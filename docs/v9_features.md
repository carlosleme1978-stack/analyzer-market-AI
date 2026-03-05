# V9 Features

## Payments (Stripe)
- Webhook signature verification
- Event idempotency (stripe_events)
- Amount + currency validation

## Queue
- Supabase jobs table
- Atomic claim (lease) via `claim_next_job`
- Retries with backoff + DLQ (dead)

## Worker security
- HMAC SHA-256 with `timestamp.nonce.body`
- Timestamp skew validation
- Nonce anti-replay (worker_nonces)

## Tokens
- token is **not stored**; only `token_hash` (sha256)
- expiry + views enforced

## Rate limit
- per-IP per-route, bucketed window
