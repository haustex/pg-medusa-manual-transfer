import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import multer from "multer"
import { clientIp } from "../lib/client-ip"
import { OrderTransfer } from "../lib/order-transfer"
import { ManualTransferStatus, receivedSoFar, UPLOADABLE_STATUSES } from "../lib/payment-data"
import { getProofLimits, getSigningSecret, getTrustedProxySecret } from "../lib/plugin-options"
import { MAX_PROOF_BYTES } from "../lib/proof-file"
import { RateLimiter } from "../lib/rate-limit"
import { verifyUploadToken } from "../lib/tokens"

/** HTTP helpers shared by the proof routes (store, admin and the signed file route) */

export const PROOF_FIELDS = [
  "id",
  "order_id",
  "payment_id",
  "reference",
  "filename",
  "mime_type",
  "size",
  "sha256",
  "status",
  "rejection_reason",
  "reviewed_by",
  "reviewed_at",
  "uploaded_by",
  "customer_id",
  "note",
  "duplicate_of_order_id",
  "file_deleted_at",
  "created_at",
] as const

/** What a buyer may see of a proof */
export const BUYER_PROOF_FIELDS = [
  "id",
  "filename",
  "mime_type",
  "size",
  "status",
  "rejection_reason",
  "created_at",
] as const

type ProofLike = Record<string, unknown>

export function pickFields<T extends readonly string[]>(record: ProofLike, fields: T) {
  return Object.fromEntries(fields.map((field) => [field, record[field] ?? null]))
}

/** The payment instructions and proof status a buyer sees */
export function buyerView(transfer: OrderTransfer, proofs: ProofLike[]) {
  const { order, payment } = transfer
  const status = payment.data.status as ManualTransferStatus | undefined
  const received = receivedSoFar(payment.data)
  return {
    order_id: order.id,
    display_id: order.display_id,
    reference: payment.data.reference ?? null,
    status: status ?? null,
    amount: payment.amount,
    currency_code: payment.currency_code,
    /** Partial transfers an admin recorded so far, and what is left to pay */
    amount_received: received,
    amount_remaining: MathBN.max(MathBN.sub(payment.amount, received), 0).toNumber(),
    expires_at: payment.data.expires_at ?? null,
    account: payment.data.account ?? null,
    can_upload:
      order.status !== "canceled" &&
      !payment.canceled_at &&
      !payment.captured_at &&
      !!status &&
      UPLOADABLE_STATUSES.includes(status),
    proofs: proofs.map((proof) => pickFields(proof, BUYER_PROOF_FIELDS)),
  }
}

export type BuyerAccess = { as: "customer"; customer_id: string } | { as: "guest" }

function tokenFrom(req: MedusaRequest): unknown {
  const header = req.headers["x-manual-transfer-token"]
  if (typeof header === "string" && header) {
    return header
  }
  if (typeof req.query.token === "string") {
    return req.query.token
  }
  return (req.body as Record<string, unknown> | undefined)?.token
}

/**
 * The logged-in customer who placed the order, or anyone holding the order's
 * upload token. Everyone else gets the same NOT_FOUND as for a missing order.
 */
export function buyerAccess(req: AuthenticatedMedusaRequest, transfer: OrderTransfer): BuyerAccess {
  const actorId = req.auth_context?.actor_id
  if (actorId && req.auth_context?.actor_type === "customer" && transfer.order.customer_id === actorId) {
    return { as: "customer", customer_id: actorId }
  }
  if (verifyUploadToken(getSigningSecret(req.scope), transfer.order.id, tokenFrom(req))) {
    return { as: "guest" }
  }
  throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${transfer.order.id} not found`)
}

export function tooManyRequests(res: MedusaResponse, retryAfterSeconds: number, message: string) {
  res.setHeader("Retry-After", String(retryAfterSeconds))
  res.status(429).json({ type: "too_many_requests", message })
}

const limiters = new Map<string, RateLimiter>()

/**
 * Per-IP limit for the public proof routes: uploads, reads, and cart → token
 * exchanges, each counted apart. The IP is the connection's, or the one a
 * storefront holding `trustedProxySecret` vouches for (src/lib/client-ip.ts).
 */
export function proofRateLimit(kind: "upload" | "read" | "token") {
  return (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const limits = getProofLimits(req.scope)
    const [limit, windowMs] =
      kind === "upload"
        ? [limits.perIp, limits.perIpWindowMinutes * 60_000]
        : kind === "token"
          ? [limits.tokenExchangesPerIp, limits.tokenExchangesWindowMinutes * 60_000]
          : [limits.readsPerIpPerMinute, 60_000]
    const id = `${kind}:${limit}:${windowMs}`
    let limiter = limiters.get(id)
    if (!limiter) {
      limiter = new RateLimiter(limit, windowMs)
      limiters.set(id, limiter)
    }
    const result = limiter.hit(clientIp(req, getTrustedProxySecret(req.scope)))
    if (!result.allowed) {
      return tooManyRequests(res, result.retryAfterSeconds, "Too many requests, try again later")
    }
    next()
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_BYTES, files: 1, fields: 5, fieldSize: 2048 },
})

/** Parses the single `file` field; answers 413 above 5 MB */
export function proofUploadParser(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  upload.single("file")(req as never, res as never, (error: unknown) => {
    if (!error) {
      return next()
    }
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ type: "invalid_data", message: "The file is larger than 5 MB" })
      }
      return res.status(400).json({ type: "invalid_data", message: `Upload rejected: ${error.message}` })
    }
    next(error)
  })
}
