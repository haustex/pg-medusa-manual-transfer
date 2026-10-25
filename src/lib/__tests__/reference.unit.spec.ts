import {
  checkSymbol,
  generateReference,
  isValidReferencePrefix,
  parseReference,
  REFERENCE_ALPHABET,
} from "../reference"

describe("generateReference", () => {
  it("formats prefix, two groups of five and a valid check symbol", () => {
    const ref = generateReference("MT")
    expect(ref).toMatch(/^MT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(parseReference(ref)).toBe(ref)
  })

  it("uses the given prefix", () => {
    expect(generateReference("ACME")).toMatch(/^ACME-/)
  })

  it("does not repeat across many draws", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generateReference()))
    expect(seen.size).toBe(5000)
  })

  it("is deterministic for a given random source", () => {
    let i = 0
    const ref = generateReference("MT", () => i++ % REFERENCE_ALPHABET.length)
    expect(ref).toBe(`MT-01234-5678${checkSymbol("012345678")}`)
  })
})

describe("parseReference", () => {
  const ref = generateReference("MT", () => 7)

  it("accepts lower case, spaces and missing dashes", () => {
    const loose = ref.toLowerCase().replace(/-/g, " ")
    expect(parseReference(loose)).toBe(ref)
    expect(parseReference(ref.replace(/-/g, ""))).toBe(ref)
  })

  it("maps look-alike letters O, I and L", () => {
    const body = "0000010000"
    const code = `MT-${body.slice(0, 5)}-${body.slice(5, 9)}${checkSymbol(body.slice(0, 9))}`
    expect(parseReference(code.replace(/0/g, "O").replace("1", "l"))).toBe(code)
  })

  it("rejects every single-symbol typo", () => {
    const body = ref.replace(/^MT-/, "").replace("-", "")
    for (let pos = 0; pos < body.length; pos++) {
      for (const symbol of REFERENCE_ALPHABET) {
        if (symbol === body[pos]) {
          continue
        }
        const typo = body.slice(0, pos) + symbol + body.slice(pos + 1)
        expect(parseReference(`MT-${typo.slice(0, 5)}-${typo.slice(5)}`)).toBeNull()
      }
    }
  })

  it("rejects malformed input and U", () => {
    expect(parseReference("")).toBeNull()
    expect(parseReference("MT-1234")).toBeNull()
    expect(parseReference("MT-UUUUU-UUUUU")).toBeNull()
  })
})

describe("isValidReferencePrefix", () => {
  it("allows 1-6 upper-case letters and digits", () => {
    expect(isValidReferencePrefix("MT")).toBe(true)
    expect(isValidReferencePrefix("SHOP24")).toBe(true)
    expect(isValidReferencePrefix("")).toBe(false)
    expect(isValidReferencePrefix("mt")).toBe(false)
    expect(isValidReferencePrefix("TOOLONG")).toBe(false)
    expect(isValidReferencePrefix("M-T")).toBe(false)
  })
})
