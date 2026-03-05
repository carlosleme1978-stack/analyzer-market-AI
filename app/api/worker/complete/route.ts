import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = JSON.parse(rawBody || '{}') as {
    job_id: string
    analysis_id: string
    lock_owner: string
    ok: boolean
    result?: { score: number; summary: string; recommendations: any; report_json?: any; report_md?: string; competitors?: any; sources?: any; usage?: { openai_tokens?: number; places_calls?: number; cost_cents_estimate?: number } }
    error?: string
  }

  if (!body.job_id || !body.analysis_id || !body.lock_owner) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  // Ensure this worker still owns the lease for this job
  const nowIso = new Date().toISOString()
  const { data: job } = await supabase.from('jobs').select('*').eq('id', body.job_id).single()
  if (!job || job.status !== 'processing' || job.lock_owner !== body.lock_owner || (job.locked_until && job.locked_until <= nowIso)) {
    return NextResponse.json({ error: 'lease_invalid' }, { status: 409 })
  }

  if (body.ok) {
    const usage = body.result?.usage || {}
    await supabase
      .from('analyses')
      .update({
        status: 'ready',
        score: body.result?.score,
        summary: body.result?.summary,
        recommendations: body.result?.recommendations,
        report_json: body.result?.report_json ?? null,
        report_md: body.result?.report_md ?? null,
        competitors: body.result?.competitors ?? null,
        sources: body.result?.sources ?? null,
        generated_at: new Date().toISOString(),
        retention_until: new Date(Date.now() + parseInt(process.env.RETENTION_DAYS || '30', 10) * 86400 * 1000).toISOString(),
        openai_tokens_used: usage.openai_tokens ?? null,
        places_calls: usage.places_calls ?? null,
        cost_cents_estimate: usage.cost_cents_estimate ?? null
      })
      .eq('id', body.analysis_id)

    await supabase
      .from('jobs')
      .update({ status: 'succeeded', finished_at: new Date().toISOString() })
      .eq('id', body.job_id)

    await supabase.from('analysis_events').insert({
      analysis_id: body.analysis_id,
      event: 'job_succeeded',
      meta: { job_id: body.job_id, lock_owner: body.lock_owner, usage }
    })

    return NextResponse.json({ ok: true })
  }

  // failure => retry with backoff
  const attempts = (job?.attempt_count || 0) + 1
  const maxAttempts = 5

  if (attempts >= maxAttempts) {
    await supabase
      .from('jobs')
      .update({
        status: 'dead',
        attempt_count: attempts,
        finished_at: new Date().toISOString(),
        last_error: body.error || 'unknown'
      })
      .eq('id', body.job_id)

    await supabase.from('analyses').update({ status: 'failed' }).eq('id', body.analysis_id)

    await supabase.from('analysis_events').insert({
      analysis_id: body.analysis_id,
      event: 'job_dead',
      meta: { job_id: body.job_id, attempts, error: body.error, lock_owner: body.lock_owner }
    })

    return NextResponse.json({ ok: false, dead: true })
  }

  const backoffSeconds = Math.min(60 * attempts, 300)
  const runAt = new Date(Date.now() + backoffSeconds * 1000).toISOString()

  await supabase
    .from('jobs')
    .update({
      status: 'queued',
      attempt_count: attempts,
      run_at: runAt,
      locked_until: null,
      lock_owner: null,
      last_error: body.error || 'unknown'
    })
    .eq('id', body.job_id)

  await supabase.from('analysis_events').insert({
    analysis_id: body.analysis_id,
    event: 'job_retry_scheduled',
    meta: { job_id: body.job_id, attempts, run_at: runAt, error: body.error, lock_owner: body.lock_owner }
  })

  return NextResponse.json({ ok: false, retry: true })
}
