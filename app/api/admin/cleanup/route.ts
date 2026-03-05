import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const nowIso = new Date().toISOString()
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '30', 10)
  const rlDays = parseInt(process.env.RATE_LIMIT_RETENTION_DAYS || '3', 10)

  // Best-effort cleanup (avoid throwing on partial failure)
  const out: any = { ok: true }

  // Worker nonces
  await supabase.from('worker_nonces').delete().lt('expires_at', nowIso)

  // Legacy DB rate-limit buckets (if you're using Redis, this is mostly a safety net)
  const rlCutoff = new Date(Date.now() - rlDays * 86400 * 1000).toISOString()
  await supabase.from('rate_limits_v10').delete().lt('created_at', rlCutoff)

  // Places cache
  await supabase.from('places_cache').delete().lt('expires_at', nowIso)

  // Purge expired analyses
  await supabase.from('analyses').delete().lt('retention_until', nowIso)

  out.retention_days = retentionDays
  out.rate_limit_retention_days = rlDays
  return NextResponse.json(out)
}
