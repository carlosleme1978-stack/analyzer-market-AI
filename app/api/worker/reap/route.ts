import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

/**
 * Re-queue stuck jobs:
 * - status=processing
 * - locked_until < now()
 *
 * Called by the worker at startup (or periodically).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const lockOwner = String(body.lock_owner || 'worker').slice(0, 64)

  const nowIso = new Date().toISOString()
  const { data: stuck, error } = await supabase
    .from('jobs')
    .select('id,analysis_id,attempt_count')
    .eq('status', 'processing')
    .lt('locked_until', nowIso)
    .limit(50)

  if (error) return NextResponse.json({ error: 'reap_failed' }, { status: 500 })
  if (!stuck || stuck.length === 0) return NextResponse.json({ ok: true, requeued: 0 })

  let requeued = 0
  for (const j of stuck) {
    const attempts = (j.attempt_count || 0) + 1
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
        last_error: 'lease_expired_requeued'
      })
      .eq('id', j.id)

    await supabase.from('analysis_events').insert({
      analysis_id: j.analysis_id,
      event: 'job_reaped',
      meta: { job_id: j.id, attempts, run_at: runAt, prev_lock_owner: lockOwner }
    })

    requeued += 1
  }

  return NextResponse.json({ ok: true, requeued })
}
