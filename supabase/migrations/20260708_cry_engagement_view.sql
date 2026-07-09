-- Engagement counts for cries, computed in the database.
--
-- The client used to download raw likes/comments/cry_hugs rows and count them
-- in JS. PostgREST silently caps responses at 1000 rows, so once total
-- engagement across a feed page passed 1000 rows the counts undercounted.
-- This view returns one row per visible cry with exact counts.
--
-- security_invoker: the underlying tables' RLS applies to the caller, so the
-- counts only include rows the caller is allowed to see — the same semantics
-- the client-side counting had.

create index if not exists comments_cry_id_idx on public.comments (cry_id);

create or replace view public.cry_engagement
with (security_invoker = true) as
select
  c.id as cry_id,
  (select count(*) from public.likes l    where l.cry_id  = c.id) as like_count,
  (select count(*) from public.cry_hugs h where h.cry_id  = c.id) as hug_count,
  (select count(*) from public.comments m where m.cry_id  = c.id) as comment_count
from public.cries c;

grant select on public.cry_engagement to authenticated;
