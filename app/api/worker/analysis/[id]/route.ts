import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const id = params.id
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('analyses')
    .select('id,status,paid,input,price_cents,currency,openai_tokens_used,places_calls,cost_cents_estimate,created_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ analysis: data })
}
