import crypto from 'crypto'
import { supabase } from '@/lib/supabase'

export type WorkerAuthResult = { ok: true } | { ok: false; error: string }

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length !== bb.length) return false
    return crypto.timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

export async function verifyWorkerRequest(rawBody: string, headers: Headers): Promise<WorkerAuthResult> {
  const secret = process.env.WORKER_SECRET
  if (!secret) return { ok: false, error: 'missing_worker_secret' }

  const sig = headers.get('x-signature') || ''
  const ts = headers.get('x-timestamp') || ''
  const nonce = headers.get('x-nonce') || ''

  if (!sig || !ts || !nonce) return { ok: false, error: 'missing_headers' }
  if (!/^[0-9]+$/.test(ts)) return { ok: false, error: 'invalid_timestamp' }

  const skew = parseInt(process.env.HMAC_MAX_SKEW_SECONDS || '300', 10)
  const now = Math.floor(Date.now() / 1000)
  const t = parseInt(ts, 10)
  if (Math.abs(now - t) > skew) return { ok: false, error: 'timestamp_skew' }

  const payload = `${ts}.${nonce}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!timingSafeEqualHex(expected, sig)) return { ok: false, error: 'bad_signature' }

  // Anti-replay: nonce must be unique for TTL window
  const ttl = parseInt(process.env.NONCE_TTL_SECONDS || '600', 10)
  const expiresAt = new Date((now + ttl) * 1000).toISOString()

  const { error } = await supabase.from('worker_nonces').insert({ nonce, expires_at: expiresAt })
  if (error) {
    // unique violation => replay
    return { ok: false, error: 'replay' }
  }

  return { ok: true }
}
