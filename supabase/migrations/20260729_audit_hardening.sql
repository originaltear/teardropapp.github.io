-- Audit hardening (2026-07-29 full app review)
--
-- 1. profiles.is_premium could be UPDATEd by any authenticated user on their own
--    row (profiles_update has no column restrictions), and checkPremium() falls
--    back to this flag — i.e. self-granted free premium via one REST call.
--    Column-level revoke closes it; only service_role/postgres may set it.
--    (The __DEV__ sandbox grant in lib/purchases.ts loses its DB write — dev
--    builds now test premium via RevenueCat sandbox or a manually set flag.)
--
-- 2. respondToFriendRequest('accepted') tried to create BOTH follow directions
--    from the client, but follows_insert RLS only permits follower_id =
--    auth.uid(), so the requester→accepter direction silently failed (latent —
--    nothing currently sends requests, but the accept path is live UI).
--    A SECURITY DEFINER trigger now creates the mutual follow server-side.
--
-- 3. The client never inserts notifications (SECURITY DEFINER triggers do), but
--    an INSERT policy allowed any user to write arbitrary notifications into
--    anyone's feed (actor_id = self was the only constraint) — a spam vector.
--    Dropped.

-- ── 1. is_premium: server-managed only ───────────────────────────────────────
-- NOTE: a column-level REVOKE cannot subtract from a table-level GRANT, so the
-- working approach (as applied to prod) is: revoke table-level UPDATE, then
-- re-grant column-level UPDATE on everything clients legitimately write
-- (mirrors how SELECT already protects push_token).
revoke update on public.profiles from authenticated, anon;

grant update (
  display_name, avatar_uri, bio, is_public, username,
  selected_tears, earned_tears, push_token,
  profile_visibility, allow_comments, notification_preferences
) on public.profiles to authenticated;

-- ── 2. Mutual follow on friend-request acceptance ────────────────────────────
create or replace function public.create_mutual_follow_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.follows (follower_id, following_id)
    values (new.to_user_id, new.from_user_id)
    on conflict (follower_id, following_id) do nothing;

    insert into public.follows (follower_id, following_id)
    values (new.from_user_id, new.to_user_id)
    on conflict (follower_id, following_id) do nothing;
  end if;
  return new;
end;
$$;

-- Same hardening as the other trigger functions: not client-callable via RPC.
revoke execute on function public.create_mutual_follow_on_accept() from public, anon, authenticated;

drop trigger if exists trg_friend_request_accept on public.friend_requests;
create trigger trg_friend_request_accept
  after update on public.friend_requests
  for each row execute function public.create_mutual_follow_on_accept();

-- ── 3. Notifications: triggers only ──────────────────────────────────────────
drop policy if exists "Users can only insert notifications they trigger" on public.notifications;
