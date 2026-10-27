import type { MedusaContainer, RemoteQueryFunction } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN, Modules } from "@medusajs/framework/utils"
import { loadOrderTransfer, OrderTransfer } from "../order-transfer"
import { receivedSoFar } from "../payment-data"
import { getBusinessCalendar, getNotificationOptions, getSigningSecret, NotificationLocale } from "../plugin-options"
import { uploadToken } from "../tokens"
import { STATUS_LABELS } from "./templates"

/**
 * Everything the e-mails and the invoice show about an order paid by
 * transfer, and the store that sends them. The store identity comes from the
 * store settings: its name, and the metadata keys logo_url, address,
 * support_email, phone and website (editable on the plugin's settings page).
 */

export type StoreIdentity = {
  name: string
  logo_url: string | null
  address_lines: string[]
  email: string | null
  phone: string | null
  website: string | null
}

export type DocumentItem = { title: string; subtitle: string | null; quantity: number; unit_price: number; total: number }

export type TransferDocument = {
  store: StoreIdentity
  order: {
    id: string
    display_id: number | null
    email: string | null
    customer_name: string | null
    created_at: string
    currency_code: string
    locale: string | null
    billing_lines: string[]
    items: DocumentItem[]
    subtotal: number
    shipping_total: number
    tax_total: number
    discount_total: number
    total: number
  }
  payment: OrderTransfer["payment"]
  amount_received: number
  amount_remaining: number
  timezone: string
}

const METADATA_KEYS = ["logo_url", "address", "support_email", "phone", "website"] as const
export type StoreIdentityMetadata = Partial<Record<(typeof METADATA_KEYS)[number], string>>

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export async function loadStoreIdentity(container: MedusaContainer): Promise<StoreIdentity> {
  const [store] = await container.resolve(Modules.STORE).listStores({}, { take: 1 })
  const metadata = (store?.metadata ?? {}) as Record<string, unknown>
  return {
    name: text(store?.name) ?? "Store",
    logo_url: text(metadata.logo_url),
    address_lines: (text(metadata.address) ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    email: text(metadata.support_email),
    phone: text(metadata.phone),
    website: text(metadata.website),
  }
}

const num = (value: unknown): number => (value === null || value === undefined ? 0 : MathBN.convert(value as never).toNumber())

function addressLines(address: Record<string, unknown> | null | undefined): string[] {
  if (!address) {
    return []
  }
  const name = [address.first_name, address.last_name].filter(Boolean).join(" ")
  const city = [address.postal_code, address.city].filter(Boolean).join(" ")
  return [
    name,
    text(address.company),
    text(address.address_1),
    text(address.address_2),
    [city, text(address.province)].filter(Boolean).join(", "),
    text(address.country_code)?.toUpperCase(),
  ].filter((line): line is string => !!line)
}

export async function loadTransferDocument(container: MedusaContainer, orderId: string): Promise<TransferDocument> {
  const query = container.resolve<Omit<RemoteQueryFunction, symbol>>(ContainerRegistrationKeys.QUERY)
  const transfer = await loadOrderTransfer(query, orderId)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "created_at",
      "metadata",
      "item_subtotal",
      "shipping_total",
      "tax_total",
      "discount_total",
      "total",
      "items.title",
      "items.product_title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "shipping_address.*",
      "billing_address.*",
      "customer.first_name",
      "customer.last_name",
    ],
    filters: { id: orderId },
  })
  const order = (data[0] ?? {}) as Record<string, any>
  const billing = order.billing_address ?? order.shipping_address
  const customerName =
    [billing?.first_name, billing?.last_name].filter(Boolean).join(" ") ||
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
    null
  const received = receivedSoFar(transfer.payment.data)
  return {
    store: await loadStoreIdentity(container),
    order: {
      id: transfer.order.id,
      display_id: transfer.order.display_id,
      email: transfer.order.email,
      customer_name: customerName,
      created_at: transfer.order.created_at,
      currency_code: order.currency_code ?? transfer.payment.currency_code,
      locale: text(order.metadata?.locale),
      billing_lines: addressLines(billing),
      items: ((order.items ?? []) as Record<string, unknown>[]).map((item) => ({
        title: text(item.product_title) ?? text(item.title) ?? "",
        subtitle: text(item.variant_title) && item.variant_title !== item.product_title ? text(item.variant_title) : null,
        quantity: num(item.quantity),
        unit_price: num(item.unit_price),
        total: num(item.total),
      })),
      // Order "subtotal" includes shipping since Medusa 2.x: the invoice lists items, then shipping
      subtotal: num(order.item_subtotal),
      shipping_total: num(order.shipping_total),
      tax_total: num(order.tax_total),
      discount_total: num(order.discount_total),
      total: num(order.total),
    },
    payment: transfer.payment,
    amount_received: received,
    amount_remaining: MathBN.max(MathBN.sub(transfer.payment.amount, received), 0).toNumber(),
    timezone: getBusinessCalendar(container).timezone,
  }
}

const INTL_LOCALE: Record<NotificationLocale, string> = { en: "en-US", id: "id-ID" }

export function formatMoney(amount: number, currencyCode: string, locale: NotificationLocale): string {
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency: currencyCode.toUpperCase() }).format(amount)
  } catch {
    return `${amount} ${currencyCode.toUpperCase()}`
  }
}

/** Date and time in the store's time zone, with the zone's name */
export function formatDateTime(value: string | null | undefined, locale: NotificationLocale, timezone: string): string | null {
  if (!value) {
    return null
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value)) + ` (${timezoneName(new Date(value), locale, timezone)})`
}

function timezoneName(at: Date, locale: NotificationLocale, timezone: string): string {
  const part = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")
  return part?.value ?? timezone
}

/** A YYYY-MM-DD calendar day (bank statement dates), or an instant shown as a day in the time zone */
export function formatDay(value: string | null | undefined, locale: NotificationLocale, timezone: string): string | null {
  if (!value) {
    return null
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "long",
    timeZone: day ? "UTC" : timezone,
  }).format(new Date(day ? `${value}T12:00:00Z` : value))
}

export function orderNumber(displayId: number | null, orderId: string): string {
  return displayId ? `#${displayId}` : orderId
}

/** paymentUrl with {order_id}, {display_id} and {token} filled in, or null */
export function paymentUrl(container: MedusaContainer, order: { id: string; display_id: number | null }): string | null {
  const template = getNotificationOptions(container).paymentUrl
  if (!template) {
    return null
  }
  const values: Record<string, string> = {
    order_id: order.id,
    display_id: String(order.display_id ?? ""),
    token: uploadToken(getSigningSecret(container), order.id),
  }
  return template.replace(/\{(order_id|display_id|token)\}/g, (_, key: string) => encodeURIComponent(values[key]))
}

export function adminUrls(container: MedusaContainer, orderId?: string) {
  const base = getNotificationOptions(container).adminUrl?.replace(/\/+$/, "")
  return {
    admin_order_url: base && orderId ? `${base}/orders/${orderId}` : null,
    admin_queue_url: base ? `${base}/manual-transfer` : null,
  }
}

/** The locale of a buyer's e-mails: the order's metadata.locale ("id", "id-ID", "en"…) or the option */
export function buyerLocale(container: MedusaContainer, doc: TransferDocument): NotificationLocale {
  const fromOrder = doc.order.locale?.toLowerCase()
  if (fromOrder?.startsWith("id")) {
    return "id"
  }
  if (fromOrder?.startsWith("en")) {
    return "en"
  }
  return getNotificationOptions(container).locale
}

/** The values the templates see, in one locale */
export function documentContext(container: MedusaContainer, doc: TransferDocument, locale: NotificationLocale) {
  const { payment, order } = doc
  const currency = payment.currency_code
  const money = (amount: number) => formatMoney(amount, currency, locale)
  const status = payment.data.status ?? null
  const confirmation = payment.data.confirmation
  const received =
    status === "paid" && confirmation ? confirmation.total_received ?? confirmation.amount_received : doc.amount_received
  return {
    locale,
    store: doc.store,
    order: {
      id: order.id,
      number: orderNumber(order.display_id, order.id),
      email: order.email,
      customer_name: order.customer_name ?? order.email,
      created_at: formatDay(order.created_at, locale, doc.timezone),
    },
    payment: {
      reference: payment.data.reference ?? null,
      status,
      status_label: status ? STATUS_LABELS[locale][status] ?? status : null,
      currency: currency.toUpperCase(),
      amount: money(payment.amount),
      amount_received: money(received),
      amount_remaining: money(doc.amount_remaining),
      has_received: doc.amount_received > 0 && status !== "paid",
      deadline: formatDateTime(payment.data.expires_at, locale, doc.timezone),
      account: payment.data.account ?? null,
    },
    confirmation: confirmation
      ? {
          amount: money(confirmation.amount_received),
          received_on: formatDay(confirmation.received_at, locale, doc.timezone),
          bank_reference: confirmation.bank_reference,
        }
      : null,
    /** What the buyer still has to send: the remainder after a partial transfer, else the full amount */
    amount_to_pay: money(doc.amount_received > 0 ? doc.amount_remaining : payment.amount),
    payment_url: paymentUrl(container, order),
    ...adminUrls(container, order.id),
  }
}

export type DocumentContext = ReturnType<typeof documentContext>
