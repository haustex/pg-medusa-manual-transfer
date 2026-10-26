import type { NotificationLocale } from "../plugin-options"

/**
 * Default e-mail templates. Every e-mail is the layout around one body; both
 * use the syntax of ./template.ts and the context of ./context.ts. Wording
 * lives in STRINGS (English and Indonesian) and reaches the templates as
 * {{{t.*}}}, already rendered against the same context.
 *
 * Stores replace any of them with files in `notifications.templatesDir`:
 * `<name>.<locale>.html` or `<name>.html`, the subject in its <title>, and
 * `layout.html` with {{{content}}} for the frame. A file that contains <html is
 * sent as it is, without the layout.
 *
 * Only the store's own name, logo and contact details appear: no plugin or
 * vendor credit.
 */

export const BUYER_TEMPLATES = [
  "order_placed",
  "proof_received",
  "proof_rejected",
  "payment_underpaid",
  "payment_confirmed",
  "payment_reminder",
  "payment_expired",
  "payment_canceled",
] as const

export const ADMIN_TEMPLATES = ["admin_status_changed", "admin_overdue"] as const

export type BuyerTemplateName = (typeof BUYER_TEMPLATES)[number]
export type AdminTemplateName = (typeof ADMIN_TEMPLATES)[number]
export type TemplateName = BuyerTemplateName | AdminTemplateName

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MUTED = "color:#71717a"
const BUTTON =
  "display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600"
const LABEL = `padding:6px 12px 6px 0;${MUTED};font-size:13px;vertical-align:top;white-space:nowrap`
const VALUE = "padding:6px 0;font-size:14px;vertical-align:top"
const MONO = "font-family:SFMono-Regular,Menlo,Consolas,monospace"

export const DEFAULT_LAYOUT = `<!doctype html>
<html lang="{{locale}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="padding:20px 32px;border-bottom:1px solid #e4e4e7">
{{#store.logo_url}}<img src="{{store.logo_url}}" alt="{{store.name}}" style="max-height:48px;max-width:240px;border:0">{{/store.logo_url}}
{{^store.logo_url}}<span style="font-size:18px;font-weight:700">{{store.name}}</span>{{/store.logo_url}}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.55">
{{{content}}}
</td></tr>
<tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;${MUTED}">
<strong>{{store.name}}</strong><br>
{{#store.address_lines}}{{.}}<br>{{/store.address_lines}}
{{#store.email}}<a href="mailto:{{store.email}}" style="${MUTED}">{{store.email}}</a>{{/store.email}}
{{#store.phone}} · {{store.phone}}{{/store.phone}}
{{#store.website}} · <a href="{{store.website}}" style="${MUTED}">{{store.website}}</a>{{/store.website}}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

const HEADING = `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">{{{t.heading}}}</h1>`
const INTRO = `<p style="margin:0 0 16px">{{{t.intro}}}</p>`

/** The bank details, the exact amount and the reference */
const INSTRUCTIONS = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:8px;margin:16px 0">
<tr><td style="padding:16px 20px">
<p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.04em;${MUTED}">{{{t.amount_to_transfer}}}</p>
<p style="margin:2px 0 14px;font-size:26px;font-weight:700">{{amount_to_pay}}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="${LABEL}">{{{t.bank}}}</td><td style="${VALUE}">{{payment.account.bank_name}}</td></tr>
<tr><td style="${LABEL}">{{{t.account_holder}}}</td><td style="${VALUE}">{{payment.account.account_holder}}</td></tr>
<tr><td style="${LABEL}">{{{t.account_number}}}</td><td style="${VALUE};${MONO};font-weight:700">{{payment.account.account_number}}</td></tr>
{{#payment.account.swift_code}}<tr><td style="${LABEL}">SWIFT / BIC</td><td style="${VALUE};${MONO}">{{payment.account.swift_code}}</td></tr>{{/payment.account.swift_code}}
{{#payment.account.bank_address}}<tr><td style="${LABEL}">{{{t.bank_address}}}</td><td style="${VALUE}">{{payment.account.bank_address}}</td></tr>{{/payment.account.bank_address}}
<tr><td style="${LABEL}">{{{t.currency}}}</td><td style="${VALUE}">{{payment.currency}}</td></tr>
<tr><td style="${LABEL}">{{{t.reference}}}</td><td style="${VALUE};${MONO};font-weight:700">{{payment.reference}}</td></tr>
{{#payment.deadline}}<tr><td style="${LABEL}">{{{t.pay_by}}}</td><td style="${VALUE}">{{payment.deadline}}</td></tr>{{/payment.deadline}}
</table>
<p style="margin:14px 0 0;font-size:13px;${MUTED}">{{{t.reference_note}}}</p>
<p style="margin:6px 0 0;font-size:13px;${MUTED}">{{{t.fees_note}}}</p>
</td></tr>
</table>`

const PAY_BUTTON = `{{#payment_url}}<p style="margin:20px 0"><a href="{{payment_url}}" style="${BUTTON}">{{{t.button}}}</a></p>{{/payment_url}}`

const SUMMARY = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0">
<tr><td style="${LABEL}">{{{t.order}}}</td><td style="${VALUE}">{{order.number}}</td></tr>
<tr><td style="${LABEL}">{{{t.reference}}}</td><td style="${VALUE};${MONO}">{{payment.reference}}</td></tr>
<tr><td style="${LABEL}">{{{t.amount_due}}}</td><td style="${VALUE}">{{payment.amount}}</td></tr>
{{#payment.has_received}}<tr><td style="${LABEL}">{{{t.received}}}</td><td style="${VALUE}">{{payment.amount_received}}</td></tr>
<tr><td style="${LABEL}">{{{t.remaining}}}</td><td style="${VALUE}">{{payment.amount_remaining}}</td></tr>{{/payment.has_received}}
</table>`

const QUESTIONS = `<p style="margin:16px 0 0;font-size:13px;${MUTED}">{{{t.questions}}}</p>`

export const DEFAULT_BODIES: Record<TemplateName, string> = {
  order_placed: `${HEADING}${INTRO}${INSTRUCTIONS}
<ol style="margin:0 0 16px;padding-left:20px">
<li style="margin-bottom:6px">{{{t.step_transfer}}}</li>
<li style="margin-bottom:6px">{{{t.step_upload}}}</li>
<li>{{{t.step_confirm}}}</li>
</ol>
${PAY_BUTTON}
{{#has_invoice}}<p style="margin:0 0 8px;font-size:13px;${MUTED}">{{{t.invoice_attached}}}</p>{{/has_invoice}}
${QUESTIONS}`,

  proof_received: `${HEADING}${INTRO}${SUMMARY}<p style="margin:0">{{{t.next}}}</p>${QUESTIONS}`,

  proof_rejected: `${HEADING}${INTRO}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#fef2f2;border-radius:6px">
<tr><td style="padding:12px 16px;font-size:14px"><strong>{{{t.reason_label}}}</strong> {{rejection_reason}}</td></tr>
</table>
<p style="margin:0">{{{t.next}}}</p>
${INSTRUCTIONS}${PAY_BUTTON}${QUESTIONS}`,

  payment_underpaid: `${HEADING}${INTRO}${SUMMARY}<p style="margin:0">{{{t.next}}}</p>${INSTRUCTIONS}${PAY_BUTTON}${QUESTIONS}`,

  payment_confirmed: `${HEADING}${INTRO}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0">
<tr><td style="${LABEL}">{{{t.order}}}</td><td style="${VALUE}">{{order.number}}</td></tr>
<tr><td style="${LABEL}">{{{t.reference}}}</td><td style="${VALUE};${MONO}">{{payment.reference}}</td></tr>
<tr><td style="${LABEL}">{{{t.received}}}</td><td style="${VALUE}">{{payment.amount_received}}</td></tr>
{{#confirmation.received_on}}<tr><td style="${LABEL}">{{{t.received_on}}}</td><td style="${VALUE}">{{confirmation.received_on}}</td></tr>{{/confirmation.received_on}}
</table>
<p style="margin:0">{{{t.next}}}</p>${QUESTIONS}`,

  payment_reminder: `${HEADING}${INTRO}${INSTRUCTIONS}${PAY_BUTTON}<p style="margin:0;font-size:13px;${MUTED}">{{{t.already_paid}}}</p>${QUESTIONS}`,

  payment_expired: `${HEADING}${INTRO}<p style="margin:0">{{{t.next}}}</p>${QUESTIONS}`,

  payment_canceled: `${HEADING}${INTRO}<p style="margin:0">{{{t.next}}}</p>${QUESTIONS}`,

  admin_status_changed: `${HEADING}${INTRO}
{{#bank_check}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#fffbeb;border-radius:6px">
<tr><td style="padding:12px 16px;font-size:14px"><strong>{{{t.bank_check_title}}}</strong><br>{{{t.bank_check}}}</td></tr>
</table>{{/bank_check}}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
<tr><td style="${LABEL}">{{{t.order}}}</td><td style="${VALUE}">{{order.number}}</td></tr>
<tr><td style="${LABEL}">{{{t.status}}}</td><td style="${VALUE}"><strong>{{payment.status_label}}</strong></td></tr>
<tr><td style="${LABEL}">{{{t.customer}}}</td><td style="${VALUE}">{{order.customer_name}} &lt;{{order.email}}&gt;</td></tr>
<tr><td style="${LABEL}">{{{t.reference}}}</td><td style="${VALUE};${MONO}">{{payment.reference}}</td></tr>
<tr><td style="${LABEL}">{{{t.amount_due}}}</td><td style="${VALUE}">{{payment.amount}}</td></tr>
{{#payment.has_received}}<tr><td style="${LABEL}">{{{t.received}}}</td><td style="${VALUE}">{{payment.amount_received}}</td></tr>
<tr><td style="${LABEL}">{{{t.remaining}}}</td><td style="${VALUE}">{{payment.amount_remaining}}</td></tr>{{/payment.has_received}}
{{#payment.deadline}}<tr><td style="${LABEL}">{{{t.pay_by}}}</td><td style="${VALUE}">{{payment.deadline}}</td></tr>{{/payment.deadline}}
<tr><td style="${LABEL}">{{{t.account}}}</td><td style="${VALUE}">{{payment.account.bank_name}} · {{payment.account.account_number}}</td></tr>
{{#rejection_reason}}<tr><td style="${LABEL}">{{{t.reason_label}}}</td><td style="${VALUE}">{{rejection_reason}}</td></tr>{{/rejection_reason}}
{{#actor}}<tr><td style="${LABEL}">{{{t.by}}}</td><td style="${VALUE}">{{actor}}</td></tr>{{/actor}}
</table>
{{#admin_order_url}}<p style="margin:20px 0"><a href="{{admin_order_url}}" style="${BUTTON}">{{{t.open_order}}}</a></p>{{/admin_order_url}}`,

  admin_overdue: `${HEADING}${INTRO}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;font-size:13px">
<tr>
<th align="left" style="padding:6px 8px 6px 0;border-bottom:1px solid #e4e4e7;${MUTED}">{{{t.order}}}</th>
<th align="left" style="padding:6px 8px;border-bottom:1px solid #e4e4e7;${MUTED}">{{{t.status}}}</th>
<th align="left" style="padding:6px 8px;border-bottom:1px solid #e4e4e7;${MUTED}">{{{t.waiting_since}}}</th>
<th align="right" style="padding:6px 0 6px 8px;border-bottom:1px solid #e4e4e7;${MUTED}">{{{t.amount_due}}}</th>
</tr>
{{#items}}<tr>
<td style="padding:8px 8px 8px 0;border-bottom:1px solid #f4f4f5">{{#admin_order_url}}<a href="{{admin_order_url}}">{{number}}</a>{{/admin_order_url}}{{^admin_order_url}}{{number}}{{/admin_order_url}}<br><span style="${MONO};${MUTED};white-space:nowrap">{{reference}}</span></td>
<td style="padding:8px;border-bottom:1px solid #f4f4f5">{{status_label}}</td>
<td style="padding:8px;border-bottom:1px solid #f4f4f5">{{since}}</td>
<td align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #f4f4f5">{{amount}}</td>
</tr>{{/items}}
</table>
{{#admin_queue_url}}<p style="margin:20px 0"><a href="{{admin_queue_url}}" style="${BUTTON}">{{{t.open_queue}}}</a></p>{{/admin_queue_url}}`,
}

type Strings = Record<string, string>

const COMMON: Record<NotificationLocale, Strings> = {
  en: {
    amount_to_transfer: "Amount to transfer",
    bank: "Bank",
    account_holder: "Account holder",
    account_number: "Account number",
    bank_address: "Bank address",
    currency: "Currency",
    reference: "Reference",
    pay_by: "Pay by",
    reference_note: "Put the reference <strong>{{payment.reference}}</strong> in the transfer note so we can match your payment.",
    fees_note:
      "Transferring from abroad? Choose <strong>OUR</strong> (all fees paid by the sender), so the full amount arrives.",
    button: "Upload proof of transfer",
    order: "Order",
    amount_due: "Amount due",
    received: "Received",
    received_on: "Received on",
    remaining: "Still to pay",
    status: "Status",
    customer: "Customer",
    account: "Bank account",
    by: "By",
    reason_label: "Reason:",
    questions: "Questions? Reply to this e-mail{{#store.email}} or write to {{store.email}}{{/store.email}}.",
  },
  id: {
    amount_to_transfer: "Jumlah yang ditransfer",
    bank: "Bank",
    account_holder: "Nama penerima",
    account_number: "Nomor rekening",
    bank_address: "Alamat bank",
    currency: "Mata uang",
    reference: "Referensi",
    pay_by: "Bayar sebelum",
    reference_note: "Tulis referensi <strong>{{payment.reference}}</strong> di berita transfer agar pembayaran Anda mudah kami cocokkan.",
    fees_note:
      "Transfer dari luar negeri? Pilih biaya <strong>OUR</strong> (ditanggung pengirim) agar jumlahnya diterima utuh.",
    button: "Upload bukti transfer",
    order: "Pesanan",
    amount_due: "Tagihan",
    received: "Diterima",
    received_on: "Tanggal diterima",
    remaining: "Sisa tagihan",
    status: "Status",
    customer: "Pembeli",
    account: "Rekening",
    by: "Oleh",
    reason_label: "Alasan:",
    questions: "Ada pertanyaan? Balas e-mail ini{{#store.email}} atau tulis ke {{store.email}}{{/store.email}}.",
  },
}

const BY_TEMPLATE: Record<NotificationLocale, Record<TemplateName, Strings>> = {
  en: {
    order_placed: {
      subject: "Order {{order.number}}: please transfer {{payment.amount}}",
      heading: "Thank you for your order",
      intro:
        "Your order {{order.number}} is reserved. Please transfer <strong>exactly {{payment.amount}}</strong> to the account below{{#payment.deadline}} before <strong>{{payment.deadline}}</strong>{{/payment.deadline}}; after that the order is canceled.",
      step_transfer: "Transfer the exact amount, with the reference in the transfer note.",
      step_upload: "Upload a photo or PDF of the transfer receipt{{#payment_url}} with the button below{{/payment_url}}.",
      step_confirm: "We check the payment in our bank statement and confirm your order by e-mail.",
      invoice_attached: "The pro-forma invoice is attached as a PDF.",
    },
    proof_received: {
      subject: "We received your proof of transfer for order {{order.number}}",
      heading: "Proof of transfer received",
      intro: "Thank you. We will check your transfer against our bank statement.",
      next: "You will get an e-mail as soon as the payment is confirmed.",
    },
    proof_rejected: {
      subject: "Order {{order.number}}: please send your proof of transfer again",
      heading: "We could not accept your proof of transfer",
      intro: "We looked at the proof of transfer for order {{order.number}} and could not match it to a payment.",
      next: "Please upload a new proof, or transfer the amount below if you have not paid yet{{#payment.deadline}}, before {{payment.deadline}}{{/payment.deadline}}.",
    },
    payment_underpaid: {
      subject: "Order {{order.number}}: {{payment.amount_remaining}} still to pay",
      heading: "Part of the payment arrived",
      intro: "We received {{payment.amount_received}} for order {{order.number}}, which is less than the amount due.",
      next: "Please transfer the remaining <strong>{{payment.amount_remaining}}</strong> and upload the proof.",
    },
    payment_confirmed: {
      subject: "Payment received for order {{order.number}}",
      heading: "Payment confirmed",
      intro: "We received your transfer for order {{order.number}}. Thank you!",
      next: "We are preparing your order now and will keep you posted.",
    },
    payment_reminder: {
      subject: "Reminder: order {{order.number}} is due {{payment.deadline}}",
      heading: "Your payment is due soon",
      intro:
        "We have not received the transfer for order {{order.number}} yet. Please pay before <strong>{{payment.deadline}}</strong>, or the order will be canceled.",
      already_paid: "Already paid? Upload the proof of transfer so we can find it sooner.",
    },
    payment_expired: {
      subject: "Order {{order.number}} was canceled: no payment received",
      heading: "Your order was canceled",
      intro: "We did not receive the transfer for order {{order.number}} before the deadline, so the order was canceled.",
      next: "If you did transfer the money, reply to this e-mail with the proof of transfer and we will sort it out.",
    },
    payment_canceled: {
      subject: "Order {{order.number}} was canceled",
      heading: "Your order was canceled",
      intro: "Order {{order.number}} was canceled{{#payment.has_received}} and the money you sent will be returned{{/payment.has_received}}.",
      next: "If this is unexpected, reply to this e-mail.",
    },
    admin_status_changed: {
      subject: "{{order.number}}: {{t_headline}}",
      heading: "{{t_headline}}",
      intro: "{{t_intro}}",
      bank_check_title: "Check the bank statement first",
      bank_check:
        "Look for the transfer in your banking app or the account statement before confirming. Never rely on the proof image alone.",
      open_order: "Open the order",
    },
    admin_overdue: {
      subject: "{{items.length}} manual transfer payment(s) waiting for you",
      heading: "Payments waiting for an admin",
      intro: "These payments have waited longer than agreed: proofs to verify, or underpayments without follow-up.",
      waiting_since: "Waiting since",
      open_queue: "Open the manual transfers",
    },
  },
  id: {
    order_placed: {
      subject: "Pesanan {{order.number}}: silakan transfer {{payment.amount}}",
      heading: "Terima kasih atas pesanan Anda",
      intro:
        "Pesanan {{order.number}} sudah kami simpan. Silakan transfer <strong>tepat {{payment.amount}}</strong> ke rekening di bawah{{#payment.deadline}} sebelum <strong>{{payment.deadline}}</strong>{{/payment.deadline}}; setelah itu pesanan dibatalkan.",
      step_transfer: "Transfer jumlah yang tepat, dengan referensi di berita transfer.",
      step_upload: "Upload foto atau PDF bukti transfer{{#payment_url}} lewat tombol di bawah{{/payment_url}}.",
      step_confirm: "Kami mengecek pembayaran di mutasi rekening dan mengonfirmasi pesanan lewat e-mail.",
      invoice_attached: "Invoice pro-forma terlampir sebagai PDF.",
    },
    proof_received: {
      subject: "Bukti transfer untuk pesanan {{order.number}} sudah kami terima",
      heading: "Bukti transfer diterima",
      intro: "Terima kasih. Kami akan mencocokkan transfer Anda dengan mutasi rekening kami.",
      next: "Anda akan menerima e-mail begitu pembayaran dikonfirmasi.",
    },
    proof_rejected: {
      subject: "Pesanan {{order.number}}: mohon kirim ulang bukti transfer",
      heading: "Bukti transfer belum bisa kami terima",
      intro: "Kami sudah memeriksa bukti transfer untuk pesanan {{order.number}} tetapi belum menemukan pembayarannya.",
      next: "Silakan upload bukti baru, atau transfer jumlah di bawah kalau belum membayar{{#payment.deadline}}, sebelum {{payment.deadline}}{{/payment.deadline}}.",
    },
    payment_underpaid: {
      subject: "Pesanan {{order.number}}: sisa {{payment.amount_remaining}} belum dibayar",
      heading: "Sebagian pembayaran sudah masuk",
      intro: "Kami menerima {{payment.amount_received}} untuk pesanan {{order.number}}, kurang dari tagihan.",
      next: "Silakan transfer sisanya, <strong>{{payment.amount_remaining}}</strong>, lalu upload buktinya.",
    },
    payment_confirmed: {
      subject: "Pembayaran pesanan {{order.number}} sudah diterima",
      heading: "Pembayaran dikonfirmasi",
      intro: "Transfer Anda untuk pesanan {{order.number}} sudah kami terima. Terima kasih!",
      next: "Pesanan Anda sedang kami siapkan; kabar berikutnya menyusul.",
    },
    payment_reminder: {
      subject: "Pengingat: pesanan {{order.number}} jatuh tempo {{payment.deadline}}",
      heading: "Batas pembayaran sudah dekat",
      intro:
        "Transfer untuk pesanan {{order.number}} belum kami terima. Mohon bayar sebelum <strong>{{payment.deadline}}</strong>, atau pesanan akan dibatalkan.",
      already_paid: "Sudah membayar? Upload bukti transfer agar lebih cepat kami temukan.",
    },
    payment_expired: {
      subject: "Pesanan {{order.number}} dibatalkan: pembayaran tidak diterima",
      heading: "Pesanan Anda dibatalkan",
      intro: "Transfer untuk pesanan {{order.number}} tidak kami terima sebelum batas waktu, sehingga pesanan dibatalkan.",
      next: "Kalau Anda sudah transfer, balas e-mail ini dengan bukti transfer dan kami akan membantu.",
    },
    payment_canceled: {
      subject: "Pesanan {{order.number}} dibatalkan",
      heading: "Pesanan Anda dibatalkan",
      intro: "Pesanan {{order.number}} dibatalkan{{#payment.has_received}} dan uang yang sudah Anda kirim akan dikembalikan{{/payment.has_received}}.",
      next: "Kalau ini tidak Anda harapkan, balas e-mail ini.",
    },
    admin_status_changed: {
      subject: "{{order.number}}: {{t_headline}}",
      heading: "{{t_headline}}",
      intro: "{{t_intro}}",
      bank_check_title: "Cek mutasi rekening dulu",
      bank_check:
        "Cari transfernya di aplikasi bank atau mutasi rekening sebelum mengonfirmasi. Jangan hanya percaya pada gambar bukti.",
      open_order: "Buka pesanan",
    },
    admin_overdue: {
      subject: "{{items.length}} pembayaran transfer manual menunggu Anda",
      heading: "Pembayaran menunggu tindakan admin",
      intro: "Pembayaran berikut sudah menunggu lebih lama dari batas: bukti yang perlu diverifikasi, atau kurang bayar yang belum ditindaklanjuti.",
      waiting_since: "Menunggu sejak",
      open_queue: "Buka transfer manual",
    },
  },
}

/** Headline and intro of the admin e-mail, per kind of change */
export const ADMIN_HEADLINES: Record<NotificationLocale, Record<string, { headline: string; intro: string }>> = {
  en: {
    placed: { headline: "new order awaiting transfer", intro: "A new order will be paid by bank transfer." },
    proof_uploaded: { headline: "proof uploaded, needs verification", intro: "The buyer uploaded a proof of transfer." },
    rejected: { headline: "proof rejected", intro: "A proof of transfer was rejected; the buyer was asked for a new one." },
    underpaid: { headline: "underpayment recorded", intro: "Less than the amount due arrived; the buyer was asked for the rest." },
    paid: { headline: "payment confirmed", intro: "The payment was confirmed and captured." },
    expired: { headline: "deadline passed, order canceled", intro: "No payment arrived before the deadline; the order was canceled and the stock released." },
    canceled: { headline: "order canceled", intro: "The order and its transfer payment were canceled." },
  },
  id: {
    placed: { headline: "pesanan baru menunggu transfer", intro: "Pesanan baru akan dibayar lewat transfer bank." },
    proof_uploaded: { headline: "bukti diupload, perlu verifikasi", intro: "Pembeli mengupload bukti transfer." },
    rejected: { headline: "bukti ditolak", intro: "Bukti transfer ditolak; pembeli diminta mengirim yang baru." },
    underpaid: { headline: "kurang bayar dicatat", intro: "Dana yang masuk kurang dari tagihan; pembeli diminta melunasi sisanya." },
    paid: { headline: "pembayaran dikonfirmasi", intro: "Pembayaran sudah dikonfirmasi dan di-capture." },
    expired: { headline: "lewat batas waktu, pesanan dibatalkan", intro: "Tidak ada pembayaran sebelum batas waktu; pesanan dibatalkan dan stok dikembalikan." },
    canceled: { headline: "pesanan dibatalkan", intro: "Pesanan dan pembayaran transfernya dibatalkan." },
  },
}

export const STATUS_LABELS: Record<NotificationLocale, Record<string, string>> = {
  en: {
    awaiting_payment: "Awaiting payment",
    awaiting_verification: "Awaiting verification",
    paid: "Paid",
    underpaid: "Underpaid",
    rejected: "Rejected",
    expired: "Expired",
    canceled: "Canceled",
  },
  id: {
    awaiting_payment: "Menunggu pembayaran",
    awaiting_verification: "Menunggu verifikasi",
    paid: "Lunas",
    underpaid: "Kurang bayar",
    rejected: "Ditolak",
    expired: "Kedaluwarsa",
    canceled: "Dibatalkan",
  },
}

/** Wording for one template: the shared strings plus its own */
export function templateStrings(name: TemplateName, locale: NotificationLocale): Strings {
  return { ...COMMON[locale], ...BY_TEMPLATE[locale][name] }
}
