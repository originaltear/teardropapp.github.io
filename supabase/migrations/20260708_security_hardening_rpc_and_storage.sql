-- Security hardening from Supabase advisor findings (2026-07-08).
--
-- 1. Trigger functions were callable through the REST RPC surface
--    (/rest/v1/rpc/...). Calling them errors out anyway ("can only be called
--    as trigger"), but there is no reason to expose them at all. Triggers
--    keep working — they run as the table owner, not the API roles.
-- 2. App RPCs become signed-in-only (the app always calls them with a
--    session). unread_notification_count is not used by any client at all.
-- 3. Public storage buckets had a broad SELECT policy letting any client
--    LIST every file. Object URLs on public buckets do not need SELECT —
--    only our own-folder cleanup (list + remove) does, so scope SELECT to
--    the caller's folder.

-- ── 1. Trigger-only functions ────────────────────────────────────────────────

revoke execute on function public.notify_on_like() from public, anon, authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;
revoke execute on function public.notify_on_hug() from public, anon, authenticated;
revoke execute on function public.notify_on_follow() from public, anon, authenticated;
revoke execute on function public.notify_on_friend_request() from public, anon, authenticated;
revoke execute on function public.rate_limit_comments() from public, anon, authenticated;
revoke execute on function public.sync_profile_is_public() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.trigger_push_notification() from public, anon, authenticated;
revoke execute on function public.check_reply_same_cry() from public, anon, authenticated;

-- ── 2. App RPCs: signed-in users only ────────────────────────────────────────

revoke execute on function public.delete_user_account() from public, anon;
revoke execute on function public.get_registration_rank(timestamp with time zone) from public, anon;
revoke execute on function public.is_username_taken(text) from public, anon;
-- Unused by the app — keep it callable only by service_role
revoke execute on function public.unread_notification_count(uuid) from public, anon, authenticated;

-- ── 3. Storage: stop public listing, keep own-folder cleanup working ─────────

drop policy if exists avatars_read on storage.objects;
drop policy if exists cry_media_read on storage.objects;

create policy avatars_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy cry_media_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'cry-media' and (storage.foldername(name))[1] = auth.uid()::text);
