import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { EXPIRABLE_STATUSES, REMINDABLE_STATUSES } from "../lib/payment-data"
import { getDeadlineOptions } from "../lib/plugin-options"
import { findTransfersDue } from "../lib/transfer-queue"
import { expireManualTransferPaymentWorkflow } from "../workflows/expire-manual-transfer-payment"
import { remindManualTransferPaymentWorkflow } from "../workflows/remind-manual-transfer-payment"

/** A payment that changed between the query and its lock is skipped quietly */
function isSkip(error: unknown): boolean {
  return error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED
}

/**
 * Every 15 minutes: sends the reminder event for payments due within
 * `reminderHours` (once each), then cancels orders whose deadline passed
 * while still awaiting payment (or after a rejected proof), releasing their
 * stock. Payments with a proof waiting for review or partly paid are left for
 * an admin.
 */
export default async function manualTransferDeadlinesJob(container: MedusaContainer) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { reminderHours, autoCancelExpired } = getDeadlineOptions(container)
  const now = new Date()

  const reminders = await findTransfersDue(pg, {
    statuses: REMINDABLE_STATUSES,
    before: new Date(now.getTime() + reminderHours * 3600_000),
    after: now,
    notReminded: true,
  })
  for (const due of reminders) {
    try {
      await remindManualTransferPaymentWorkflow(container).run({ input: { ...due, within_hours: reminderHours } })
    } catch (error) {
      if (!isSkip(error)) {
        logger.warn(`manual transfer: reminder for payment ${due.payment_id} failed: ${(error as Error).message}`)
      }
    }
  }

  if (!autoCancelExpired) {
    return
  }
  const expired = await findTransfersDue(pg, { statuses: EXPIRABLE_STATUSES, before: now })
  for (const due of expired) {
    try {
      await expireManualTransferPaymentWorkflow(container).run({ input: due })
      logger.info(`manual transfer: order ${due.order_id} canceled, payment deadline passed`)
    } catch (error) {
      if (!isSkip(error)) {
        logger.warn(`manual transfer: could not cancel expired order ${due.order_id}: ${(error as Error).message}`)
      }
    }
  }
}

export const config = {
  name: "manual-transfer-deadlines",
  schedule: "*/15 * * * *",
}
