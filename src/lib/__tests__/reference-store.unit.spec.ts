import { MAX_REFERENCE_ATTEMPTS, reserveReference } from "../reference-store"

/** A knex stand-in whose insert enforces a unique code like the real index */
function fakePg(taken: Set<string>, failWith?: unknown) {
  const inserted: Record<string, unknown>[] = []
  const pg = ((table: string) => ({
    insert: async (row: Record<string, unknown>) => {
      expect(table).toBe("manual_transfer_reference")
      if (failWith) {
        throw failWith
      }
      if (taken.has(row.code as string)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })
      }
      taken.add(row.code as string)
      inserted.push(row)
    },
  })) as never
  return { pg, inserted }
}

function sequence(...codes: string[]) {
  let i = 0
  return jest.fn(() => codes[Math.min(i++, codes.length - 1)])
}

describe("reserveReference", () => {
  it("inserts the code with the session id and returns it", async () => {
    const { pg, inserted } = fakePg(new Set())
    const code = await reserveReference(pg, { prefix: "MT", sessionId: "payses_1", generate: sequence("MT-AAAAA-AAAAA") })
    expect(code).toBe("MT-AAAAA-AAAAA")
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ code: "MT-AAAAA-AAAAA", payment_session_id: "payses_1" })
    expect(String(inserted[0].id)).toMatch(/^mtref_/)
  })

  it("draws again when the code is already taken", async () => {
    const taken = new Set(["MT-AAAAA-AAAAA", "MT-BBBBB-BBBBB"])
    const { pg, inserted } = fakePg(taken)
    const generate = sequence("MT-AAAAA-AAAAA", "MT-BBBBB-BBBBB", "MT-CCCCC-CCCCC")
    const code = await reserveReference(pg, { prefix: "MT", generate })
    expect(code).toBe("MT-CCCCC-CCCCC")
    expect(generate).toHaveBeenCalledTimes(3)
    expect(inserted.map((r) => r.code)).toEqual(["MT-CCCCC-CCCCC"])
  })

  it("never hands out the same code twice", async () => {
    const { pg } = fakePg(new Set())
    const generate = sequence("MT-AAAAA-AAAAA", "MT-AAAAA-AAAAA", "MT-DDDDD-DDDDD")
    const first = await reserveReference(pg, { prefix: "MT", generate })
    const second = await reserveReference(pg, { prefix: "MT", generate })
    expect(first).toBe("MT-AAAAA-AAAAA")
    expect(second).toBe("MT-DDDDD-DDDDD")
  })

  it("gives up after a bounded number of collisions", async () => {
    const { pg } = fakePg(new Set(["MT-AAAAA-AAAAA"]))
    const generate = sequence("MT-AAAAA-AAAAA")
    await expect(reserveReference(pg, { prefix: "MT", generate })).rejects.toThrow(/unique payment reference/)
    expect(generate).toHaveBeenCalledTimes(MAX_REFERENCE_ATTEMPTS)
  })

  it("does not retry on other database errors", async () => {
    const { pg } = fakePg(new Set(), Object.assign(new Error("connection lost"), { code: "57P01" }))
    const generate = sequence("MT-AAAAA-AAAAA")
    await expect(reserveReference(pg, { prefix: "MT", generate })).rejects.toThrow("connection lost")
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("uses real generated references by default", async () => {
    const { pg } = fakePg(new Set())
    expect(await reserveReference(pg, { prefix: "SHOP" })).toMatch(/^SHOP-[0-9A-Z]{5}-[0-9A-Z]{5}$/)
  })
})
