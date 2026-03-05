import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getClientIp } from '@/lib/ip'
import { rateLimitKey } from '@/lib/rateLimit'
import { fingerprint, ua } from '@/lib/fingerprint'
import crypto from 'crypto'

type Competitor = {
  name?: string
  rating?: number
  user_ratings_total?: number
  lat?: number
  lng?: number
}

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function stats(items: Competitor[]) {
  const ratings = items.map(i => Number(i.rating || 0)).filter(n => Number.isFinite(n) && n > 0)
  const reviews = items.map(i => Number(i.user_ratings_total || 0)).filter(n => Number.isFinite(n) && n >= 0)
  const avg_rating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : 0
  const avg_reviews = reviews.length ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length) : 0
  return { competitors_found: items.length, avg_rating, avg_reviews }
}

function entryRisk(bench: { competitors_found: number; avg_rating: number; avg_reviews: number }, competitors: Competitor[]) {
  const c = bench.competitors_found
  const top = [...competitors]
    .sort((a, b) => Number(b.user_ratings_total || 0) - Number(a.user_ratings_total || 0))
    .slice(0, 3)
  const top_reviews = top.reduce((s, it) => s + Number(it.user_ratings_total || 0), 0)
  const total_reviews = competitors.reduce((s, it) => s + Number(it.user_ratings_total || 0), 0)
  const dominance = total_reviews > 0 ? Math.round((top_reviews / total_reviews) * 100) : 0

  let level: 'Baixo' | 'Médio' | 'Alto' = 'Baixo'
  // Conservative heuristic: competitive entry risk indicator (not a financial promise).
  if (c >= 12 || bench.avg_reviews >= 250 || dominance >= 55) level = 'Alto'
  else if (c >= 6 || bench.avg_reviews >= 120 || dominance >= 40) level = 'Médio'

  const reasons: string[] = []
  if (c >= 6) reasons.push(`${c} concorrentes relevantes no recorte analisado`)
  if (bench.avg_rating >= 4.5) reasons.push(`padrão de qualidade alto (rating médio ${bench.avg_rating}⭐)`)
  if (bench.avg_reviews >= 120) reasons.push(`prova social forte (média ${bench.avg_reviews} reviews)`)
  if (dominance >= 40) reasons.push(`mercado concentrado (top 3 somam ~${dominance}% das reviews)`)
  if (!reasons.length) reasons.push('concorrência moderada e barreiras de reputação ainda controláveis')

  const next =
    level === 'Alto'
      ? 'Entrar exige diferenciação clara + execução forte em reputação (reviews) e oferta.'
      : level === 'Médio'
        ? 'Há espaço, mas você precisa de um plano de reputação e aquisição consistente.'
        : 'Boa chance de capturar demanda com boa oferta e constância.'

  return { level, reasons: reasons.slice(0, 4), next }
}

function quant(n: number, p = 3) {
  const m = Math.pow(10, p)
  return Math.round(n * m) / m
}

function mapPreview(competitors: Competitor[]) {
  const pts = competitors
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .slice(0, 12)
    .map((c) => ({
      // Quantize to reduce exactness (anti-scrape friendly) while keeping the real distribution shape.
      lat: quant(Number(c.lat)),
      lng: quant(Number(c.lng)),
      rating: c.rating,
      reviews: c.user_ratings_total,
      name: c.name
    }))

  if (!pts.length) return { points: [], note: 'Sem coordenadas disponíveis na prévia.' }

  let minLat = pts[0].lat,
    maxLat = pts[0].lat,
    minLng = pts[0].lng,
    maxLng = pts[0].lng
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }

  const center = { lat: quant((minLat + maxLat) / 2), lng: quant((minLng + maxLng) / 2) }

  return {
    center,
    bbox: { minLat, maxLat, minLng, maxLng },
    points: pts,
    note: 'Mapa esquemático: pontos reais (quantizados) para indicar densidade e distribuição.'
  }
}

function opportunityLabel(competitors: number, avg_rating: number, avg_reviews: number) {
  const pressure = Math.min(100, competitors * 7)
  const barrier = Math.min(100, Math.floor(avg_reviews / 4))
  const quality = Math.min(100, Math.floor(avg_rating * 20))
  const score = 100 - Math.round(pressure * 0.55 + barrier * 0.35 + quality * 0.10)
  if (score >= 60) return 'Alta'
  if (score >= 35) return 'Média'
  return 'Baixa'
}

function buildBlocks(context: { query: string; location?: string; business?: string; keywords?: string }, competitors: Competitor[]) {
  const bench = stats(competitors)

  const baseRow = {
    region: (context.location || 'Área analisada').trim() || 'Área analisada',
    competitors: bench.competitors_found,
    avg_rating: bench.avg_rating,
    avg_reviews: bench.avg_reviews,
    opportunity: opportunityLabel(bench.competitors_found, bench.avg_rating, bench.avg_reviews)
  }

  const opportunity_map = {
    rows: [baseRow],
    insight: `${baseRow.region} tem ${baseRow.competitors} concorrentes e média ${baseRow.avg_reviews} reviews — oportunidade ${baseRow.opportunity}.`
  }

  const top = [...competitors]
    .sort((a, b) => Number(b.user_ratings_total || 0) - Number(a.user_ratings_total || 0))
    .slice(0, 3)
  const top_avg_rating = top.length ? Number((top.reduce((s, c) => s + Number(c.rating || 0), 0) / top.length).toFixed(2)) : 0
  const top_avg_reviews = top.length ? Math.round(top.reduce((s, c) => s + Number(c.user_ratings_total || 0), 0) / top.length) : 0

  const rating_target = Math.min(5, Math.max(bench.avg_rating, top_avg_rating - 0.05))
  const reviews_target = Math.round(Math.max(bench.avg_reviews, Math.floor(top_avg_reviews * 0.7)) / 10) * 10

  const competitive_gap = {
    table: [
      { metric: 'Rating', market_avg: bench.avg_rating, top_competitors: top_avg_rating },
      { metric: 'Reviews', market_avg: bench.avg_reviews, top_competitors: top_avg_reviews }
    ],
    targets: { rating_min: Number(rating_target.toFixed(2)), reviews_target },
    insight: `Para competir, mire em rating mínimo ≈ ${rating_target.toFixed(2)} e reviews alvo ≈ ${reviews_target}.`
  }

  const q = (context.query || '').toLowerCase()
  const keys = ((context.keywords || '') + ' ' + (context.business || '') + ' ' + q).toLowerCase()
  const is_visual = ['estética', 'barbear', 'barbearia', 'restaurante', 'café', 'cafe', 'padaria', 'pizzaria', 'academia', 'moda', 'salão', 'salao', 'fotografia', 'personal'].some(k => keys.includes(k))
  const high_intent = Boolean((context.keywords || '').trim()) || ['perto', 'próximo', 'proximo', '24h', 'urgência', 'urgencia', 'preço', 'preco', 'orçamento', 'orcamento', 'melhor'].some(k => q.includes(k))

  const acquisition_strategy = {
    rows: [
      { channel: 'SEO local / Google Maps', priority: bench.competitors_found >= 6 ? 'Alta' : 'Média', reason: 'Decisão local é fortemente influenciada por Maps, reviews e prova social.' },
      { channel: 'Google Ads', priority: high_intent ? 'Alta' : 'Média', reason: 'Capta demanda de alta intenção quando o cliente pesquisa ativamente.' },
      { channel: 'Instagram Ads', priority: is_visual ? 'Média' : 'Baixa', reason: 'Bom para awareness e prova visual; funciona melhor com oferta clara.' },
      { channel: 'Facebook Ads', priority: is_visual || bench.competitors_found >= 8 ? 'Média' : 'Baixa', reason: 'Alcance local amplo; útil para remarketing e ofertas.' },
      { channel: 'TikTok Ads', priority: is_visual ? 'Média' : 'Baixa', reason: 'Mais topo de funil; melhor para nichos visuais.' }
    ]
  }

  let intensity = 'Baixa'
  if (bench.competitors_found >= 12 || bench.avg_reviews >= 250) intensity = 'Alta'
  else if (bench.competitors_found >= 6 || bench.avg_reviews >= 120) intensity = 'Média'

  const mult = intensity === 'Alta' ? 1.5 : intensity === 'Média' ? 1.25 : 1.0
  const reviews_target2 = Math.round(Math.max(30, bench.avg_reviews) * mult / 10) * 10

  const investment_estimate = {
    reviews_target: reviews_target2,
    marketing_budget_eur_month: intensity === 'Alta' ? { min: 600, max: 1200 } : intensity === 'Média' ? { min: 300, max: 600 } : { min: 150, max: 300 },
    time_to_compete_months: intensity === 'Alta' ? { min: 6, max: 12 } : intensity === 'Média' ? { min: 3, max: 6 } : { min: 1, max: 3 },
    competitive_intensity: intensity,
    disclaimer: 'Estimativas heurísticas (não são promessa de resultado financeiro).'
  }

  return { opportunity_map, competitive_gap, acquisition_strategy, investment_estimate }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const fp = fingerprint(ip, ua(req.headers))

  // Preview is a conversion lever, but must be protected from bots/scraping
  const okIp = await rateLimitKey(ip, 'preview:ip', 25, 60)
  const okFp = await rateLimitKey(fp, 'preview:fp', 15, 60)
  if (!okIp || !okFp) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const { query, location, business, keywords } = body as { query?: string; location?: string; business?: string; keywords?: string }

  const q = (query || [business, keywords, location].filter(Boolean).join(' ')).trim()
  if (!q) return NextResponse.json({ error: 'missing_query' }, { status: 400 })

  const region = (process.env.PREVIEW_REGION || '').trim()
  const cacheKey = 'preview:' + sha256(q + '|' + region)
  const ttlHours = parseInt(process.env.PREVIEW_CACHE_HOURS || '24', 10)
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString()

  // Cache lookup (places_cache)
  const { data: cached } = await supabase.from('places_cache').select('value,expires_at').eq('cache_key', cacheKey).maybeSingle()
  if (cached?.value && (!cached.expires_at || new Date(cached.expires_at) > new Date())) {
    return NextResponse.json({ ok: true, cached: true, ...cached.value })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  let competitors: Competitor[] = []
  let raw_status = 'no_api_key'

  if (apiKey) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
    url.searchParams.set('query', q)
    url.searchParams.set('key', apiKey)
    if (region) url.searchParams.set('region', region)

    const r = await fetch(url.toString(), { cache: 'no-store' })
    const payload = (await r.json().catch(() => ({}))) as any
    raw_status = String(payload?.status || '')
    const results = Array.isArray(payload?.results) ? payload.results.slice(0, 12) : []
    competitors = results.map((it: any) => ({
      name: it?.name,
      rating: typeof it?.rating === 'number' ? it.rating : undefined,
      user_ratings_total: typeof it?.user_ratings_total === 'number' ? it.user_ratings_total : undefined,
      lat: typeof it?.geometry?.location?.lat === 'number' ? it.geometry.location.lat : undefined,
      lng: typeof it?.geometry?.location?.lng === 'number' ? it.geometry.location.lng : undefined
    }))
  }

  const bmk = stats(competitors)
  const score_estimate = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Math.max(0, 100 - bmk.competitors_found * 6) * 0.35) +
          (Math.min(100, Math.round(bmk.avg_reviews / 5)) * 0.30) +
          (Math.min(100, Math.round(bmk.avg_rating * 20)) * 0.35)
      )
    )
  )

  const preview = {
    query: q,
    benchmarks: bmk,
    score_estimate,
    entry_risk: entryRisk(bmk, competitors),
    map_preview: mapPreview(competitors),
    blocks: buildBlocks({ query: q, location, business, keywords }, competitors),
    highlights: [
      `Concorrentes relevantes encontrados: ${bmk.competitors_found}`,
      `Média de rating na região: ${bmk.avg_rating || 0}⭐`,
      `Média de volume de avaliações: ${bmk.avg_reviews || 0}`
    ],
    raw_status
  }

  // Store cache (best-effort)
  await supabase.from('places_cache').upsert({ cache_key: cacheKey, value: preview, expires_at: expiresAt })

  return NextResponse.json({ ok: true, cached: false, ...preview })
}
