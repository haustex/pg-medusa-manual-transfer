import { backendConfig } from "@lib/manual-transfer/backend"
import { forwardProof } from "@modules/manual-transfer/core/api"
import { NextRequest } from "next/server"

/**
 * Forwards the proof upload (multipart: `file`, optional `note`, and `token`
 * for guests) to POST /store/manual-transfer/orders/:id/proofs. A route handler
 * rather than a server action: no body-size setting in next.config needed, and
 * the customer's JWT cookie stays on the server.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  return forwardProof(await backendConfig(), orderId, request)
}
