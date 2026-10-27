import { backendConfig } from "@lib/manual-transfer/backend"
import { getInvoice, relay } from "@modules/manual-transfer/core/api"
import { NextRequest } from "next/server"

/** The pro-forma invoice PDF, with `?token=` for guests and `?locale=en|id` */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const token = request.nextUrl.searchParams.get("token")
  const locale = request.nextUrl.searchParams.get("locale") === "id" ? "id" : "en"
  return relay(await getInvoice(await backendConfig(), orderId, locale, token), ["content-disposition", "content-length"])
}
