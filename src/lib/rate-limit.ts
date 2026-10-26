/**
 * A small fixed-window rate limiter kept in memory, per process. It bounds
 * what one IP can send to the public proof routes; the per-order upload limit
 * is counted in the database instead, so it holds across server instances.
 */

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  hit(key: string): RateLimitResult {
    const now = this.now()
    if (this.hits.size > 10_000) {
      this.sweep(now)
    }
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true }
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
    }
    entry.count++
    return { allowed: true }
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key)
      }
    }
  }
}
