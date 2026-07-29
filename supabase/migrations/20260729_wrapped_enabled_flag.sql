-- Remote switch for "Your Year in Tears" (app/wrapped.tsx).
--
-- The recap ships dark inside a normal app release: the screen exists, but no
-- entry point renders until this flag is true. Flipping it in December launches
-- the feature for every installed copy with no new build and no store review —
-- which also means the launch date isn't hostage to a review queue.
--
--   update public.app_config set wrapped_enabled = true where id = 1;
alter table public.app_config
  add column if not exists wrapped_enabled boolean not null default false;
