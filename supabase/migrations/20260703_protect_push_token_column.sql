-- Privacy fix: device push tokens were readable by any signed-in user
-- (applied to production via Supabase MCP).
--
-- push_token identifies a device for Expo's push API; with someone else's
-- token you can spam them notifications. RLS is row-level, so profiles_select
-- (any signed-in user) exposed every column including push_token.
--
-- A column-level revoke alone is a no-op while a table-level SELECT grant
-- exists, so we drop the table grant and re-issue SELECT on every column
-- except push_token. Owners never READ their own token (the client only
-- writes it) and no query does select('*') on profiles, so nothing breaks.
-- service_role keeps full access for the send-push Edge Function.
--
-- Note: notification_preferences and is_premium remain readable to signed-in
-- users because the owner reads them via the same role; they are low-
-- sensitivity (a bool and on/off toggles) and can be hardened later with a
-- SECURITY DEFINER "get my settings" RPC if desired.
revoke select on public.profiles from anon, authenticated;

grant select (
  id, display_name, avatar_uri, bio, is_public, created_at, username,
  selected_tears, earned_tears, profile_visibility, allow_comments,
  notification_preferences, is_premium
) on public.profiles to anon, authenticated;
