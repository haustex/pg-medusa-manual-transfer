# PG Medusa Transfer Manual by Haus Kayu

Manual bank transfer with payment-proof upload and admin verification for Medusa v2.

> Terima transfer bank dengan upload bukti dan verifikasi di Admin Medusa. Dibuat dan dipakai sendiri oleh Haus Kayu.

**Status:** in development (phase 5 of 6: payment provider, bank accounts, payment-proof upload, admin verification, e-mails, pro-forma invoice and storefront example). Coming soon to hauskayu.com.

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
- **Capture only through admin confirmation**: Medusa's own "Capture" button (Payments section of the order) is not
  used for bank transfers and is refused. An admin confirms the transfer (amount received, date, bank reference)
  after checking the bank statement, and only then is the payment captured.
- The account details are **copied into each order** when it is placed, so later edits only apply to new orders.
- **Payment-proof upload**: JPG, PNG or PDF up to 5 MB, recognised by the file's content (not its name). Logged-in
  customers upload from their order; guests use a secret upload token. Proofs are stored privately in the database
  and admins open them through 5-minute signed links. After a rejection the buyer can upload again. A file already
  sent for another order is flagged. Uploads are rate limited per IP and per order.

- **Verification queue** (sidebar → Manual transfers): tabs per status (needs verification, awaiting payment,
  underpaid, rejected, paid, expired, canceled, all) with counts, search by reference, e-mail or `#order number`.
- **Actions on the order page** (widget): **Confirm paid** (amount received, date, bank reference, note; a red
  warning and an explicit "the store absorbs the difference" tick when less than the amount due arrived),
  **Underpaid** (records a partial transfer and shows what is left to pay; the buyer can upload a proof for the
  rest) and **Reject** for a pending proof (reason required, shown to the buyer). Every action is in the payment
  history with the admin's name, time and note. Each form carries the warning *check the bank statement, never rely
  on the proof alone*.
- **Statuses**: awaiting payment, awaiting verification, paid, underpaid, rejected, expired (and canceled).
- **Reminder** 24 hours before the deadline (once per payment) and **auto-cancel** when the deadline passes: the order is canceled with Medusa's own
  workflow, so the stock reservation is released. Payments with a proof waiting for review or with part of the money
  received are left for an admin. Both run every 15 minutes in the worker.
- **Proof retention** (optional): delete proof files some days after the order was paid or canceled, keeping the
  records.
- **Late badge and admin digest**: a proof waiting for verification more than 1 business day, or an underpayment
  without follow-up for more than 3 business days, shows a red "Late" badge in the queue (per row and per tab) and is
  listed once in a digest e-mail to the admins. Both thresholds are options.
- **E-mails for every status change**, to the buyer and to the admins, through Medusa's Notification Module (any
  e-mail provider): order placed with the payment instructions and the pro-forma invoice attached, proof received,
  proof rejected (with the reason), underpaid (what is left), paid, reminder, expired, canceled. Default templates in
  English and Indonesian; replace any of them with your own HTML files.
- **Pro-forma invoice PDF**: store name, logo and address, order number, reference, items and totals, bank details
  and deadline. Attached to the order e-mail, downloadable by the buyer and from the order page; the layout can be
  replaced. Set in an embedded Noto Sans (open license, Latin subset), so names like "José Müller-Ñúñez" keep their
  accents; `invoice.fontPath` uses your store's font instead.
- The e-mails and the invoice carry **your store's identity only** (Settings → Manual transfer → Store details).
- **Storefront example** for the Medusa Next.js Starter (`examples/nextjs-starter`, in the npm package): payment
  instructions with copy buttons, exact amount, reference, countdown, the "fees: OUR" note and the invoice download,
  plus the proof upload with its status. English and Indonesian. See [Storefront](#storefront).

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
        showCredit: true,          // the small plugin credit under the plugin's Admin pages
        proofRetentionDays: null,  // e.g. 365: delete proof files that long after the order was paid or canceled
        reminderHours: 24,         // reminder event this many hours before the deadline
        autoCancelExpired: true,   // cancel orders whose deadline passed without payment
        adminReminders: {
          verificationBusinessDays: 1, // "Late" when a proof waits longer than this
          underpaidBusinessDays: 3,    // "Late" when an underpayment has no follow-up for longer than this
          email: true,                 // digest e-mail to the admins (the badge is always shown)
        },
        notifications: {
          adminEmails: ["orders@your-store.com"],  // recommended; unset = every Admin user (logged, shown in Settings)
          locale: "en",              // buyer e-mails: "en" or "id"; an order's metadata.locale wins
          // adminLocale: "id",
          paymentUrl: "https://your-store.com/transfer/{order_id}?token={token}", // the example storefront's page; no link without it
          adminUrl: "https://your-store.com/app", // links in the admin e-mails
          // templatesDir: "./emails",            // your own templates, see below
          // templateIds: { order_placed: "d-123" }, // provider-side templates (e.g. SendGrid)
          // buyer: { payment_reminder: false },  // switch single e-mails off
          // admin: { paid: false, overdue: true },
          attachInvoice: true,
        },
        invoice: {
          // note: "Bank fees are paid by the buyer.",
          // fontPath: "./fonts/Brand.ttf",       // your TTF/OTF, or { regular, bold, mono }; default: bundled Noto Sans
          // render: "./src/invoice.js",          // your own PDF layout, see below
        },
        proofUploads: {
          perIp: 10,               // upload attempts per IP per window
          perIpWindowMinutes: 15,
          readsPerIpPerMinute: 120,
          perOrderPerDay: 5,       // proofs one order may receive in 24 hours
          tokenExchangesPerIp: 10, // cart id → upload token exchanges per IP per window (own budget)
          tokenExchangesWindowMinutes: 60,
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
your bank account in **Settings → Manual transfer**. For e-mails, configure Medusa's Notification Module with a
provider on the `email` channel (see below).

### E-mails and the pro-forma invoice

The plugin sends through Medusa's **Notification Module**, so any provider on the `email` channel works (SendGrid,
Resend, SES, SMTP plugins, …). Without a Notification Module nothing is sent and nothing fails.

| Change | Buyer e-mail (template) | Admin e-mail |
| --- | --- | --- |
| Order placed | `order_placed`: instructions, exact amount, reference, deadline, invoice PDF attached | `admin_status_changed` |
| Proof uploaded | `proof_received` | `admin_status_changed`, with the bank-statement warning |
| Proof rejected | `proof_rejected`, with the reason and the instructions | `admin_status_changed` |
| Underpaid | `payment_underpaid`, with what is left | `admin_status_changed` |
| Paid | `payment_confirmed` | `admin_status_changed` |
| Deadline near | `payment_reminder` | – |
| Expired | `payment_expired` | `admin_status_changed` |
| Canceled | `payment_canceled` | `admin_status_changed` |
| Waiting too long for an admin | – | `admin_overdue` (one digest) |

Every notification has `content: { subject, html, text }` rendered by the plugin, `template:
"manual-transfer.<name>"` (or your `templateIds`), all values in `data`, and an idempotency key, so a retried event
never sends the same e-mail twice. Attachments are base64.

**Store identity.** The e-mails and the invoice show the store's name (Settings → Store) and the store metadata
`logo_url`, `address`, `support_email`, `phone` and `website`. Edit them in **Settings → Manual transfer → Store
details**; the **Preview** menu there opens every e-mail and the invoice rendered with a made-up order.

**Your own templates.** Put HTML files in `notifications.templatesDir`: `<name>.<locale>.html` or `<name>.html`
(names in the table above, plus `layout.html` with `{{{content}}}` for the frame). The subject is the file's
`<title>`. A file containing `<html` is sent as it is, without the layout. Syntax: `{{value}}` (escaped),
`{{{value}}}` (raw), `{{#value}}…{{/value}}` (if / for each), `{{^value}}…{{/value}}` (if not). Values: `store.*`,
`order.number`, `order.customer_name`, `payment.reference`, `payment.amount`, `payment.amount_received`,
`payment.amount_remaining`, `payment.deadline`, `payment.account.*`, `payment.status_label`, `amount_to_pay`,
`payment_url`, `rejection_reason`, `confirmation.*`, `admin_order_url`, and `t.*` (the default wording).

**Admin recipients.** Set `notifications.adminEmails` to the addresses that should get the admin e-mails (new order,
proof uploaded, paid, digest, …). Without it they go to every Admin user: the plugin logs a warning once, and
**Settings → Manual transfer → E-mail notifications** lists who receives them right now, plus the `paymentUrl` the
buyer e-mails link to.

**Invoice font.** The default layout embeds Noto Sans (SIL Open Font License, subset to the Latin scripts, see
`assets/fonts`), so accented names and addresses come out intact; only the glyphs used end up in the PDF. For your
brand font, or for other scripts, set `invoice.fontPath` to a TTF/OTF file (relative to the app's working directory)
or `{ regular, bold?, mono? }`; bold falls back to regular, mono to the bundled one. An unreadable file logs a warning
and the bundled fonts are used. Characters a font has no glyph for lose their accent or become "?".

**Your own invoice.** `invoice.render` is a function, or a module path whose default export is one:
`(context, pdfLib) => Uint8Array` with the labels, store, items, totals, account and the loaded order in `context`
and [pdf-lib](https://pdf-lib.js.org) in `pdfLib`. `await context.embedFonts(pdf)` embeds the same fonts as the
default layout.

**Testing without a real provider.** The package includes a notification provider that writes every e-mail to a
folder (`.html`, `.txt`, `.json` and the attachments) instead of sending it. For development only:

```ts
{
  resolve: "@medusajs/medusa/notification",
  options: {
    providers: [
      {
        resolve: "medusa-payment-manual-transfer/providers/email-preview",
        id: "email-preview",
        options: { channels: ["email"], dir: "./email-previews" },
      },
    ],
  },
},
```

### Storefront

`examples/nextjs-starter` (part of the npm package) adds the buyer's pages to the
[Medusa Next.js Starter](https://github.com/medusajs/nextjs-starter-medusa):

```bash
node node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs ../your-storefront
```

It copies the pages and makes four small, checked edits to the starter (payment method name, place-order button,
order-page link, no "paid at" for unpaid transfers). Placing an order leads to `/{countryCode}/transfer/{orderId}`:
status, exact amount, bank details and reference with copy buttons, deadline with countdown, the "choose OUR" note, the
invoice download and the proof upload. Guests get there with the upload token, logged-in customers with their session.
Set `notifications.paymentUrl` to `https://<storefront>/transfer/{order_id}?token={token}` so the e-mails link to the
same page. Details, the list of edits and porting notes: [examples/nextjs-starter/README.md](examples/nextjs-starter/README.md).

### Signing secret (production)

Guest upload tokens and the signed proof links are HMACs. In production set a secret of its own, so rotating the
JWT secret does not break the links in e-mails already sent:

```bash
openssl rand -hex 32
# .env
MANUAL_TRANSFER_SECRET=<the 64 hex characters>
```

The plugin option `secret` wins over `MANUAL_TRANSFER_SECRET`, which wins over `http.jwtSecret` (the fallback, fine
for development). Changing the secret invalidates every upload token and proof link issued before.

### Locks (server + worker)

Uploads, rejections, confirmations, underpayments, reminders and the expiry job lock the payment they change. The
plugin uses Medusa's **Locking Module** from the container, which Medusa loads by default. Its default provider is
in-memory, which only protects one process: when you run a separate server and worker (or several instances), use
a shared provider, e.g.

```ts
modules: [
  {
    resolve: "@medusajs/medusa/locking",
    options: {
      providers: [
        { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl: process.env.REDIS_URL } },
      ],
    },
  },
]
```

(`@medusajs/medusa/locking-postgres` works too.) Only if an app disabled the Locking Module altogether does the plugin
fall back to a lock kept in its own process, and it logs a warning once.

### Proof retention

Proofs are kept forever by default. With `proofRetentionDays: N`, a daily job (03:30) deletes the **file contents**
of proofs whose payment was captured (paid) or canceled more than N days ago. The proof record stays: file name,
size, SHA-256, who uploaded it, review and history, so duplicate detection keeps working. The Admin shows "file
deleted" instead of the View button, and old signed links answer `410 Gone`.

### Admin API

| Method | Path | |
| --- | --- | --- |
| GET / POST | `/admin/manual-transfer/accounts` | list / create accounts |
| GET / POST / DELETE | `/admin/manual-transfer/accounts/:id` | read / update / delete an account |
| GET | `/admin/manual-transfer/orders/:id` | the order's manual-transfer payment, history and proofs |
| GET | `/admin/manual-transfer/orders/:id/invoice` | the pro-forma invoice PDF (`?locale=en\|id`) |
| GET | `/admin/manual-transfer/payments` | the verification queue: `?status=&q=&limit=&offset=`, with `counts` and `overdue_counts` per status, `overdue` per row |
| GET | `/admin/manual-transfer/previews/:name` | an e-mail (template name) or `invoice`, rendered with a made-up order |
| POST | `/admin/manual-transfer/payments/:id/confirm` | confirm a transfer and capture the payment |
| POST | `/admin/manual-transfer/payments/:id/underpaid` | record a partial transfer (status `underpaid`) |
| GET | `/admin/manual-transfer/config` | `{ show_credit, proof_retention_days, notifications: { active, enabled, admin_recipients: { source, emails }, payment_url } }` for the Admin pages |
| GET | `/admin/manual-transfer/proofs/:id/url` | a signed link to view a proof, valid 5 minutes |
| POST | `/admin/manual-transfer/proofs/:id/reject` | reject a pending proof, `{ reason }` required |

`confirm` takes `{ amount_received, received_at: "YYYY-MM-DD", bank_reference?, note?, accept_shortfall? }`. Partial
transfers recorded with `underpaid` count towards the amount due; it is refused when less than that arrived in
total, unless `accept_shortfall` is `true`. `underpaid` takes the same fields without `accept_shortfall` and is
refused when the transfer covers the whole amount (confirm instead).

**Always check the bank statement in your banking app before confirming. Never rely on a proof image alone.**

### Store API (payment proofs)

All need the publishable API key. The buyer is either the logged-in customer who placed the order (session or
bearer) or anyone holding the order's upload token (`x-manual-transfer-token` header, or `?token=`).

| Method | Path | |
| --- | --- | --- |
| GET | `/store/manual-transfer/orders/:id` | instructions (reference, amount, account, deadline), status, `amount_received` / `amount_remaining`, `can_upload`, proofs |
| GET | `/store/manual-transfer/orders/:id/invoice` | the pro-forma invoice PDF (`?locale=en\|id`) |
| POST | `/store/manual-transfer/orders/:id/proofs` | multipart: `file` (JPG/PNG/PDF ≤ 5 MB), optional `note` |
| GET | `/store/manual-transfer/carts/:id/upload-token` | right after checkout (24 h): trade the completed cart id for `{ order_id, token }` |

Anyone else gets `404`. Too many requests get `429` with `Retry-After`. Upload tokens are HMAC-derived from the order
id, so the e-mails can always rebuild the link (`{token}` in `paymentUrl`); they only work while the payment accepts proofs.

The per-IP limit is kept in memory per server process; the per-order limit is counted in the database. Behind a
reverse proxy, make sure Express sees the client IP (`trust proxy`). Run several server instances? Use a shared
locking provider (e.g. `@medusajs/medusa/locking-redis`), since proof uploads, rejections and confirmations lock the
payment.

### Payment data

`payment.data` (and the payment session's data) holds `reference`, `account` (the copied account details),
`amount`, `currency_code`, `status` (`awaiting_payment`, `awaiting_verification`, `paid`, `underpaid`, `rejected`,
`expired`, `canceled`), `authorized_at`, `expires_at`, `history`, `receipts` (partial transfers), `reminded_at`,
`admin_reminded_at` and, once confirmed, `confirmation`. The provider rebuilds it from these keys at every step, so data a storefront sends
when creating the session is ignored.

Events for notifications: `manual_transfer.proof_uploaded` and `manual_transfer.proof_rejected` (`{ id, order_id }`),
`manual_transfer.payment_confirmed` and `manual_transfer.payment_underpaid` (`{ id }` of the payment),
`manual_transfer.payment_reminder` (`{ id, order_id, expires_at }`), `manual_transfer.payment_expired`
(`{ id, order_id }`) and `manual_transfer.admin_overdue` (`{ payment_ids }`). The plugin's own subscriber turns them
(and `order.placed` / `order.canceled`) into the e-mails above.

### Development

`integration-tests/` holds the E2E suite, the test app and the storefront run (`storefront.mjs`: the example installed in
a pinned starter checkout, checkout to "paid" in Chromium): see [integration-tests/README.md](integration-tests/README.md).
`npm run email:preview -- <dir>` renders every e-mail and the invoice with a made-up order, without Medusa.

### Roadmap

- **Storage adapter for proofs** (not built yet): proofs live in the database today, which is private by
  construction and needs no setup. A pluggable adapter for a private bucket (S3, Cloudflare R2, …) with short-lived
  signed URLs is planned for stores with many or large proofs. Medusa's File Module is deliberately not used: with
  `file-local`, "private" files land under the public `static/` folder.

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
- **Antrean verifikasi** (sidebar → Transfer manual): tab per status (perlu verifikasi, menunggu pembayaran, kurang
  bayar, ditolak, lunas, kedaluwarsa, dibatalkan, semua) dengan jumlahnya, cari lewat referensi, email, atau
  `#nomor order`.
- **Aksi di halaman order** (widget): **Konfirmasi lunas** (nominal diterima, tanggal, ref bank, catatan; peringatan
  merah dan centang "toko menanggung selisih" kalau kurang dari tagihan), **Kurang bayar** (mencatat transfer
  sebagian dan menghitung sisa; pembeli bisa upload bukti untuk sisanya), dan **Tolak** bukti (alasan wajib, dilihat
  pembeli). Semua aksi tercatat di riwayat dengan nama admin, waktu, dan catatan, dan setiap form membawa peringatan
  *cek mutasi di aplikasi bank, jangan hanya percaya bukti*.
- **Tombol "Capture" bawaan Medusa tidak dipakai** untuk transfer bank dan akan ditolak; capture terjadi lewat
  Konfirmasi lunas.
- **Pengingat** 24 jam sebelum batas waktu dan
  **auto-cancel** saat kedaluwarsa: order dibatalkan dengan workflow Medusa sehingga stok kembali. Pembayaran yang
  buktinya menunggu dicek atau yang sudah dibayar sebagian dibiarkan untuk admin. Keduanya jalan tiap 15 menit di
  worker.
- **Masa simpan bukti** (opsional, `proofRetentionDays`): isi file bukti dihapus N hari setelah order lunas atau
  dibatalkan; data buktinya (nama, ukuran, hash, riwayat) tetap disimpan. Default `null` = simpan selamanya.

- **Badge "Terlambat" dan email ringkasan ke admin**: bukti yang menunggu verifikasi lebih dari 1 hari kerja, atau
  kurang bayar tanpa tindak lanjut lebih dari 3 hari kerja, diberi badge merah di antrean (per baris dan per tab)
  dan dikirim sekali dalam email ringkasan ke admin. Ambangnya bisa diatur (`adminReminders`).
- **Email untuk setiap perubahan status**, ke pembeli dan admin, lewat Notification Module Medusa (provider email
  apa pun): order dibuat (instruksi + invoice PDF terlampir), bukti diterima, bukti ditolak (dengan alasan), kurang
  bayar (sisa tagihan), lunas, pengingat, kedaluwarsa, dibatalkan. Template default bahasa Inggris dan Indonesia
  (`notifications.locale: "id"`, atau `metadata.locale` order), bisa diganti dengan file HTML sendiri
  (`notifications.templatesDir`).
- **Invoice PDF pro-forma**: nama, logo, alamat toko, nomor order, referensi, barang dan total, detail rekening, batas
  waktu. Terlampir di email order, bisa diunduh pembeli dan dari halaman order; layout-nya bisa diganti
  (`invoice.render`). Font Noto Sans (lisensi terbuka, subset Latin) disematkan sehingga nama seperti
  "José Müller-Ñúñez" tetap utuh; `invoice.fontPath` untuk memakai font toko sendiri.
- **Penerima email admin**: isi `notifications.adminEmails` (disarankan). Kalau kosong, semua user Admin menerimanya;
  plugin menulis peringatan di log dan **Settings → Manual transfer → Notifikasi email** menampilkan siapa saja
  penerimanya saat ini serta `paymentUrl` yang dipakai di email pembeli.
- **Contoh storefront** untuk Medusa Next.js Starter (`examples/nextjs-starter`, ikut paket npm): halaman instruksi
  (detail rekening dengan tombol salin, nominal persis, kode referensi, hitung mundur, catatan biaya OUR, unduh invoice)
  dan upload bukti dengan statusnya, teks EN + ID. Pasang dengan
  `node node_modules/medusa-payment-manual-transfer/examples/nextjs-starter/install.mjs ../storefront-anda`, lalu isi
  `notifications.paymentUrl` dengan `https://<storefront>/transfer/{order_id}?token={token}`. Detail:
  [examples/nextjs-starter/README.md](examples/nextjs-starter/README.md).
- Email dan invoice **hanya memakai identitas toko Anda** (Settings → Manual transfer → Detail toko). Menu
  **Pratinjau** di sana membuka setiap email dan invoice dengan order contoh.
- **Tes email tanpa provider asli**: provider `medusa-payment-manual-transfer/providers/email-preview` menulis setiap
  email ke folder (HTML, teks, JSON, lampiran) alih-alih mengirimnya. Hanya untuk development.

**Secret produksi**: buat dengan `openssl rand -hex 32` lalu isi `MANUAL_TRANSFER_SECRET` di `.env`. Tanpa itu plugin
memakai `http.jwtSecret` (cukup untuk development). Mengganti secret membatalkan semua token upload dan link bukti
yang sudah terkirim.

**Lock**: plugin memakai Locking Module Medusa dari container. Provider default-nya in-memory (hanya satu proses);
kalau server dan worker dipisah, pakai `@medusajs/medusa/locking-redis` atau `locking-postgres` (contoh di bagian
English). Hanya kalau Locking Module dimatikan, plugin memakai lock di prosesnya sendiri dan menulis peringatan.

**Roadmap**: adapter penyimpanan bukti ke bucket privat (S3, Cloudflare R2, …) dengan signed URL, belum dikerjakan.

Konfigurasi lengkap ada di bagian English di atas.

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
