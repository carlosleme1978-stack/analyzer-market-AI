-- Analyzer Market AI V15 migration
-- 1) Atomic view consumption to prevent race conditions
-- 2) Daily usage table + RPC for global caps (OpenAI + Places)
-- 3) Cleanup helper RPC (optional scheduling)

-- Atomic consume of paid report views
create or replace function consume_analysis_view(p_id uuid)
returns table(views int)
language plpgsql
as $$
begin
  update analyses
     set views = coalesce(views, 0) + 1
   where id = p_id
     and coalesce(views, 0) < views_limit
  returning analyses.views into views;

  if not found then
    return;
  end if;

  return next;
end;
$$;

-- Daily usage (global caps)
create table if not exists daily_usage (
  day date primary key,
  openai_cents int not null default 0,
  places_calls int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function consume_daily_usage(p_day date, p_kind text, p_amount int, p_limit int)
returns table(ok boolean, used int, remaining int)
language plpgsql
as $$
declare
  cur_used int;
begin
  insert into daily_usage(day) values (p_day)
  on conflict (day) do nothing;

  if p_kind = 'openai_cents' then
    select openai_cents into cur_used from daily_usage where day = p_day for update;
    if cur_used + p_amount > p_limit then
      ok := false; used := cur_used; remaining := greatest(p_limit - cur_used, 0); return next; return;
    end if;
    update daily_usage set openai_cents = openai_cents + p_amount, updated_at = now() where day = p_day;
    ok := true; used := cur_used + p_amount; remaining := greatest(p_limit - (cur_used + p_amount), 0); return next; return;
  elsif p_kind = 'places_calls' then
    select places_calls into cur_used from daily_usage where day = p_day for update;
    if cur_used + p_amount > p_limit then
      ok := false; used := cur_used; remaining := greatest(p_limit - cur_used, 0); return next; return;
    end if;
    update daily_usage set places_calls = places_calls + p_amount, updated_at = now() where day = p_day;
    ok := true; used := cur_used + p_amount; remaining := greatest(p_limit - (cur_used + p_amount), 0); return next; return;
  else
    raise exception 'invalid_kind';
  end if;
end;
$$;

-- Optional cleanup wrapper (schedule in Supabase / pg_cron)
create or replace function run_app_cleanup(p_rl_days int default 3)
returns json
language plpgsql
as $$
declare
  out json;
  rl_cutoff timestamptz;
begin
  rl_cutoff := now() - make_interval(days => p_rl_days);

  delete from worker_nonces where expires_at < now();
  delete from rate_limits_v10 where created_at < rl_cutoff;
  delete from places_cache where expires_at < now();
  delete from analyses where retention_until < now();

  out := json_build_object('ok', true, 'rl_days', p_rl_days, 'ts', now());
  return out;
end;
$$;
