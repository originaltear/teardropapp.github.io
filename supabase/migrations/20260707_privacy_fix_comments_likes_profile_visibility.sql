-- Privacy audit fixes (applied to production 2026-07-07 via Supabase MCP).
--
-- Audit background: a report claimed friends-only cries leaked into the "All"
-- map view. Empirical RLS simulation (SET ROLE authenticated + request.jwt.claims)
-- proved the cries table was already airtight: strangers only receive
-- visibility='everyone' rows; friends-only rows never leave the server unless
-- the requester is a mutual follower. The audit did, however, find three real
-- issues in neighbouring tables, fixed below.
--
-- 1. comments SELECT was USING(true): anyone could read comment text on
--    private cries straight from the API.
-- 2. likes SELECT was USING(true) (and INSERT didn't require a visible cry):
--    anyone could enumerate likes on private cries.
-- 3. profiles.profile_visibility was never enforced: the app only ever wrote
--    profile_visibility while RLS + client gating read is_public, which was
--    permanently true. A trigger now keeps is_public in sync so the existing
--    client gating (global feed filter, profile page cries list) takes effect.
--    Basic identity stays readable to signed-in users (search, friend
--    requests, comment author names); anon can no longer read any profiles.

-- ── 1) Comments: readable only when the underlying cry is visible ────────────
drop policy if exists "Anyone can view comments" on public.comments;
create policy "comments_select_visible_cry" on public.comments
  for select using (
    exists (select 1 from public.cries c where c.id = comments.cry_id)
  );

-- ── 2) Likes: same rule for reads; inserts require a visible cry ─────────────
drop policy if exists "Anyone can view likes" on public.likes;
create policy "likes_select_visible_cry" on public.likes
  for select using (
    exists (select 1 from public.cries c where c.id = likes.cry_id)
  );

drop policy if exists "Users can like" on public.likes;
create policy "likes_insert_visible_cry" on public.likes
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.cries c where c.id = likes.cry_id)
  );

-- ── 3) Profiles: make profile_visibility actually take effect ────────────────
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() is not null);

create or replace function public.sync_profile_is_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_public := (coalesce(new.profile_visibility, 'everyone') = 'everyone');
  return new;
end;
$$;

drop trigger if exists profiles_sync_is_public on public.profiles;
create trigger profiles_sync_is_public
  before insert or update on public.profiles
  for each row execute function public.sync_profile_is_public();

update public.profiles
set is_public = (coalesce(profile_visibility, 'everyone') = 'everyone');
