import "server-only"
import { getAuthHeaders } from "@lib/data/cookies"
import { BackendConfig, clientIpFrom, getTransfer } from "@modules/manual-transfer/core/api"
import type { TransferView } from "@modules/manual-transfer/core/types"
import { headers } from "next/headers"

/**
 * How this storefront's server reaches the plugin: the starter's backend URL
 * and publishable key, the customer's JWT cookie, and the buyer's IP with
 * MANUAL_TRANSFER_PROXY_SECRET (= the plugin's `trustedProxySecret`), so the
 * backend's per-IP limits count the buyer, not this server.
 */
export async function backendConfig(): Promise<BackendConfig> {
  const auth = (await getAuthHeaders()) as { authorization?: string }
  return {
    // Same default as the starter's src/lib/config.ts
    baseUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
    publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    authorization: auth.authorization ?? null,
    clientIp: clientIpFrom(await headers()),
    proxySecret: process.env.MANUAL_TRANSFER_PROXY_SECRET ?? null,
  }
}

/** For the logged-in customer who placed the order, or with the guest's token; null for anyone else */
export async function retrieveTransfer(orderId: string, token?: string | null): Promise<TransferView | null> {
  return getTransfer(await backendConfig(), orderId, token).catch(() => null)
}
