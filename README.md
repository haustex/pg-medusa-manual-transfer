# PG Medusa Transfer Manual by Haus Kayu

Manual bank transfer with payment-proof upload and admin verification for Medusa v2.

> Terima transfer bank dengan upload bukti dan verifikasi di Admin Medusa. Dibuat dan dipakai sendiri oleh Haus Kayu.

**Status:** in development (phase 1 of 6: payment provider and bank accounts). Coming soon to hauskayu.com.

[English](#english) · [Bahasa Indonesia](#bahasa-indonesia)

---

## English

### What it does (so far)

- **Bank accounts managed in the Admin** (Settings → Manual transfer): bank name, account holder, account
  number, SWIFT/BIC, bank address, currency, regions, active/inactive, order. Several accounts can be active; the
  first active one matching the cart's currency and region is used.
- **Placing the order authorizes the payment**: Medusa creates the order and reserves stock, the payment waits for
  the buyer's transfer (`awaiting_payment`).
- **Unique payment reference per order**, e.g. `MT-7K3QX-9PA2B`, with a check character that catches typos.
- **Payment deadline** in business days (default 3), counted in your time zone and skipping your holidays.
- **Capture only through admin confirmation**: Medusa's own "Capture" button is refused. An admin confirms the
  transfer (amount received, date, bank reference) after checking the bank statement, and only then is the payment
  captured.
- The account details are **copied into each order** when it is placed, so later edits only apply to new orders.

Payment-proof upload, the verification tab, reminders, auto-cancel, e-mails, invoices and storefront pages follow in
later phases.

### Install

```bash
npm install medusa-payment-manual-transfer
```

`medusa-config.ts`:

```ts
module.exports = defineConfig({
  // …
  plugins: [{ resolve: "medusa-payment-manual-transfer", options: {} }],
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
| POST | `/admin/manual-transfer/payments/:id/confirm` | confirm a transfer and capture the payment |

`confirm` takes `{ amount_received, received_at: "YYYY-MM-DD", bank_reference?, note?, accept_shortfall? }`. It is
refused when less than the amount due arrived, unless `accept_shortfall` is `true`.

**Always check the bank statement in your banking app before confirming. Never rely on a proof image alone.**

### Payment data

`payment.data` (and the payment session's data) holds `reference`, `account` (the copied account details),
`amount`, `currency_code`, `status` (`awaiting_payment`, `awaiting_verification`, `paid`, `underpaid`, `rejected`,
`expired`, `canceled`), `authorized_at`, `expires_at` and, once confirmed, `confirmation`. The provider rebuilds it
from these keys at every step, so data a storefront sends when creating the session is ignored.

---

## Bahasa Indonesia

### Fitur (sejauh ini)

- **Rekening bank dikelola dari Admin** (Settings → Manual transfer): nama bank, nama penerima, nomor rekening,
  SWIFT/BIC, alamat bank, mata uang, region, aktif/nonaktif, urutan. Rekening aktif pertama yang cocok dengan mata
  uang dan region keranjang yang dipakai.
- **Order dibuat saat checkout**: pembayaran di-authorize sehingga order tercipta dan stok ditahan, status
  menunggu pembayaran (`awaiting_payment`).
- **Kode referensi unik per order**, mis. `MT-7K3QX-9PA2B`, dengan karakter cek untuk menangkap salah ketik.
- **Batas waktu pembayaran** dalam hari kerja (default 3), dihitung di zona waktu toko dan melewati hari libur.
- **Capture hanya lewat konfirmasi admin**: tombol "Capture" bawaan Medusa ditolak. Admin mengonfirmasi transfer
  (nominal diterima, tanggal, ref bank) setelah mengecek mutasi, baru pembayaran di-capture.
- Detail rekening **disalin ke setiap order**, jadi perubahan rekening hanya berlaku untuk order baru.

Upload bukti, tab verifikasi, pengingat, auto-cancel, email, invoice, dan halaman storefront menyusul di fase
berikutnya. Konfigurasi sama dengan bagian English di atas.

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
