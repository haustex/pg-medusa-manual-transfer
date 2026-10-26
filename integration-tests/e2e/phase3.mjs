// Phase 3: verification queue, underpayment, locks, reminder/expiry/retention jobs.
import crypto from "node:crypto"

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(1500)])

export async function phase3(ctx) {
  const { BASE, check, admin, orderPayment, reservedQuantity, psql, placeOrder, runJob, setData, saveOrders } = ctx
  const raw = (method, path, opts) => ctx.raw(method, path, opts)
  const upload = (orderId, token, buffer = PNG()) => ctx.upload(orderId, token, buffer)

  // --- config
  const cfg = await admin("GET", "/admin/manual-transfer/config")
  check("config: show_credit default true, retention from options", cfg.status === 200 && cfg.json.show_credit === true && cfg.json.proof_retention_days === 30, cfg.json)

  // --- queue
  const q = await placeOrder()
  const up = await upload(q.orderId, q.token)
  check("queue order: proof uploaded", up.status === 201, up.json)
  const list = await admin("GET", "/admin/manual-transfer/payments?status=awaiting_verification&limit=100")
  const row = list.json.payments?.find((p) => p.order_id === q.orderId)
  check("queue lists the order under awaiting_verification", list.status === 200 && !!row && row.status === "awaiting_verification" && row.payment_id === q.payment.id && !!row.last_proof_at && row.amount === q.total, row ?? list.json)
  check("queue counts per status", (list.json.counts?.awaiting_verification ?? 0) >= 1 && typeof list.json.count === "number", list.json.counts)
  const notThere = await admin("GET", "/admin/manual-transfer/payments?status=paid&limit=100")
  check("queue status filter excludes it from paid", !notThere.json.payments.some((p) => p.order_id === q.orderId), notThere.json.count)
  const byRef = await admin("GET", `/admin/manual-transfer/payments?q=${encodeURIComponent(q.payment.data.reference.slice(-5))}`)
  check("queue search by reference", byRef.json.payments?.some((p) => p.order_id === q.orderId), byRef.json)
  const byNum = await admin("GET", `/admin/manual-transfer/payments?q=%23${q.display_id}`)
  check("queue search by #order number", byNum.json.payments?.length >= 1 && byNum.json.payments.every((p) => p.display_id === q.display_id), byNum.json)
  const badStatus = await admin("GET", "/admin/manual-transfer/payments?status=bogus")
  check("queue rejects an unknown status", badStatus.status === 400, badStatus.json)
  const unauth = await fetch(`${BASE}/admin/manual-transfer/payments`)
  check("queue needs admin auth", unauth.status === 401, unauth.status)

  // --- lock: two confirmations at once, exactly one wins
  const both = await Promise.all([
    admin("POST", `/admin/manual-transfer/payments/${q.payment.id}/confirm`, { amount_received: q.total, received_at: "2026-10-26" }),
    admin("POST", `/admin/manual-transfer/payments/${q.payment.id}/confirm`, { amount_received: q.total, received_at: "2026-10-26" }),
  ])
  const codes = both.map((r) => r.status).sort()
  check("concurrent confirmations: one 200, one refused", codes[0] === 200 && codes[1] >= 400, both.map((r) => [r.status, r.json.message]))
  const { payment: qp } = await orderPayment(q.orderId)
  check("payment confirmed once (one confirmed entry, one capture)", qp.data.history.filter((h) => h.event === "confirmed").length === 1 && (qp.captures ?? []).length === 1, { history: qp.data.history.map((h) => h.event), captures: qp.captures?.length })
  const qview = await admin("GET", `/admin/manual-transfer/orders/${q.orderId}`)
  const confirmer = qp.data.confirmation?.confirmed_by
  check("admin order view names the admin user", !!confirmer && qview.json.users?.[confirmer]?.email === "admin@e2e.test" && qview.json.order_status !== undefined, qview.json.users)

  // --- underpayment
  const u = await placeOrder()
  await upload(u.orderId, u.token)
  const tooMuch = await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/underpaid`, { amount_received: u.total, received_at: "2026-10-26" })
  check("underpaid with the full amount refused (confirm instead)", tooMuch.status === 400 && /confirm the payment instead/.test(tooMuch.json.message), tooMuch.json)
  const noDate = await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/underpaid`, { amount_received: 1 })
  check("underpaid without date -> 400", noDate.status === 400, noDate.json)
  const part = await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/underpaid`, { amount_received: u.total - 10, received_at: "2026-10-25", bank_reference: "PART1", note: "fee dipotong bank" })
  check("underpaid recorded -> 200", part.status === 200, part.json)
  let { order: uo, payment: up1 } = await orderPayment(u.orderId)
  const uh = up1.data.history.at(-1)
  check("payment underpaid with receipt and remaining in history", up1.data.status === "underpaid" && up1.data.receipts?.length === 1 && up1.data.receipts[0].bank_reference === "PART1" && uh?.event === "underpaid" && uh?.details?.remaining === 10 && uh?.actor_type === "user", up1.data)
  check("underpaid order is not captured", uo.payment_status === "authorized" && !up1.captured_at, uo.payment_status)
  const uview = await admin("GET", `/admin/manual-transfer/orders/${u.orderId}`)
  check("pending proof accepted with the partial transfer", uview.json.proofs?.[0]?.status === "accepted" && uview.json.amount_received === u.total - 10, uview.json.proofs?.[0])
  const buyer = await raw("GET", `/store/manual-transfer/orders/${u.orderId}`, { headers: { "x-manual-transfer-token": u.token } })
  const mt = buyer.json.manual_transfer
  check("buyer sees received and remaining amounts, can upload again", mt?.status === "underpaid" && mt?.amount_received === u.total - 10 && mt?.amount_remaining === 10 && mt?.can_upload === true && !("receipts" in mt), mt)
  const secondProof = await upload(u.orderId, u.token)
  check("buyer uploads proof of the rest", secondProof.status === 201, secondProof.json)
  const shortAgain = await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/confirm`, { amount_received: 5, received_at: "2026-10-26" })
  check("confirm counts earlier receipts: 5 of remaining 10 refused", shortAgain.status === 400 && /less than/.test(shortAgain.json.message), shortAgain.json)
  const rest = await admin("POST", `/admin/manual-transfer/payments/${u.payment.id}/confirm`, { amount_received: 10, received_at: "2026-10-26", bank_reference: "PART2" })
  check("confirm the remaining 10 -> 200", rest.status === 200, rest.json)
  ;({ order: uo, payment: up1 } = await orderPayment(u.orderId))
  check("captured; confirmation total_received = amount due", uo.payment_status === "captured" && up1.data.status === "paid" && up1.data.confirmation?.amount_received === 10 && up1.data.confirmation?.total_received === u.total, up1.data.confirmation)

  // --- reminder job
  const r = await placeOrder()
  const far = await placeOrder()
  setData(r.payment.id, "expires_at", new Date(Date.now() + 2 * 3600_000).toISOString())
  setData(far.payment.id, "expires_at", new Date(Date.now() + 48 * 3600_000).toISOString())
  check("deadlines job runs (reminders)", await runJob("manual-transfer-deadlines"))
  let { payment: rp } = await orderPayment(r.orderId)
  check("payment due in 2 h gets reminded once", !!rp.data.reminded_at && rp.data.history.at(-1)?.event === "reminder_sent" && rp.data.status === "awaiting_payment", rp.data.history.map((h) => h.event))
  const { payment: fp } = await orderPayment(far.orderId)
  check("payment due in 48 h not reminded", !fp.data.reminded_at, fp.data.reminded_at)
  await runJob("manual-transfer-deadlines")
  ;({ payment: rp } = await orderPayment(r.orderId))
  check("second run sends no second reminder", rp.data.history.filter((h) => h.event === "reminder_sent").length === 1, rp.data.history.map((h) => h.event))

  // --- expiry job
  const e = await placeOrder()
  const eVerify = await placeOrder()
  await upload(eVerify.orderId, eVerify.token)
  const eUnder = await placeOrder()
  await admin("POST", `/admin/manual-transfer/payments/${eUnder.payment.id}/underpaid`, { amount_received: 1, received_at: "2026-10-26" })
  const past = new Date(Date.now() - 3600_000).toISOString()
  for (const o of [e, eVerify, eUnder]) setData(o.payment.id, "expires_at", past)
  const reservedBefore = await reservedQuantity()
  check("deadlines job runs (expiry)", await runJob("manual-transfer-deadlines"))
  const { order: eo, payment: ep } = await orderPayment(e.orderId)
  check("expired order canceled by the job", eo.status === "canceled", eo.status)
  check("payment expired and canceled, history expired then canceled", ep.data.status === "expired" && !!ep.canceled_at && ep.data.history.map((h) => h.event).slice(-2).join(",") === "expired,canceled", { status: ep.data.status, canceled_at: ep.canceled_at, history: ep.data.history.map((h) => h.event) })
  const reservedAfter = await reservedQuantity()
  check("expiry released the reserved stock (-2)", reservedBefore - reservedAfter === 2, { reservedBefore, reservedAfter })
  const { order: vo, payment: vp } = await orderPayment(eVerify.orderId)
  check("past deadline but proof awaiting review: left alone", vo.status !== "canceled" && vp.data.status === "awaiting_verification", { order: vo.status, status: vp.data.status })
  const { order: uo2, payment: up2 } = await orderPayment(eUnder.orderId)
  check("past deadline but partly paid: left alone", uo2.status !== "canceled" && up2.data.status === "underpaid", { order: uo2.status, status: up2.data.status })
  const lateUpload = await upload(e.orderId, e.token)
  check("expired order takes no proof", lateUpload.status === 400 || lateUpload.status === 404, lateUpload.json)
  const expiredList = await admin("GET", "/admin/manual-transfer/payments?status=expired&limit=100")
  check("queue lists it under expired", expiredList.json.payments?.some((p) => p.order_id === e.orderId), expiredList.json.count)

  // --- retention job
  const oldView = await admin("GET", `/admin/manual-transfer/orders/${u.orderId}`)
  const oldProof = oldView.json.proofs[0]
  const signedBefore = await admin("GET", `/admin/manual-transfer/proofs/${oldProof.id}/url`)
  const recentView = await admin("GET", `/admin/manual-transfer/orders/${q.orderId}`)
  const recentProof = recentView.json.proofs[0]
  psql(`update payment set captured_at = now() - interval '40 days' where id = '${u.payment.id}'`)
  check("retention job runs", await runJob("manual-transfer-proof-retention"))
  const purgedView = await admin("GET", `/admin/manual-transfer/orders/${u.orderId}`)
  check("proofs of an order paid 40 days ago: files deleted, records kept", purgedView.json.proofs.length === oldView.json.proofs.length && purgedView.json.proofs.every((p) => !!p.file_deleted_at && p.sha256?.length === 64 && p.filename), purgedView.json.proofs)
  const fileRows = psql(`select count(*) from manual_transfer_proof_file where id in (select file_id from manual_transfer_proof where order_id = '${u.orderId}')`)
  check("file contents gone from the database", fileRows.ok && fileRows.out === "0", fileRows)
  const gone = await fetch(BASE + signedBefore.json.url)
  check("earlier signed link now answers 410", gone.status === 410, gone.status)
  const noLink = await admin("GET", `/admin/manual-transfer/proofs/${oldProof.id}/url`)
  check("no new signed link for a deleted file", noLink.status === 400, noLink.json)
  const keptView = await admin("GET", `/admin/manual-transfer/orders/${q.orderId}`)
  check("recently paid order keeps its proof file", !keptView.json.proofs.find((p) => p.id === recentProof.id)?.file_deleted_at, keptView.json.proofs)
  psql(`update payment set captured_at = now() where id = '${u.payment.id}'`)

  saveOrders({ verify: eVerify.orderId, verifyToken: eVerify.token, underpaid: eUnder.orderId, underpaidPayment: eUnder.payment.id, paid: u.orderId, expired: e.orderId })
}

// Last, after phase 2: it exhausts this IP's token-exchange budget
export async function phase3Limits(ctx) {
  const { check, raw, loadOrders } = ctx
  const orders = loadOrders()
  const eVerify = { orderId: orders.verify, token: orders.verifyToken }

  // --- upload-token exchange has its own per-IP budget (30 in the test app)
  let limited = null
  for (let i = 0; i < 40 && !limited; i++) {
    const t = await raw("GET", `/store/manual-transfer/carts/cart_missing_${i}/upload-token`)
    if (t.status === 429) limited = t
  }
  check("token exchange limit -> 429 with Retry-After", !!limited && Number(limited.headers.get("retry-after")) > 0, limited?.json)
  const readStill = await raw("GET", `/store/manual-transfer/orders/${eVerify.orderId}`, { headers: { "x-manual-transfer-token": eVerify.token } })
  check("status reads keep their own budget", readStill.status === 200, readStill.status)
}
