import { BACKEND_URL, backendHeaders, relay } from "@lib/manual-transfer/backend"
import { NextRequest } from "next/server"

/** The pro-forma invoice PDF: GET /store/manual-transfer/orders/:id/invoice, with `?token=` for guests and `?locale=en|id` */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const token = request.nextUrl.searchParams.get("token")
  const locale = request.nextUrl.searchParams.get("locale") === "id" ? "id" : "en"
  const response = await fetch(
    `${BACKEND_URL}/store/manual-transfer/orders/${encodeURIComponent(orderId)}/invoice?locale=${locale}`,
    { headers: await backendHeaders(request, token), cache: "no-store" }
  )
  return relay(response, ["content-disposition", "content-length"])
}
