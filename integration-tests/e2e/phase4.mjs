// Phase 4: e-mails through the Notification Module (email-preview provider),
// the pro-forma invoice, Admin previews, and the admin "late" reminders.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(1500)])
const ADMIN = "ops@e2e.test"
const BUYER = "buyer@e2e.test"
const STORE = "Contoh Jati Store"

export async function phase4(ctx) {
  const { BASE, check, admin, raw, placeOrder, upload, orderPayment, runJob, psql, sentEmails, saveOrders, EMAIL_DIR } = ctx

  /** E-mails about one order: template, recipient, subject, data, files */
  const mails = (orderId) => sentEmails().filter((m) => m.data?.order?.id === orderId)
  async function waitFor(predicate, ms = 20_000) {
    const until = Date.now() + ms
    while (Date.now() < until) {
      const found = predicate()
      if (found) return found
      await new Promise((r) => setTimeout(r, 500))
    }
    return null
  }
  const find = (orderId, template, to) => mails(orderId).find((m) => m.template === `manual-transfer.${template}` && m.to === to)
  const findAdmin = (orderId, change) => mails(orderId).find((m) => m.template === "manual-transfer.admin_status_changed" && m.to === ADMIN && m.data?.change === change)
  const html = (mail) => fs.readFileSync(path.join(EMAIL_DIR, mail.html), "utf8")
  const historyAt = (paymentId, event, at) =>
    psql(`update payment set data = jsonb_set(data, '{history}', (select jsonb_agg(case when h->>'event' = '${event}' then jsonb_set(h, '{at}', to_jsonb('${at}'::text)) else h end) from jsonb_array_elements(data->'history') h)) where id = '${paymentId}'`)

  // --- order placed: instructions + invoice to the buyer, a note to the admins
  const o = await placeOrder()
  const placed = await waitFor(() => find(o.orderId, "order_placed", BUYER))
  check("order placed: buyer e-mail sent", !!placed, mails(o.orderId).map((m) => [m.template, m.to]))
  const placedHtml = placed ? html(placed) : ""
  check(
    "order e-mail: store name, bank details, exact amount, reference, deadline",
    placedHtml.includes(STORE) && placedHtml.includes(o.payment.data.account.account_number) && placedHtml.includes("TESTIDJA") && placedHtml.includes(o.payment.data.reference) && /GMT\+7/.test(placedHtml) && placed?.subject?.includes(`#${o.display_id}`),
    { subject: placed?.subject }
  )
  const link = placedHtml.match(/https:\/\/shop\.example\.test\/transfer\/([^?"]+)\?token=([A-Za-z0-9_-]+)/)
  check("order e-mail: payment link with the order's upload token", link?.[1] === o.orderId && link?.[2] === o.token, link?.[0])
  const viaLink = await raw("GET", `/store/manual-transfer/orders/${o.orderId}?token=${link?.[2]}`)
  check("the e-mailed token opens the buyer's payment page", viaLink.status === 200, viaLink.status)
  const attachment = placed?.attachments?.[0]
  const pdf = attachment ? fs.readFileSync(path.join(EMAIL_DIR, attachment.file)) : Buffer.alloc(0)
  check("order e-mail carries the invoice PDF", attachment?.content_type === "application/pdf" && /^invoice-TEST-.*\.pdf$/.test(attachment.filename) && pdf.subarray(0, 5).toString() === "%PDF-", attachment)
  const adminPlaced = await waitFor(() => findAdmin(o.orderId, "placed"))
  check("order placed: admin e-mail to adminEmails", !!adminPlaced && /new order/.test(adminPlaced.subject), adminPlaced?.subject)

  // --- proof uploaded
  await upload(o.orderId, o.token, PNG())
  const received = await waitFor(() => find(o.orderId, "proof_received", BUYER))
  const adminProof = await waitFor(() => findAdmin(o.orderId, "proof_uploaded"))
  check("proof uploaded: buyer receipt e-mail", !!received, mails(o.orderId).map((m) => m.template))
  check("proof uploaded: admin e-mail with the bank-statement warning", !!adminProof && html(adminProof).includes("Check the bank statement first"), adminProof?.subject)

  // --- rejected
  const view = await admin("GET", `/admin/manual-transfer/orders/${o.orderId}`)
  await admin("POST", `/admin/manual-transfer/proofs/${view.json.proofs[0].id}/reject`, { reason: "Nominal <tidak> terbaca" })
  const rejected = await waitFor(() => find(o.orderId, "proof_rejected", BUYER))
  check("proof rejected: buyer e-mail with the (escaped) reason", !!rejected && html(rejected).includes("Nominal &lt;tidak&gt; terbaca"), rejected?.subject)
  const adminRejected = await waitFor(() => findAdmin(o.orderId, "rejected"))
  check("proof rejected: admin e-mail names the admin", !!adminRejected && html(adminRejected).includes("admin@e2e.test"), adminRejected?.subject)

  // --- underpaid, then paid
  await admin("POST", `/admin/manual-transfer/payments/${o.payment.id}/underpaid`, { amount_received: o.total - 20, received_at: "2026-10-26" })
  const under = await waitFor(() => find(o.orderId, "payment_underpaid", BUYER))
  check("underpaid: buyer e-mail asks for the remaining $20.00", !!under && under.subject.includes("$20.00") && html(under).includes("$20.00"), under?.subject)
  await admin("POST", `/admin/manual-transfer/payments/${o.payment.id}/confirm`, { amount_received: 20, received_at: "2026-10-27", bank_reference: "FT-REST" })
  const paid = await waitFor(() => find(o.orderId, "payment_confirmed", BUYER))
  check("paid: buyer e-mail with the total received", !!paid && html(paid).includes(`$${o.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`), paid?.subject)
  check("paid: admin e-mail", !!(await waitFor(() => findAdmin(o.orderId, "paid"))))

  // --- one e-mail per change, whatever the retries
  const counts = mails(o.orderId).reduce((acc, m) => ((acc[`${m.template}:${m.to}`] = (acc[`${m.template}:${m.to}`] ?? 0) + 1), acc), {})
  check("each buyer e-mail sent exactly once", ["order_placed", "proof_received", "proof_rejected", "payment_underpaid", "payment_confirmed"].every((t) => counts[`manual-transfer.${t}:${BUYER}`] === 1), counts)
  const notifications = psql(`select count(*) from notification where resource_id = '${o.orderId}'`)
  check("notifications recorded by the Notification Module", notifications.ok && Number(notifications.out) >= 10, notifications)

  // --- reminder, expiry, admin cancel
  const r = await placeOrder()
  const e = await placeOrder()
  const c = await placeOrder()
  ctx.setData(r.payment.id, "expires_at", new Date(Date.now() + 2 * 3600_000).toISOString())
  ctx.setData(e.payment.id, "expires_at", new Date(Date.now() - 3600_000).toISOString())
  await runJob("manual-transfer-deadlines")
  const reminder = await waitFor(() => find(r.orderId, "payment_reminder", BUYER))
  check("reminder: buyer e-mail with the instructions", !!reminder && html(reminder).includes(r.payment.data.reference), mails(r.orderId).map((m) => m.template))
  check("reminder: no admin e-mail", !mails(r.orderId).some((m) => m.to === ADMIN && m.data?.change === "reminder"))
  const expired = await waitFor(() => find(e.orderId, "payment_expired", BUYER))
  check("expired: buyer e-mail", !!expired, mails(e.orderId).map((m) => m.template))
  check("expired: admin e-mail", !!(await waitFor(() => findAdmin(e.orderId, "expired"))))
  await new Promise((res) => setTimeout(res, 2000))
  check("expired: no separate 'canceled' e-mail", !find(e.orderId, "payment_canceled", BUYER), mails(e.orderId).map((m) => m.template))
  await admin("POST", `/admin/orders/${c.orderId}/cancel`, {})
  check("admin cancel: buyer e-mail", !!(await waitFor(() => find(c.orderId, "payment_canceled", BUYER))), mails(c.orderId).map((m) => m.template))
  check("admin cancel: admin e-mail", !!(await waitFor(() => findAdmin(c.orderId, "canceled"))))

  // --- nothing from the plugin's maker in what buyers or admins receive
  const all = sentEmails()
  const credit = all.filter((m) => {
    const body = m.html ? html(m) : ""
    return /haus\s*kayu|hauskayu/i.test(body + m.subject)
  })
  check(`no Haus Kayu credit in any of the ${all.length} e-mails`, all.length > 20 && credit.length === 0, credit.map((m) => m.file))

  // --- invoice download
  const inv = await raw("GET", `/store/manual-transfer/orders/${r.orderId}/invoice`, { headers: { "x-manual-transfer-token": r.token } })
  check("buyer invoice with the token -> PDF", inv.status === 200 && inv.headers.get("content-type") === "application/pdf" && inv.buffer.subarray(0, 5).toString() === "%PDF-" && /attachment; filename="invoice-TEST-/.test(inv.headers.get("content-disposition")), { status: inv.status, type: inv.headers.get("content-type") })
  const invNo = await raw("GET", `/store/manual-transfer/orders/${r.orderId}/invoice`)
  check("buyer invoice without token -> 404", invNo.status === 404, invNo.status)
  const invOther = await raw("GET", `/store/manual-transfer/orders/${r.orderId}/invoice?token=${o.token}`)
  check("another order's token -> 404", invOther.status === 404, invOther.status)
  const adminToken = (await ctx.login()).json.token
  const invAdmin = await fetch(`${BASE}/admin/manual-transfer/orders/${r.orderId}/invoice?locale=id`, { headers: { authorization: `Bearer ${adminToken}` } })
  check("admin invoice -> PDF", invAdmin.status === 200 && invAdmin.headers.get("content-type") === "application/pdf", invAdmin.status)
  const invAnon = await fetch(`${BASE}/admin/manual-transfer/orders/${r.orderId}/invoice`)
  check("admin invoice needs auth", invAnon.status === 401, invAnon.status)

  // --- Admin previews with the store's identity
  const preview = await admin("GET", "/admin/manual-transfer/previews/order_placed?locale=id")
  check("Admin preview renders an e-mail with the store's identity", preview.status === 200 && String(preview.json.raw ?? "").includes(STORE), preview.status)
  const previewPdf = await fetch(`${BASE}/admin/manual-transfer/previews/invoice`, { headers: { authorization: `Bearer ${adminToken}` } })
  check("Admin preview of the invoice -> PDF", previewPdf.status === 200 && previewPdf.headers.get("content-type") === "application/pdf", previewPdf.status)
  check("unknown preview -> 404", (await admin("GET", "/admin/manual-transfer/previews/nope")).status === 404)

  // --- admin reminders: late badge data and the digest e-mail
  const v = await placeOrder()
  await upload(v.orderId, v.token, PNG())
  const u = await placeOrder()
  await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/underpaid`, { amount_received: 1, received_at: "2026-10-26" })
  const fresh = await admin("GET", "/admin/manual-transfer/payments?status=awaiting_verification&limit=100")
  check("fresh proof is not late", fresh.json.payments.find((p) => p.order_id === v.orderId)?.overdue === false, fresh.json.payments.find((p) => p.order_id === v.orderId))
  // Waiting since well before the thresholds (1 and 3 business days)
  const longAgo = new Date(Date.now() - 10 * 864e5).toISOString()
  historyAt(v.payment.id, "proof_uploaded", longAgo)
  historyAt(u.payment.id, "underpaid", new Date(Date.now() - 864e5 / 2).toISOString())
  let queue = await admin("GET", "/admin/manual-transfer/payments?limit=100")
  const vRow = queue.json.payments.find((p) => p.order_id === v.orderId)
  check("proof waiting 10 days: late, with the time it became late", vRow?.overdue === true && !!vRow.overdue_at && vRow.status_since === longAgo, vRow)
  check("underpaid half a day ago: not late yet (3 business days)", queue.json.payments.find((p) => p.order_id === u.orderId)?.overdue === false)
  check("late counts per status for the tabs", (queue.json.overdue_counts?.awaiting_verification ?? 0) >= 1, queue.json.overdue_counts)
  historyAt(u.payment.id, "underpaid", longAgo)
  queue = await admin("GET", "/admin/manual-transfer/payments?status=underpaid&limit=100")
  check("underpaid 10 days ago: late", queue.json.payments.find((p) => p.order_id === u.orderId)?.overdue === true && (queue.json.overdue_counts?.underpaid ?? 0) >= 1, queue.json.overdue_counts)

  const digests = () => sentEmails().filter((m) => m.template === "manual-transfer.admin_overdue" && m.to === ADMIN)
  const digestOf = (display) => digests().filter((m) => (m.data?.items ?? []).some((i) => i.number === `#${display}`))
  const before = digests().length
  check("deadlines job runs (admin reminders)", await runJob("manual-transfer-deadlines"))
  const digest = await waitFor(() => digests().length > before && digestOf(v.display_id).length ? digestOf(v.display_id).at(-1) : null)
  check("digest e-mail lists the late proof and the late underpayment", !!digest && digestOf(u.display_id).length === 1, digest?.data?.items)
  const { payment: vp } = await orderPayment(v.orderId)
  check("admin_reminded_at noted on the payment", !!vp.data.admin_reminded_at, vp.data.admin_reminded_at)
  await runJob("manual-transfer-deadlines")
  await new Promise((res) => setTimeout(res, 2000))
  check("second run: no second digest for the same wait", digestOf(v.display_id).length === 1 && digestOf(u.display_id).length === 1, digests().map((m) => m.data.items.map((i) => i.number)))
  // A new upload after a rejection starts a new wait
  const vView = await admin("GET", `/admin/manual-transfer/orders/${v.orderId}`)
  await admin("POST", `/admin/manual-transfer/proofs/${vView.json.proofs[0].id}/reject`, { reason: "blur" })
  await upload(v.orderId, v.token, PNG())
  queue = await admin("GET", "/admin/manual-transfer/payments?status=awaiting_verification&limit=100")
  check("new upload: no longer late", queue.json.payments.find((p) => p.order_id === v.orderId)?.overdue === false)

  saveOrders({ late: v.orderId, lateUnderpaid: u.orderId, emailed: o.orderId })
}
