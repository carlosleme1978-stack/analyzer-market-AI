-- Analyzer Market AI V9 schema

create extension if not exists pgcrypto;

-- Analyses: tokens are NEVER stored in plaintext, only token_hash.
create table if not exists analyses(
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  status text not null default 'created',
  paid boolean not null default false,
  input jsonb,
  score int,
  summary text,
  recommendations jsonb,
  views int not null default 0,
  views_limit int not null default 5,
  expires_at timestamptz,
  price_cents int,
  currency text,
  stripe_session_id text,
  created_at timestamptz default now()
);

-- Queue: one job per analysis (unique).
create table if not exists jobs(
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  status text not null default 'queued',
  attempt_count int not null default 0,
  run_at timestamptz not null default now(),
  lock_owner text,
  locked_until timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  unique(analysis_id)
);

-- Observability
create table if not exists analysis_events(
  id bigint generated always as identity primary key,
  analysis_id uuid not null references analyses(id) on delete cascade,
  event text not null,
  meta jsonb,
  created_at timestamptz default now()
);

-- Worker anti-replay
create table if not exists worker_nonces(
  nonce text primary key,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Stripe idempotency
create table if not exists stripe_events(
  event_id text primary key,
  type text,
  created_at timestamptz default now()
);

-- Rate limit buckets
create table if not exists rate_limits(
  id bigint generated always as identity primary key,
  ip text not null,
  route text not null,
  bucket_start timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists rate_limits_lookup on rate_limits(ip, route, bucket_start);

-- Function: atomically claim next runnable job with lease.
create or replace function claim_next_job(p_lock_owner text, p_lease_seconds int)
returns jobs
language plpgsql
as $$
declare
  j jobs;
begin
  update jobs
    set status='processing',
        lock_owner=p_lock_owner,
        locked_until=now() + make_interval(secs => p_lease_seconds)
  where id = (
    select id
    from jobs
    where status='queued'
      and run_at <= now()
    order by run_at asc, created_at asc
    limit 1
    for update skip locked
  )
  returning * into j;

  return j;
end;
$$;

-- Optional cleanup (can be scheduled via cron):
-- delete from worker_nonces where expires_at < now();
-- delete from rate_limits where created_at < now() - interval '7 days';


-- V10: cost + usage metrics (helps control OpenAI/Places spend)
alter table analyses
  add column if not exists openai_tokens_used int,
  add column if not exists places_calls int,
  add column if not exists cost_cents_estimate int;

-- V10: rate limit table with generic key (ip/fingerprint/tokenhash)
create table if not exists rate_limits_v10(
  id bigint generated always as identity primary key,
  key text not null,
  route text not null,
  bucket_start timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists rate_limits_v10_lookup on rate_limits_v10(key, route, bucket_start);



-- V11: richer report + Places cache + retention controls
alter table analyses
  add column if not exists report_json jsonb,
  add column if not exists report_md text,
  add column if not exists competitors jsonb,
  add column if not exists sources jsonb,
  add column if not exists generated_at timestamptz,
  add column if not exists retention_until timestamptz;

create table if not exists places_cache(
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists places_cache_expires on places_cache(expires_at);

-- Helper view: delete expired cache (optional schedule)
-- delete from places_cache where expires_at < now();



-- V13: optional helper to requeue stuck jobs (can be scheduled via cron)

create or replace function requeue_stuck_jobs(p_max int default 50)
returns int
language plpgsql
as $$
declare
  n int := 0;
begin
  update jobs
    set status='queued',
        attempt_count=attempt_count+1,
        run_at=now() + make_interval(secs => least(60 * (attempt_count+1), 300)),
        locked_until=null,
        lock_owner=null,
        last_error='lease_expired_requeued'
  where id in (
    select id
    from jobs
    where status='processing'
      and locked_until < now()
    limit p_max
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- V13: cleanup helpers (optional)
-- delete from worker_nonces where expires_at < now();
-- delete from rate_limits_v10 where created_at < now() - interval '3 days';
-- delete from analyses where retention_until < now();
