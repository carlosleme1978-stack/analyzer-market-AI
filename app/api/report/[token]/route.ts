import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rateLimitKey } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { hashToken } from '@/lib/token'
import { fingerprint, ua } from '@/lib/fingerprint'
import { createViewerSessionCookie, verifyViewerSessionCookie } from '@/lib/viewerSession'

type Competitor = { name?: string; rating?: number; user_ratings_total?: number; types?: string[] }

function aggregate(competitors: Competitor[]) {
  const top = competitors.slice(0, 10).map((c) => ({
    name: c?.name,
    rating: typeof c?.rating === 'number' ? c.rating : null,
    user_ratings_total: typeof c?.user_ratings_total === 'number' ? c.user_ratings_total : null
  }))

  const ratings = top.map((c) => Number(c.rating || 0)).filter((n) => Number.isFinite(n) && n > 0)
  const reviews = top.map((c) => Number(c.user_ratings_total || 0)).filter((n) => Number.isFinite(n) && n >= 0)

  const avg_rating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : 0
  const avg_reviews = reviews.length ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length) : 0

  return { top, stats: { competitors_considered: top.length, avg_rating, avg_reviews } }
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req.headers)
  const fp = fingerprint(ip, ua(req.headers))

  // Layered anti-scraping limits
  const okIp = await rateLimitKey(ip, 'report:ip', 25, 60)
  const okFp = await rateLimitKey(fp, 'report:fp', 15, 60)
  if (!okIp || !okFp) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const tokenHash = hashToken(params.token)

  // Token limiter (protects paid content)
  const okTok = await rateLimitKey(tokenHash, 'report:token', 10, 60)
  if (!okTok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { data, error } = await supabase.from('analyses').select('*').eq('token_hash', tokenHash).single()
  if (error || !data) return NextResponse.json({ error: 'invalid_or_unavailable' }, { status: 404 })

  if (data.expires_at && new Date(data.expires_at) < new Date()) return NextResponse.json({ error: 'invalid_or_unavailable' }, { status: 404 })
  if (!data.paid) return NextResponse.json({ error: 'invalid_or_unavailable' }, { status: 404 })
  if (data.status !== 'ready') return NextResponse.json({ error: 'invalid_or_unavailable' }, { status: 404 })

  // Atomic: consume 1 view in DB (prevents race between tabs/requests)
  const { data: consumed, error: consErr } = await supabase.rpc('consume_analysis_view', { p_id: data.id })
  const viewsUsed = Array.isArray(consumed) && consumed.length ? consumed[0]?.views : null
  if (consErr || viewsUsed == null) return NextResponse.json({ error: 'views_exceeded' }, { status: 403 })

  await supabase.from('analysis_events').insert({ analysis_id: data.id, event: 'report_viewed', meta: { fp, views: viewsUsed } })

  // Create a short-lived viewer session cookie to support "detail" access without reusing token everywhere
  let cookieValue: string | null = null
  try {
    cookieValue = createViewerSessionCookie(String(data.id), 10 * 60)
  } catch {
    cookieValue = null
  }

  const url = new URL(req.url)
  const wantsDetail = url.searchParams.get('detail') === '1'

  const competitors = Array.isArray(data.competitors) ? (data.competitors as any[]) : []
  const agg = aggregate(competitors as any)

  // By default (detail=0), return only minimized competitor data + aggregated stats
  let competitors_out: any = agg.top
  let sources_out: any = { places: Boolean(data?.sources?.places), openai: Boolean(data?.sources?.openai) }

  if (wantsDetail) {
    const v = verifyViewerSessionCookie(req.cookies.get('am_view')?.value)
    if (!v.ok || v.aid !== String(data.id)) return NextResponse.json({ error: 'detail_requires_session' }, { status: 403 })
    competitors_out = competitors
    sources_out = data.sources
  }

  const res = NextResponse.json({
    score: data.score,
    summary: data.summary,
    recommendations: data.recommendations,
    report_json: data.report_json,
    report_md: data.report_md,
    competitors: competitors_out,
    competitors_stats: agg.stats,
    sources: sources_out,
    meta: {
      views_used: viewsUsed,
      views_limit: data.views_limit,
      expires_at: data.expires_at,
      generated_at: data.generated_at
    }
  })

  if (cookieValue) {
    res.cookies.set({
      name: 'am_view',
      value: cookieValue,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60
    })
  }
  return res
}
