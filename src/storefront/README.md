# Storefront core

The buyer's side of the plugin, independent of any starter: React components, the calls to the plugin's store
routes, and the texts in English and Indonesian. The installers of `examples/dtc-starter` and
`examples/nextjs-starter` copy this folder to `src/modules/manual-transfer/core/` of the storefront; for another
React storefront copy it yourself (it is plain TypeScript, no build step, no dependencies besides React).

| File | |
| --- | --- |
| `api.ts` | server-side calls: `getTransfer`, `getUploadToken`, `postProof` / `forwardProof`, `getInvoice`, `relay`; `clientIpFrom`, `backendHeaders` |
| `labels.ts` | EN / ID texts, `pickLocale`, money and date formats |
| `types.ts` | `TransferView` (the Store API answer), `isManualTransfer` |
| `theme.ts` | class names (Tailwind + `@medusajs/ui-preset` tokens by default), `theme` overrides |
| `components/transfer-view.tsx` | the whole payment page (server-renderable) |
| `components/proof-upload.tsx`, `copy-button.tsx`, `countdown.tsx` | the interactive parts (client components) |
| `components/status-badge.tsx`, `transfer-not-found.tsx` | |

## Using it

On the server, build a `BackendConfig` and read the transfer; then render `TransferView` with two routes of your own
that forward the upload and the invoice:

```tsx
const config = {
  baseUrl: process.env.MEDUSA_BACKEND_URL!,
  publishableKey: process.env.MEDUSA_PUBLISHABLE_KEY!,
  authorization: customerJwt ? `Bearer ${customerJwt}` : null,
  clientIp: clientIpFrom(request.headers),             // X-Real-IP, then the first X-Forwarded-For entry
  proxySecret: process.env.MANUAL_TRANSFER_PROXY_SECRET, // = the plugin's trustedProxySecret
}
const transfer = await getTransfer(config, orderId, token)   // null: show <TransferNotFound />

<TransferView
  transfer={transfer}
  token={token}
  locale={pickLocale([lang, acceptLanguage])}
  uploadUrl={`/api/manual-transfer/${orderId}/proofs`}       // POST → forwardProof(config, orderId, request)
  invoiceUrl={`/api/manual-transfer/${orderId}/invoice?locale=en&token=…`} // GET → relay(await getInvoice(…))
  theme={{ button: "btn btn-primary" }}                     // optional, any key of TransferTheme
/>
```

Keep `api.ts` on the server: `proxySecret` must never reach the browser. The proxy in front of the storefront must
set `X-Real-IP` (or `X-Forwarded-For`), or a buyer could choose the IP the backend limits.

Without Tailwind or `@medusajs/ui-preset`, pass a `theme` with your own classes; the markup is plain HTML with
`data-testid` attributes. The pages carry the store's look only, by design.
