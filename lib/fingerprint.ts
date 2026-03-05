import crypto from 'crypto'

export function ua(headers: Headers): string {
  return headers.get('user-agent') || ''
}

/**
 * Lightweight fingerprint for abuse controls.
 * Not used for tracking across time; only short-lived rate limiting.
 */
export function fingerprint(ip: string, userAgent: string): string {
  return crypto.createHash('sha256').update(ip + '|' + userAgent).digest('hex').slice(0, 32)
}
