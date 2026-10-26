import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { followUpDueAt } from "../../../../lib/overdue"
import { getAdminReminderOptions, getBusinessCalendar } from "../../../../lib/plugin-options"
import { countTransfersByStatus, listFollowUps, listTransfers } from "../../../../lib/transfer-queue"
import { GetAdminTransfers } from "./validators"

/**
 * The verification queue: manual-transfer payments with their order, newest
 * first, optionally of one status and matching a reference, e-mail or order
 * number. `counts` has the number of payments per status for the tabs,
 * `overdue_counts` how many of them wait too long for an admin; each row has
 * `overdue` and `overdue_at` (see the adminReminders option).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = GetAdminTransfers.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues.map((i) => i.message).join("; "))
  }
  const { status, q, limit, offset } = parsed.data
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const [{ rows, count }, counts, followUps] = await Promise.all([
    listTransfers(pg, { statuses: status ? [status] : undefined, q, limit, offset }),
    countTransfersByStatus(pg),
    listFollowUps(pg),
  ])

  const thresholds = getAdminReminderOptions(req.scope)
  const calendar = getBusinessCalendar(req.scope)
  const now = Date.now()
  const overdueAt = (row: { status: string | null; status_since: string | null }) => {
    const due = followUpDueAt(row.status, row.status_since, thresholds, calendar)
    return due && due.getTime() <= now ? due.toISOString() : null
  }
  const overdueCounts: Record<string, number> = {}
  for (const row of followUps) {
    if (overdueAt(row)) {
      overdueCounts[row.status!] = (overdueCounts[row.status!] ?? 0) + 1
    }
  }
  // Closed payments (captured, canceled) never count as late
  const open = new Set(followUps.map((row) => row.payment_id))

  res.json({
    payments: rows.map((row) => {
      const at = open.has(row.payment_id) ? overdueAt(row) : null
      return { ...row, overdue: !!at, overdue_at: at }
    }),
    count,
    limit,
    offset,
    counts,
    overdue_counts: overdueCounts,
  })
}
