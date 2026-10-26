import { createHmac, KeyObject, timingSafeEqual } from "node:crypto"

/**
 * Secrets for guest upload links and signed proof URLs, both HMAC-SHA256 with
 * a purpose label so one can never be used as the other.
 *
 * Upload tokens are derived from the order id, so the notification e-mail
 * (phase 4) can rebuild the link at any time without storing the token. They
 * only work while the payment accepts proofs.
 */

export type SigningSecret = string | Buffer | KeyObject

const UPLOAD_PURPOSE = "manual-transfer:proof-upload:v1"
const VIEW_PURPOSE = "manual-transfer:proof-view:v1"
export const PROOF_URL_TTL_SECONDS = 5 * 60

function hmac(secret: SigningSecret, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url")
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function uploadToken(secret: SigningSecret, orderId: string): string {
  return hmac(secret, `${UPLOAD_PURPOSE}:${orderId}`)
}

export function verifyUploadToken(secret: SigningSecret, orderId: string, token: unknown): boolean {
  return typeof token === "string" && token.length > 0 && safeEqual(uploadToken(secret, orderId), token)
}

export function signProofPath(
  secret: SigningSecret,
  proofId: string,
  now: Date = new Date(),
  ttlSeconds: number = PROOF_URL_TTL_SECONDS
): { path: string; expires_at: string } {
  const expires = Math.floor(now.getTime() / 1000) + ttlSeconds
  const signature = hmac(secret, `${VIEW_PURPOSE}:${proofId}:${expires}`)
  return {
    path: `/manual-transfer/proofs/${encodeURIComponent(proofId)}/file?expires=${expires}&signature=${signature}`,
    expires_at: new Date(expires * 1000).toISOString(),
  }
}

export function verifyProofSignature(
  secret: SigningSecret,
  proofId: string,
  expires: unknown,
  signature: unknown,
  now: Date = new Date()
): boolean {
  if (typeof expires !== "string" || !/^\d{1,12}$/.test(expires) || typeof signature !== "string") {
    return false
  }
  const expiresAt = Number(expires)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  // Expired, or valid for suspiciously long (not signed by us)
  if (expiresAt < nowSeconds || expiresAt > nowSeconds + PROOF_URL_TTL_SECONDS + 60) {
    return false
  }
  return safeEqual(hmac(secret, `${VIEW_PURPOSE}:${proofId}:${expires}`), signature)
}
