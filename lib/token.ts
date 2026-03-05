import crypto from 'crypto'

/**
 * 256-bit token (base64url).
 * Token is NEVER stored in plaintext, only a hash.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function requirePepper() {
  // Hard requirement in production to harden token hashing.
  if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_PEPPER) {
    throw new Error('TOKEN_PEPPER is required in production')
  }
}

/**
 * Hash token with optional server-side pepper to reduce risk if DB leaks.
 * pepper should be long random (>=32 chars) and kept server-only.
 */
export function hashToken(token: string): string {
  requirePepper()
  const pepper = process.env.TOKEN_PEPPER || ''
  return crypto.createHash('sha256').update(pepper + token).digest('hex')
}
