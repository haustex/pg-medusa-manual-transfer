"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag, getCartId, removeCartId } from "@lib/data/cookies"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import type { TransferView } from "./types"

/**
 * Payment instructions and proof status of an order. The backend answers for
 * the logged-in customer who placed the order (the starter's JWT cookie) or
 * for anyone holding the order's upload token (from the order e-mail, or
 * traded for the cart id right after checkout). Anyone else: null.
 */
export async function retrieveTransfer(orderId: string, token?: string | null): Promise<TransferView | null> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()) }
  if (token) {
    headers["x-manual-transfer-token"] = token
  }
  try {
    const { manual_transfer } = await sdk.client.fetch<{ manual_transfer: TransferView }>(
      `/store/manual-transfer/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers, cache: "no-store" }
    )
    return manual_transfer
  } catch {
    return null
  }
}

/**
 * Like the starter's placeOrder, for bank transfers: completes the cart, and
 * while the cart id is still known trades it for the order's upload token, so
 * a guest lands on the payment page with access to it. Logged-in customers
 * need no token. Redirects to /{countryCode}/transfer/{orderId}.
 */
export async function placeManualTransferOrder(): Promise<HttpTypes.StoreCart | undefined> {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error("No existing cart found when placing an order")
  }
  const authHeaders = await getAuthHeaders()
  const result = await sdk.store.cart
    .complete(cartId, {}, { ...authHeaders })
    .then(async (res) => {
      revalidateTag(await getCacheTag("carts"))
      return res
    })
    .catch(medusaError)

  if (result?.type !== "order") {
    return result.cart
  }
  revalidateTag(await getCacheTag("orders"))

  let token: string | null = null
  if (!("authorization" in authHeaders)) {
    token = await sdk.client
      .fetch<{ token: string }>(`/store/manual-transfer/carts/${encodeURIComponent(cartId)}/upload-token`, {
        method: "GET",
        cache: "no-store",
      })
      .then(({ token }) => token)
      // The page then asks the buyer to open the link from the order e-mail
      .catch(() => null)
  }
  await removeCartId()
  const countryCode = result.order.shipping_address?.country_code?.toLowerCase()
  redirect(`/${countryCode}/transfer/${result.order.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`)
}
