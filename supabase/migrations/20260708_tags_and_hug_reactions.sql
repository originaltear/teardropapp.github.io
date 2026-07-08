-- Tags on cries + hug reactions.
--
-- 1. cries.tags — up to 5 short free-text tags per cry (chips in the UI).
--    Validated server-side so a hand-rolled client can't stuff megabytes in.
-- 2. cry_hugs — a second reaction type next to likes. RLS mirrors the likes
--    table exactly: rows are only visible/insertable when the underlying cry
--    is visible to the querying user (cries RLS applies inside the EXISTS).
-- 3. notifications accepts type 'hug'; trigger mirrors notify_on_like.

-- ── 1. Tags ───────────────────────────────────────────────────────────────────

alter table public.cries
  add column if not exists tags text[] not null default '{}';

create or replace function public.valid_tags(t text[])
returns boolean
language sql immutable
set search_path to 'public'
as $$
  select coalesce(array_length(t, 1), 0) <= 5
     and not exists (
       select 1 from unnest(t) tag
       where length(trim(tag)) = 0 or length(tag) > 24
     );
$$;

alter table public.cries drop constraint if exists cries_tags_valid;
alter table public.cries add constraint cries_tags_valid check (public.valid_tags(tags));

-- ── 2. Hug reactions ─────────────────────────────────────────────────────────

create table if not exists public.cry_hugs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  cry_id     uuid not null references public.cries(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint cry_hugs_unique unique (user_id, cry_id)
);

create index if not exists cry_hugs_cry_id_idx on public.cry_hugs (cry_id);

alter table public.cry_hugs enable row level security;

drop policy if exists cry_hugs_select_visible on public.cry_hugs;
create policy cry_hugs_select_visible on public.cry_hugs
  for select using (
    exists (select 1 from public.cries c where c.id = cry_hugs.cry_id)
  );

drop policy if exists cry_hugs_insert_visible on public.cry_hugs;
create policy cry_hugs_insert_visible on public.cry_hugs
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.cries c where c.id = cry_hugs.cry_id)
  );

drop policy if exists cry_hugs_delete_own on public.cry_hugs;
create policy cry_hugs_delete_own on public.cry_hugs
  for delete using (user_id = auth.uid());

revoke all on public.cry_hugs from anon;
grant select, insert, delete on public.cry_hugs to authenticated;

-- ── 3. Hug notifications ─────────────────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['like'::text, 'comment'::text, 'friend_request'::text,
                           'follow'::text, 'reply'::text, 'hug'::text]));

create or replace function public.notify_on_hug()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.cries where id = new.cry_id;
  -- Don't notify if you hug your own cry
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
    values (v_owner, 'hug', new.user_id, new.cry_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_hug on public.cry_hugs;
create trigger trg_notify_hug after insert on public.cry_hugs
  for each row execute function public.notify_on_hug();
