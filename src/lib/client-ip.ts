import crypto from "node:crypto"
import { isIP } from "node:net"

/**
 * The buyer's IP for the per-IP rate limits.
 *
 * Behind a storefront every request reaches the backend from the storefront's
 * server, so the storefront sends the buyer's IP in `x-mt-client-ip`, together
 * with the shared secret in `x-mt-proxy-secret` (plugin option
 * `trustedProxySecret`). The header is used only when that secret matches;
 * otherwise the IP of the TCP connection counts. `X-Forwarded-For` is never
 * read: Medusa sets Express' `trust proxy` to 1, so `req.ip` would be whatever
 * a caller who reaches the backend directly writes into that header.
 */

export const CLIENT_IP_HEADER = "x-mt-client-ip"
export const PROXY_SECRET_HEADER = "x-mt-proxy-secret"

type RequestLike = {
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string | null } | null
}

/** "::ffff:1.2.3.4" (IPv4 on a dual-stack socket) → "1.2.3.4" */
export function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  return (mapped ? mapped[1] : ip).toLowerCase()
}

function sameSecret(given: string, expected: string): boolean {
  // Hash both sides: timingSafeEqual needs equal lengths and must not leak the length
  const a = crypto.createHash("sha256").update(given).digest()
  const b = crypto.createHash("sha256").update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

function single(value: string | string[] | undefined): string | null {
  // A header sent twice arrives as an array (or comma-joined): not trusted
  return typeof value === "string" && value && !value.includes(",") ? value.trim() : null
}

export function connectionIp(req: RequestLike): string {
  const address = req.socket?.remoteAddress
  return address ? normalizeIp(address) : "unknown"
}

export function clientIp(req: RequestLike, trustedProxySecret?: string | null): string {
  if (trustedProxySecret) {
    const secret = single(req.headers[PROXY_SECRET_HEADER])
    const claimed = single(req.headers[CLIENT_IP_HEADER])
    if (secret && claimed && isIP(claimed) && sameSecret(secret, trustedProxySecret)) {
      return normalizeIp(claimed)
    }
  }
  return connectionIp(req)
}
