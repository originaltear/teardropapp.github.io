-- Country as a code, because a name is not an identity.
--
-- The device geocoder answers in the phone's language, so `country` has always
-- stored a country translated into whichever language the user happened to have
-- set. Across every cry this had produced Denmark as both "Danmark" (41 rows,
-- 10 users) and "Denmark" (6 rows, 4 users), the United States as "USA" and
-- "United States", Germany as "Tyskland", China as "中国". The recap counted one
-- country as two, the flag lookup matches English names so most rows fell
-- through to a grey globe, and get_wrapped_rank groups by country server-side,
-- which split one nation's population into separate, smaller cohorts.
--
-- The names have been normalised once by hand, but ten of fourteen users have
-- Danish phones, so every new cry from them would reintroduce the drift. The
-- code is what does not move: it is the same two letters whatever language the
-- phone is in.
--
-- `country` stays exactly as it is. It remains the label, and a user reading
-- their own country in their own language is nicer than forcing English on
-- them. Only the grouping moves to the code.

alter table public.cries add column if not exists country_code text;

-- Backfill from the names as they stand right now, which were normalised to
-- English immediately before this migration. Anything else is left null for the
-- on-device backfill to resolve from coordinates.
update public.cries set country_code = case trim(country)
  when 'Denmark'       then 'DK'
  when 'United States' then 'US'
  when 'Afghanistan'   then 'AF'
  when 'China'         then 'CN'
  when 'Germany'       then 'DE'
end
where country_code is null and trim(coalesce(country, '')) <> '';

-- Redundant on this table, which carries table-level grants rather than the
-- per-column allowlist that public.profiles uses, but stated so a future reader
-- does not have to work out which of the two regimes applies here.
grant select (country_code) on public.cries to authenticated;
grant insert (country_code) on public.cries to authenticated;
grant update (country_code) on public.cries to authenticated;
