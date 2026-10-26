// Phase 2: payment-proof upload, signed links, rejection, guest tokens, rate limits.
import crypto from "node:crypto"

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(2000)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(3000)])
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")
const GIF = Buffer.from("GIF89a" + "x".repeat(100))
const FAKE_PNG = Buffer.from("<html><script>alert(1)</script></html>")
const BIG_PNG = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(5 * 1024 * 1024 + 1 - 8)])

export async function phase2(ctx) {
  const { BASE, seed, check, admin, store, checkout, orderPayment, saveOrders } = ctx
  async function raw(method, path, { headers = {}, body, token } = {}) {
    const h = { "x-publishable-api-key": seed.publishable_key, ...headers }
    if (token) h.authorization = `Bearer ${token}`
    const r = await fetch(BASE + path, { method, headers: h, body })
    const text = await r.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text.slice(0, 200) }
    }
    return { status: r.status, json, headers: r.headers }
  }
  function form(buffer, filename, extra = {}) {
    const fd = new FormData()
    fd.append("file", new Blob([buffer], { type: "application/octet-stream" }), filename)
    for (const [k, v] of Object.entries(extra)) fd.append(k, v)
    return fd
  }
  const upload = (orderId, buffer, filename, opts = {}) =>
    raw("POST", `/store/manual-transfer/orders/${orderId}/proofs${opts.query ?? ""}`, {
      body: form(buffer, filename, opts.fields),
      token: opts.customerToken,
      headers: opts.uploadToken ? { "x-manual-transfer-token": opts.uploadToken } : {},
    })
  const status = (orderId, opts = {}) =>
    raw("GET", `/store/manual-transfer/orders/${orderId}${opts.query ?? ""}`, {
      token: opts.customerToken,
      headers: opts.uploadToken ? { "x-manual-transfer-token": opts.uploadToken } : {},
    })

  // --- a registered customer
  async function customer(email) {
    const reg = await raw("POST", "/auth/customer/emailpass/register", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-password" }),
    })
    await raw("POST", "/store/customers", {
      token: reg.json.token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, first_name: "Cust", last_name: "E2E" }),
    })
    const login = await raw("POST", "/auth/customer/emailpass", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-password" }),
    })
    return login.json.token
  }
  const stamp = Date.now()
  const custA = await customer(`a-${stamp}@e2e.test`)
  const custB = await customer(`b-${stamp}@e2e.test`)
  check("customers registered and logged in", !!custA && !!custB)

  const { cart: cartA } = await checkout({ customerToken: custA })
  const doneA = await raw("POST", `/store/carts/${cartA.id}/complete`, { token: custA })
  const orderA = doneA.json.order?.id
  check("customer order placed", !!orderA, doneA.json)

  const s1 = await status(orderA, { customerToken: custA })
  const mt = s1.json.manual_transfer
  check("customer sees instructions (status, reference, account, can_upload)", s1.status === 200 && mt?.status === "awaiting_payment" && /^TEST-/.test(mt?.reference) && !!mt?.account?.account_number && mt?.can_upload === true && Array.isArray(mt?.proofs), s1.json)
  check("store view hides internal data (no history/confirmation/sha)", !("history" in (mt ?? {})) && !JSON.stringify(mt).includes("sha256"), mt)
  const anon = await status(orderA)
  check("anonymous status request -> 404", anon.status === 404, anon.json)
  const other = await status(orderA, { customerToken: custB })
  check("another customer -> 404", other.status === 404, other.json)
  const otherUp = await upload(orderA, PNG, "x.png", { customerToken: custB })
  check("another customer cannot upload -> 404", otherUp.status === 404, otherUp.json)

  const upA = await upload(orderA, PNG, "../../bukti transfer.PNG", { customerToken: custA, fields: { note: "Transfer dari BCA" } })
  check("customer uploads PNG -> 201 pending", upA.status === 201 && upA.json.proof?.status === "pending" && upA.json.proof?.mime_type === "image/png", upA.json)
  check("filename cleaned", upA.json.proof?.filename === "bukti transfer.png", upA.json.proof)
  check("buyer response has no internal fields", upA.json.proof && !("sha256" in upA.json.proof) && !("file_id" in upA.json.proof), upA.json.proof)
  let { payment: pA } = await orderPayment(orderA)
  check("payment -> awaiting_verification", pA.data.status === "awaiting_verification", pA.data.status)
  const hUp = pA.data.history.at(-1)
  check("history proof_uploaded by customer", hUp?.event === "proof_uploaded" && hUp?.actor_type === "customer" && hUp?.note === "Transfer dari BCA" && hUp?.details?.proof_id === upA.json.proof.id, hUp)
  const again = await upload(orderA, JPG, "again.jpg", { customerToken: custA })
  check("second upload while awaiting verification refused", again.status === 400 && /already waiting/.test(again.json.message), again.json)

  // --- admin view, signed URL
  const adminView = await admin("GET", `/admin/manual-transfer/orders/${orderA}`)
  const proofA = adminView.json.proofs?.[0]
  check("admin sees the proof with hash", adminView.status === 200 && proofA?.id === upA.json.proof.id && proofA?.sha256?.length === 64, adminView.json)
  const noAuth = await fetch(`${BASE}/admin/manual-transfer/proofs/${proofA.id}/url`)
  check("signed URL endpoint needs admin auth", noAuth.status === 401, noAuth.status)
  const signed = await admin("GET", `/admin/manual-transfer/proofs/${proofA.id}/url`)
  check("admin gets a 5-minute signed URL", signed.status === 200 && /^\/manual-transfer\/proofs\/.+\/file\?expires=\d+&signature=/.test(signed.json.url) && Date.parse(signed.json.expires_at) - Date.now() <= 300_000, signed.json)
  const file = await fetch(BASE + signed.json.url)
  const fileBytes = Buffer.from(await file.arrayBuffer())
  check("signed URL serves the exact file", file.status === 200 && fileBytes.equals(PNG) && file.headers.get("content-type") === "image/png", { status: file.status, len: fileBytes.length })
  check("file served with nosniff, no-store and sandbox CSP", file.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(file.headers.get("cache-control")) && /sandbox/.test(file.headers.get("content-security-policy") ?? ""), Object.fromEntries(file.headers))
  const tampered = await fetch(BASE + signed.json.url.replace(/signature=./, "signature=A"))
  check("tampered signature -> 403", tampered.status === 403, tampered.status)
  const unsigned = await fetch(`${BASE}/manual-transfer/proofs/${proofA.id}/file`)
  check("unsigned file request -> 403", unsigned.status === 403, unsigned.status)
  const expired = await fetch(BASE + signed.json.url.replace(/expires=\d+/, `expires=${Math.floor(Date.now() / 1000) - 10}`))
  check("expired link -> 403", expired.status === 403, expired.status)
  const staticLeak = await fetch(`${BASE}/static/`)
  check("nothing of the proof under /static", ![200].includes(staticLeak.status) || !(await staticLeak.text()).includes("png"), staticLeak.status)

  // --- reject and upload again
  const noReason = await admin("POST", `/admin/manual-transfer/proofs/${proofA.id}/reject`, {})
  check("reject without reason -> 400", noReason.status === 400, noReason.json)
  const rej = await admin("POST", `/admin/manual-transfer/proofs/${proofA.id}/reject`, { reason: "Nominal tidak terbaca" })
  check("reject with reason -> 200", rej.status === 200 && rej.json.proof?.status === "rejected" && rej.json.proof?.rejection_reason === "Nominal tidak terbaca", rej.json)
  ;({ payment: pA } = await orderPayment(orderA))
  check("payment -> rejected, history proof_rejected by admin", pA.data.status === "rejected" && pA.data.history.at(-1)?.event === "proof_rejected" && pA.data.history.at(-1)?.actor_type === "user", pA.data.history.at(-1))
  const s2 = await status(orderA, { customerToken: custA })
  check("buyer sees the rejection reason and may upload again", s2.json.manual_transfer?.status === "rejected" && s2.json.manual_transfer?.can_upload === true && s2.json.manual_transfer?.proofs?.[0]?.rejection_reason === "Nominal tidak terbaca", s2.json)
  const rejAgain = await admin("POST", `/admin/manual-transfer/proofs/${proofA.id}/reject`, { reason: "again" })
  check("rejecting a reviewed proof refused", rejAgain.status === 400, rejAgain.json)
  const reup = await upload(orderA, JPG, "baru.jpg", { customerToken: custA })
  check("re-upload after rejection -> 201 (JPG)", reup.status === 201 && reup.json.proof?.mime_type === "image/jpeg", reup.json)

  // --- confirm accepts the pending proof, then no more uploads
  const { order: oA } = await orderPayment(orderA)
  const conf = await admin("POST", `/admin/manual-transfer/payments/${pA.id}/confirm`, { amount_received: Number(oA.total), received_at: "2026-10-26" })
  check("confirm with pending proof -> 200", conf.status === 200, conf.json)
  const afterConf = await admin("GET", `/admin/manual-transfer/orders/${orderA}`)
  const byId = Object.fromEntries(afterConf.json.proofs.map((p) => [p.id, p.status]))
  check("confirm accepted the pending proof, rejected one stays rejected", byId[reup.json.proof.id] === "accepted" && byId[proofA.id] === "rejected", byId)
  const late = await upload(orderA, PNG, "late.png", { customerToken: custA })
  check("upload after payment confirmed refused", late.status === 400, late.json)
  const s3 = await status(orderA, { customerToken: custA })
  check("buyer sees paid, can_upload false", s3.json.manual_transfer?.status === "paid" && s3.json.manual_transfer?.can_upload === false, s3.json.manual_transfer)

  // --- guest with the upload token
  const { cart: cartG } = await checkout()
  const notDone = await raw("GET", `/store/manual-transfer/carts/${cartG.id}/upload-token`)
  check("upload token not available before checkout completes", notDone.status === 404, notDone.json)
  const doneG = await store("POST", `/store/carts/${cartG.id}/complete`)
  const orderG = doneG.json.order?.id
  const tok = await raw("GET", `/store/manual-transfer/carts/${cartG.id}/upload-token`)
  const token = tok.json.token
  check("completed cart -> upload token", tok.status === 200 && tok.json.order_id === orderG && /^[A-Za-z0-9_-]{43}$/.test(token), tok.json)
  check("guest status without token -> 404", (await status(orderG)).status === 404)
  check("guest status with a wrong token -> 404", (await status(orderG, { uploadToken: token.slice(0, -2) + "AA" })).status === 404)
  check("token of one order does not open another", (await status(orderA, { uploadToken: token })).status === 404)
  const gs = await status(orderG, { query: `?token=${token}` })
  check("guest status with token (query) -> 200", gs.status === 200 && gs.json.manual_transfer?.can_upload === true, gs.json)
  const noTok = await upload(orderG, PDF, "a.pdf")
  check("guest upload without token -> 404", noTok.status === 404, noTok.json)
  const fake = await upload(orderG, FAKE_PNG, "bukti.png", { uploadToken: token })
  check("HTML renamed .png refused (magic bytes)", fake.status === 400 && /JPG, PNG or PDF/.test(fake.json.message), fake.json)
  const gif = await upload(orderG, GIF, "bukti.gif", { uploadToken: token })
  check("GIF refused", gif.status === 400, gif.json)
  const big = await upload(orderG, BIG_PNG, "big.png", { uploadToken: token })
  check("file over 5 MB -> 413", big.status === 413, big.json)
  const empty = await raw("POST", `/store/manual-transfer/orders/${orderG}/proofs`, { headers: { "x-manual-transfer-token": token } })
  check("no file -> 400", empty.status === 400, empty.json)
  const gpdf = await upload(orderG, PDF, "bukti.pdf", { uploadToken: token })
  check("guest uploads PDF with token -> 201", gpdf.status === 201 && gpdf.json.proof?.mime_type === "application/pdf", gpdf.json)
  const { payment: pG } = await orderPayment(orderG)
  check("history proof_uploaded by guest", pG.data.history.at(-1)?.actor_type === "guest", pG.data.history.at(-1))
  const gview = await admin("GET", `/admin/manual-transfer/orders/${orderG}`)
  const gsigned = await admin("GET", `/admin/manual-transfer/proofs/${gview.json.proofs[0].id}/url`)
  const gfile = await fetch(BASE + gsigned.json.url)
  check("PDF served as application/pdf", gfile.status === 200 && gfile.headers.get("content-type") === "application/pdf" && Buffer.from(await gfile.arrayBuffer()).equals(PDF), gfile.status)

  // --- the same file sent for another order is flagged
  const { cart: cartD } = await checkout()
  const doneD = await store("POST", `/store/carts/${cartD.id}/complete`)
  const orderD = doneD.json.order.id
  const tokD = (await raw("GET", `/store/manual-transfer/carts/${cartD.id}/upload-token`)).json.token
  const dupe = await upload(orderD, PNG, "same.png", { uploadToken: tokD })
  check("same file on another order accepted for review", dupe.status === 201, dupe.json)
  const dview = await admin("GET", `/admin/manual-transfer/orders/${orderD}`)
  check("duplicate flagged with the earlier order", dview.json.proofs?.[0]?.duplicate_of_order_id === orderA, dview.json.proofs?.[0])
  saveOrders({ proof: orderD })

  // --- per-order limit (5 per 24 h)
  const { cart: cartL } = await checkout()
  const doneL = await store("POST", `/store/carts/${cartL.id}/complete`)
  const orderL = doneL.json.order.id
  const tokL = (await raw("GET", `/store/manual-transfer/carts/${cartL.id}/upload-token`)).json.token
  const codes = []
  for (let i = 0; i < 6; i++) {
    const up = await upload(orderL, Buffer.concat([JPG, Buffer.from([i])]), `p${i}.jpg`, { uploadToken: tokL })
    codes.push(up.status)
    if (up.status === 201) {
      await admin("POST", `/admin/manual-transfer/proofs/${up.json.proof.id}/reject`, { reason: "tidak jelas" })
    }
    if (up.status === 429) check("per-order limit sends Retry-After", !!up.headers.get("retry-after"), Object.fromEntries(up.headers))
  }
  check("per-order limit: 5 uploads then 429", codes.join(",") === "201,201,201,201,201,429", codes)

  // --- canceled order takes no proof
  const { cart: cartC } = await checkout()
  const doneC = await store("POST", `/store/carts/${cartC.id}/complete`)
  const tokC = (await raw("GET", `/store/manual-transfer/carts/${cartC.id}/upload-token`)).json.token
  await admin("POST", `/admin/orders/${doneC.json.order.id}/cancel`, {})
  const canc = await upload(doneC.json.order.id, PNG.subarray(0, 500), "c.png", { uploadToken: tokC })
  check("canceled order refuses proofs", canc.status === 400, canc.json)

  // --- per-IP limit (40 per 15 min in the test app)
  let limited = null
  for (let i = 0; i < 50 && !limited; i++) {
    const r = await upload(orderG, GIF, "spam.gif", { uploadToken: token })
    if (r.status === 429) limited = r
  }
  check("per-IP upload limit -> 429 with Retry-After", !!limited && Number(limited.headers.get("retry-after")) > 0, limited?.json)
}
