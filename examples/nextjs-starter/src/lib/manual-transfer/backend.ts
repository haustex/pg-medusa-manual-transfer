import "server-only"
import { getAuthHeaders } from "@lib/data/cookies"
import type { NextRequest } from "next/server"

/** Same defaults as the starter's src/lib/config.ts */
export const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

/**
 * Headers for calling the plugin's store routes from a route handler: the
 * publishable key, the customer's JWT if logged in, the guest upload token if
 * any, and the buyer's IP (the backend limits uploads per IP; it only uses
 * X-Forwarded-For when Express' `trust proxy` covers this storefront).
 */
export async function backendHeaders(request: NextRequest, token: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    ...((await getAuthHeaders()) as Record<string, string>),
  }
  if (token) {
    headers["x-manual-transfer-token"] = token
  }
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")
  if (forwarded) {
    headers["x-forwarded-for"] = forwarded
  }
  return headers
}

/** Passes the backend's answer on, with the headers the browser needs */
export function relay(response: Response, keep: string[]): Response {
  const headers = new Headers({ "cache-control": "no-store" })
  for (const name of ["content-type", ...keep]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(response.body, { status: response.status, headers })
}
