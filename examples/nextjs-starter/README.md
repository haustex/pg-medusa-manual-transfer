# Storefront example: Medusa Next.js Starter

Bank-transfer pages for the [Medusa Next.js Starter](https://github.com/medusajs/nextjs-starter-medusa), in English
and Indonesian. They carry your store's look only. The starter is deprecated upstream in favour of the
[DTC Starter](../dtc-starter/README.md); both examples share the same core.

[English](#english) · [Bahasa Indonesia](#bahasa-indonesia)

## English

### What you get

- **Checkout**: "Bank transfer" as a payment method; "Place order" places the order and continues to the payment page
  (for a guest it trades the cart id for the upload token right away).
- **Payment page** `/{countryCode}/transfer/{orderId}?token=…`: status, the exact amount, bank details with copy
  buttons, the reference for the transfer note, the deadline in the buyer's time zone with a countdown, the note
  "choose OUR, all fees paid by the sender", the pro-forma invoice download, the proof upload (JPG, PNG or PDF up to
  5 MB, again after a rejection or an underpayment) and the proofs sent with their status.
- **Account order page**: a link to the payment page for bank-transfer orders; no "paid at" before the money arrived.
- **Language**: `?lang=id|en`, then the starter's `_medusa_locale` cookie, then the country in the URL, then the
  browser's language.

Guests open the page with the token (from the order e-mail, or right after checkout); logged-in customers with their
session. Anyone else sees "not found".

### Install

```bash
cd your-storefront
node ../your-medusa-app/node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs .
```

The script copies the core (`src/storefront` of the package) to `src/modules/manual-transfer/core/` and this
folder's `src/` into the starter (new files only; `--force` overwrites), then makes four edits, each skipped when
already done:

| File | Edit |
| --- | --- |
| `src/lib/constants.tsx` | `"pp_manual-transfer_manual-transfer": { title: "Bank transfer", icon: <Buildings /> }` in `paymentInfoMap` |
| `src/modules/checkout/components/payment-button/index.tsx` | `case isManualTransfer(paymentSession?.provider_id): return <ManualTransferPaymentButton notReady={notReady} data-testid={dataTestId} />` before the `isManual` case |
| `src/modules/order/templates/order-details-template.tsx` | `<OrderTransferLink order={order} />` after `<OrderDetails … />` |
| `src/modules/order/components/payment-details/index.tsx` | no "paid at …" when `isManualTransfer(payment.provider_id)` |

If an anchor is missing (the starter changed), the script says which edit to make by hand. Tested against starter
commit `9818886` (Next.js 15.3) with Medusa 2.19 and 2.22.

Then:

- in the Medusa app's `medusa-config.ts`: `notifications: { paymentUrl: "https://your-store.com/transfer/{order_id}?token={token}" }`
  (the starter's middleware adds the country code);
- the same random value as `MANUAL_TRANSFER_PROXY_SECRET` in the backend's and in the storefront's server
  environment (`openssl rand -hex 32`; never `NEXT_PUBLIC_…`), so the backend's per-IP limits count the buyer and not
  the storefront server. The storefront reads the buyer's IP from `X-Real-IP` / `X-Forwarded-For`: make sure the
  proxy in front of it sets them.

The provider id is `pp_manual-transfer_manual-transfer` when the provider is registered with `id: "manual-transfer"`;
with another id, change the key in `paymentInfoMap` and `isManualTransfer` in the core's `types.ts`.

### Files

| File | |
| --- | --- |
| `src/app/[countryCode]/(main)/transfer/[orderId]/page.tsx` | the payment page (no-index, no referrer: the URL holds the token) |
| `src/app/api/manual-transfer/[orderId]/proofs/route.ts` | forwards the upload to the backend (`forwardProof`) |
| `src/app/api/manual-transfer/[orderId]/invoice/route.ts` | forwards the invoice PDF |
| `src/lib/manual-transfer/backend.ts` | `backendConfig()` (backend URL, key, JWT cookie, buyer IP + secret), `retrieveTransfer` |
| `src/lib/manual-transfer/data.ts` | `placeManualTransferOrder` (server action) |
| `src/modules/manual-transfer/components/…` | checkout button (`@medusajs/ui`), order link, upload form that refreshes the page |
| `src/modules/manual-transfer/core/…` | copied from the package, see [src/storefront/README.md](../../src/storefront/README.md) |

Uploads go through a route handler, not a server action: no `serverActions.bodySizeLimit` needed, and the customer's
JWT cookie stays on the server.

---

## Bahasa Indonesia

- **Checkout**: metode "Bank transfer"; tombol "Place order" membuat pesanan lalu langsung ke halaman pembayaran.
- **Halaman pembayaran** `/{countryCode}/transfer/{orderId}?token=…`: status, nominal persis, detail rekening dengan
  tombol salin, kode referensi, batas waktu dengan hitung mundur, catatan biaya OUR, unduh invoice, upload bukti (lagi
  setelah ditolak atau kurang bayar) dan daftar bukti beserta statusnya.
- **Halaman order di akun**: link ke halaman pembayaran; tidak ada "paid at" sebelum uang masuk.

Pasang:

```bash
cd storefront-anda
node ../app-medusa-anda/node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs .
```

Skrip menyalin inti (`src/storefront`) ke `src/modules/manual-transfer/core/`, menyalin `src/` contoh ini, dan membuat
empat perubahan kecil (tabel di bagian English). Lalu isi `notifications.paymentUrl` di `medusa-config.ts`, dan
`MANUAL_TRANSFER_PROXY_SECRET` yang sama di `.env` backend dan server storefront (jangan `NEXT_PUBLIC_…`) agar batas
upload per IP menghitung IP pembeli, bukan IP server storefront.
