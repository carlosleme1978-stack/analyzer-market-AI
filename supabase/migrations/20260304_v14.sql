-- Analyzer Market AI V14 migration
-- Adds optional hard caps for cost control and improves ops visibility.

alter table analyses
  add column if not exists max_cost_cents int,
  add column if not exists max_places_calls int,
  add column if not exists max_openai_tokens int;

-- Helpful indexes
create index if not exists jobs_status_runat on jobs(status, run_at);
create index if not exists jobs_locked_until on jobs(locked_until);
create index if not exists analysis_events_analysis_id on analysis_events(analysis_id);

-- Optional: tighten places_cache TTL usage via a DB-side cleanup (call via cron)
create or replace function delete_expired_places_cache(p_max int default 500)
returns int
language plpgsql
as $$
declare
  n int := 0;
begin
  delete from places_cache
  where cache_key in (
    select cache_key from places_cache
    where expires_at < now()
    limit p_max
  );
  get diagnostics n = row_count;
  return n;
end;
$$;
