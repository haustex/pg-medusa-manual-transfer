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
