# Storefront example: Medusa Next.js Starter

Bank-transfer pages for the [Medusa Next.js Starter](https://github.com/medusajs/nextjs-starter-medusa), in English
and Indonesian. They carry your store's look only.

[English](#english) · [Bahasa Indonesia](#bahasa-indonesia)

## English

### What you get

- **Checkout**: "Bank transfer" as a payment method; "Place order" places the order and continues to the payment page
  (for a guest it trades the cart id for the upload token right away).
- **Payment page** `/{countryCode}/transfer/{orderId}?token=…`: status, the exact amount, bank details with copy
  buttons (account holder, account number, SWIFT, reference, amount as plain digits), the reference to put in the
  transfer note, the deadline in the buyer's time zone with a countdown, the note "choose OUR, all fees paid by the
  sender", and the pro-forma invoice download.
- **Proof upload** on the same page: JPG, PNG or PDF up to 5 MB, optional note; after a rejection or an underpayment the
  buyer uploads again. The page lists the proofs sent and their status (being checked, accepted, rejected with the
  reason), and says "paid" once an admin confirmed the transfer.
- **Account order page**: a link to the payment page for bank-transfer orders; no "paid at" before the money arrived.
- **Texts in English and Indonesian** in `src/lib/manual-transfer/labels.ts`. Language: `?lang=id|en`, then the
  starter's `_medusa_locale` cookie, then the country in the URL (`/id/…`), then the browser's language.

Guests open the page with the token (from the order e-mail, or right after checkout); logged-in customers with their
session. Anyone else sees "not found".

### Install

The starter is deprecated upstream in favour of [dtc-starter](https://github.com/medusajs/dtc-starter). The files
in `src/` are plain Next.js App Router code and port to it; only the four edits below are
starter-specific. Tested against starter commit `9818886` (Next.js 15.3, Medusa 2.19 backend).

```bash
cd your-storefront
node ../your-medusa-app/node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs .
```

The script copies `src/` of this folder into the starter (new files only; `--force` overwrites) and makes four small
edits, each skipped when already done:

| File | Edit |
| --- | --- |
| `src/lib/constants.tsx` | `"pp_manual-transfer_manual-transfer": { title: "Bank transfer", icon: <Buildings /> }` in `paymentInfoMap` |
| `src/modules/checkout/components/payment-button/index.tsx` | `case isManualTransfer(paymentSession?.provider_id): return <ManualTransferPaymentButton notReady={notReady} data-testid={dataTestId} />` before the `isManual` case |
| `src/modules/order/templates/order-details-template.tsx` | `<OrderTransferLink order={order} />` after `<OrderDetails … />` |
| `src/modules/order/components/payment-details/index.tsx` | no "paid at …" when `isManualTransfer(payment.provider_id)` |

If the starter changed and an anchor is missing, the script says which edit to make by hand.

Then, in the Medusa app's `medusa-config.ts`, point the e-mails at the page (the starter's middleware adds the country
code):

```ts
notifications: {
  paymentUrl: "https://your-store.com/transfer/{order_id}?token={token}",
}
```

The provider id is `pp_manual-transfer_manual-transfer` when the provider is registered with `id: "manual-transfer"`;
with another id, change `MANUAL_TRANSFER_PROVIDER` / `isManualTransfer` in `src/lib/manual-transfer/types.ts` and the key
in `paymentInfoMap`.

### Files

| File | |
| --- | --- |
| `src/app/[countryCode]/(main)/transfer/[orderId]/page.tsx` | the payment page (no-index, no referrer: the URL holds the token) |
| `src/app/api/manual-transfer/[orderId]/proofs/route.ts` | forwards the upload to the backend with the customer's JWT or the token |
| `src/app/api/manual-transfer/[orderId]/invoice/route.ts` | forwards the invoice PDF |
| `src/lib/manual-transfer/data.ts` | `retrieveTransfer`, `placeManualTransferOrder` (server actions) |
| `src/lib/manual-transfer/labels.ts` | EN / ID texts, language choice, money and date formats |
| `src/modules/manual-transfer/…` | the page template, copy button, countdown, upload form, status badge, checkout button, order link |

Uploads go through a route handler, not a server action: no `serverActions.bodySizeLimit` needed, and the customer's
JWT cookie stays on the server. The backend limits uploads per IP; behind the storefront every request comes from its
server, so either set Express' `trust proxy` to the storefront's address (the route forwards `X-Forwarded-For`) or raise
`proofUploads.perIp`. The per-order limit (5 a day) holds either way.

---

## Bahasa Indonesia

### Isinya

- **Checkout**: metode pembayaran "Bank transfer"; tombol "Place order" membuat pesanan lalu langsung ke halaman
  pembayaran (untuk tamu, cart id langsung ditukar dengan token upload).
- **Halaman pembayaran** `/{countryCode}/transfer/{orderId}?token=…`: status, nominal persis, detail rekening dengan
  tombol salin (nama penerima, nomor rekening, SWIFT, kode referensi, nominal tanpa simbol), kode referensi untuk berita
  transfer, batas waktu di zona waktu pembeli dengan hitung mundur, catatan "pilih biaya OUR / ditanggung pengirim", dan
  unduh invoice pro-forma.
- **Upload bukti** di halaman yang sama: JPG, PNG, atau PDF maks. 5 MB, catatan opsional; setelah ditolak atau kurang
  bayar pembeli bisa upload lagi. Halaman menampilkan bukti yang sudah dikirim beserta statusnya (sedang dicek,
  diterima, ditolak dengan alasan), dan status "Lunas" setelah admin mengonfirmasi.
- **Halaman order di akun**: link ke halaman pembayaran untuk order transfer bank; tidak ada "paid at" sebelum uang masuk.
- **Teks bahasa Inggris dan Indonesia** di `src/lib/manual-transfer/labels.ts`. Bahasa: `?lang=id|en`, lalu cookie
  `_medusa_locale` dari starter, lalu negara di URL (`/id/…`), lalu bahasa browser.

Tamu membuka halaman dengan token (dari email order, atau langsung setelah checkout); pelanggan yang login memakai
sesinya. Selain itu: "tidak ditemukan".

### Pemasangan

```bash
cd storefront-anda
node ../app-medusa-anda/node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs .
```

Skrip menyalin `src/` dari folder ini (hanya file baru; `--force` menimpa) dan membuat empat perubahan kecil di file
starter (tabel di bagian English). Kalau starter berubah dan teks acuannya tidak ditemukan, skrip menyebutkan perubahan
mana yang perlu dibuat manual. Starter ini sudah ditandai deprecated oleh Medusa (penggantinya dtc-starter); kodenya
App Router biasa dan bisa dipindahkan.

Lalu di `medusa-config.ts` app Medusa, arahkan link di email ke halaman ini (middleware starter menambahkan kode negara):

```ts
notifications: {
  paymentUrl: "https://toko-anda.com/transfer/{order_id}?token={token}",
}
```

Upload lewat route handler sehingga tidak perlu mengubah `next.config.js`. Batas upload per IP di backend akan melihat IP
server storefront: atur `trust proxy` Express ke alamat storefront, atau naikkan `proofUploads.perIp`. Batas per order (5
per hari) tetap berlaku.
