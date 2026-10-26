import { followUpDueAt, followUpSince, isOverdue, needsAdminReminder } from "../overdue"
import { getAdminReminderOptions, getBusinessCalendar } from "../plugin-options"

const thresholds = { verificationBusinessDays: 1, underpaidBusinessDays: 3 }
const calendar = { timezone: "Asia/Jakarta", holidays: ["2026-10-28"] }

describe("admin follow-up", () => {
  it("starts the wait at the last upload or underpayment", () => {
    const history = [
      { event: "proof_uploaded", at: "2026-10-20T01:00:00.000Z" },
      { event: "proof_rejected", at: "2026-10-20T02:00:00.000Z" },
      { event: "proof_uploaded", at: "2026-10-21T03:00:00.000Z" },
      { event: "underpaid", at: "2026-10-22T03:00:00.000Z" },
    ]
    expect(followUpSince({ status: "awaiting_verification", history })).toBe("2026-10-21T03:00:00.000Z")
    expect(followUpSince({ status: "underpaid", history })).toBe("2026-10-22T03:00:00.000Z")
    expect(followUpSince({ status: "awaiting_payment", history })).toBeNull()
    expect(followUpSince({ status: "underpaid", history: "nope" })).toBeNull()
  })

  it("counts business days in the provider's time zone, skipping weekends and holidays", () => {
    // Friday 10:00 WIB + 1 business day = Monday 10:00 WIB
    expect(followUpDueAt("awaiting_verification", "2026-10-23T03:00:00.000Z", thresholds, calendar)?.toISOString()).toBe(
      "2026-10-26T03:00:00.000Z"
    )
    // Monday + 3 business days with Wednesday a holiday = Friday
    expect(followUpDueAt("underpaid", "2026-10-26T03:00:00.000Z", thresholds, calendar)?.toISOString()).toBe(
      "2026-10-30T03:00:00.000Z"
    )
    expect(followUpDueAt("paid", "2026-10-26T03:00:00.000Z", thresholds, calendar)).toBeNull()
  })

  it("is late once the threshold passed, and reminds once per wait", () => {
    const row = { status: "awaiting_verification", status_since: "2026-10-23T03:00:00.000Z" }
    expect(isOverdue(row, thresholds, calendar, new Date("2026-10-26T02:59:00Z"))).toBe(false)
    expect(isOverdue(row, thresholds, calendar, new Date("2026-10-26T03:00:00Z"))).toBe(true)
    const now = new Date("2026-10-27T00:00:00Z")
    expect(needsAdminReminder(row, thresholds, calendar, now)).toBe(true)
    expect(needsAdminReminder({ ...row, admin_reminded_at: "2026-10-26T04:00:00Z" }, thresholds, calendar, now)).toBe(false)
    // Reminded about an earlier wait: a new upload starts a new one
    expect(needsAdminReminder({ ...row, admin_reminded_at: "2026-10-22T00:00:00Z" }, thresholds, calendar, now)).toBe(true)
  })
})

describe("adminReminders and the business calendar", () => {
  const container = (config: Record<string, unknown>) => ({ resolve: () => config }) as never

  it("defaults to 1 and 3 business days with e-mail on", () => {
    expect(getAdminReminderOptions(container({}))).toEqual({ verificationBusinessDays: 1, underpaidBusinessDays: 3, email: true })
    const custom = container({
      plugins: [{ resolve: "medusa-payment-manual-transfer", options: { adminReminders: { verificationBusinessDays: 2, underpaidBusinessDays: -1, email: false } } }],
    })
    expect(getAdminReminderOptions(custom)).toEqual({ verificationBusinessDays: 2, underpaidBusinessDays: 3, email: false })
  })

  it("reads timezone and holidays from the payment provider's options", () => {
    const providers = [
      { resolve: "@medusajs/medusa/payment-stripe", id: "stripe", options: { timezone: "Europe/Berlin" } },
      { resolve: "medusa-payment-manual-transfer/providers/manual-transfer", id: "manual-transfer", options: { timezone: "Asia/Jakarta", holidays: ["2026-12-25"] } },
    ]
    expect(getBusinessCalendar(container({ modules: { payment: { resolve: "@medusajs/medusa/payment", options: { providers } } } }))).toEqual({
      timezone: "Asia/Jakarta",
      holidays: ["2026-12-25"],
    })
    expect(getBusinessCalendar(container({ modules: [{ resolve: "@medusajs/medusa/payment", options: { providers } }] })).timezone).toBe("Asia/Jakarta")
    expect(getBusinessCalendar(container({}))).toEqual({ timezone: "UTC", holidays: [] })
  })
})
