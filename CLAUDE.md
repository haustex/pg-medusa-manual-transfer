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
- Referensi: Crockford base32, 9 acak + 1 cek Luhn mod 32 (`src/lib/reference.ts`). Tenggat: hari kerja di
  `timezone` opsi provider, time-of-day dipertahankan (`src/lib/deadline.ts`).
- Fase 1 diuji E2E dengan app sementara (DB `mt_phase1` di mt-spike-pg, port 9400/9401): 33/33 cek di mode shared
  dan split.
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
