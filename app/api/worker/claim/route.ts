import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const lockOwner = String(body.lock_owner || 'worker').slice(0, 64)

  const defaultLease = Number(process.env.JOB_LEASE_SECONDS || 180)
  const requestedLease = Number(body.lease_seconds || defaultLease)
  const leaseSeconds = Math.max(30, Math.min(requestedLease, 600)) // hard safety caps

  const { data, error } = await supabase.rpc('claim_next_job', {
    p_lock_owner: lockOwner,
    p_lease_seconds: leaseSeconds
  })

  if (error) return NextResponse.json({ error: 'claim_failed' }, { status: 500 })

// Se a função não encontrou job, ela pode voltar um record com id null.
// Trate isso como "sem job".
if (!data || !data.id) return NextResponse.json({ job: null })

await supabase.from('analysis_events').insert({
  analysis_id: data.analysis_id,
  event: 'job_claimed',
  meta: { job_id: data.id, lock_owner: lockOwner, lease_seconds: leaseSeconds }
})

return NextResponse.json({ job: data })}