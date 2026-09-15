-- Let the notifications table accept the two types its own triggers produce.
--
-- 20260813_notify_on_comment_like and 20260816_report_handling_and_alerts each
-- added a trigger that inserts a notification of a new type, 'comment_like' and
-- 'report'. Neither extended notifications_type_check, which still only allowed
-- like, comment, friend_request, follow, reply and hug.
--
-- A trigger runs inside the statement that fired it, so the rejected insert took
-- the original row down with it. From the moment those two migrations ran on
-- 2026-09-11 until this one on 2026-09-15:
--
--   - every comment like was rolled back. In the app the heart filled and then
--     emptied again a moment later. Zero comment likes landed in four days.
--   - every report was rolled back. That is the path App Store Guideline 1.2
--     requires to work. None landed either, though reports are rare enough that
--     it is unclear whether anyone tried.
--
-- supabase-js returns the error rather than throwing, and the like button treats
-- a failed write as a reason to quietly undo, so nothing surfaced except the
-- heart not staying filled.
--
-- Verified after applying, each inside a transaction that was rolled back: a like
-- on a real comment now produces a 'comment_like' notification, and a report now
-- produces a 'report' notification to the moderator.
--
-- Any future migration that adds a notification type has to extend this
-- constraint in the same file.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'like', 'comment', 'friend_request', 'follow', 'reply', 'hug',
    'comment_like', 'report'
  ]));
