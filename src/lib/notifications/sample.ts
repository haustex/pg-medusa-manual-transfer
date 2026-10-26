import type { MedusaContainer } from "@medusajs/framework/types"
import { HISTORY_EVENT, historyEntry, MANUAL_TRANSFER_STATUS, ManualTransferStatus } from "../payment-data"
import type { NotificationLocale } from "../plugin-options"
import { documentContext, formatMoney, StoreIdentity, TransferDocument } from "./context"
import { renderEmail, RenderedEmail } from "./render"
import { ADMIN_HEADLINES, TemplateName } from "./templates"

/**
 * A made-up order for previewing the e-mails and the invoice without sending
 * anything: the Admin preview links and scripts/preview-emails.mjs use it.
 */

const SAMPLE_STATUS: Record<TemplateName, ManualTransferStatus> = {
  order_placed: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  proof_received: MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION,
  proof_rejected: MANUAL_TRANSFER_STATUS.REJECTED,
  payment_underpaid: MANUAL_TRANSFER_STATUS.UNDERPAID,
  payment_confirmed: MANUAL_TRANSFER_STATUS.PAID,
  payment_reminder: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
  payment_expired: MANUAL_TRANSFER_STATUS.EXPIRED,
  payment_canceled: MANUAL_TRANSFER_STATUS.CANCELED,
  admin_status_changed: MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION,
  admin_overdue: MANUAL_TRANSFER_STATUS.AWAITING_VERIFICATION,
}

export function sampleDocument(store: StoreIdentity, status: ManualTransferStatus = "awaiting_payment"): TransferDocument {
  const placed = new Date(Date.UTC(2026, 9, 26, 7, 30))
  const expires = new Date(Date.UTC(2026, 9, 29, 7, 30))
  const underpaid = status === MANUAL_TRANSFER_STATUS.UNDERPAID
  const paid = status === MANUAL_TRANSFER_STATUS.PAID
  return {
    store,
    order: {
      id: "order_sample",
      display_id: 1042,
      email: "buyer@example.com",
      customer_name: "Alex Buyer",
      created_at: placed.toISOString(),
      currency_code: "usd",
      locale: null,
      billing_lines: ["Alex Buyer", "1 Main St", "78701 Austin, TX", "US"],
      items: [
        { title: "Teak bench", subtitle: "L / natural oil", quantity: 2, unit_price: 600.25, total: 1200.5 },
        { title: "Teak side table", subtitle: null, quantity: 1, unit_price: 249, total: 249 },
      ],
      subtotal: 1449.5,
      shipping_total: 50,
      tax_total: 0,
      discount_total: 0,
      total: 1499.5,
    },
    payment: {
      id: "pay_sample",
      amount: 1499.5,
      currency_code: "usd",
      captured_at: paid ? expires.toISOString() : null,
      canceled_at: null,
      data: {
        reference: "MT-7K3QX-9PA2B",
        status,
        account: {
          id: "mtacc_sample",
          bank_name: "Example Bank",
          account_holder: "PT Example Store",
          account_number: "1234567890",
          swift_code: "EXAMIDJA",
          bank_address: "Jl. Example No. 1, Jakarta, Indonesia",
          currency_code: "usd",
        },
        amount: 1499.5,
        currency_code: "usd",
        region_id: null,
        authorized_at: placed.toISOString(),
        expires_at: expires.toISOString(),
        ...(underpaid
          ? {
              receipts: [
                { amount: 1474.5, received_at: "2026-10-27", bank_reference: "FT2610", note: null, recorded_by: null, recorded_at: placed.toISOString() },
              ],
            }
          : {}),
        ...(paid
          ? {
              confirmation: {
                amount_received: 1499.5,
                total_received: 1499.5,
                received_at: "2026-10-27",
                bank_reference: "FT2610",
                note: null,
                confirmed_by: null,
                confirmed_at: expires.toISOString(),
              },
            }
          : {}),
        history: [historyEntry(HISTORY_EVENT.AUTHORIZED, { at: placed })],
      },
    },
    amount_received: underpaid ? 1474.5 : 0,
    amount_remaining: underpaid ? 25 : 1499.5,
    timezone: "Asia/Jakarta",
  }
}

const ADMIN_CHANGE_OF: Partial<Record<ManualTransferStatus, string>> = {
  awaiting_verification: "proof_uploaded",
}

/** One template rendered with the sample order */
export function renderSample(
  container: MedusaContainer,
  store: StoreIdentity,
  name: TemplateName,
  locale: NotificationLocale,
  { templatesDir }: { templatesDir?: string } = {}
): RenderedEmail {
  const doc = sampleDocument(store, SAMPLE_STATUS[name])
  const context: Record<string, unknown> = {
    ...documentContext(container, doc, locale),
    rejection_reason: name === "proof_rejected" ? "The amount on the receipt is not readable." : null,
    has_invoice: name === "order_placed",
  }
  if (name === "admin_status_changed") {
    const change = ADMIN_CHANGE_OF[doc.payment.data.status!] ?? "placed"
    Object.assign(context, {
      payment_url: null,
      t_headline: ADMIN_HEADLINES[locale][change].headline,
      t_intro: ADMIN_HEADLINES[locale][change].intro,
      bank_check: change === "proof_uploaded",
    })
  }
  if (name === "admin_overdue") {
    context.items = [
      { number: "#1042", reference: "MT-7K3QX-9PA2B", status_label: locale === "id" ? "Menunggu verifikasi" : "Awaiting verification", since: (context.payment as { deadline: string }).deadline, amount: (context.payment as { amount: string }).amount, admin_order_url: context.admin_order_url },
      { number: "#1038", reference: "MT-2HQ8M-4ZC7D", status_label: locale === "id" ? "Kurang bayar" : "Underpaid", since: (context.payment as { deadline: string }).deadline, amount: formatMoney(320, "usd", locale), admin_order_url: null },
    ]
  }
  return renderEmail(name, locale, context, { templatesDir })
}
