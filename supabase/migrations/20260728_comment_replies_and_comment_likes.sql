-- Comment replies + comment likes (applied to production via Supabase MCP).
--
-- 1. comments.parent_comment_id enables one-level threads; a trigger guards
--    that replies stay on the same cry as their parent.
-- 2. comment_likes with RLS that recurses through comments -> cries, so likes
--    are only visible/insertable when the underlying cry is visible.
-- 3. New 'reply' notification type; notify_on_comment now notifies the
--    parent-comment author on replies (and still the cry owner, deduped).

-- ── 1) Threaded replies ───────────────────────────────────────────────────────
alter table public.comments
  add column if not exists parent_comment_id uuid
  references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments(parent_comment_id);

create or replace function public.check_reply_same_cry()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_parent_cry uuid;
begin
  if new.parent_comment_id is not null then
    select cry_id into v_parent_cry from public.comments where id = new.parent_comment_id;
    if v_parent_cry is null or v_parent_cry <> new.cry_id then
      raise exception 'Reply must belong to the same cry as its parent comment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_reply_same_cry on public.comments;
create trigger comments_reply_same_cry
  before insert on public.comments
  for each row execute function public.check_reply_same_cry();

-- ── 2) Comment likes ──────────────────────────────────────────────────────────
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;

create policy "comment_likes_select_visible" on public.comment_likes
  for select using (
    exists (select 1 from public.comments cm where cm.id = comment_likes.comment_id)
  );

create policy "comment_likes_insert_visible" on public.comment_likes
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.comments cm where cm.id = comment_likes.comment_id)
  );

create policy "comment_likes_delete_own" on public.comment_likes
  for delete using (user_id = auth.uid());

-- ── 3) 'reply' notification type ──────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['like'::text, 'comment'::text, 'friend_request'::text, 'follow'::text, 'reply'::text]));

-- ── 4) Notify parent-comment author on replies ───────────────────────────────
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
  v_parent_author uuid;
begin
  select user_id into v_owner from public.cries where id = new.cry_id;

  if new.parent_comment_id is not null then
    select user_id into v_parent_author from public.comments where id = new.parent_comment_id;
    if v_parent_author is not null and v_parent_author <> new.user_id then
      insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
      values (v_parent_author, 'reply', new.user_id, new.cry_id, new.id);
    end if;
    if v_owner is not null and v_owner <> new.user_id and v_owner is distinct from v_parent_author then
      insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
      values (v_owner, 'comment', new.user_id, new.cry_id, new.id);
    end if;
  else
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
      values (v_owner, 'comment', new.user_id, new.cry_id, new.id);
    end if;
  end if;

  return new;
end;
$$;
