// Deprecated in V9 (kept only for backward compatibility).
// Use /api/worker/claim and /api/worker/complete.

import { NextRequest, NextResponse } from 'next/server'
import { verifyWorkerRequest } from '@/lib/workerAuth'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await verifyWorkerRequest(rawBody, req.headers)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  return NextResponse.json({ ok: true, deprecated: true })
}
