import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const cache_key = String(body.cache_key || '')
  const payload = body.payload
  const ttl_seconds = Number(body.ttl_seconds || 0)

  if (!cache_key || !payload || !ttl_seconds) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  // Safety cap: never store beyond 30 days by default (Places ToS friendly cache window).
  const maxTtl = 30 * 86400
  const ttl = Math.max(60, Math.min(ttl_seconds, maxTtl))
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()


// Minimize payload (Places policy friendly): keep only non-sensitive, non-excessive fields.
const allowItem = (it: any) => ({
  place_id: it?.place_id || null,
  name: it?.name || null,
  rating: typeof it?.rating === 'number' ? it.rating : null,
  user_ratings_total: typeof it?.user_ratings_total === 'number' ? it.user_ratings_total : null,
  types: Array.isArray(it?.types) ? it.types.slice(0, 8) : []
})

let safePayload: any = payload
if (Array.isArray(payload)) {
  safePayload = payload.slice(0, 12).map(allowItem)
} else if (payload && Array.isArray((payload as any).items)) {
  safePayload = { ...(payload as any), items: (payload as any).items.slice(0, 12).map(allowItem) }
}

  const { error } = await supabase.from('places_cache').upsert({
    cache_key,
    payload: safePayload,
    expires_at: expiresAt
  })

  if (error) return NextResponse.json({ error: 'cache_write_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, expires_at: expiresAt })
}
