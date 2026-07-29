-- "You cried more than X% of people" for Your Year in Tears (app/wrapped.tsx).
--
-- Needs cross-user aggregates, which RLS (correctly) forbids the client from
-- reading — so it runs SECURITY DEFINER and returns ONLY numbers about the
-- caller: their own percentile, globally and inside their own country. No other
-- user's rows, counts or identities are ever exposed.
--
-- Small-sample guard: a percentile drawn from a handful of people is both
-- meaningless and potentially identifying ("top 33% of 3 people"). Each scope
-- stays null until it has enough participants — 25 globally, 10 per country —
-- so the card simply doesn't appear until the numbers mean something, then
-- turns itself on as the app grows.
create or replace function public.get_wrapped_rank(p_year int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  y_start date;
  y_end date;
  my_total int;
  my_country text;
  g_users int; g_below int;
  c_users int; c_below int;
  min_global constant int := 25;
  min_country constant int := 10;
  out_global int := null;
  out_country int := null;
begin
  if uid is null then return null; end if;

  y_start := make_date(p_year, 1, 1);
  y_end   := make_date(p_year + 1, 1, 1);

  select count(*) into my_total
    from cries
   where user_id = uid and created_at >= y_start and created_at < y_end;

  if my_total = 0 then return null; end if;

  select country into my_country
    from cries
   where user_id = uid and country is not null
     and created_at >= y_start and created_at < y_end
   group by country
   order by count(*) desc
   limit 1;

  create temp table if not exists _wrapped_rank_tmp on commit drop as
  with year_cries as (
    select user_id, country
      from cries
     where created_at >= y_start and created_at < y_end
  ),
  totals as (
    select user_id, count(*)::int as n from year_cries group by user_id
  ),
  dom_country as (
    select user_id, country from (
      select user_id, country,
             row_number() over (partition by user_id order by count(*) desc) as rn
        from year_cries
       where country is not null
       group by user_id, country
    ) t where rn = 1
  )
  select t.user_id, t.n, d.country
    from totals t left join dom_country d on d.user_id = t.user_id;

  select count(*)::int, count(*) filter (where n < my_total)::int
    into g_users, g_below
    from _wrapped_rank_tmp;

  if g_users >= min_global then
    out_global := greatest(1, 100 - floor((g_below::numeric / g_users) * 100)::int);
  end if;

  if my_country is not null then
    select count(*)::int, count(*) filter (where n < my_total)::int
      into c_users, c_below
      from _wrapped_rank_tmp
     where country = my_country;

    if c_users >= min_country then
      out_country := greatest(1, 100 - floor((c_below::numeric / c_users) * 100)::int);
    end if;
  end if;

  drop table if exists _wrapped_rank_tmp;

  return json_build_object(
    'total', my_total,
    'country', my_country,
    'global_top_pct', out_global,
    'country_top_pct', out_country
  );
end;
$$;

revoke execute on function public.get_wrapped_rank(int) from public, anon;
grant execute on function public.get_wrapped_rank(int) to authenticated;
