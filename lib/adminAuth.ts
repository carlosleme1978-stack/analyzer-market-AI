import { NextRequest } from 'next/server'

export function requireAdmin(req: NextRequest): { ok: boolean; error?: string } {
  const secret = process.env.ADMIN_SECRET || ''
  if (!secret) return { ok: false, error: 'admin_disabled' }

  const gotHeader = req.headers.get('x-admin-secret') || ''
  const got = gotHeader
  if (!got || got !== secret) return { ok: false, error: 'unauthorized' }

  return { ok: true }
}
