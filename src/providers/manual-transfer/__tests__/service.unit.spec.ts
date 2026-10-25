import { AccountRow } from "../../../lib/accounts"
import { MANUAL_TRANSFER_STATUS } from "../../../lib/payment-data"
import { parseReference } from "../../../lib/reference"
import ManualTransferProviderService from "../service"

const accounts: AccountRow[] = []
let sessionRegion: string | null = null

jest.mock("../../../lib/accounts", () => {
  const actual = jest.requireActual("../../../lib/accounts")
  return {
    ...actual,
    listActiveAccounts: jest.fn(async (_pg: unknown, currency: string) =>
      accounts
        .filter((a) => a.is_active && a.currency_code === currency.toLowerCase())
        .sort((a, b) => a.rank - b.rank)
    ),
    findSessionRegionId: jest.fn(async () => sessionRegion),
  }
})

function account(overrides: Partial<AccountRow>): AccountRow {
  return {
    id: "mtacc_usd",
    label: "internal label",
    bank_name: "Test Bank",
    account_holder: "PT Contoh",
    account_number: "0000000000",
    swift_code: "TESTIDJA",
    bank_address: null,
    currency_code: "usd",
    region_ids: [],
    is_active: true,
    rank: 0,
    ...overrides,
  }
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never

function provider(options = {}) {
  return new ManualTransferProviderService({ logger, __pg_connection__: {} as never }, options)
}

beforeEach(() => {
  accounts.length = 0
  accounts.push(account({}))
  sessionRegion = null
})

describe("validateOptions", () => {
  it("accepts defaults and sane values", () => {
    expect(() => ManualTransferProviderService.validateOptions({})).not.toThrow()
    expect(() =>
      ManualTransferProviderService.validateOptions({
        referencePrefix: "SHOP",
        deadlineBusinessDays: 5,
        timezone: "Asia/Jakarta",
        holidays: ["2026-12-25"],
      })
    ).not.toThrow()
  })

  it("rejects bad values with one message", () => {
    expect(() =>
      ManualTransferProviderService.validateOptions({
        referencePrefix: "bad-prefix",
        deadlineBusinessDays: 0,
        timezone: "Nowhere/City",
        holidays: ["tomorrow"],
      })
    ).toThrow(/referencePrefix.*deadlineBusinessDays.*timezone.*holidays/)
  })
})

describe("initiatePayment", () => {
  it("snapshots the account and issues a reference", async () => {
    const { id, data, status } = await provider({ referencePrefix: "SHOP" }).initiatePayment({
      amount: 1250.5,
      currency_code: "USD",
      data: { session_id: "payses_1" },
    })
    expect(status).toBe("pending")
    expect(parseReference(id)).toBe(id)
    expect(id).toMatch(/^SHOP-/)
    expect(data).toEqual({
      reference: id,
      account: {
        id: "mtacc_usd",
        bank_name: "Test Bank",
        account_holder: "PT Contoh",
        account_number: "0000000000",
        swift_code: "TESTIDJA",
        bank_address: null,
        currency_code: "usd",
      },
      amount: 1250.5,
      currency_code: "usd",
      region_id: null,
      status: MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT,
      session_id: "payses_1",
    })
  })

  it("prefers the cart's region over what the storefront sends", async () => {
    accounts.push(account({ id: "mtacc_us", region_ids: ["reg_us"], rank: -1 }))
    accounts.push(account({ id: "mtacc_eu", region_ids: ["reg_eu"], rank: -1 }))
    sessionRegion = "reg_us"
    const { data } = await provider().initiatePayment({
      amount: 10,
      currency_code: "usd",
      data: { session_id: "payses_1", region_id: "reg_eu" },
    })
    expect(data?.region_id).toBe("reg_us")
    expect((data?.account as { id: string }).id).toBe("mtacc_us")
  })

  it("fails when no account takes the currency", async () => {
    await expect(
      provider().initiatePayment({ amount: 10, currency_code: "eur", data: {} })
    ).rejects.toThrow(/No active bank account for currency EUR/)
  })
})

describe("authorizePayment", () => {
  async function session(extra: Record<string, unknown> = {}) {
    const { data } = await provider().initiatePayment({
      amount: 100,
      currency_code: "usd",
      data: { session_id: "payses_1" },
    })
    return { ...data, ...extra }
  }

  it("authorizes so the order is placed, awaiting payment with a deadline", async () => {
    const before = Date.now()
    const { status, data } = await provider({ deadlineBusinessDays: 3 }).authorizePayment({
      data: await session(),
    })
    expect(status).toBe("authorized")
    expect(data?.status).toBe(MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT)
    const authorizedAt = Date.parse(data?.authorized_at as string)
    const expiresAt = Date.parse(data?.expires_at as string)
    expect(authorizedAt).toBeGreaterThanOrEqual(before)
    // 3 business days are at least 3 and at most 5 calendar days
    expect(expiresAt - authorizedAt).toBeGreaterThanOrEqual(3 * 864e5)
    expect(expiresAt - authorizedAt).toBeLessThanOrEqual(5 * 864e5)
  })

  it("drops keys the storefront slipped into the session data", async () => {
    const forged = await session({
      status: MANUAL_TRANSFER_STATUS.PAID,
      confirmation: { amount_received: 100 },
      expires_at: "2099-01-01T00:00:00.000Z",
      anything: "else",
    })
    const { data } = await provider().authorizePayment({ data: forged })
    expect(data?.status).toBe(MANUAL_TRANSFER_STATUS.AWAITING_PAYMENT)
    expect(data).not.toHaveProperty("confirmation")
    expect(data).not.toHaveProperty("anything")
    expect(data?.expires_at).not.toBe("2099-01-01T00:00:00.000Z")
  })

  it("freezes the account as it is when the order is placed", async () => {
    const data = await session()
    accounts[0] = account({ account_number: "1111111111" })
    const { data: authorized } = await provider().authorizePayment({ data })
    expect((authorized?.account as { account_number: string }).account_number).toBe("1111111111")
  })

  it("switches to another account when the chosen one was deactivated", async () => {
    const data = await session()
    accounts[0] = account({ is_active: false })
    accounts.push(account({ id: "mtacc_backup" }))
    const { data: authorized } = await provider().authorizePayment({ data })
    expect((authorized?.account as { id: string }).id).toBe("mtacc_backup")
  })

  it("refuses a session without a valid reference", async () => {
    await expect(
      provider().authorizePayment({ data: await session({ reference: "MT-00000-00001" }) })
    ).rejects.toThrow(/incomplete/)
  })
})

describe("capturePayment", () => {
  it("refuses Medusa's own capture without an admin confirmation", async () => {
    const { data } = await provider().authorizePayment({
      data: (await provider().initiatePayment({ amount: 1, currency_code: "usd", data: {} })).data,
    })
    await expect(provider().capturePayment({ data })).rejects.toThrow(/only by confirming/)
    await expect(
      provider().capturePayment({ data: { ...data, status: MANUAL_TRANSFER_STATUS.PAID } })
    ).rejects.toThrow(/only by confirming/)
  })

  it("captures once confirmed", async () => {
    const data = {
      status: MANUAL_TRANSFER_STATUS.PAID,
      confirmation: { amount_received: 1, confirmed_at: "2026-10-26T00:00:00Z" },
    }
    await expect(provider().capturePayment({ data })).resolves.toEqual({ data })
  })
})

describe("cancel, refund, status", () => {
  it("cancels unpaid transfers, keeping expired ones expired", async () => {
    const { data } = await provider().cancelPayment({ data: { status: "awaiting_payment" } })
    expect(data?.status).toBe(MANUAL_TRANSFER_STATUS.CANCELED)
    expect(data?.canceled_at).toBeDefined()
    const expired = await provider().cancelPayment({ data: { status: "expired" } })
    expect(expired.data?.status).toBe(MANUAL_TRANSFER_STATUS.EXPIRED)
    await expect(provider().cancelPayment({ data: { status: "paid" } })).rejects.toThrow(/refund/)
  })

  it("records refunds", async () => {
    const first = await provider().refundPayment({ amount: 10, data: { status: "paid" } })
    const second = await provider().refundPayment({ amount: 5, data: first.data })
    expect((second.data?.refunds as { amount: number }[]).map((r) => r.amount)).toEqual([10, 5])
  })

  it("maps statuses for Medusa", async () => {
    const p = provider()
    expect((await p.getPaymentStatus({ data: { status: "awaiting_payment" } })).status).toBe("pending")
    expect(
      (await p.getPaymentStatus({ data: { status: "awaiting_verification", authorized_at: "x" } })).status
    ).toBe("authorized")
    expect((await p.getPaymentStatus({ data: { status: "paid" } })).status).toBe("captured")
    expect((await p.getPaymentStatus({ data: { status: "expired" } })).status).toBe("canceled")
  })
})

describe("updatePayment", () => {
  it("keeps the reference and account, takes the new amount", async () => {
    const { data } = await provider().initiatePayment({ amount: 10, currency_code: "usd", data: {} })
    const updated = await provider().updatePayment({ amount: 25, currency_code: "usd", data })
    expect(updated.data?.reference).toBe(data?.reference)
    expect(updated.data?.amount).toBe(25)
  })
})
