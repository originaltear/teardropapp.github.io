-- Safe to apply immediately, unlike the other two migrations waiting on 1.1.0.
-- Widening a CHECK cannot break an older client: it only stops rejecting rows
-- that were being thrown away before.
--
-- reported_type only permitted 'cry' and 'user'. Two consequences:
--
--  1. Comments could not be reported at all, even once the app offered it.
--
--  2. "Report a problem" in Settings writes reported_type = 'app', so every
--     bug report anyone has ever sent was rejected by the database. The insert
--     was wrapped in try/catch, but supabase-js returns errors rather than
--     throwing, so the catch never ran and the person was thanked for a report
--     that did not exist. There are zero 'app' rows in the table.

alter table public.reports
  drop constraint if exists reports_reported_type_check;

alter table public.reports
  add constraint reports_reported_type_check
  check (reported_type in ('cry', 'user', 'comment', 'app'));
