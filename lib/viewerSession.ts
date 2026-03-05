import crypto from 'crypto'

type SessionPayload = { aid: string; exp: number; rnd: string }

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return Buffer.from(s + pad, 'base64')
}

export function createViewerSessionCookie(aid: string, ttlSeconds = 600) {
  const secret = process.env.VIEWER_SESSION_SECRET
  if (!secret) throw new Error('missing_viewer_session_secret')

  const payload: SessionPayload = { aid, exp: Math.floor(Date.now() / 1000) + ttlSeconds, rnd: crypto.randomBytes(12).toString('hex') }
  const raw = Buffer.from(JSON.stringify(payload), 'utf-8')
  const body = b64url(raw)
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest())
  const value = `${body}.${sig}`
  return value
}

export function verifyViewerSessionCookie(value: string | undefined | null): { ok: boolean; aid?: string; error?: string } {
  if (!value) return { ok: false, error: 'missing' }
  const secret = process.env.VIEWER_SESSION_SECRET
  if (!secret) return { ok: false, error: 'missing_secret' }

  const parts = String(value).split('.')
  if (parts.length !== 2) return { ok: false, error: 'bad_format' }
  const [body, sig] = parts
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest())
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, error: 'bad_sig' }

  let payload: SessionPayload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf-8'))
  } catch {
    return { ok: false, error: 'bad_json' }
  }
  if (!payload?.aid || !payload?.exp) return { ok: false, error: 'bad_payload' }
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: 'expired' }
  return { ok: true, aid: payload.aid }
}
