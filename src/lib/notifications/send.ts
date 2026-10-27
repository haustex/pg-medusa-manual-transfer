import type { Attachment, INotificationModuleService, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { invoiceFilename, renderInvoicePdf } from "../invoice"
import { HISTORY_EVENT, ManualTransferHistoryEntry } from "../payment-data"
import { getBusinessCalendar, getNotificationOptions, NotificationLocale } from "../plugin-options"
import { listTransfersById } from "../transfer-queue"
import {
  adminUrls,
  buyerLocale,
  documentContext,
  formatDateTime,
  formatMoney,
  loadStoreIdentity,
  loadTransferDocument,
  orderNumber,
  TransferDocument,
} from "./context"
import { renderEmail } from "./render"
import { ADMIN_HEADLINES, BuyerTemplateName, STATUS_LABELS, TemplateName } from "./templates"

/**
 * E-mails for every change of a manual-transfer payment, to the buyer and to
 * the admins, through Medusa's Notification Module (any provider on the
 * `email` channel). Nothing is sent when the app has no Notification Module.
 *
 * Every notification has an idempotency key made of the change it reports,
 * so a retried event never sends the same e-mail twice.
 */

/** A change of a manual-transfer payment, as the subscriber sees it */
export type TransferChange =
  | "placed"
  | "proof_uploaded"
  | "rejected"
  | "underpaid"
  | "paid"
  | "reminder"
  | "expired"
  | "canceled"

export const BUYER_TEMPLATE: Record<TransferChange, BuyerTemplateName> = {
  placed: "order_placed",
  proof_uploaded: "proof_received",
  rejected: "proof_rejected",
  underpaid: "payment_underpaid",
  paid: "payment_confirmed",
  reminder: "payment_reminder",
  expired: "payment_expired",
  canceled: "payment_canceled",
}

/** The history entry each change appends; its time tells retries from new changes */
const HISTORY_OF: Record<TransferChange, string> = {
  placed: HISTORY_EVENT.AUTHORIZED,
  proof_uploaded: HISTORY_EVENT.PROOF_UPLOADED,
  rejected: HISTORY_EVENT.PROOF_REJECTED,
  underpaid: HISTORY_EVENT.UNDERPAID,
  paid: HISTORY_EVENT.CONFIRMED,
  reminder: HISTORY_EVENT.REMINDER_SENT,
  expired: HISTORY_EVENT.EXPIRED,
  canceled: HISTORY_EVENT.CANCELED,
}

/** The reminder only concerns the buyer; every status change goes to the admins as well */
const ADMIN_CHANGES: readonly TransferChange[] = ["placed", "proof_uploaded", "rejected", "underpaid", "paid", "expired", "canceled"]

function lastEntry(doc: TransferDocument, event: string): ManualTransferHistoryEntry | undefined {
  const history = (doc.payment.data.history ?? []) as ManualTransferHistoryEntry[]
  return [...history].reverse().find((entry) => entry.event === event)
}

function key(...parts: (string | null | undefined)[]): string {
  return `mt-${createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 40)}`
}

function notificationModule(container: MedusaContainer): INotificationModuleService | null {
  return container.hasRegistration(Modules.NOTIFICATION) ? container.resolve(Modules.NOTIFICATION) : null
}

export type AdminRecipients = {
  /** "option": notifications.adminEmails; "admin_users": the fallback, every Admin user */
  source: "option" | "admin_users"
  emails: string[]
}

let warnedFallback = false

/**
 * notifications.adminEmails (recommended), or else every Admin user. The
 * fallback is logged once per process and shown in the Admin settings, so
 * nobody receives order e-mails without the store knowing.
 */
export async function adminRecipients(container: MedusaContainer, { warn = true } = {}): Promise<AdminRecipients> {
  const configured = getNotificationOptions(container).adminEmails
  if (configured?.length) {
    return { source: "option", emails: [...new Set(configured.map((email) => email.trim()).filter(Boolean))] }
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "user", fields: ["email"] })
  const emails = [...new Set(data.map((user) => user.email).filter((email): email is string => !!email))]
  if (warn && !warnedFallback && emails.length) {
    warnedFallback = true
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        `manual transfer: notifications.adminEmails is not set, the admin e-mails go to every Admin user (${emails.length}). ` +
          "Set notifications.adminEmails in medusa-config to choose the recipients."
      )
  }
  return { source: "admin_users", emails }
}

/** Whether e-mails go out at all: enabled in the options and a Notification Module in the app */
export function notificationsActive(container: MedusaContainer): boolean {
  return getNotificationOptions(container).enabled && !!notificationModule(container)
}

type Outgoing = {
  to: string
  template: TemplateName
  locale: NotificationLocale
  context: Record<string, unknown>
  idempotency_key: string
  resource_id?: string
  attachments?: Attachment[]
  trigger_type: string
}

async function deliver(container: MedusaContainer, messages: Outgoing[]) {
  const notifications = notificationModule(container)
  if (!notifications || !messages.length) {
    return
  }
  const options = getNotificationOptions(container)
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  for (const message of messages) {
    try {
      const email = renderEmail(message.template, message.locale, message.context, { templatesDir: options.templatesDir })
      await notifications.createNotifications({
        to: message.to,
        from: options.from ?? null,
        channel: options.channel,
        template: options.templateIds?.[message.template] ?? `manual-transfer.${message.template}`,
        data: { ...message.context, subject: email.subject },
        content: email,
        attachments: message.attachments ?? null,
        trigger_type: message.trigger_type,
        resource_id: message.resource_id ?? null,
        resource_type: message.resource_id ? "order" : null,
        idempotency_key: message.idempotency_key,
      })
    } catch (error) {
      logger.warn(`manual transfer: could not send ${message.template} to ${message.to}: ${(error as Error).message}`)
    }
  }
}

/** Sends the buyer's and the admins' e-mails about one change of an order's transfer */
export async function notifyTransferChange(
  container: MedusaContainer,
  change: TransferChange,
  { order_id, proof_id, trigger }: { order_id: string; proof_id?: string; trigger: string }
) {
  const options = getNotificationOptions(container)
  if (!options.enabled || !notificationModule(container)) {
    return
  }
  const doc = await loadTransferDocument(container, order_id)
  const marker = proof_id ?? lastEntry(doc, HISTORY_OF[change])?.at ?? doc.payment.data.authorized_at ?? ""
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  let rejectionReason: string | null = null
  if (change === "rejected" && proof_id) {
    const { data } = await query.graph({ entity: "manual_transfer_proof", fields: ["rejection_reason"], filters: { id: proof_id } })
    rejectionReason = (data[0]?.rejection_reason as string | undefined) ?? null
  }
  const messages: Outgoing[] = []

  const buyerTemplate = BUYER_TEMPLATE[change]
  if (doc.order.email && options.buyer?.[buyerTemplate] !== false) {
    const locale = buyerLocale(container, doc)
    const attachments: Attachment[] = []
    if (change === "placed" && options.attachInvoice) {
      const pdf = await renderInvoicePdf(container, doc, locale)
      attachments.push({ filename: invoiceFilename(doc), content: pdf.toString("base64"), content_type: "application/pdf", disposition: "attachment" })
    }
    const context = documentContext(container, doc, locale)
    messages.push({
      to: doc.order.email,
      template: buyerTemplate,
      locale,
      // The admin links stay out of the buyer's e-mail
      context: { ...context, admin_order_url: null, admin_queue_url: null, rejection_reason: rejectionReason, has_invoice: attachments.length > 0 },
      idempotency_key: key(buyerTemplate, doc.payment.id, marker, doc.order.email),
      resource_id: doc.order.id,
      attachments,
      trigger_type: trigger,
    })
  }

  if (ADMIN_CHANGES.includes(change) && options.admin?.[change] !== false) {
    const locale = options.adminLocale
    const context = documentContext(container, doc, locale)
    const actorEntry = lastEntry(doc, HISTORY_OF[change])
    const actor = actorEntry?.actor_type === "user" && actorEntry.actor_id ? await adminName(container, actorEntry.actor_id) : null
    for (const to of (await adminRecipients(container)).emails) {
      messages.push({
        to,
        template: "admin_status_changed",
        locale,
        context: {
          ...context,
          payment_url: null,
          change,
          t_headline: ADMIN_HEADLINES[locale][change].headline,
          t_intro: ADMIN_HEADLINES[locale][change].intro,
          bank_check: change === "proof_uploaded",
          rejection_reason: rejectionReason,
          actor,
        },
        idempotency_key: key("admin_status_changed", change, doc.payment.id, marker, to),
        resource_id: doc.order.id,
        trigger_type: trigger,
      })
    }
  }
  await deliver(container, messages)
}

async function adminName(container: MedusaContainer, userId: string): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "user", fields: ["email", "first_name", "last_name"], filters: { id: userId } })
  const user = data[0]
  return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email : null
}

/** One digest e-mail per admin about payments that wait too long for them */
export async function notifyAdminsOverdue(container: MedusaContainer, paymentIds: string[], trigger: string) {
  const options = getNotificationOptions(container)
  if (!options.enabled || options.admin?.overdue === false || !notificationModule(container) || !paymentIds.length) {
    return
  }
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const rows = await listTransfersById(pg, paymentIds)
  if (!rows.length) {
    return
  }
  const locale = options.adminLocale
  const { timezone } = getBusinessCalendar(container)
  const store = await loadStoreIdentity(container)
  const items = rows.map((row) => ({
    number: orderNumber(row.display_id, row.order_id),
    reference: row.reference,
    status_label: row.status ? STATUS_LABELS[locale][row.status] ?? row.status : "",
    since: formatDateTime(row.status_since, locale, timezone),
    amount: formatMoney(row.amount, row.currency_code, locale),
    admin_order_url: adminUrls(container, row.order_id).admin_order_url,
  }))
  const context = { locale, store, items, ...adminUrls(container) }
  const ids = [...paymentIds].sort().join(",")
  const { emails: recipients } = await adminRecipients(container)
  await deliver(
    container,
    recipients.map((to) => ({
      to,
      template: "admin_overdue" as const,
      locale,
      context,
      idempotency_key: key("admin_overdue", ids, rows.map((r) => r.admin_reminded_at).join(","), to),
      trigger_type: trigger,
    }))
  )
}
