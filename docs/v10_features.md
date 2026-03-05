# Analyzer Market AI V10 features

V10 focuses on **production hardening**:

- Token hashing with **server-side pepper** (`TOKEN_PEPPER`)
- Anti-scraping: **layered rate limits** (IP + fingerprint + token-hash) using `rate_limits_v10`
- Stripe webhook: validates **session binding** + amount/currency from DB, plus idempotency
- Job queue: lease-based claim (RPC) + **lease enforcement** on complete
- Worker: **heartbeat** endpoint to extend lease during long jobs
- Cost controls: store `openai_tokens_used`, `places_calls`, `cost_cents_estimate`
- Observability: status/report views + job lifecycle events
