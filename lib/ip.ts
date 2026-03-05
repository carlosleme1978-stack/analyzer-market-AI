export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for') || ''
  // x-forwarded-for can be a comma-separated list. Take the first non-empty.
  const ip = xff.split(',').map(s => s.trim()).find(Boolean)
  return ip || headers.get('x-real-ip') || 'unknown'
}
