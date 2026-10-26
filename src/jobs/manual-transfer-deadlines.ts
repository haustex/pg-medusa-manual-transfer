import type { IEventBusModuleService, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { needsAdminReminder } from "../lib/overdue"
import { EXPIRABLE_STATUSES, MANUAL_TRANSFER_EVENTS, REMINDABLE_STATUSES } from "../lib/payment-data"
import { getAdminReminderOptions, getBusinessCalendar, getDeadlineOptions } from "../lib/plugin-options"
import { findTransfersDue, listFollowUps } from "../lib/transfer-queue"
import { expireManualTransferPaymentWorkflow } from "../workflows/expire-manual-transfer-payment"
import { flagManualTransferOverdueWorkflow } from "../workflows/flag-manual-transfer-overdue"
import { remindManualTransferPaymentWorkflow } from "../workflows/remind-manual-transfer-payment"

/** A payment that changed between the query and its lock is skipped quietly */
function isSkip(error: unknown): boolean {
  return error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED
}

/**
 * Payments waiting too long for an admin (see adminReminders) are flagged once
 * per wait, and one manual_transfer.admin_overdue event lists them for the
 * digest e-mail.
 */
async function remindAdmins(container: MedusaContainer, logger: Logger, now: Date) {
  const thresholds = getAdminReminderOptions(container)
  if (!thresholds.email) {
    return
  }
  const calendar = getBusinessCalendar(container)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const late = (await listFollowUps(pg)).filter((row) => needsAdminReminder(row, thresholds, calendar, now))
  const flagged: string[] = []
  for (const row of late) {
    try {
      await flagManualTransferOverdueWorkflow(container).run({
        input: { order_id: row.order_id, payment_id: row.payment_id, status: row.status!, status_since: row.status_since! },
      })
      flagged.push(row.payment_id)
    } catch (error) {
      if (!isSkip(error)) {
        logger.warn(`manual transfer: could not flag late payment ${row.payment_id}: ${(error as Error).message}`)
      }
    }
  }
  if (flagged.length) {
    await container
      .resolve<IEventBusModuleService>(Modules.EVENT_BUS)
      .emit({ name: MANUAL_TRANSFER_EVENTS.ADMIN_OVERDUE, data: { payment_ids: flagged } })
  }
}

/**
 * Every 15 minutes: sends the reminder event for payments due within
 * `reminderHours` (once each), tells the admins about payments waiting too
 * long for them, then cancels orders whose deadline passed while still
 * awaiting payment (or after a rejected proof), releasing their stock.
 * Payments with a proof waiting for review or partly paid are left for an
 * admin.
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

  await remindAdmins(container, logger, now)

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
