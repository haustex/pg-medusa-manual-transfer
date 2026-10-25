import { addBusinessDays, isBusinessDay, isValidHoliday, isValidTimezone } from "../deadline"

// 2026-10-23 is a Friday
const jakarta = { timezone: "Asia/Jakarta" }

describe("addBusinessDays", () => {
  it("skips the weekend and keeps the time of day", () => {
    // Friday 15:00 WIB -> Wednesday 15:00 WIB
    const due = addBusinessDays(new Date("2026-10-23T08:00:00Z"), 3, jakarta)
    expect(due.toISOString()).toBe("2026-10-28T08:00:00.000Z")
  })

  it("counts from Monday when the order is placed on a weekend", () => {
    const due = addBusinessDays(new Date("2026-10-24T03:00:00Z"), 3, jakarta)
    expect(due.toISOString()).toBe("2026-10-28T03:00:00.000Z")
  })

  it("decides weekdays in the store's time zone, not UTC", () => {
    // Friday 20:00 UTC is already Saturday 03:00 in Jakarta
    const friday = new Date("2026-10-23T20:00:00Z")
    expect(isBusinessDay(friday, { timezone: "UTC" })).toBe(true)
    expect(isBusinessDay(friday, jakarta)).toBe(false)
    expect(addBusinessDays(friday, 1, { timezone: "UTC" }).toISOString()).toBe("2026-10-26T20:00:00.000Z")
    // Monday 03:00 in Jakarta
    expect(addBusinessDays(friday, 1, jakarta).toISOString()).toBe("2026-10-25T20:00:00.000Z")
  })

  it("skips holidays", () => {
    const due = addBusinessDays(new Date("2026-10-23T08:00:00Z"), 3, {
      ...jakarta,
      holidays: ["2026-10-26", "2026-10-27"],
    })
    expect(due.toISOString()).toBe("2026-10-30T08:00:00.000Z")
  })

  it("returns the start for zero days", () => {
    const start = new Date("2026-10-23T08:00:00Z")
    expect(addBusinessDays(start, 0).getTime()).toBe(start.getTime())
  })
})

describe("option checks", () => {
  it("validates time zones and holiday dates", () => {
    expect(isValidTimezone("Asia/Jakarta")).toBe(true)
    expect(isValidTimezone("Mars/Base")).toBe(false)
    expect(isValidHoliday("2026-12-25")).toBe(true)
    expect(isValidHoliday("25-12-2026")).toBe(false)
    expect(isValidHoliday("2026-13-40")).toBe(false)
  })
})
