-- ⚠️ DO NOT APPLY UNTIL 1.1.0 IS LIVE IN BOTH STORES.
--
-- The trigger below produces notifications of type 'report'. notifText() and
-- notifIcon() in app/(tabs)/notifications.tsx are lookups with no fallback, so
-- on an older client a report notification renders as a blank row. Ship first,
-- then run this.
--
-- Two things, both about the 24-hour rule under App Store Guideline 1.2:
-- reports have to be noticed, and it has to be possible to see which ones are
-- already dealt with.

-- ── 1. Somewhere to record that a report was handled ─────────────────────────

alter table public.reports
  add column if not exists handled_at   timestamptz,
  add column if not exists handled_note text;

comment on column public.reports.handled_at is
  'Set when the report has been reviewed and acted on. Null means outstanding.';

create index if not exists reports_outstanding_idx
  on public.reports (created_at desc)
  where handled_at is null;

-- ── 2. Tell the operator a report came in ────────────────────────────────────
--
-- Reports used to land in this table and wait to be discovered. One sat unseen
-- for four days during testing, which under a 24-hour commitment is the whole
-- problem in one example.
--
-- Reuses the notification pipeline that already exists rather than adding mail:
-- inserting a row here pushes to the operator's phone through send-push within
-- seconds. The recipient is a single account, so the id is a setting rather
-- than something derived.

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config
  add column if not exists moderator_user_id uuid;

comment on column public.app_config.moderator_user_id is
  'Who gets notified when a report arrives. Null disables report alerts.';

update public.app_config
set moderator_user_id = '6541cfa9-e82b-4f23-9e60-1614ba09be2c'
where id = 1 and moderator_user_id is null;

create or replace function public.notify_on_report()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_moderator uuid;
begin
  select moderator_user_id into v_moderator from public.app_config where id = 1;

  -- No moderator configured, or the moderator reported something themselves:
  -- nothing useful to send.
  if v_moderator is null or v_moderator = new.reporter_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, cry_id, reference_id)
  values (
    v_moderator,
    'report',
    new.reporter_id,
    case when new.reported_type = 'cry' then new.reported_id else null end,
    new.id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_report on public.reports;

create trigger trg_notify_report
after insert on public.reports
for each row execute function public.notify_on_report();
