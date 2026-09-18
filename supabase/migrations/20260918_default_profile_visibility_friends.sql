-- New profiles default to Friends (mutual follows) instead of Everyone.
--
-- Measured on real accounts before the change: 63 % of people had picked
-- Friends, 19 % Everyone. Most people share with the people they know, so the
-- default follows them, and someone with no friends yet shares with nobody.
--
-- This column default is a backstop. handle_new_user does not set the column,
-- but the app writes it explicitly right after sign-up (the setup screen and
-- Apple sign-in), and from 1.1.1 both of those write 'followers' too.
--
-- Existing profiles are left exactly as they are.
--
-- 'followers' is already allowed by profiles_profile_visibility_check, and
-- sync_profile_is_public derives is_public = false from it, the same as for
-- everyone who already chose Friends.

alter table public.profiles alter column profile_visibility set default 'followers';
