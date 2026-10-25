/**
 * Payment deadlines counted in business days of the store's time zone.
 *
 * Saturdays, Sundays and the configured holidays (YYYY-MM-DD, in that time
 * zone) do not count. The time of day is kept: an order placed on Friday at
 * 15:00 with 3 business days is due on Wednesday at 15:00, one placed on
 * Saturday is due on Wednesday as well.
 */

export const DEFAULT_DEADLINE_BUSINESS_DAYS = 3
export const DEFAULT_TIMEZONE = "UTC"

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type BusinessCalendar = {
  timezone?: string
  holidays?: string[]
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export function isValidHoliday(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/** Calendar date and weekday of an instant in the given time zone */
function localDay(at: Date, timezone: string): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") }
}

export function isBusinessDay(at: Date, { timezone = DEFAULT_TIMEZONE, holidays = [] }: BusinessCalendar = {}): boolean {
  const { date, weekday } = localDay(at, timezone)
  return weekday !== "Sat" && weekday !== "Sun" && !holidays.includes(date)
}

export function addBusinessDays(from: Date, days: number, calendar: BusinessCalendar = {}): Date {
  let at = from.getTime()
  for (let counted = 0; counted < days; ) {
    at += DAY_MS
    if (isBusinessDay(new Date(at), calendar)) {
      counted++
    }
  }
  return new Date(at)
}
