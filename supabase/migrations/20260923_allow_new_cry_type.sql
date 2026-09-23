-- Allow the 'new_cry' notification type ahead of its trigger.
--
-- Split out of 20260923_notify_followers_on_new_cry.sql so a single test
-- notification could be sent end to end before 1.1.2 ships. Allowing a type
-- changes nothing on its own: rows of it only appear once the trigger exists,
-- and that migration still waits for 1.1.2 to be live. It re-applies the same
-- constraint, so running it again is harmless.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'like', 'comment', 'friend_request', 'follow', 'reply', 'hug',
    'comment_like', 'report', 'new_cry'
  ]));
