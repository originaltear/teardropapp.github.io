-- Basic server-side spam guard: max 10 comments per user per minute
-- (applied to production via Supabase MCP).
create or replace function public.rate_limit_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.comments
    where user_id = new.user_id
      and created_at > now() - interval '1 minute'
  ) >= 10 then
    raise exception 'Too many comments — please slow down';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.rate_limit_comments();
