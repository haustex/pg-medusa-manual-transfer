# Storefront example: Medusa DTC Starter

Bank-transfer pages for the storefront of the [Medusa DTC Starter](https://github.com/medusajs/dtc-starter)
(`apps/storefront`, Next.js 16), in English and Indonesian. They carry your store's look only.

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
- **Language**: `?lang=id|en`, then the `_medusa_locale` cookie, then the country in the URL, then the browser's
  language.

Guests open the page with the token (from the order e-mail, or right after checkout); logged-in customers with their
session. Anyone else sees "not found".

### Install

```bash
cd your-dtc-repo
node apps/backend/node_modules/medusa-payment-manual-transfer/examples/dtc-starter/install.mjs apps/storefront
```

(or wherever npm put the package; with npm workspaces usually `node_modules/medusa-payment-manual-transfer`.)

The script copies the core (`src/storefront` of the package) to `src/modules/manual-transfer/core/` and this
folder's `src/` into `apps/storefront/src` (new files only; `--force` overwrites), then makes four edits, each
skipped when already done:

| File | Edit |
| --- | --- |
| `src/lib/constants.tsx` | `"pp_manual-transfer_manual-transfer": { title: "Bank transfer", icon: <Buildings /> }` in `paymentInfoMap` |
| `src/modules/checkout/components/payment-button/index.tsx` | `case isManualTransfer(paymentSession?.provider_id): return <ManualTransferPaymentButton … />` before the `isManual` case |
| `src/modules/order/templates/order-details-template.tsx` | `<OrderTransferLink order={order} />` after `<OrderDetails … />` |
| `src/modules/order/components/payment-details/index.tsx` | no "paid at …" when `isManualTransfer(payment.provider_id)` |

If an anchor is missing (your storefront changed), the script says which edit to make by hand. Tested against
dtc-starter commit `6965d8a` (Next.js 16.3, Medusa 2.22.1).

Then:

- in `apps/backend/medusa-config.ts`: `notifications: { paymentUrl: "https://your-store.com/transfer/{order_id}?token={token}" }`
  (the storefront's middleware adds the country code);
- the same random value as `MANUAL_TRANSFER_PROXY_SECRET` in `apps/backend/.env` and in the storefront's server
  environment (`openssl rand -hex 32`; never `NEXT_PUBLIC_…`), so the backend's per-IP limits count the buyer and not
  the storefront server. The storefront reads the buyer's IP from `X-Real-IP` / `X-Forwarded-For`: make sure the
  proxy in front of it sets them.

### What differs from the Next.js Starter example

Only three lines: the backend URL comes from `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, the checkout button uses the
starter's own `@modules/common/components/ui` (the DTC Starter has no `@medusajs/ui`), and `revalidateTag` takes the
Next.js 16 `{ expire: 0 }` profile. Everything else is the shared core.

### Files

| File | |
| --- | --- |
| `src/app/[countryCode]/(main)/transfer/[orderId]/page.tsx` | the payment page (no-index, no referrer: the URL holds the token) |
| `src/app/api/manual-transfer/[orderId]/proofs/route.ts` | forwards the upload to the backend (`forwardProof`) |
| `src/app/api/manual-transfer/[orderId]/invoice/route.ts` | forwards the invoice PDF |
| `src/lib/manual-transfer/backend.ts` | `backendConfig()` (backend URL, key, JWT cookie, buyer IP + secret), `retrieveTransfer` |
| `src/lib/manual-transfer/data.ts` | `placeManualTransferOrder` (server action) |
| `src/modules/manual-transfer/components/…` | checkout button, order link, upload form that refreshes the page |
| `src/modules/manual-transfer/core/…` | copied from the package, see [src/storefront/README.md](../../src/storefront/README.md) |

---

## Bahasa Indonesia

- **Checkout**: metode "Bank transfer"; tombol "Place order" membuat pesanan lalu langsung ke halaman pembayaran.
- **Halaman pembayaran** `/{countryCode}/transfer/{orderId}?token=…`: status, nominal persis, detail rekening dengan
  tombol salin, kode referensi, batas waktu dengan hitung mundur, catatan biaya OUR, unduh invoice, upload bukti (lagi
  setelah ditolak atau kurang bayar) dan daftar bukti beserta statusnya.
- **Halaman order di akun**: link ke halaman pembayaran; tidak ada "paid at" sebelum uang masuk.

Pasang:

```bash
node <lokasi paket>/examples/dtc-starter/install.mjs apps/storefront
```

Skrip menyalin inti (`src/storefront`) ke `src/modules/manual-transfer/core/`, menyalin `src/` contoh ini, dan membuat
empat perubahan kecil (tabel di bagian English). Lalu isi `notifications.paymentUrl` di `apps/backend/medusa-config.ts`,
dan `MANUAL_TRANSFER_PROXY_SECRET` yang sama di `.env` backend dan server storefront (jangan `NEXT_PUBLIC_…`).
