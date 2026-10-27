import { getLocale } from "@lib/data/locale-actions"
import { retrieveTransfer } from "@lib/manual-transfer/backend"
import ProofUpload from "@modules/manual-transfer/components/proof-upload"
import TransferNotFound from "@modules/manual-transfer/core/components/transfer-not-found"
import TransferView from "@modules/manual-transfer/core/components/transfer-view"
import { pickLocale } from "@modules/manual-transfer/core/labels"
import { Metadata } from "next"
import { headers } from "next/headers"

type Props = {
  params: Promise<{ countryCode: string; orderId: string }>
  searchParams: Promise<{ token?: string; lang?: string }>
}

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Bank transfer",
  // The URL carries the guest's upload token
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * /{countryCode}/transfer/{orderId}?token=… — the page the order e-mail links
 * to (plugin option notifications.paymentUrl, e.g.
 * "https://shop.example.com/transfer/{order_id}?token={token}"; the starter's
 * middleware adds the country code).
 */
export default async function TransferPage(props: Props) {
  const [{ countryCode, orderId }, { token, lang }] = await Promise.all([props.params, props.searchParams])
  const locale = pickLocale([lang, await getLocale(), countryCode, (await headers()).get("accept-language")])
  const transfer = await retrieveTransfer(orderId, token ?? null)

  if (!transfer) {
    return <TransferNotFound locale={locale} homeHref={`/${countryCode}/store`} />
  }

  const api = `/api/manual-transfer/${encodeURIComponent(transfer.order_id)}`
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : ""
  return (
    <TransferView
      transfer={transfer}
      token={token ?? null}
      locale={locale}
      uploadUrl={`${api}/proofs`}
      invoiceUrl={`${api}/invoice?locale=${locale}${tokenQuery}`}
      Upload={ProofUpload}
    />
  )
}
