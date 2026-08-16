-- Safe to apply immediately: an additive column with a default that matches
-- how the app already behaves. Older clients never select it.
--
-- Whether other people can see who you follow and who follows you. Separate
-- from profile_visibility on purpose. Facebook and Instagram both let you keep
-- a visible profile while keeping the lists to yourself, and the two really
-- are different questions: one is "can you see me", the other is "can you see
-- who I am connected to".
--
-- Default true because the counts are already public and the lists became
-- reachable in the same release; starting closed would ship the feature off.
--
-- Note this is a courtesy, not a boundary. RLS on `follows` permits SELECT to
-- anyone, so the rows are reachable outside the app regardless. Making it a
-- real boundary is a separate job, and a risky one, since the feed, the map
-- filters and the follower counts all read the same table.

alter table public.profiles
  add column if not exists show_follow_lists boolean not null default true;

comment on column public.profiles.show_follow_lists is
  'When false, others see follower/following counts but cannot open the lists.';
