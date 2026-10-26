# CLAUDE.md — PG Medusa Transfer Manual by Haus Kayu

## ⚠️ ATURAN SERVER (WAJIB — baca sebelum melakukan apa pun)

Server ini juga menjalankan **toko produksi hauskayu**.

- **DILARANG** request ke port `9000`, `8001`, `80`, `443`, `5432`, `6379` atau domain `*.hauskayu.com`.
- **DILARANG** `pm2 restart` / `pm2 stop` / `pm2 delete` untuk proses `hk-*`.
- Tes **hanya** di port `9400+` dan container `mt-spike-*` (Postgres `55433`, Redis `56380`).
- Semua perintah medusa/db **lewat wrapper guard** yang menolak port produksi dan env kosong.
- **Jangan pernah commit** secret, nomor rekening asli, atau file `.env`.
- Kerjakan **per fase**. Setelah fase selesai (lint, tsc, tes hijau): commit, push, **berhenti**, tunggu "go".

### Cara menjalankan perintah medusa/db di host ini

```bash
export DATABASE_URL=postgres://postgres:spike@127.0.0.1:55433/mt_spike REDIS_URL=redis://127.0.0.1:56380
npm run db:generate                       # = node scripts/guard.mjs medusa plugin:db:generate
node scripts/guard.mjs <perintah> [args]  # perintah lain: medusa db:migrate, medusa start (PORT>=9400), …
```

`scripts/guard.mjs` menolak: env kosong, Postgres selain 127.0.0.1:55433, Redis selain 127.0.0.1:56380,
`PORT` < 9400 atau port produksi, dan URL apa pun ke `*.hauskayu.com`.

## Keputusan teknis

- **Provider membaca rekening langsung dari DB** (`src/lib/accounts.ts`) lewat `__pg_connection__` yang
  di-inject Medusa ke container Payment Module. Tabel: `manual_transfer_account`. **Tanpa cache in-process**:
  satu query berindeks per payment session. Terbukti di Fase 0 (mode shared dan server+worker, 17/17 cek
  masing-masing): akun baru, nonaktif, dan edit nomor langsung terlihat oleh worker yang sudah jalan.
- Detail rekening di-**snapshot** ke `payment_session.data.account`, jadi edit akun belakangan tidak mengubah
  instruksi order yang sudah ada. Snapshot tidak memuat `label`/`rank` internal.
- Nama key di `MedusaService({ ManualTransferAccount })` harus sama dengan nama model
  (`manual_transfer_account`), kalau tidak `query.graph` gagal (`listManualTransferAccounts` tidak ada).
- **Data payment dibangun ulang dari key whitelist** (`src/lib/payment-data.ts`) di setiap langkah provider: Medusa
  menyimpan `{...data dari storefront, ...data provider}` di session, jadi key palsu (mis. `confirmation`,
  `status: "paid"`) dari storefront harus dibuang di `authorizePayment`. Region diambil dari cart/order lewat
  `payment_session → cart_payment_collection → cart` (fallback `order_payment_collection`), bukan dari input pembeli.
- **Authorize = status `authorized`** (order + reservasi stok dibuat Medusa); status domain ada di
  `payment.data.status`. `capturePayment` menolak kecuali `data.status === "paid"` dan ada `data.confirmation`, yang
  hanya ditulis workflow `confirm-manual-transfer-payment` (lalu `capturePaymentWorkflow.runAsStep`, kompensasi
  mengembalikan data). `UpdatePaymentDTO` hanya mendeklarasikan `id`, tapi `updatePayment` meneruskan `data` ke repo.
- Akun di-snapshot ulang saat authorize (edit/nonaktif sebelum order dibuat ikut terbaca); setelah itu beku.
- Referensi **dijamin unik oleh DB**: provider meng-insert ke `manual_transfer_reference` (unique index pada
  `code`, plus index tanpa `WHERE deleted_at` yang ditambahkan manual di migration) lewat `__pg_connection__`, dan
  generate ulang saat `23505` (maks 8 kali, `src/lib/reference-store.ts`). Baris tidak pernah dihapus.
- **Riwayat pembayaran** ada di `payment.data.history` (`authorized`, `account_substituted`, `proof_uploaded`,
  `proof_rejected`, `underpaid`, `confirmed`, `reminder_sent`, `expired`, `canceled`, `refunded`). Riwayat dari storefront dibuang; dimulai di
  authorize. Widget `order.details.side` membacanya lewat `GET /admin/manual-transfer/orders/:id`.
- Admin: kelas Tailwind responsif (`sm:*`) yang tidak dipakai dashboard tidak ter-generate; pakai kelas dasar.
  Label sidebar memakai `translationNs: "translation"`. Screenshot: container `mt-spike-browser` dari image
  `mcr.microsoft.com/playwright:v1.48.2-jammy` (Chromium host kurang `libnss3`).
- Referensi: Crockford base32, 9 acak + 1 cek Luhn mod 32 (`src/lib/reference.ts`). Tenggat: hari kerja di
  `timezone` opsi provider, time-of-day dipertahankan (`src/lib/deadline.ts`).
- Fase 1 (+ perbaikan a/b) diuji E2E dengan app sementara (DB `mt_phase1` di mt-spike-pg, port 9400/9401): 41/41
  cek di mode shared dan split.
- **Bukti transfer disimpan di DB** (`manual_transfer_proof` + isi base64 di `manual_transfer_proof_file`), bukan File
  Module: provider `file-local` menaruh file "private" di `static/` yang publik. Admin membuka lewat
  `GET /admin/manual-transfer/proofs/:id/url` → `/manual-transfer/proofs/:id/file?expires&signature` (HMAC, 5 menit,
  di luar `/admin` supaya bisa dibuka di tab baru; header nosniff, no-store, CSP sandbox untuk gambar).
- Tipe file dari magic bytes (`src/lib/proof-file.ts`); nama/mime dari browser diabaikan. multer memory, 5 MB → 413.
- Akses pembeli: customer login pemilik order, atau token upload = HMAC(secret, order_id) (`src/lib/tokens.ts`).
  Secret: opsi plugin `secret` → env `MANUAL_TRANSFER_SECRET` → `http.jwtSecret`. Selain itu 404. Token tamu juga
  bisa ditukar dari cart id yang selesai ≤ 24 jam (`/store/manual-transfer/carts/:id/upload-token`).
- Rate limit: per IP in-memory per proses (`proofRateLimit`), per order 5/24 jam dihitung di DB. Opsi plugin
  `proofUploads`. Opsi plugin dibaca dari `configModule.plugins` (resolve = nama paket atau path yang berakhiran nama
  paket).
- Semua workflow yang menulis `payment.data` (upload, tolak, konfirmasi, kurang bayar, pengingat, kedaluwarsa) memakai
  `acquireManualTransferLockStep` dengan `paymentLockKey(payment_id)`: Locking Module Medusa kalau
  `container.hasRegistration("locking")`, selain itu lock in-process + warning sekali (`src/lib/locking.ts`). Provider
  default Medusa in-memory juga per proses; README menyarankan locking-redis/postgres untuk server+worker.
- Upload-token via cart id punya budget rate limit sendiri (`proofRateLimit("token")`, `tokenExchangesPerIp`).
- **Kurang bayar**: transfer sebagian dicatat di `payment.data.receipts`; status `underpaid`, bukti pending ikut
  `accepted`. Konfirmasi menjumlahkan receipts + nominal ini (`confirmation.total_received`); `underpaid` ditolak kalau
  nominal sudah menutup tagihan.
- **Antrean verifikasi** dan job membaca `payment ⋈ order_payment_collection ⋈ order` dengan SQL lewat
  `PG_CONNECTION` (`src/lib/transfer-queue.ts`), karena Payment Module tidak bisa memfilter `payment.data`.
- Job `manual-transfer-deadlines` (tiap 15 menit): pengingat sekali (`reminded_at`) untuk `awaiting_payment`,
  `rejected`, `underpaid` dalam `reminderHours`; kedaluwarsa hanya `awaiting_payment`/`rejected` → status `expired`,
  lalu `cancelOrderWorkflow.runAsStep` (provider `cancelPayment` mempertahankan `expired`, stok kembali). Job
  `manual-transfer-proof-retention` (03:30) hanya kalau `proofRetentionDays`: hapus baris `manual_transfer_proof_file`,
  set `file_deleted_at`; route file → 410, route url → 400.
- Admin: halaman `/app/manual-transfer` (tab per status, DataTable), aksi di widget order (Drawer konfirmasi / kurang
  bayar / tolak). `GET /admin/manual-transfer/orders/:id` juga mengembalikan `users` (nama admin di riwayat).
  `overflow-x-auto` dipasang inline (kelas dashboard tidak lengkap). Footer kredit (`CreditFooter`) hanya di halaman
  plugin, dari `GET /admin/manual-transfer/config` (`showCredit`).
- E2E menjalankan job lewat `medusa exec` app uji; proses itu harus di-spawn `detached` (process group sendiri),
  kalau tidak server uji ikut menerima sinyal stop.
- Fase 3 (+ a/b/c) diuji E2E: 136/136 cek (Fase 1–3) di mode shared dan split.
- Fase 2 diuji E2E: 93/93 cek (Fase 1 + 52 cek Fase 2) di mode shared dan split.
- Id workflow/step memakai prefix `manual-transfer-` agar tidak bentrok dengan plugin lain (lint mewajibkan
  id = nama export/file).

## Identitas & branding

- Nama tampilan: **"PG Medusa Transfer Manual by Haus Kayu"**
- Repo: `github.com/haustex/pg-medusa-manual-transfer`
- Paket npm: `medusa-payment-manual-transfer`
- Lisensi: MIT © Haus Kayu

### package.json

- `description`: "Manual bank transfer with payment-proof upload and admin verification for Medusa v2 — by Haus Kayu"
- `author`: "Haus Kayu <dev@hauskayu.com> (https://hauskayu.com)"
- `homepage`, `repository`, `bugs` `{ url, email }`
- `funding`: https://hauskayu.com
- `keywords`: medusa, medusa-v2, medusa-plugin, medusa-plugin-integration, medusa-plugin-payment, bank-transfer, manual-payment, payment-proof, indonesia, usd
- `peerDependencies`: `@medusajs/*` `^2.19.0`

### README (EN + ID)

- Tagline: "Terima transfer bank dengan upload bukti dan verifikasi di Admin Medusa. Dibuat dan dipakai sendiri oleh Haus Kayu."
- Section **"Kenapa kami membuatnya"**: Haus Kayu menjual perkakas dan furnitur jati dari Jepara ke pembeli di AS; untuk custom furniture dan order besar pembeli lebih nyaman transfer ke rekening USD.
- Section **"Plugin lain dari Haus Kayu"**: PG Medusa Doit.id — github.com/haustex/pg-medusa-doit, npm `medusa-payment-doit`.
- Section **"About Haus Kayu"**: link https://hauskayu.com/?utm_source=github&utm_medium=readme&utm_campaign=pg-medusa-manual-transfer
- Section **"Support"**: dev@hauskayu.com dan https://wa.me/6285111663330?text=Halo%20Haus%20Kayu%2C%20saya%20mau%20tanya%20soal%20PG%20Medusa%20Transfer%20Manual
- Tulis **"Coming soon to hauskayu.com"**, BUKAN "Used in production", sampai plugin benar-benar terpasang di toko.

### Admin

- Footer kecil: "PG Medusa Transfer Manual · by Haus Kayu, perkakas jati dari Jepara" → link ke https://hauskayu.com/?utm_source=medusa-admin&utm_medium=plugin&utm_campaign=pg-medusa-manual-transfer
- Plus link **"Bantuan"** ke WhatsApp support di atas.
- Bisa dimatikan dengan plugin option `showCredit` (default `true`).

### Larangan branding

- **DILARANG** kredit Haus Kayu di semua yang dilihat pembeli: halaman instruksi, upload bukti, email, invoice PDF. Semua itu memakai nama, logo, dan alamat **toko yang memasang plugin**.
- **Tanpa tracking**, tanpa request apa pun dari plugin ke hauskayu.com.

## Fitur & fase

> **JANGAN publish ke npm dan JANGAN buat repo publik.** Itu langkah manual pemilik.

### Fase 0 — Spike
Buktikan payment provider bisa membaca daftar rekening yang disimpan dari Admin **dari DB**, bukan cache in-process (produksi memakai server + worker terpisah). Tes di mode `shared` dan terpisah (`server` + `worker`).

### Fase 1 — Provider
- Beberapa akun rekening dikelola dari Admin: nama bank, nama penerima, nomor rekening, SWIFT, alamat bank, mata uang, region, aktif/nonaktif.
- Contoh akun pertama: Bank Jago kantong USD, SWIFT `JAGBIDJA` (data asli diisi pemilik lewat Admin — jangan hardcode / commit nomor rekening asli).
- Authorize = order dibuat dengan status menunggu pembayaran, stok ditahan.
- Capture **HANYA** lewat konfirmasi admin.
- Kode referensi unik per order.
- Batas waktu bisa diatur (default 3 hari kerja).

### Fase 2 — Upload bukti
- JPG/PNG/PDF ≤ 5 MB, cek tipe file asli (magic bytes), simpan **PRIVAT**, admin melihat lewat signed URL.
- Pembeli login: lewat halaman order. Pembeli tamu: lewat token rahasia di email.
- Rate limit.
- Pembeli bisa upload ulang kalau ditolak.

### Fase 3 — Admin
- Tab "Perlu verifikasi" + widget di detail order.
- Tombol:
  - **Konfirmasi lunas**: input nominal diterima, tanggal, ref bank; peringatan kalau kurang dari tagihan.
  - **Kurang bayar**: hitung sisa.
  - **Tolak**: wajib alasan.
- Riwayat aksi (admin, waktu, catatan).
- Peringatan jelas: "cek mutasi di aplikasi bank, jangan hanya percaya bukti".
- Status: menunggu pembayaran, menunggu verifikasi, lunas, kurang bayar, ditolak, kedaluwarsa.
- Job: pengingat 24 jam sebelum batas; auto-cancel saat kedaluwarsa dan stok dikembalikan.

### Fase 4 — Notifikasi & invoice
- Email lewat Notification Module untuk setiap perubahan status (ke pembeli dan ke admin).
- Invoice PDF pro-forma (nama toko, nomor order, referensi, nominal, detail rekening, batas waktu) dengan template yang bisa diganti.
- Ingat: tanpa kredit Haus Kayu di email/invoice.

### Fase 5 — Storefront
- Contoh untuk Medusa Next.js Starter di `examples/nextjs-starter` (ikut paket npm).
- Halaman instruksi: detail rekening dengan tombol salin, nominal persis, kode referensi, hitung mundur, catatan "pilih biaya OUR / ditanggung pengirim", unduh invoice.
- Halaman upload bukti dengan status.
- Teks EN + ID di `labels.ts`. Tampilan netral (tanpa kredit Haus Kayu).

### Fase 6 — Kualitas & rilis
- `integration-tests` di repo; CI (lint, tsc, unit, E2E) dengan matrix Medusa 2.19 dan 2.22.
- `release.yml`: publish lewat OIDC + provenance, **TANPA `registry-url`** di setup-node, actions versi Node 24.
- CHANGELOG 0.1.0, SECURITY.md, CONTRIBUTING.md, issue template, screenshot di `docs/screenshots`.
- `npm pack --dry-run` harus bersih.
