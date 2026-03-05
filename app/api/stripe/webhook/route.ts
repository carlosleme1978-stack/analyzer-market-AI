import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripeKey || !webhookSecret) return NextResponse.json({ error: 'missing_stripe_config' }, { status: 500 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  const sig = req.headers.get('stripe-signature') || ''
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // Idempotency guard (Stripe retries)
  const { error: evErr } = await supabase.from('stripe_events').insert({
    event_id: event.id,
    type: event.type
  })
  if (evErr) return NextResponse.json({ received: true })

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const analysisId = session.metadata?.analysis_id

  if (!analysisId) return NextResponse.json({ error: 'missing_metadata' }, { status: 400 })

  // Fetch analysis to validate amount/currency AND bind to the created session id
  const { data: analysis } = await supabase
    .from('analyses')
    .select('id,price_cents,currency,stripe_session_id')
    .eq('id', analysisId)
    .single()

  if (!analysis) return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 })

  if (analysis.stripe_session_id && session.id !== analysis.stripe_session_id) {
    // Prevent "pay on a different session" shenanigans
    return NextResponse.json({ error: 'session_mismatch' }, { status: 400 })
  }

  const currency = (analysis.currency || 'eur').toLowerCase()
  const expectedAmount = Number(analysis.price_cents || 0)

  const amountTotal = session.amount_total ?? 0
  const paid = session.payment_status === 'paid'

  if (!paid) return NextResponse.json({ received: true })
  if ((session.currency || '').toLowerCase() !== currency) return NextResponse.json({ error: 'currency_mismatch' }, { status: 400 })
  if (amountTotal !== expectedAmount) return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 })

  // Mark paid + queue
  await supabase
    .from('analyses')
    .update({ paid: true, status: 'queued' })
    .eq('id', analysisId)

  // Enqueue job (idempotent via unique(analysis_id))
  await supabase.from('jobs').upsert(
    {
      analysis_id: analysisId,
      status: 'queued',
      run_at: new Date().toISOString()
    },
    { onConflict: 'analysis_id' }
  )

  await supabase.from('analysis_events').insert({
    analysis_id: analysisId,
    event: 'payment_confirmed',
    meta: { session_id: session.id }
  })

  return NextResponse.json({ received: true })
}
