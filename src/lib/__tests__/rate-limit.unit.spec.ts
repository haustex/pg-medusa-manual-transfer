import { RateLimiter } from "../rate-limit"

describe("RateLimiter", () => {
  it("allows up to the limit per key and window, then reports when to retry", () => {
    let now = 0
    const limiter = new RateLimiter(3, 60_000, () => now)
    expect([1, 2, 3].map(() => limiter.hit("1.2.3.4").allowed)).toEqual([true, true, true])
    now = 15_000
    expect(limiter.hit("1.2.3.4")).toEqual({ allowed: false, retryAfterSeconds: 45 })
    // Other keys are counted separately
    expect(limiter.hit("5.6.7.8").allowed).toBe(true)
    now = 60_000
    expect(limiter.hit("1.2.3.4").allowed).toBe(true)
  })

  it("forgets expired keys when it grows large", () => {
    let now = 0
    const limiter = new RateLimiter(1, 1000, () => now)
    for (let i = 0; i < 10_001; i++) {
      limiter.hit(`ip-${i}`)
    }
    now = 2000
    limiter.hit("fresh")
    expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBe(1)
  })
})
