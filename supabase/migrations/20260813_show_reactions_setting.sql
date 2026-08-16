-- Let people decide whether others can see WHO liked or hugged their cries.
--
-- The counts have always been public; this is about the names behind them.
-- RLS on likes and cry_hugs already restricts rows to cries the viewer is
-- allowed to see, so this column is a preference on top of a boundary that
-- already holds — not the boundary itself.
--
-- Default true: reaction counts are already visible, so revealing the names on
-- a cry someone can already read is not a new exposure, and defaulting to false
-- would ship the feature switched off for everyone.

alter table public.profiles
  add column if not exists show_reactions boolean not null default true;

comment on column public.profiles.show_reactions is
  'When false, other users see reaction counts but not who reacted.';

-- ⚠️ REQUIRED. Column privileges on `profiles` are an allowlist (see the
-- push_token migration), so without this the column is unreadable by clients
-- and any query selecting it fails outright rather than omitting the field.
grant select (show_reactions) on public.profiles to anon, authenticated;
grant update (show_reactions) on public.profiles to authenticated;
