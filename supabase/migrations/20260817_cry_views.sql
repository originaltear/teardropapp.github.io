-- Cry views — "seen by", not "view count".
--
-- The app's whole promise is that you are not alone. Telling an author that
-- twelve people sat with what they wrote serves that. A public number on every
-- post would do the opposite: it turns a private record of a bad day into a
-- performance, and the day someone logs something heavy and reads "1 view" we
-- have told a vulnerable person that nobody cared. So:
--
--   * only the author can read the count, never other viewers
--   * one row per person per cry, so re-opening changes nothing
--   * the author's own opens are not recorded
--   * the client hides the number below 3 (never render "seen by 0")
--
-- Safe to apply before the client ships: nothing writes here until it does.

create table if not exists public.cry_views (
  cry_id        uuid        not null references public.cries(id) on delete cascade,
  viewer_id     uuid        not null references auth.users(id)   on delete cascade,
  first_seen_at timestamptz not null default now(),

  -- Country of the viewer, coarse and optional. Only populated if the app is
  -- ever told to, which needs a line in the privacy policy first. Left null it
  -- costs nothing; filled it makes "seen from 14 countries" a true statement.
  viewer_country text,

  primary key (cry_id, viewer_id)
);

alter table public.cry_views enable row level security;

-- Read: the author of the cry, and nobody else. Not even the viewer gets to
-- see their own row back — there is no reason for them to need it.
drop policy if exists cry_views_select_own_cries on public.cry_views;
create policy cry_views_select_own_cries on public.cry_views
  for select to authenticated
  using (exists (
    select 1 from public.cries c
    where c.id = cry_views.cry_id
      and c.user_id = (select auth.uid())
  ));

-- Write: you may only record yourself, only on a cry you can actually see
-- (the subquery is filtered by the existing cries RLS), and never on your own.
drop policy if exists cry_views_insert_self on public.cry_views;
create policy cry_views_insert_self on public.cry_views
  for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (
      select 1 from public.cries c
      where c.id = cry_views.cry_id
        and c.user_id <> (select auth.uid())
    )
  );

-- No update or delete policy: a view is a fact, not a setting.

-- Column privileges on this project are an allowlist. Without these grants the
-- table reads as missing rather than as forbidden, which is a miserable bug to
-- chase down twice.
grant select (cry_id, viewer_id, first_seen_at, viewer_country) on public.cry_views to authenticated;
grant insert (cry_id, viewer_id, viewer_country)                on public.cry_views to authenticated;

-- The author's "who has seen my cries" lookup goes through cry_id, which the
-- primary key already leads on. This one covers the reverse: cleaning up or
-- counting by viewer.
create index if not exists cry_views_viewer_idx on public.cry_views (viewer_id);
