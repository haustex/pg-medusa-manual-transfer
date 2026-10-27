import { getLocale } from "@lib/data/locale-actions"
import { retrieveTransfer } from "@lib/manual-transfer/data"
import { labelsFor, pickLocale } from "@lib/manual-transfer/labels"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import TransferTemplate from "@modules/manual-transfer/templates/transfer-template"
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
    const t = labelsFor(locale)
    return (
      <div className="content-container flex flex-col gap-y-4 py-16 max-w-xl" data-testid="transfer-not-found">
        <Heading level="h1" className="text-2xl-semi">
          {t.notFoundTitle}
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle">{t.notFoundText}</Text>
        <LocalizedClientLink href="/store" className="txt-medium-plus text-ui-fg-interactive">
          {t.continueShopping}
        </LocalizedClientLink>
      </div>
    )
  }

  return <TransferTemplate transfer={transfer} token={token ?? null} locale={locale} />
}
