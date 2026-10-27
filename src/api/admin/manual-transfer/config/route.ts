import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminRecipients, notificationsActive } from "../../../../lib/notifications/send"
import { getNotificationOptions, getPluginOptions, getProofRetentionDays } from "../../../../lib/plugin-options"

/** Plugin settings the Admin pages need */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const options = getPluginOptions(req.scope)
  const notifications = getNotificationOptions(req.scope)
  res.json({
    show_credit: options.showCredit !== false,
    proof_retention_days: getProofRetentionDays(req.scope),
    notifications: {
      /** E-mails go out: enabled and the app has a Notification Module */
      active: notificationsActive(req.scope),
      enabled: notifications.enabled,
      admin_recipients: await adminRecipients(req.scope, { warn: false }),
      payment_url: notifications.paymentUrl ?? null,
    },
  })
}
