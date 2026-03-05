import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const kind = String(body.kind || '')
  const amount = Math.max(0, Math.min(1_000_000, Number(body.amount || 0)))

  const dayIso = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const day = dayIso

  // If limits are not set, allow (no-op)
  const maxDailyOpenAICents = parseInt(process.env.MAX_DAILY_OPENAI_CENTS || '0', 10)
  const maxDailyPlacesCalls = parseInt(process.env.MAX_DAILY_PLACES_CALLS || '0', 10)

  let p_kind = ''
  let limit = 0
  if (kind === 'openai_cents') {
    p_kind = 'openai_cents'
    limit = maxDailyOpenAICents
  } else if (kind === 'places_calls') {
    p_kind = 'places_calls'
    limit = maxDailyPlacesCalls
  } else {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 })
  }

  if (!limit || limit <= 0) {
    return NextResponse.json({ ok: true, used: null, remaining: null, limit: null })
  }

  const { data, error } = await supabase.rpc('consume_daily_usage', {
    p_day: day,
    p_kind,
    p_amount: amount,
    p_limit: limit
  })

  if (error || !Array.isArray(data) || !data.length) {
    return NextResponse.json({ error: 'daily_usage_failed' }, { status: 500 })
  }

  const row = data[0]
  return NextResponse.json({
    ok: !!row.ok,
    used: row.used,
    remaining: row.remaining,
    limit
  })
}
