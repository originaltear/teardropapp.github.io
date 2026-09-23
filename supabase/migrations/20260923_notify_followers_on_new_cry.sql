-- ⚠️ DO NOT APPLY THIS UNTIL 1.1.2 IS LIVE IN BOTH STORES.
--
-- It starts producing a notification type older clients do not know. notifText()
-- in app/(tabs)/notifications.tsx is a lookup without a fallback, so on 1.1.1 a
-- new_cry row renders as a blank line that does nothing when tapped. Ship the
-- app first, then run this.
--
-- Tell the people who follow you that you logged a cry.
--
-- Why: measured 2026-09-18, 57% of people who log a cry never log a second one,
-- and 29% reach the three cries that the recap and the review prompt need. The
-- app only ever pushed when someone reacted to YOUR cry, so a new user with no
-- friends yet received nothing at all, ever. This is the one notification that
-- reaches someone who is not already being talked to.
--
-- Four rules, all of them deliberate:
--
--   1. Only people who may see the cry. The recipient set mirrors the SELECT
--      policies on cries exactly: 'everyone' goes to any follower, 'followers'
--      only to mutuals, 'close_friends' only to the author's list, 'only_me' to
--      nobody. Blocks cut both ways. Getting this wrong would leak the
--      existence of a private cry, which is worse than leaking a like.
--   2. Nothing about the cry itself travels. The row carries the author and the
--      cry id; the push text (supabase/functions/send-push) says only that they
--      shared a cry. Which emotion, and what the note said, stay with the
--      person who wrote them: a lock screen is read by whoever holds the phone.
--   3. Backdated cries are silent. Logging last Tuesday's cry is bookkeeping,
--      not news, so only cries timestamped within the last hour notify.
--   4. At most one per author per recipient per six hours. A bad evening can
--      produce several cries, and the friend who gets three pushes about it
--      turns the whole thing off.
--
-- The way out for the recipient is per person: cry_notify_mutes, written by the
-- bell on a profile. The blunt switch is notification_preferences.friend_cries,
-- which send-push checks; it is on by default, because an opt-in notification
-- nobody finds would not move the number this exists to move.

-- The mute table it reads lives in 20260923_cry_notify_mutes.sql, which is
-- safe on its own and was applied first.

-- ── The type has to be allowed before anything inserts it ─────────────────────
-- Two earlier migrations added a trigger that inserted a type this constraint
-- did not list. The insert failed, and because a trigger runs inside the
-- statement that fired it, the row that caused it was rolled back too: comment
-- likes silently did nothing for four days. Never add a type without this.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'like', 'comment', 'friend_request', 'follow', 'reply', 'hug',
    'comment_like', 'report', 'new_cry'
  ]));

-- ── The trigger ───────────────────────────────────────────────────────────────

create or replace function public.notify_followers_on_new_cry()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Rule 3: only a cry that is happening now.
  if new.created_at < now() - interval '1 hour' then
    return new;
  end if;

  -- Rule 1: only me never reaches anyone.
  if new.visibility = 'only_me' then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, cry_id)
  select f.follower_id, 'new_cry', new.user_id, new.id
  from public.follows f
  where f.following_id = new.user_id
    and f.follower_id <> new.user_id
    -- Rule 1, the visibility the author chose for this cry
    and (
      new.visibility = 'everyone'
      or (
        new.visibility = 'followers'
        and exists (
          select 1 from public.follows b
          where b.follower_id = new.user_id
            and b.following_id = f.follower_id
        )
      )
      or (
        new.visibility = 'close_friends'
        and exists (
          select 1 from public.close_friends cf
          where cf.user_id = new.user_id
            and cf.friend_id = f.follower_id
        )
      )
    )
    -- Blocks in either direction
    and not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = f.follower_id and bl.blocked_id = new.user_id)
         or (bl.blocker_id = new.user_id and bl.blocked_id = f.follower_id)
    )
    -- The bell on the author's profile
    and not exists (
      select 1 from public.cry_notify_mutes m
      where m.user_id = f.follower_id
        and m.muted_user_id = new.user_id
    )
    -- Rule 4: one per author per recipient per six hours
    and not exists (
      select 1 from public.notifications n
      where n.user_id = f.follower_id
        and n.actor_id = new.user_id
        and n.type = 'new_cry'
        and n.created_at > now() - interval '6 hours'
    );

  return new;
end;
$function$;

drop trigger if exists trg_notify_followers_on_new_cry on public.cries;

create trigger trg_notify_followers_on_new_cry
after insert on public.cries
for each row execute function public.notify_followers_on_new_cry();
