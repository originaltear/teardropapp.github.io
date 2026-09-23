-- Per-person mute for "someone you follow logged a cry", which arrives with
-- 1.1.2 (see 20260923_notify_followers_on_new_cry.sql).
--
-- Split out and applied first on purpose: a table that nothing writes to yet
-- cannot affect anyone on 1.1.1, while the trigger in the other file would
-- start producing a notification type older clients render as a blank row.
--
-- The notification is on for everyone you follow, because an opt-in nobody
-- finds would not move the number it exists to move. This is the way out, one
-- person at a time, written by the bell on their profile.

-- ── Per-person mute ───────────────────────────────────────────────────────────

create table if not exists public.cry_notify_mutes (
  user_id       uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, muted_user_id)
);

alter table public.cry_notify_mutes enable row level security;

drop policy if exists cry_notify_mutes_own on public.cry_notify_mutes;
create policy cry_notify_mutes_own on public.cry_notify_mutes
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, delete on public.cry_notify_mutes to authenticated;

