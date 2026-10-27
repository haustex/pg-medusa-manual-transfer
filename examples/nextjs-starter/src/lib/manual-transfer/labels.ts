/**
 * Texts of the bank-transfer pages, in English and Indonesian. Edit freely:
 * nothing else in the storefront reads them. `{name}` placeholders are filled
 * by `fill()`.
 */

export type TransferLocale = "en" | "id"

export const LABELS = {
  en: {
    method: "Bank transfer",
    methodHint: "Transfer the exact amount to our bank account. Your order is reserved until the payment deadline.",
    placeOrder: "Place order",
    title: "Pay by bank transfer",
    order: "Order {number}",
    amountToPay: "Amount to transfer",
    amountExact: "Transfer exactly this amount, in {currency}.",
    amountRemaining: "We received {received} of {total}. Please transfer the rest:",
    payTo: "Transfer to",
    bank: "Bank",
    accountHolder: "Account holder",
    accountNumber: "Account number",
    swift: "SWIFT / BIC",
    bankAddress: "Bank address",
    currency: "Currency",
    reference: "Payment reference",
    referenceHint: "Write this reference in the transfer note, so we can match your payment.",
    feesNote: "International transfers: choose the fee option OUR (all fees paid by the sender), so the full amount arrives.",
    deadline: "Pay by",
    timeLeft: "Time left",
    countdown: "{days}d {hours}h {minutes}m {seconds}s",
    deadlinePassed: "The payment deadline has passed.",
    invoice: "Download pro-forma invoice (PDF)",
    copy: "Copy",
    copied: "Copied",
    uploadTitle: "Upload proof of transfer",
    uploadHint: "After transferring, upload the receipt or a screenshot from your banking app: JPG, PNG or PDF, up to 5 MB.",
    uploadAgainHint: "Upload a new proof of transfer: JPG, PNG or PDF, up to 5 MB.",
    file: "File",
    note: "Note (optional)",
    notePlaceholder: "e.g. sent from my business account",
    upload: "Upload proof",
    uploading: "Uploading…",
    uploaded: "Thank you, we received your proof. We will check our bank statement and confirm your payment.",
    errorType: "Choose a JPG, PNG or PDF file.",
    errorSize: "The file is larger than 5 MB.",
    errorTooMany: "Too many uploads, please try again later.",
    errorGeneric: "The upload failed, please try again.",
    proofs: "Your uploads",
    proofStatus: { pending: "Being checked", accepted: "Accepted", rejected: "Rejected" },
    rejectedBecause: "Reason: {reason}",
    status: {
      awaiting_payment: "Awaiting payment",
      awaiting_verification: "Checking your payment",
      paid: "Paid",
      underpaid: "Partly paid",
      rejected: "Proof rejected",
      expired: "Expired",
      canceled: "Canceled",
    },
    statusText: {
      awaiting_payment: "Please transfer the amount below before the deadline, then upload your proof of transfer.",
      awaiting_verification: "We received your proof of transfer and are checking our bank statement. You will get an e-mail once the payment is confirmed.",
      paid: "Your payment was received. Thank you! We will let you know when your order ships.",
      underpaid: "Part of the amount arrived. Please transfer the rest and upload the proof.",
      rejected: "We could not match your proof of transfer to a payment. Please check the details and upload a new proof.",
      expired: "The payment deadline passed and the order was canceled. Please contact us if you already transferred the money.",
      canceled: "This order was canceled.",
    },
    notFoundTitle: "Payment page not found",
    notFoundText: "The link may be incomplete. Open the link in your order e-mail, or sign in to see your orders.",
    continueShopping: "Continue shopping",
    instructionsLink: "Payment instructions and proof upload",
  },
  id: {
    method: "Transfer bank",
    methodHint: "Transfer nominal yang tepat ke rekening kami. Pesanan Anda ditahan sampai batas waktu pembayaran.",
    placeOrder: "Buat pesanan",
    title: "Bayar dengan transfer bank",
    order: "Pesanan {number}",
    amountToPay: "Nominal transfer",
    amountExact: "Transfer tepat sebesar ini, dalam {currency}.",
    amountRemaining: "Kami sudah menerima {received} dari {total}. Mohon transfer sisanya:",
    payTo: "Transfer ke",
    bank: "Bank",
    accountHolder: "Nama penerima",
    accountNumber: "Nomor rekening",
    swift: "SWIFT / BIC",
    bankAddress: "Alamat bank",
    currency: "Mata uang",
    reference: "Kode referensi",
    referenceHint: "Tulis kode referensi ini di berita transfer agar pembayaran Anda bisa kami cocokkan.",
    feesNote: "Transfer internasional: pilih biaya OUR (ditanggung pengirim) agar nominalnya diterima utuh.",
    deadline: "Bayar sebelum",
    timeLeft: "Sisa waktu",
    countdown: "{days} hari {hours} j {minutes} m {seconds} d",
    deadlinePassed: "Batas waktu pembayaran sudah lewat.",
    invoice: "Unduh invoice pro-forma (PDF)",
    copy: "Salin",
    copied: "Tersalin",
    uploadTitle: "Upload bukti transfer",
    uploadHint: "Setelah transfer, upload struk atau tangkapan layar dari aplikasi bank: JPG, PNG, atau PDF, maksimal 5 MB.",
    uploadAgainHint: "Upload bukti transfer yang baru: JPG, PNG, atau PDF, maksimal 5 MB.",
    file: "File",
    note: "Catatan (opsional)",
    notePlaceholder: "mis. dikirim dari rekening usaha",
    upload: "Upload bukti",
    uploading: "Mengunggah…",
    uploaded: "Terima kasih, bukti Anda sudah kami terima. Kami akan mengecek mutasi rekening dan mengonfirmasi pembayaran Anda.",
    errorType: "Pilih file JPG, PNG, atau PDF.",
    errorSize: "Ukuran file lebih dari 5 MB.",
    errorTooMany: "Terlalu banyak upload, coba lagi nanti.",
    errorGeneric: "Upload gagal, silakan coba lagi.",
    proofs: "Bukti yang Anda kirim",
    proofStatus: { pending: "Sedang dicek", accepted: "Diterima", rejected: "Ditolak" },
    rejectedBecause: "Alasan: {reason}",
    status: {
      awaiting_payment: "Menunggu pembayaran",
      awaiting_verification: "Pembayaran sedang dicek",
      paid: "Lunas",
      underpaid: "Kurang bayar",
      rejected: "Bukti ditolak",
      expired: "Kedaluwarsa",
      canceled: "Dibatalkan",
    },
    statusText: {
      awaiting_payment: "Silakan transfer nominal di bawah sebelum batas waktu, lalu upload bukti transfer.",
      awaiting_verification: "Bukti transfer Anda sudah kami terima dan sedang kami cocokkan dengan mutasi rekening. Anda akan menerima email setelah pembayaran dikonfirmasi.",
      paid: "Pembayaran Anda sudah kami terima. Terima kasih! Kami akan mengabari saat pesanan dikirim.",
      underpaid: "Sebagian nominal sudah masuk. Mohon transfer sisanya dan upload buktinya.",
      rejected: "Bukti transfer Anda belum bisa kami cocokkan dengan pembayaran. Mohon cek detailnya dan upload bukti yang baru.",
      expired: "Batas waktu pembayaran sudah lewat dan pesanan dibatalkan. Hubungi kami jika Anda sudah mentransfer.",
      canceled: "Pesanan ini dibatalkan.",
    },
    notFoundTitle: "Halaman pembayaran tidak ditemukan",
    notFoundText: "Link-nya mungkin tidak lengkap. Buka link di email pesanan Anda, atau masuk untuk melihat pesanan Anda.",
    continueShopping: "Lanjut belanja",
    instructionsLink: "Instruksi pembayaran dan upload bukti",
  },
} as const

export type TransferLabels = (typeof LABELS)[TransferLocale]

export function labelsFor(locale: TransferLocale): TransferLabels {
  return LABELS[locale]
}

/** Replaces {name} placeholders */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
}

/**
 * The page language: `?lang=`, then the starter's `_medusa_locale` cookie,
 * then the country in the URL (`/id/...`), then the browser's
 * Accept-Language. English otherwise.
 */
export function pickLocale(candidates: (string | null | undefined)[]): TransferLocale {
  for (const value of candidates) {
    const code = value?.trim().toLowerCase()
    if (!code) continue
    if (code.startsWith("id")) return "id"
    if (code.startsWith("en")) return "en"
  }
  return "en"
}

export function formatMoney(amount: number, currency: string, locale: TransferLocale): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount)
}

/** The amount as typed into a banking app: digits and a dot, no currency sign or grouping */
export function plainAmount(amount: number, currency: string): string {
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions()
    .maximumFractionDigits
  return amount.toFixed(digits)
}

/** In the viewer's time zone: call it in the browser */
export function formatDeadline(iso: string, locale: TransferLocale): string {
  // dateStyle/timeStyle cannot be combined with timeZoneName
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso))
}
