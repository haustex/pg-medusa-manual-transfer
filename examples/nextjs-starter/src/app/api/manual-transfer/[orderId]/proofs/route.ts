import { BACKEND_URL, backendHeaders, relay } from "@lib/manual-transfer/backend"
import { NextRequest, NextResponse } from "next/server"

/** A little above the backend's 5 MB, for the multipart framing */
const MAX_BODY = 6 * 1024 * 1024

/**
 * Forwards the proof upload (multipart: `file`, optional `note`, and `token`
 * for guests) to POST /store/manual-transfer/orders/:id/proofs. A route handler
 * rather than a server action: no body-size setting in next.config needed, and
 * the customer's JWT cookie stays on the server.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ type: "invalid_data", message: "The file is larger than 5 MB" }, { status: 413 })
  }
  const form = await request.formData()
  const token = form.get("token")
  form.delete("token")
  const response = await fetch(`${BACKEND_URL}/store/manual-transfer/orders/${encodeURIComponent(orderId)}/proofs`, {
    method: "POST",
    body: form,
    headers: await backendHeaders(request, typeof token === "string" ? token : null),
    cache: "no-store",
  })
  return relay(response, ["retry-after"])
}
