# PG Medusa Transfer Manual by Haus Kayu

Manual bank transfer with payment-proof upload and admin verification for Medusa v2.

> Terima transfer bank dengan upload bukti dan verifikasi di Admin Medusa. Dibuat dan dipakai sendiri oleh Haus Kayu.

**Status:** in development (phase 2 of 6: payment provider, bank accounts, payment-proof upload). Coming soon to hauskayu.com.

[English](#english) · [Bahasa Indonesia](#bahasa-indonesia)

---

## English

### What it does (so far)

- **Bank accounts managed in the Admin** (Settings → Manual transfer): bank name, account holder, account
  number, SWIFT/BIC, bank address, currency, regions, active/inactive, order. Several accounts can be active; the
  first active one matching the cart's currency and region is used.
- **Placing the order authorizes the payment**: Medusa creates the order and reserves stock, the payment waits for
  the buyer's transfer (`awaiting_payment`).
- **Unique payment reference per order**, e.g. `MT-7K3QX-9PA2B`, guaranteed unique by a database index, with a
  check character that catches typos.
- **Payment history** on the order page (Admin widget), including a warning when the account chosen at checkout
  was deactivated before the order was placed and another account was given to the buyer.
- **Payment deadline** in business days (default 3), counted in your time zone and skipping your holidays.
- **Capture only through admin confirmation**: Medusa's own "Capture" button is refused. An admin confirms the
  transfer (amount received, date, bank reference) after checking the bank statement, and only then is the payment
  captured.
- The account details are **copied into each order** when it is placed, so later edits only apply to new orders.
- **Payment-proof upload**: JPG, PNG or PDF up to 5 MB, recognised by the file's content (not its name). Logged-in
  customers upload from their order; guests use a secret upload token. Proofs are stored privately in the database
  and admins open them through 5-minute signed links. After a rejection the buyer can upload again. A file already
  sent for another order is flagged. Uploads are rate limited per IP and per order.

The verification tab, reminders, auto-cancel, e-mails, invoices and storefront pages follow in later phases.

### Install

```bash
npm install medusa-payment-manual-transfer
```

`medusa-config.ts`:

```ts
module.exports = defineConfig({
  // …
  plugins: [
    {
      resolve: "medusa-payment-manual-transfer",
      options: {
        // secret: "…",           // signs guest upload tokens and proof links; default MANUAL_TRANSFER_SECRET, then http.jwtSecret
        proofUploads: {
          perIp: 10,               // upload attempts per IP per window
          perIpWindowMinutes: 15,
          readsPerIpPerMinute: 120,
          perOrderPerDay: 5,       // proofs one order may receive in 24 hours
        },
      },
    },
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-manual-transfer/providers/manual-transfer",
            id: "manual-transfer",
            options: {
              referencePrefix: "MT",       // 1–6 of A–Z/0–9
              deadlineBusinessDays: 3,     // 1–60
              timezone: "Asia/Jakarta",    // IANA zone business days are counted in (default UTC)
              holidays: ["2026-12-25"],    // YYYY-MM-DD, skipped when counting
            },
          },
        ],
      },
    },
  ],
})
```

Then run `npx medusa db:migrate`, enable the `pp_manual-transfer_manual-transfer` provider on your regions, and add
your bank account in **Settings → Manual transfer**.

### Admin API

| Method | Path | |
| --- | --- | --- |
| GET / POST | `/admin/manual-transfer/accounts` | list / create accounts |
| GET / POST / DELETE | `/admin/manual-transfer/accounts/:id` | read / update / delete an account |
| GET | `/admin/manual-transfer/orders/:id` | the order's manual-transfer payment, history and proofs |
| POST | `/admin/manual-transfer/payments/:id/confirm` | confirm a transfer and capture the payment |
| GET | `/admin/manual-transfer/proofs/:id/url` | a signed link to view a proof, valid 5 minutes |
| POST | `/admin/manual-transfer/proofs/:id/reject` | reject a pending proof, `{ reason }` required |

`confirm` takes `{ amount_received, received_at: "YYYY-MM-DD", bank_reference?, note?, accept_shortfall? }`. It is
refused when less than the amount due arrived, unless `accept_shortfall` is `true`.

**Always check the bank statement in your banking app before confirming. Never rely on a proof image alone.**

### Store API (payment proofs)

All need the publishable API key. The buyer is either the logged-in customer who placed the order (session or
bearer) or anyone holding the order's upload token (`x-manual-transfer-token` header, or `?token=`).

| Method | Path | |
| --- | --- | --- |
| GET | `/store/manual-transfer/orders/:id` | instructions (reference, amount, account, deadline), status, `can_upload`, proofs |
| POST | `/store/manual-transfer/orders/:id/proofs` | multipart: `file` (JPG/PNG/PDF ≤ 5 MB), optional `note` |
| GET | `/store/manual-transfer/carts/:id/upload-token` | right after checkout (24 h): trade the completed cart id for `{ order_id, token }` |

Anyone else gets `404`. Too many requests get `429` with `Retry-After`. Upload tokens are HMAC-derived from the order
id, so the order e-mail (phase 4) can always rebuild the link; they only work while the payment accepts proofs.

The per-IP limit is kept in memory per server process; the per-order limit is counted in the database. Behind a
reverse proxy, make sure Express sees the client IP (`trust proxy`). Run several server instances? Use a shared
locking provider (e.g. `@medusajs/medusa/locking-redis`), since proof uploads, rejections and confirmations lock the
payment.

### Payment data

`payment.data` (and the payment session's data) holds `reference`, `account` (the copied account details),
`amount`, `currency_code`, `status` (`awaiting_payment`, `awaiting_verification`, `paid`, `underpaid`, `rejected`,
`expired`, `canceled`), `authorized_at`, `expires_at`, `history` and, once confirmed, `confirmation`.

Events for notifications: `manual_transfer.proof_uploaded` and `manual_transfer.proof_rejected` (`{ id, order_id }`),
`manual_transfer.payment_confirmed` (`{ id }` of the payment). The provider rebuilds it
from these keys at every step, so data a storefront sends when creating the session is ignored.

---

## Bahasa Indonesia

### Fitur (sejauh ini)

- **Rekening bank dikelola dari Admin** (Settings → Manual transfer): nama bank, nama penerima, nomor rekening,
  SWIFT/BIC, alamat bank, mata uang, region, aktif/nonaktif, urutan. Rekening aktif pertama yang cocok dengan mata
  uang dan region keranjang yang dipakai.
- **Order dibuat saat checkout**: pembayaran di-authorize sehingga order tercipta dan stok ditahan, status
  menunggu pembayaran (`awaiting_payment`).
- **Kode referensi unik per order**, mis. `MT-7K3QX-9PA2B`, dijamin unik oleh index database, dengan karakter cek
  untuk menangkap salah ketik.
- **Riwayat pembayaran** di halaman order (widget Admin), termasuk peringatan kalau rekening pilihan saat checkout
  dinonaktifkan sebelum order dibuat dan pembeli diberi rekening lain.
- **Batas waktu pembayaran** dalam hari kerja (default 3), dihitung di zona waktu toko dan melewati hari libur.
- **Capture hanya lewat konfirmasi admin**: tombol "Capture" bawaan Medusa ditolak. Admin mengonfirmasi transfer
  (nominal diterima, tanggal, ref bank) setelah mengecek mutasi, baru pembayaran di-capture.
- Detail rekening **disalin ke setiap order**, jadi perubahan rekening hanya berlaku untuk order baru.

- **Upload bukti transfer**: JPG, PNG, atau PDF maksimal 5 MB, dicek dari isi file (bukan namanya). Pelanggan yang
  login mengunggah dari halaman order; tamu memakai token rahasia. Bukti disimpan privat di database dan admin
  melihatnya lewat link bertanda tangan yang berlaku 5 menit. Setelah ditolak, pembeli bisa upload ulang. File yang
  sama yang pernah dikirim untuk order lain ditandai. Upload dibatasi per IP dan per order.

Tab verifikasi, pengingat, auto-cancel, email, invoice, dan halaman storefront menyusul di fase berikutnya. Konfigurasi sama dengan bagian English di atas.

**Selalu cek mutasi di aplikasi bank sebelum konfirmasi, jangan hanya percaya bukti transfer.**

---

## Kenapa kami membuatnya

Haus Kayu menjual perkakas dan furnitur jati dari Jepara ke pembeli di AS. Untuk custom furniture dan order besar,
pembeli lebih nyaman transfer langsung ke rekening USD kami daripada membayar dengan kartu.

## Plugin lain dari Haus Kayu

- **PG Medusa Doit.id**: [github.com/haustex/pg-medusa-doit](https://github.com/haustex/pg-medusa-doit), npm
  `medusa-payment-doit`

## About Haus Kayu

[Haus Kayu](https://hauskayu.com/?utm_source=github&utm_medium=readme&utm_campaign=pg-medusa-manual-transfer):
teak tools and furniture from Jepara, Indonesia.

## Support

- E-mail: [dev@hauskayu.com](mailto:dev@hauskayu.com)
- WhatsApp: [chat with us](https://wa.me/6285111663330?text=Halo%20Haus%20Kayu%2C%20saya%20mau%20tanya%20soal%20PG%20Medusa%20Transfer%20Manual)

## License

MIT © Haus Kayu
