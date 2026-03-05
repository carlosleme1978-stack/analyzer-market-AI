import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase'
import { generateToken, hashToken } from '@/lib/token'
import { getClientIp } from '@/lib/ip'
import { rateLimitKey } from '@/lib/rateLimit'
import { fingerprint, ua } from '@/lib/fingerprint'

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'missing_stripe_key' }, { status: 500 })

  const ip = getClientIp(req.headers)
  const fp = fingerprint(ip, ua(req.headers))

  // Prevent bots from creating unlimited sessions
  const okIp = await rateLimitKey(ip, 'checkout:ip', 10, 60)
  const okFp = await rateLimitKey(fp, 'checkout:fp', 6, 60)
  if (!okIp || !okFp) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

  const body = await req.json().catch(() => ({}))
  const { query, location, business, keywords } = body as { query?: string; location?: string; business?: string; keywords?: string }

  const token = generateToken()
  const tokenHash = hashToken(token)

  const expiryHours = parseInt(process.env.TOKEN_EXPIRY_HOURS || '48', 10)
  const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()

  const viewsLimit = parseInt(process.env.MAX_TOKEN_VIEWS || '5', 10)

  const currency = (process.env.CURRENCY || 'eur').toLowerCase()
  const amount = parseInt(process.env.PRICE_EUR_CENTS || '3900', 10)

  const { data: analysis, error } = await supabase
    .from('analyses')
    .insert({
      token_hash: tokenHash,
      status: 'created',
      paid: false,
      expires_at: expiresAt,
      views_limit: viewsLimit,
      input: { query, location, business, keywords },
      price_cents: amount,
      currency,
      max_cost_cents: parseInt(process.env.MAX_OPENAI_COST_CENTS || '12', 10),
      max_places_calls: parseInt(process.env.MAX_PLACES_CALLS || '5', 10),
      max_openai_tokens: parseInt(process.env.MAX_OPENAI_TOKENS || '1200', 10)
    })
    .select('id')
    .single()

  if (error || !analysis) return NextResponse.json({ error: 'db_error' }, { status: 500 })

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'http://localhost:3000').replace(/\/$/, '')
  // Do NOT put token in URLs (leaks via logs/referrers/history)
  const successUrl = `${baseUrl}/success`
  const cancelUrl = `${baseUrl}/cancel`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: 'Market analysis report',
            description: 'Analyzer Market AI — market opportunity report'
          }
        },
        quantity: 1
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      analysis_id: analysis.id,
      token_hash: tokenHash
    }
  })

  await supabase
    .from('analyses')
    .update({ stripe_session_id: session.id })
    .eq('id', analysis.id)

  await supabase.from('analysis_events').insert({
    analysis_id: analysis.id,
    event: 'checkout_created',
    meta: { fp, session_id: session.id }
  })

  return NextResponse.json({
    token,
    checkout_url: session.url
  })
}
