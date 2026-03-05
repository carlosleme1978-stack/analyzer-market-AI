import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

  const [{ count: analyses24h }, { count: jobsQueued }, { count: jobsProcessing }, { count: jobsDead }] = await Promise.all([
    supabase.from('analyses').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'dead')
  ])

  const { data: latestJobs } = await supabase
    .from('jobs')
    .select('id,analysis_id,status,attempt_count,run_at,locked_until,lock_owner,last_error,created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: latestEvents } = await supabase
    .from('analysis_events')
    .select('id,analysis_id,event,created_at')
    .order('id', { ascending: false })
    .limit(20)

  return NextResponse.json({
    window: { since24h },
    counts: { analyses24h, jobsQueued, jobsProcessing, jobsDead },
    latestJobs: latestJobs || [],
    latestEvents: latestEvents || []
  })
}
