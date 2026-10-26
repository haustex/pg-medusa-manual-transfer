import { pickPaymentData, receivedSoFar } from "../payment-data"

describe("receivedSoFar", () => {
  it("sums recorded partial transfers without float noise", () => {
    expect(receivedSoFar(undefined)).toBe(0)
    expect(receivedSoFar({ receipts: "nope" })).toBe(0)
    expect(receivedSoFar({ receipts: [{ amount: 0.1 }, { amount: 0.2 }] })).toBe(0.3)
    expect(receivedSoFar({ receipts: [{ amount: 100 }, { amount: 49.99 }] })).toBe(149.99)
  })
})

describe("pickPaymentData", () => {
  it("keeps receipts and reminded_at, drops unknown keys", () => {
    expect(pickPaymentData({ receipts: [], reminded_at: "x", forged: true })).toEqual({ receipts: [], reminded_at: "x" })
  })
})
