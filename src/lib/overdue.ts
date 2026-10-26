import { addBusinessDays, BusinessCalendar } from "./deadline"
import { ADMIN_FOLLOW_UP, AdminFollowUpStatus, ManualTransferHistoryEntry } from "./payment-data"

/**
 * Payments that wait too long for an admin: a proof awaiting verification for
 * more than `verificationBusinessDays`, or an underpayment without follow-up
 * for more than `underpaidBusinessDays`, counted from the history entry that
 * started the wait (the last upload, the last underpayment recorded).
 */

export type FollowUpThresholds = {
  verificationBusinessDays: number
  underpaidBusinessDays: number
}

export function isFollowUpStatus(status: unknown): status is AdminFollowUpStatus {
  return typeof status === "string" && status in ADMIN_FOLLOW_UP
}

/** When the current wait started, from the payment history; null when the status does not wait for an admin */
export function followUpSince(data: { status?: unknown; history?: unknown } | undefined): string | null {
  if (!isFollowUpStatus(data?.status) || !Array.isArray(data?.history)) {
    return null
  }
  const event = ADMIN_FOLLOW_UP[data.status]
  const entries = (data.history as ManualTransferHistoryEntry[]).filter((entry) => entry?.event === event)
  return entries.length ? entries[entries.length - 1].at : null
}

/** The moment the payment counts as late, or null when it does not wait for an admin */
export function followUpDueAt(
  status: unknown,
  since: string | Date | null | undefined,
  thresholds: FollowUpThresholds,
  calendar: BusinessCalendar
): Date | null {
  if (!isFollowUpStatus(status) || !since) {
    return null
  }
  const start = new Date(since)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const days =
    status === "underpaid" ? thresholds.underpaidBusinessDays : thresholds.verificationBusinessDays
  return addBusinessDays(start, Math.ceil(days), calendar)
}

export function isOverdue(
  row: { status: unknown; status_since: string | Date | null | undefined },
  thresholds: FollowUpThresholds,
  calendar: BusinessCalendar,
  now: Date = new Date()
): boolean {
  const due = followUpDueAt(row.status, row.status_since, thresholds, calendar)
  return !!due && due.getTime() <= now.getTime()
}

/** Late, and the admins were not told since the wait started */
export function needsAdminReminder(
  row: { status: unknown; status_since: string | Date | null | undefined; admin_reminded_at?: string | Date | null },
  thresholds: FollowUpThresholds,
  calendar: BusinessCalendar,
  now: Date = new Date()
): boolean {
  if (!isOverdue(row, thresholds, calendar, now)) {
    return false
  }
  return !row.admin_reminded_at || new Date(row.admin_reminded_at).getTime() < new Date(row.status_since!).getTime()
}
