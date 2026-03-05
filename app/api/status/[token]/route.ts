import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rateLimitKey } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { hashToken } from '@/lib/token'
import { fingerprint, ua } from '@/lib/fingerprint'

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req.headers)
  const fp = fingerprint(ip, ua(req.headers))

  // Layered limits (anti-bot / anti-scrape)
  const okIp = await rateLimitKey(ip, 'status:ip', 40, 60)
  const okFp = await rateLimitKey(fp, 'status:fp', 25, 60)
  if (!okIp || !okFp) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const tokenHash = hashToken(params.token)

  // Token-specific limiter (stops distributed scraping on one token)
  const okTok = await rateLimitKey(tokenHash, 'status:token', 20, 60)
  if (!okTok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { data, error } = await supabase
    .from('analyses')
    .select('id,status,expires_at,paid')
    .eq('token_hash', tokenHash)
    .single()

  if (error || !data) return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 })

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 404 })
  }

  // Observability (best effort)
  await supabase.from('analysis_events').insert({
    analysis_id: data.id,
    event: 'status_checked',
    meta: { fp }
  })

  return NextResponse.json({
    status: data.status,
    paid: !!data.paid
  })
}
