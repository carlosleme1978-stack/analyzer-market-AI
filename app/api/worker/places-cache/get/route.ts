import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = rawBody ? JSON.parse(rawBody) : {}
  const cache_key = String(body.cache_key || '')
  if (!cache_key) return NextResponse.json({ error: 'missing_cache_key' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('places_cache')
    .select('cache_key,payload,expires_at')
    .eq('cache_key', cache_key)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'cache_lookup_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ hit: false })

  return NextResponse.json({ hit: true, payload: data.payload, expires_at: data.expires_at })
}
