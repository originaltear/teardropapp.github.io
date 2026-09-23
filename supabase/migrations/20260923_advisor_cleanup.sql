-- Three findings from Supabase's own advisors, 2026-09-23.
--
-- 1. Two trigger functions were exposed as RPC endpoints, callable by anyone
--    including signed-out users: /rest/v1/rpc/notify_on_comment_like and
--    /rest/v1/rpc/notify_on_report. Postgres refuses to run a trigger function
--    outside a trigger, so nothing could actually be done through them, but a
--    SECURITY DEFINER function has no business being on the public API at all.
--    Revoking EXECUTE does not stop the triggers: the privilege is checked
--    when a trigger is created, not each time it fires.
--
-- 2. cry_notify_mutes.muted_user_id is a foreign key with no index, so
--    deleting a user had to scan the whole table to find their rows.
--
-- 3. comments had two identical indexes on cry_id (comments_cry_id_idx and
--    idx_comments_cry). Every comment was written to both, and only one is
--    ever read.

revoke execute on function public.notify_on_comment_like() from public, anon, authenticated;
revoke execute on function public.notify_on_report() from public, anon, authenticated;

create index if not exists cry_notify_mutes_muted_user_id_idx
  on public.cry_notify_mutes (muted_user_id);

drop index if exists public.idx_comments_cry;
