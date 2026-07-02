-- Single-row config table driving the in-app "update available" prompt
-- (applied to production via Supabase MCP).
--
-- Release workflow: after a new version is live in the stores, bump the
-- matching column here (dashboard or SQL) — existing installs prompt on next
-- launch. Readable by everyone; only the service role can write.
create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  latest_version_ios text not null default '1.0.2',
  latest_version_android text not null default '1.0.2',
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config_select_all" on public.app_config
  for select using (true);

insert into public.app_config (id) values (1) on conflict (id) do nothing;
