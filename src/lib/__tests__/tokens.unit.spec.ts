import { randomBytes } from "node:crypto"
import { PROOF_URL_TTL_SECONDS, signProofPath, uploadToken, verifyProofSignature, verifyUploadToken } from "../tokens"

const SECRET = "test-secret"

describe("upload tokens", () => {
  it("are stable per order and verify", () => {
    const token = uploadToken(SECRET, "order_1")
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(uploadToken(SECRET, "order_1")).toBe(token)
    expect(verifyUploadToken(SECRET, "order_1", token)).toBe(true)
  })

  it("do not open another order, or verify with another secret", () => {
    const token = uploadToken(SECRET, "order_1")
    expect(verifyUploadToken(SECRET, "order_2", token)).toBe(false)
    expect(verifyUploadToken("other-secret", "order_1", token)).toBe(false)
  })

  it("reject missing, empty and malformed tokens", () => {
    for (const bad of [undefined, null, "", 42, ["x"], "short", uploadToken(SECRET, "order_1") + "x"]) {
      expect(verifyUploadToken(SECRET, "order_1", bad)).toBe(false)
    }
  })
})

describe("signed proof links", () => {
  const now = new Date("2026-10-26T00:00:00Z")

  function parts(path: string) {
    const url = new URL(path, "http://x")
    return { expires: url.searchParams.get("expires")!, signature: url.searchParams.get("signature")! }
  }

  it("verify within five minutes", () => {
    const { path, expires_at } = signProofPath(SECRET, "mtproof_1", now)
    expect(path).toMatch(/^\/manual-transfer\/proofs\/mtproof_1\/file\?expires=\d+&signature=/)
    expect(Date.parse(expires_at) - now.getTime()).toBe(PROOF_URL_TTL_SECONDS * 1000)
    const { expires, signature } = parts(path)
    expect(verifyProofSignature(SECRET, "mtproof_1", expires, signature, now)).toBe(true)
    expect(verifyProofSignature(SECRET, "mtproof_1", expires, signature, new Date(now.getTime() + 299_000))).toBe(true)
  })

  it("expire", () => {
    const { expires, signature } = parts(signProofPath(SECRET, "mtproof_1", now).path)
    expect(verifyProofSignature(SECRET, "mtproof_1", expires, signature, new Date(now.getTime() + 301_000))).toBe(false)
  })

  it("cannot be moved to another proof or extended", () => {
    const { expires, signature } = parts(signProofPath(SECRET, "mtproof_1", now).path)
    expect(verifyProofSignature(SECRET, "mtproof_2", expires, signature, now)).toBe(false)
    expect(verifyProofSignature(SECRET, "mtproof_1", String(Number(expires) + 60), signature, now)).toBe(false)
  })

  it("refuse links valid for far longer than we sign", () => {
    const far = signProofPath(SECRET, "mtproof_1", now, 24 * 3600)
    const { expires, signature } = parts(far.path)
    expect(verifyProofSignature(SECRET, "mtproof_1", expires, signature, now)).toBe(false)
  })

  it("are not interchangeable with upload tokens", () => {
    const token = uploadToken(SECRET, "mtproof_1")
    const { expires } = parts(signProofPath(SECRET, "mtproof_1", now).path)
    expect(verifyProofSignature(SECRET, "mtproof_1", expires, token, now)).toBe(false)
  })

  it("reject malformed query values", () => {
    expect(verifyProofSignature(SECRET, "mtproof_1", undefined, "x", now)).toBe(false)
    expect(verifyProofSignature(SECRET, "mtproof_1", "1e12", "x", now)).toBe(false)
    expect(verifyProofSignature(SECRET, "mtproof_1", ["1"], "x", now)).toBe(false)
  })
})

describe("tampered tokens and signatures (200 random cases each)", () => {
  const now = new Date("2026-10-26T00:00:00Z")
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  const otherChar = (c: string, k: number) => {
    const i = ALPHABET.indexOf(c)
    return ALPHABET[(i + 1 + (k % 63)) % 64]
  }
  const replaceAt = (s: string, i: number, c: string) => s.slice(0, i) + c + s.slice(i + 1)
  /** Every way of breaking a valid token: always a different string */
  function variants(token: string, k: number): string[] {
    const bytes = Buffer.from(token, "base64url")
    const flipped = Buffer.from(bytes)
    flipped[16] ^= 1 << (k % 8)
    // last character with other padding bits: same bytes, non-canonical text
    const last = token.at(-1)!
    const sameBytes = ALPHABET.split("").filter(
      (c) => c !== last && Buffer.from(token.slice(0, -1) + c, "base64url").equals(bytes)
    )
    const out = [
      flipped.toString("base64url"),
      replaceAt(token, 0, otherChar(token[0], k)),
      replaceAt(token, 21, otherChar(token[21], k)),
      replaceAt(token, 42, otherChar(token[42], k)),
      ...sameBytes.map((c) => token.slice(0, -1) + c),
      token.slice(0, -1),
      token + "A",
      token + "=",
    ]
    for (const v of out) {
      expect(v).not.toBe(token)
    }
    return out
  }

  it("upload tokens", () => {
    for (let k = 0; k < 200; k++) {
      const secret = randomBytes(32)
      const order = `order_${randomBytes(6).toString("hex")}`
      const token = uploadToken(secret, order)
      expect(verifyUploadToken(secret, order, token)).toBe(true)
      for (const bad of variants(token, k)) {
        expect(verifyUploadToken(secret, order, bad)).toBe(false)
      }
    }
  })

  it("proof signatures", () => {
    for (let k = 0; k < 200; k++) {
      const secret = randomBytes(32)
      const proof = `mtproof_${randomBytes(6).toString("hex")}`
      const url = new URL(signProofPath(secret, proof, now).path, "http://x")
      const expires = url.searchParams.get("expires")!
      const signature = url.searchParams.get("signature")!
      expect(verifyProofSignature(secret, proof, expires, signature, now)).toBe(true)
      for (const bad of variants(signature, k)) {
        expect(verifyProofSignature(secret, proof, expires, bad, now)).toBe(false)
      }
    }
  })

  it("the non-canonical last character really decodes to the same bytes (the case the format check is for)", () => {
    const token = uploadToken("test-secret", "order_1")
    const bytes = Buffer.from(token, "base64url")
    const twins = ALPHABET.split("").filter((c) => c !== token.at(-1) && Buffer.from(token.slice(0, -1) + c, "base64url").equals(bytes))
    expect(twins).toHaveLength(3)
  })
})
