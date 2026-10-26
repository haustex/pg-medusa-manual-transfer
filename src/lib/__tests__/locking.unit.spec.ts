import { Modules } from "@medusajs/framework/utils"
import { InProcessLocking, resolvePaymentLocking } from "../locking"

describe("InProcessLocking", () => {
  it("refuses a held key until it is released or expires", async () => {
    let now = 1_000
    const locking = new InProcessLocking(() => now)
    await locking.acquire("a", { expire: 30 })
    await expect(locking.acquire("a", { expire: 30 })).rejects.toThrow(/already held/)
    await locking.acquire("b")
    expect(await locking.release("a")).toBe(true)
    await locking.acquire("a", { expire: 30 })
    now += 30_001
    await expect(locking.acquire("a", { expire: 30 })).resolves.toBeUndefined()
    expect(await locking.release("missing")).toBe(false)
  })
})

describe("resolvePaymentLocking", () => {
  it("uses the Locking Module when the container has it", async () => {
    const module = { acquire: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(true) }
    const container = {
      hasRegistration: (key: string) => key === Modules.LOCKING,
      resolve: (key: string) => (key === Modules.LOCKING ? module : undefined),
    } as never
    const locking = resolvePaymentLocking(container)
    await locking.acquire("k", { expire: 10 })
    await locking.release("k")
    expect(module.acquire).toHaveBeenCalledWith("k", { expire: 10 })
    expect(module.release).toHaveBeenCalledWith("k")
  })

  it("falls back to one in-process lock, warning once, without the module", async () => {
    const warn = jest.fn()
    const container = {
      hasRegistration: () => false,
      resolve: () => ({ warn }),
    } as never
    const first = resolvePaymentLocking(container)
    const second = resolvePaymentLocking(container)
    expect(first).toBeInstanceOf(InProcessLocking)
    expect(second).toBe(first)
    expect(warn).toHaveBeenCalledTimes(1)
    await first.acquire("fallback-key", { expire: 5 })
    await expect(second.acquire("fallback-key")).rejects.toThrow()
    await first.release("fallback-key")
  })
})
