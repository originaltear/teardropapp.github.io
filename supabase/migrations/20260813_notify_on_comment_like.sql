-- ⚠️ DO NOT APPLY THIS UNTIL 1.0.7 IS LIVE IN BOTH STORES.
--
-- The trigger starts producing a notification type that older clients don't
-- know. notifText() and notifIcon() in app/(tabs)/notifications.tsx are lookups
-- with no fallback, so on 1.0.6 a comment_like row renders as a blank line with
-- no icon. Ship the app first, then run this.
--
-- Notify a comment's author when someone likes their comment.
--
-- Every other reaction in the app already notifies: likes and hugs on a cry,
-- comments, replies, follows and friend requests. Comment likes were the one
-- gap — the like landed silently and the author never found out.
--
-- reference_id holds the comment, cry_id the cry it lives on, so the tap
-- handler can open the thread the same way a reply notification does.

create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_author uuid;
  v_cry    uuid;
begin
  select user_id, cry_id into v_author, v_cry
  from public.comments
  where id = new.comment_id;

  -- Don't notify people about liking their own comment
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
    values (v_author, 'comment_like', new.user_id, v_cry, new.comment_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_comment_like on public.comment_likes;

create trigger trg_notify_comment_like
after insert on public.comment_likes
for each row execute function public.notify_on_comment_like();
