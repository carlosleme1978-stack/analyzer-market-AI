Analyzer Market AI V14 — Sellable + Cost-Control + Places Cache + Ops

# Analyzer Market AI (Next.js + Supabase + Stripe + Worker)

SaaS de análise de mercado local (ticket sugerido: **39€**), com entrega via **token** (sem login).

## O que tem (V14)
- Tokens **hash** (sem plaintext) + **expiração** + **views_limit**
- Rate limit (Upstash Redis recomendado) + fallback DB
- Stripe webhook com **assinatura**, **idempotência** e **binding** de valor/moeda/sessão
- Job queue real: **claim/lease/heartbeat/retry/DLQ**
- Worker protegido com **HMAC + timestamp + nonce** (anti-replay)
- **Places cache** no Supabase (TTL com cap de 30 dias)
- **Hard caps** de custo (OpenAI/Places) no worker + colunas opcionais no DB
- Página **Ops** (admin) para ver jobs/eventos

---

## Setup

### 1) Env
Copie `.env.example` e preencha.

Obrigatório:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `WORKER_SECRET`
- `ADMIN_SECRET` (para /admin/ops e /api/admin/cleanup)
- `PRICE_EUR_CENTS` (default 3900)

Para gerar relatório real:
- `OPENAI_API_KEY` (opcional para rodar em fallback)
- `OPENAI_MODEL` (ex.: gpt-4o-mini)
- `OPENAI_MAX_OUTPUT_TOKENS`
- `MAX_OPENAI_COST_CENTS`, `OPENAI_COST_PER_1K_TOKENS_CENTS`

Google Places:
- `GOOGLE_PLACES_API_KEY`
- `PLACES_CACHE_TTL_SECONDS` (default 604800 = 7 dias; capado a 30 dias no server)

Recomendado:
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_BASE_URL` (produção)

Retenção:
- `RETENTION_DAYS` (default 30)

---

### 2) Supabase (DB)
1) Execute `supabase/schema.sql`
2) Execute `supabase/migrations/20260304_v14.sql` (opcional mas recomendado)

> Você pode agendar CRON para:
- `select requeue_stuck_jobs(50);`
- `select delete_expired_places_cache(500);`
- apagar `worker_nonces` e rate limits antigos

---

## Fluxo
1) Front chama `POST /api/checkout` -> cria analysis + Stripe Checkout + retorna token.
2) Stripe chama `POST /api/stripe/webhook` -> marca pago + enfileira job.
3) Worker roda:
   - `POST /api/worker/claim`
   - `POST /api/worker/analysis/[id]` (pega input)
   - `POST /api/worker/places-cache/get|set`
   - `POST /api/worker/heartbeat`
   - `POST /api/worker/complete`
4) Cliente vê:
   - `/status/<TOKEN>`
   - `/report/<TOKEN>`

---

## Worker (local)
```bash
cd worker
python3 worker.py
```

---

## Ops (Admin)
- `/admin/ops?key=<ADMIN_SECRET>`
- Cleanup: `/api/admin/cleanup?key=<ADMIN_SECRET>`
# analyzer-market-AI
