-- Performance tuning from Supabase advisor findings (2026-07-08).
--
-- 1. RLS initplan: `auth.uid()` in a policy is re-evaluated per ROW; wrapping
--    it as `(select auth.uid())` evaluates it once per query. Mechanical
--    rewrite of every flagged policy — semantics are identical.
-- 2. cries had both granular own-CRUD policies AND `cries_own_all` (ALL),
--    so every query evaluated two permissive policies per action. The
--    granular ones are exact duplicates of `cries_own_all` — drop them.
-- 3. Missing FK index on comment_likes.user_id; duplicate unique constraint
--    on likes(user_id, cry_id) (two identical ones — one is enough for the
--    idempotent-like 23505 handling in the app).

-- ── 1a. Simple ownership policies ────────────────────────────────────────────

alter policy ach_insert on public.achievements_unlocked
  with check ((select auth.uid()) = user_id);
alter policy ach_select on public.achievements_unlocked
  using ((select auth.uid()) = user_id);

alter policy blocks_delete on public.blocks using ((select auth.uid()) = blocker_id);
alter policy blocks_insert on public.blocks with check ((select auth.uid()) = blocker_id);
alter policy blocks_select on public.blocks using ((select auth.uid()) = blocker_id);

alter policy "Users manage own close friends" on public.close_friends
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users see lists they are on" on public.close_friends
  using ((select auth.uid()) = friend_id);

alter policy comment_likes_delete_own on public.comment_likes
  using (user_id = (select auth.uid()));
alter policy comment_likes_insert_visible on public.comment_likes
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.comments cm where cm.id = comment_likes.comment_id)
  );

alter policy "Users can comment" on public.comments
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.cries c
      join public.profiles p on p.id = c.user_id
      where c.id = comments.cry_id
        and (p.allow_comments = true or c.user_id = (select auth.uid()))
    )
  );
alter policy "Users can delete own comments" on public.comments
  using (user_id = (select auth.uid()));

alter policy cry_hugs_delete_own on public.cry_hugs
  using (user_id = (select auth.uid()));
alter policy cry_hugs_insert_visible on public.cry_hugs
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.cries c where c.id = cry_hugs.cry_id)
  );

alter policy "Users can follow others" on public.follows
  with check (follower_id = (select auth.uid()));
alter policy "Users can unfollow" on public.follows
  using (follower_id = (select auth.uid()));

alter policy "Users can send requests" on public.friend_requests
  with check (from_user_id = (select auth.uid()));
alter policy "Users can view their requests" on public.friend_requests
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
alter policy "Recipient can update status" on public.friend_requests
  using (to_user_id = (select auth.uid()));
alter policy "Sender can delete (cancel) request" on public.friend_requests
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));

alter policy "Users can unlike" on public.likes
  using (user_id = (select auth.uid()));
alter policy likes_insert_visible_cry on public.likes
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.cries c where c.id = likes.cry_id)
  );

alter policy "Users see own notifications" on public.notifications
  using (user_id = (select auth.uid()));
alter policy "Users can mark as read" on public.notifications
  using (user_id = (select auth.uid()));

alter policy profiles_insert on public.profiles with check ((select auth.uid()) = id);
alter policy profiles_select on public.profiles using ((select auth.uid()) is not null);
alter policy profiles_update on public.profiles using ((select auth.uid()) = id);

alter policy "Users can create reports" on public.reports
  with check (reporter_id = (select auth.uid()));
alter policy "Users can see own reports" on public.reports
  using (reporter_id = (select auth.uid()));

-- ── 1b. Cries visibility policies (same rewrite, bigger expressions) ─────────

alter policy cries_own_all on public.cries
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter policy cries_everyone_select on public.cries
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) <> user_id
    and visibility = 'everyone'
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = (select auth.uid()) and blocks.blocked_id = cries.user_id)
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = cries.user_id and blocks.blocked_id = (select auth.uid()))
  );

alter policy cries_followers_select on public.cries
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) <> user_id
    and visibility = 'followers'
    and exists (select 1 from public.follows
      where follows.follower_id = (select auth.uid()) and follows.following_id = cries.user_id)
    and exists (select 1 from public.follows
      where follows.follower_id = cries.user_id and follows.following_id = (select auth.uid()))
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = (select auth.uid()) and blocks.blocked_id = cries.user_id)
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = cries.user_id and blocks.blocked_id = (select auth.uid()))
  );

alter policy cries_close_friends_select on public.cries
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) <> user_id
    and visibility = 'close_friends'
    and exists (select 1 from public.close_friends
      where close_friends.user_id = cries.user_id and close_friends.friend_id = (select auth.uid()))
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = (select auth.uid()) and blocks.blocked_id = cries.user_id)
    and not exists (select 1 from public.blocks
      where blocks.blocker_id = cries.user_id and blocks.blocked_id = (select auth.uid()))
  );

-- ── 2. Drop cries policies that exactly duplicate cries_own_all ──────────────

drop policy if exists cries_insert on public.cries;
drop policy if exists cries_update on public.cries;
drop policy if exists cries_delete on public.cries;

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

create index if not exists comment_likes_user_id_idx on public.comment_likes (user_id);

-- Two identical unique constraints on likes(user_id, cry_id) — one suffices
alter table public.likes drop constraint if exists likes_user_cry_unique;
