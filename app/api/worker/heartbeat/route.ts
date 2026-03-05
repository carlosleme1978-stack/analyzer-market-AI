import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = JSON.parse(rawBody || '{}') as {
    job_id: string
    lock_owner: string
    extend_seconds?: number
  }

  if (!body.job_id || !body.lock_owner) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const extend = Math.max(30, Math.min(Number(body.extend_seconds || 120), 600))
  const now = new Date().toISOString()
  const until = new Date(Date.now() + extend * 1000).toISOString()

  // Only extend if the same worker still owns the lock and job is processing.
  const { data, error } = await supabase
    .from('jobs')
    .update({ locked_until: until })
    .eq('id', body.job_id)
    .eq('status', 'processing')
    .eq('lock_owner', body.lock_owner)
    .gt('locked_until', now)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_locked' }, { status: 409 })

  return NextResponse.json({ ok: true, locked_until: until })
}
