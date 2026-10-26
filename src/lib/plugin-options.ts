import type { ConfigModule, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BusinessCalendar, DEFAULT_TIMEZONE } from "./deadline"
import type { SigningSecret } from "./tokens"

/**
 * Options of the plugin entry in medusa-config (`plugins: [{ resolve, options }]`),
 * as opposed to the payment provider's own options.
 */
export type ManualTransferPluginOptions = {
  /** Show the small Haus Kayu credit in the Admin. Default true. */
  showCredit?: boolean
  /**
   * Days after a payment was captured or canceled before its proof files are
   * deleted (the proof records stay). Default null: keep them forever.
   */
  proofRetentionDays?: number | null
  /** Hours before the deadline when the reminder event goes out. Default 24. */
  reminderHours?: number
  /** Cancel orders whose deadline passed without payment, releasing the stock. Default true. */
  autoCancelExpired?: boolean
  /** Secret for guest upload links and signed proof URLs. Default: MANUAL_TRANSFER_SECRET, then http.jwtSecret. */
  secret?: string
  /**
   * When an admin is reminded (badge "late" in the Admin, digest e-mail) that a
   * payment waits for them. Counted in business days of the provider's
   * `timezone`/`holidays`.
   */
  adminReminders?: {
    /** A proof awaiting verification for this many business days. Default 1. */
    verificationBusinessDays?: number
    /** An underpaid payment without follow-up for this many business days. Default 3. */
    underpaidBusinessDays?: number
    /** Send the digest e-mail to the admins (the badge is always shown). Default true. */
    email?: boolean
  }
  /** E-mails to the buyer and the admins, through Medusa's Notification Module */
  notifications?: ManualTransferNotificationOptions
  /** The pro-forma invoice PDF */
  invoice?: ManualTransferInvoiceOptions
  proofUploads?: {
    /** Uploads one IP may attempt per window. Default 10. */
    perIp?: number
    /** Window for perIp, in minutes. Default 15. */
    perIpWindowMinutes?: number
    /** Status reads one IP may make per minute. Default 120. */
    readsPerIpPerMinute?: number
    /** Proofs one order may receive per 24 hours. Default 5. */
    perOrderPerDay?: number
    /** Cart-id → upload-token exchanges one IP may make per window. Default 10. */
    tokenExchangesPerIp?: number
    /** Window for tokenExchangesPerIp, in minutes. Default 60. */
    tokenExchangesWindowMinutes?: number
  }
}

export type NotificationLocale = "en" | "id"

export type ManualTransferNotificationOptions = {
  /** Default true; false sends nothing */
  enabled?: boolean
  /** Notification channel. Default "email". */
  channel?: string
  /** Sender passed to the provider; most providers use their own `from` option */
  from?: string | null
  /** Admin recipients. Default: every Admin user. */
  adminEmails?: string[]
  /** Language of the buyer e-mails: "en" or "id". Default "en"; an order's metadata.locale wins. */
  locale?: NotificationLocale
  /** Language of the admin e-mails. Default: `locale`. */
  adminLocale?: NotificationLocale
  /**
   * Storefront page with the payment instructions and the proof upload, with
   * {order_id}, {display_id} and {token} (the guest upload token) filled in,
   * e.g. "https://shop.example.com/transfer/{order_id}?token={token}".
   * Without it the e-mails carry no link.
   */
  paymentUrl?: string
  /** The Admin's address, e.g. "https://shop.example.com/app", for links in the admin e-mails */
  adminUrl?: string
  /** Folder with template overrides (`<name>.html`, `<name>.<locale>.html`, `layout.html`) */
  templatesDir?: string
  /** Template ids of the notification provider (e.g. SendGrid dynamic templates), per template name */
  templateIds?: Record<string, string>
  /** Turn single buyer e-mails off, e.g. { payment_reminder: false } */
  buyer?: Record<string, boolean>
  /** Turn single admin e-mails off, e.g. { paid: false, overdue: false } */
  admin?: Record<string, boolean>
  /** Attach the pro-forma invoice to the order e-mail. Default true. */
  attachInvoice?: boolean
}

export type ManualTransferInvoiceOptions = {
  /**
   * Replaces the default PDF: a module path (relative to the app's working
   * directory) whose default export, or a function, gets the invoice context
   * and pdf-lib and returns the PDF bytes.
   */
  render?: string | ((context: unknown, pdfLib: unknown) => Promise<Uint8Array> | Uint8Array)
  /** Extra line under the payment instructions */
  note?: string
}

export const PACKAGE_NAME = "medusa-payment-manual-transfer"

export const DEFAULT_PROOF_LIMITS = {
  perIp: 10,
  perIpWindowMinutes: 15,
  readsPerIpPerMinute: 120,
  perOrderPerDay: 5,
  tokenExchangesPerIp: 10,
  tokenExchangesWindowMinutes: 60,
}

export const DEFAULT_REMINDER_HOURS = 24

export const DEFAULT_ADMIN_REMINDERS = {
  verificationBusinessDays: 1,
  underpaidBusinessDays: 3,
  email: true,
}

function configModule(container: MedusaContainer): ConfigModule {
  return container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
}

export function getPluginOptions(container: MedusaContainer): ManualTransferPluginOptions {
  const plugins = (configModule(container).plugins ?? []) as (string | { resolve: string; options?: unknown })[]
  for (const plugin of plugins) {
    const resolve = typeof plugin === "string" ? plugin : plugin.resolve
    // Installed from npm, or linked by path in development
    if (resolve === PACKAGE_NAME || resolve.replace(/\/+$/, "").endsWith(`/${PACKAGE_NAME}`)) {
      return (typeof plugin === "string" ? {} : (plugin.options as ManualTransferPluginOptions)) ?? {}
    }
  }
  return {}
}

export function getProofLimits(container: MedusaContainer) {
  return { ...DEFAULT_PROOF_LIMITS, ...(getPluginOptions(container).proofUploads ?? {}) }
}

/** proofRetentionDays as a whole number of days ≥ 1, or null to keep proofs forever */
export function getProofRetentionDays(container: MedusaContainer): number | null {
  const days = getPluginOptions(container).proofRetentionDays
  if (days === null || days === undefined) {
    return null
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "manual transfer: proofRetentionDays must be a whole number of days (1 or more), or null"
    )
  }
  return days
}

export function getDeadlineOptions(container: MedusaContainer) {
  const options = getPluginOptions(container)
  const hours = options.reminderHours ?? DEFAULT_REMINDER_HOURS
  return {
    reminderHours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_REMINDER_HOURS,
    autoCancelExpired: options.autoCancelExpired !== false,
  }
}

export function getSigningSecret(container: MedusaContainer): SigningSecret {
  const jwtSecret = configModule(container).projectConfig?.http?.jwtSecret
  // jwtSecret may also be a { key, passphrase } pair for asymmetric JWTs
  const fromJwt =
    jwtSecret && typeof jwtSecret === "object" && "key" in jwtSecret ? jwtSecret.key : jwtSecret
  const secret = getPluginOptions(container).secret || process.env.MANUAL_TRANSFER_SECRET || fromJwt
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "manual transfer: set MANUAL_TRANSFER_SECRET (or http.jwtSecret) to sign upload links"
    )
  }
  return secret
}

function businessDays(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function getAdminReminderOptions(container: MedusaContainer) {
  const options = getPluginOptions(container).adminReminders ?? {}
  return {
    verificationBusinessDays: businessDays(options.verificationBusinessDays, DEFAULT_ADMIN_REMINDERS.verificationBusinessDays),
    underpaidBusinessDays: businessDays(options.underpaidBusinessDays, DEFAULT_ADMIN_REMINDERS.underpaidBusinessDays),
    email: options.email !== false,
  }
}

type ProviderEntry = { resolve?: unknown; id?: unknown; options?: Record<string, unknown> }

function isManualTransferProvider(entry: ProviderEntry): boolean {
  const resolve = typeof entry.resolve === "string" ? entry.resolve.replace(/\/+$/, "") : ""
  return resolve.endsWith("providers/manual-transfer") || resolve.includes(PACKAGE_NAME)
}

/**
 * Time zone and holidays of the manual-transfer payment provider, read from the
 * Payment Module's entry in medusa-config, so the admin reminders count
 * business days the same way as the buyer's deadline.
 */
export function getBusinessCalendar(container: MedusaContainer): Required<BusinessCalendar> {
  const modules = configModule(container).modules ?? {}
  const entries = (Array.isArray(modules) ? modules : Object.values(modules)) as unknown[]
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const providers = ((entry as { options?: { providers?: unknown } }).options?.providers ?? []) as ProviderEntry[]
    const provider = Array.isArray(providers) ? providers.find((p) => p && isManualTransferProvider(p)) : undefined
    if (provider) {
      const options = provider.options ?? {}
      return {
        timezone: typeof options.timezone === "string" ? options.timezone : DEFAULT_TIMEZONE,
        holidays: Array.isArray(options.holidays) ? (options.holidays as string[]) : [],
      }
    }
  }
  return { timezone: DEFAULT_TIMEZONE, holidays: [] }
}

export function getNotificationOptions(container: MedusaContainer) {
  const options = getPluginOptions(container).notifications ?? {}
  const locale: NotificationLocale = options.locale === "id" ? "id" : "en"
  return {
    ...options,
    enabled: options.enabled !== false,
    channel: options.channel || "email",
    locale,
    adminLocale: (options.adminLocale === "id" || options.adminLocale === "en" ? options.adminLocale : locale) as NotificationLocale,
    attachInvoice: options.attachInvoice !== false,
  }
}
