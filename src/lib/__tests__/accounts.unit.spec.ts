import { AccountRow, listActiveAccounts, pickAccount, snapshotAccount } from "../accounts"

function row(overrides: Partial<AccountRow>): AccountRow {
  return {
    id: "mtacc_1",
    label: null,
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

describe("pickAccount", () => {
  const global = row({ id: "global" })
  const us = row({ id: "us", region_ids: ["reg_us"] })
  const eu = row({ id: "eu", region_ids: ["reg_eu"] })

  it("returns null without accounts", () => {
    expect(pickAccount([])).toBeNull()
  })

  it("takes the first account offered in the region, keeping the given order", () => {
    expect(pickAccount([us, global], { regionId: "reg_us" })?.id).toBe("us")
    expect(pickAccount([us, global], { regionId: "reg_eu" })?.id).toBe("global")
    expect(pickAccount([us, eu], { regionId: "reg_id" })).toBeNull()
  })

  it("skips region-bound accounts when no region is known", () => {
    expect(pickAccount([us, global])?.id).toBe("global")
  })

  it("honours a requested account only when it is offered in the region", () => {
    expect(pickAccount([global, us], { regionId: "reg_us", accountId: "us" })?.id).toBe("us")
    expect(pickAccount([global, eu], { regionId: "reg_us", accountId: "eu" })?.id).toBe("global")
  })
})

describe("snapshotAccount", () => {
  it("copies only what the buyer needs", () => {
    expect(snapshotAccount(row({ label: "internal", rank: 3 }))).toEqual({
      id: "mtacc_1",
      bank_name: "Test Bank",
      account_holder: "PT Contoh",
      account_number: "0000000000",
      swift_code: "TESTIDJA",
      bank_address: null,
      currency_code: "usd",
    })
  })
})

describe("listActiveAccounts", () => {
  it("queries non-deleted active accounts of the lower-cased currency", async () => {
    const calls: unknown[][] = []
    const builder: Record<string, unknown> = {}
    for (const method of ["select", "whereNull", "andWhere"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args])
        return builder
      }
    }
    builder.orderBy = async (...args: unknown[]) => {
      calls.push(["orderBy", ...args])
      return [row({})]
    }
    const pg = ((table: string) => {
      calls.push(["table", table])
      return builder
    }) as never

    const rows = await listActiveAccounts(pg, "USD")
    expect(rows).toHaveLength(1)
    expect(calls).toContainEqual(["table", "manual_transfer_account"])
    expect(calls).toContainEqual(["whereNull", "deleted_at"])
    expect(calls).toContainEqual(["andWhere", "is_active", true])
    expect(calls).toContainEqual(["andWhere", "currency_code", "usd"])
  })
})
