import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null

function bucketStart(windowSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const start = now - (now % windowSeconds)
  return new Date(start * 1000).toISOString()
}

/**
 * Rate limit with Redis (preferred) and DB fallback.
 *
 * Redis strategy: fixed-window counter with TTL.
 * DB fallback: V11 bucket table (may not scale under heavy traffic).
 */
export async function rateLimitKey(key: string, route: string, limit: number, windowSeconds: number) {
  // Prefer Redis (fast + no DB bloat)
  if (redis) {
    const now = Math.floor(Date.now() / 1000)
    const start = now - (now % windowSeconds)
    const redisKey = `rl:${route}:${key}:${start}`
    const ttl = windowSeconds + 5 // small buffer

    try {
      const n = await redis.incr(redisKey)
      if (n === 1) await redis.expire(redisKey, ttl)
      return n <= limit
    } catch {
      // fail-open to DB fallback below
    }
  }

  // DB fallback (legacy)
  const b = bucketStart(windowSeconds)

  const { count, error: countErr } = await supabase
    .from('rate_limits_v10')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .eq('route', route)
    .eq('bucket_start', b)

  if (countErr) return false
  if ((count || 0) >= limit) return false

  const { error: insertErr } = await supabase.from('rate_limits_v10').insert({
    key,
    route,
    bucket_start: b
  })

  return !insertErr
}
