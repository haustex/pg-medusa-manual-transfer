import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

/**
 * Locks for the workflows that rewrite a payment's data (proof upload,
 * rejection, confirmation, underpayment, reminders, expiry).
 *
 * Medusa's Locking Module is used whenever the app has it, which is the
 * default: with `@medusajs/medusa/locking-redis` or `locking-postgres` the lock
 * holds across the server, the worker and several instances. Only when an app
 * turned the module off does this fall back to a lock kept in this process,
 * which protects a single instance and nothing more.
 */

export type PaymentLocking = {
  acquire(key: string, options?: { expire?: number }): Promise<void>
  release(key: string): Promise<boolean>
}

/** A lock held in memory, per process. Keys expire after `expire` seconds like the Locking Module's. */
export class InProcessLocking implements PaymentLocking {
  private held = new Map<string, number>()

  constructor(private readonly now: () => number = Date.now) {}

  async acquire(key: string, { expire }: { expire?: number } = {}): Promise<void> {
    const now = this.now()
    const until = this.held.get(key)
    if (until !== undefined && until > now) {
      throw new MedusaError(MedusaError.Types.CONFLICT, `Lock ${key} is already held`)
    }
    this.held.set(key, expire ? now + expire * 1000 : Number.POSITIVE_INFINITY)
  }

  async release(key: string): Promise<boolean> {
    return this.held.delete(key)
  }
}

const fallback = new InProcessLocking()
let warned = false

export function resolvePaymentLocking(container: MedusaContainer): PaymentLocking {
  if (container.hasRegistration(Modules.LOCKING)) {
    const locking = container.resolve(Modules.LOCKING)
    return {
      acquire: (key, options) => locking.acquire(key, { expire: options?.expire }),
      release: (key) => locking.release(key),
    }
  }
  if (!warned) {
    warned = true
    try {
      container
        .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
        .warn(
          "manual transfer: no Locking Module registered, payment locks are kept in this process only. " +
            "Enable @medusajs/medusa/locking (with the redis or postgres provider) when running several instances."
        )
    } catch {
      // no logger in the container
    }
  }
  return fallback
}
