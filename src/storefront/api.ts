import type { TransferLocale } from "./labels"
import type { TransferView } from "./types"

/**
 * Calls to the plugin's store routes, for the storefront's server (route
 * handlers, server actions, loaders). Only the Fetch API: no SDK, no
 * framework. Never call these from the browser: `proxySecret` must stay on
 * the server.
 */

export type BackendConfig = {
  /** The Medusa backend, e.g. "http://localhost:9000" */
  baseUrl: string
  publishableKey: string
  /** `Bearer <jwt>` of the logged-in customer, if any */
  authorization?: string | null
  /**
   * The buyer's IP and the plugin's `trustedProxySecret`. Sent together as
   * `x-mt-client-ip` / `x-mt-proxy-secret`, so the backend's per-IP limits see
   * the buyer instead of this server. Without the secret neither is sent.
   */
  clientIp?: string | null
  proxySecret?: string | null
}

export const CLIENT_IP_HEADER = "x-mt-client-ip"
export const PROXY_SECRET_HEADER = "x-mt-proxy-secret"
export const TOKEN_HEADER = "x-manual-transfer-token"

type HeaderSource = { get(name: string): string | null }

/**
 * The buyer's IP as the storefront's own proxy reports it: `X-Real-IP`, then
 * the first `X-Forwarded-For` entry. Make sure the proxy in front of the
 * storefront sets (overwrites) one of them, or a buyer could pick their own;
 * Vercel does, for nginx use `proxy_set_header X-Real-IP $remote_addr`.
 */
export function clientIpFrom(headers: HeaderSource): string | null {
  const real = headers.get("x-real-ip")?.trim()
  if (real) {
    return real
  }
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return first || null
}

export function backendHeaders(config: BackendConfig, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "x-publishable-api-key": config.publishableKey }
  if (config.authorization) {
    headers.authorization = config.authorization
  }
  if (token) {
    headers[TOKEN_HEADER] = token
  }
  if (config.proxySecret && config.clientIp) {
    headers[CLIENT_IP_HEADER] = config.clientIp
    headers[PROXY_SECRET_HEADER] = config.proxySecret
  }
  return headers
}

function url(config: BackendConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`
}

const orderPath = (orderId: string) => `/store/manual-transfer/orders/${encodeURIComponent(orderId)}`

/**
 * Payment instructions and proof status of an order. The backend answers for
 * the logged-in customer who placed the order or for anyone holding the
 * order's upload token; anyone else gets null (as for a missing order).
 */
export async function getTransfer(config: BackendConfig, orderId: string, token?: string | null): Promise<TransferView | null> {
  const response = await fetch(url(config, orderPath(orderId)), {
    headers: backendHeaders(config, token),
    cache: "no-store",
  })
  if (!response.ok) {
    return null
  }
  const body = (await response.json()) as { manual_transfer?: TransferView }
  return body.manual_transfer ?? null
}

/**
 * Right after checkout, while the cart id is still known: the guest's upload
 * token for the order placed from that cart (completed at most 24 hours ago).
 * Null when the backend refuses.
 */
export async function getUploadToken(config: BackendConfig, cartId: string): Promise<string | null> {
  const response = await fetch(url(config, `/store/manual-transfer/carts/${encodeURIComponent(cartId)}/upload-token`), {
    headers: backendHeaders(config),
    cache: "no-store",
  })
  if (!response.ok) {
    return null
  }
  return ((await response.json()) as { token?: string }).token ?? null
}

/** Forwards a proof upload (multipart `file` and optional `note`) */
export function postProof(config: BackendConfig, orderId: string, form: FormData, token?: string | null): Promise<Response> {
  return fetch(url(config, `${orderPath(orderId)}/proofs`), {
    method: "POST",
    body: form,
    headers: backendHeaders(config, token),
    cache: "no-store",
  })
}

/** The pro-forma invoice PDF */
export function getInvoice(config: BackendConfig, orderId: string, locale: TransferLocale, token?: string | null): Promise<Response> {
  return fetch(url(config, `${orderPath(orderId)}/invoice?locale=${locale}`), {
    headers: backendHeaders(config, token),
    cache: "no-store",
  })
}

/** A little above the backend's 5 MB, for the multipart framing */
export const MAX_UPLOAD_BODY = 6 * 1024 * 1024

/**
 * A storefront route's whole job for an upload: refuses an oversized body
 * early, takes the guest token out of the form and forwards the rest.
 */
export async function forwardProof(config: BackendConfig, orderId: string, request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BODY) {
    return Response.json({ type: "invalid_data", message: "The file is larger than 5 MB" }, { status: 413 })
  }
  const form = await request.formData()
  const token = form.get("token")
  form.delete("token")
  const response = await postProof(config, orderId, form, typeof token === "string" ? token : null)
  return relay(response, ["retry-after"])
}

/** Passes the backend's answer on, with only the headers the browser needs */
export function relay(response: Response, keep: string[] = []): Response {
  const headers = new Headers({ "cache-control": "no-store" })
  for (const name of ["content-type", ...keep]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(response.body, { status: response.status, headers })
}
