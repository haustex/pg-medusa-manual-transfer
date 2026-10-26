// Phase 1: bank accounts, the provider, references, deadline, confirmation, cancel.

const REF = /^TEST-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/

export async function phase1(ctx) {
  const { seed, check, admin, store, checkout, orderPayment, reservedQuantity, psql, saveOrders } = ctx

  // Clean slate for accounts
  const { json: existing } = await admin("GET", "/admin/manual-transfer/accounts")
  for (const a of existing.accounts ?? []) await admin("DELETE", `/admin/manual-transfer/accounts/${a.id}`)

  // --- accounts API
  const created = await admin("POST", "/admin/manual-transfer/accounts", {
    label: "USD pocket",
    bank_name: "Test Bank",
    account_holder: "PT Contoh Jati",
    account_number: "0000111122",
    swift_code: "testidja",
    bank_address: "Jakarta",
    currency_code: "USD",
  })
  const account = created.json.account
  check("create account (SWIFT/currency normalised)", created.status === 201 && account.swift_code === "TESTIDJA" && account.currency_code === "usd", created.json)
  const badSwift = await admin("POST", "/admin/manual-transfer/accounts", { bank_name: "X", account_holder: "X", account_number: "1", currency_code: "usd", swift_code: "BAD" })
  check("invalid SWIFT rejected", badSwift.status === 400, badSwift.json)
  const got = await admin("GET", `/admin/manual-transfer/accounts/${account.id}`)
  check("GET account by id", got.status === 200 && got.json.account.id === account.id, got.json)
  const missing = await admin("GET", "/admin/manual-transfer/accounts/mtacc_missing")
  check("GET unknown account -> 404", missing.status === 404, missing.json)

  // --- checkout
  const reservedBefore = await reservedQuantity()
  const { cart, session } = await checkout({
    sessionData: { status: "paid", confirmation: { amount_received: 1 }, region_id: "reg_forged", expires_at: "2099-01-01" },
  })
  const ps = session.json.payment_collection?.payment_sessions?.[0]
  check("payment session created", session.status === 200 && !!ps, session.json)
  check("session has reference + account snapshot", REF.test(ps?.data?.reference) && ps?.data?.account?.account_number === "0000111122" && !("label" in (ps?.data?.account ?? {})), ps?.data)
  check("session region comes from the cart, not the storefront", ps?.data?.region_id === seed.region_id, ps?.data)

  const refRow = psql(`select payment_session_id from manual_transfer_reference where code = '${ps?.data?.reference}'`)
  check("reference reserved in manual_transfer_reference", refRow.ok && refRow.out === ps?.id, refRow)
  const dup = psql(`insert into manual_transfer_reference (id, code) values ('mtref_dup_${Date.now()}', '${ps?.data?.reference}')`)
  check("DB refuses a duplicate reference (unique index)", !dup.ok && /duplicate key|unique/i.test(dup.out), dup)
  const dupDeleted = psql(`insert into manual_transfer_reference (id, code, deleted_at) values ('mtref_dupd_${Date.now()}', '${ps?.data?.reference}', now())`)
  check("DB refuses a duplicate even as a soft-deleted row", !dupDeleted.ok, dupDeleted)

  const done = await store("POST", `/store/carts/${cart.id}/complete`)
  const orderId = done.json.order?.id
  check("cart completes into an order", done.json.type === "order" && !!orderId, done.json)
  let { order, payment } = await orderPayment(orderId)
  check("order payment_status authorized (awaiting payment)", order?.payment_status === "authorized", order)
  check("payment data: awaiting_payment, reference, deadline", payment?.data?.status === "awaiting_payment" && REF.test(payment?.data?.reference) && payment?.data?.reference === ps?.data?.reference && !!payment?.data?.expires_at, payment?.data)
  check("forged session keys dropped", !payment?.data?.confirmation && payment?.data?.expires_at !== "2099-01-01", payment?.data)
  const days = (Date.parse(payment?.data?.expires_at) - Date.parse(payment?.data?.authorized_at)) / 864e5
  check("deadline is 3 business days (3-5 calendar days)", days >= 3 && days <= 5, { days })
  const reservedAfter = await reservedQuantity()
  check("stock reserved (+2)", reservedAfter - reservedBefore === 2, { reservedBefore, reservedAfter })

  // --- Medusa's own capture is refused
  const nativeCapture = await admin("POST", `/admin/payments/${payment.id}/capture`, {})
  check("native admin capture refused", nativeCapture.status >= 400 && /only by confirming/.test(JSON.stringify(nativeCapture.json)), nativeCapture.json)
  ;({ order, payment } = await orderPayment(orderId))
  check("still not captured after refused capture", order.payment_status === "authorized" && !payment.captured_at && (payment.captures ?? []).length === 0, { ps: order.payment_status, captures: payment.captures })

  // --- edit account after the order: order instructions unchanged
  await admin("POST", `/admin/manual-transfer/accounts/${account.id}`, { account_number: "9999888877" })
  ;({ payment } = await orderPayment(orderId))
  check("account edit does not change existing order", payment.data.account.account_number === "0000111122", payment.data.account)

  // --- confirmation
  const total = Number(order.total)
  const short = await admin("POST", `/admin/manual-transfer/payments/${payment.id}/confirm`, { amount_received: total - 1, received_at: "2026-10-26" })
  check("confirm below amount due refused", short.status === 400 && /less than/.test(short.json.message), short.json)
  const badDate = await admin("POST", `/admin/manual-transfer/payments/${payment.id}/confirm`, { amount_received: total, received_at: "26/10/2026" })
  check("confirm with bad date refused", badDate.status === 400, badDate.json)
  ;({ payment } = await orderPayment(orderId))
  check("failed confirmations leave data untouched", payment.data.status === "awaiting_payment" && !payment.data.confirmation, payment.data)

  const ok = await admin("POST", `/admin/manual-transfer/payments/${payment.id}/confirm`, { amount_received: total, received_at: "2026-10-26", bank_reference: "FT123", note: "seen in statement" })
  check("confirm full amount -> 200", ok.status === 200, ok.json)
  ;({ order, payment } = await orderPayment(orderId))
  check("order captured", order.payment_status === "captured" && !!payment.captured_at, { ps: order.payment_status, captured_at: payment.captured_at })
  check("payment data paid with confirmation", payment.data.status === "paid" && payment.data.confirmation?.bank_reference === "FT123" && payment.data.confirmation?.confirmed_by?.startsWith("user_"), payment.data)
  const again = await admin("POST", `/admin/manual-transfer/payments/${payment.id}/confirm`, { amount_received: total, received_at: "2026-10-26" })
  check("second confirm refused", again.status === 400 || again.status === 409 || again.status === 403, again.json)

  // --- shortfall accepted
  {
    const { cart: c2 } = await checkout()
    const d2 = await store("POST", `/store/carts/${c2.id}/complete`)
    const { order: o2, payment: p2 } = await orderPayment(d2.json.order.id)
    check("second order uses edited account number", p2.data.account.account_number === "9999888877", p2.data.account)
    const acc = await admin("POST", `/admin/manual-transfer/payments/${p2.id}/confirm`, { amount_received: Number(o2.total) - 5, received_at: "2026-10-26", accept_shortfall: true })
    check("shortfall confirm with accept_shortfall -> captured", acc.status === 200, acc.json)
  }

  // --- cancel releases stock
  {
    const { cart: c3 } = await checkout()
    const d3 = await store("POST", `/store/carts/${c3.id}/complete`)
    const id3 = d3.json.order.id
    const before = await reservedQuantity()
    const cancel = await admin("POST", `/admin/orders/${id3}/cancel`, {})
    check("cancel unpaid order -> 200", cancel.status === 200, cancel.json)
    const { payment: p3 } = await orderPayment(id3)
    check("payment data canceled", p3.data.status === "canceled" && !!p3.canceled_at, { data: p3.data, canceled_at: p3.canceled_at })
    const after = await reservedQuantity()
    check("cancel releases reserved stock (-2)", before - after === 2, { before, after })
    const conf = await admin("POST", `/admin/manual-transfer/payments/${p3.id}/confirm`, { amount_received: 9999, received_at: "2026-10-26" })
    check("canceled payment cannot be confirmed", conf.status >= 400, conf.json)
    saveOrders({ canceled: id3 })
  }

  // --- account deactivated between checkout and placing the order
  {
    const { json: accs } = await admin("GET", "/admin/manual-transfer/accounts")
    const current = accs.accounts.find((a) => a.is_active && a.currency_code === "usd")
    const backup = await admin("POST", "/admin/manual-transfer/accounts", {
      bank_name: "Backup Bank", account_holder: "PT Contoh Jati", account_number: "5555666677", currency_code: "usd", rank: 5,
    })
    const { cart: c4, session: s4 } = await checkout()
    const chosen = s4.json.payment_collection?.payment_sessions?.[0]?.data?.account
    check("checkout picks the first account", chosen?.id === current.id, chosen)
    await admin("POST", `/admin/manual-transfer/accounts/${current.id}`, { is_active: false })
    const d4 = await store("POST", `/store/carts/${c4.id}/complete`)
    const id4 = d4.json.order?.id
    const { payment: p4 } = await orderPayment(id4)
    check("order falls back to the backup account", p4?.data?.account?.id === backup.json.account.id, p4?.data?.account)
    const sub = (p4?.data?.history ?? []).find((h) => h.event === "account_substituted")
    check("substitution recorded in payment history", sub?.details?.from?.id === current.id && sub?.details?.to?.id === backup.json.account.id && sub?.details?.reason === "inactive_or_deleted", p4?.data?.history)
    const view = await admin("GET", `/admin/manual-transfer/orders/${id4}`)
    check("admin order endpoint returns the history", view.status === 200 && view.json.payment.data.history.some((h) => h.event === "account_substituted"), view.json)
    saveOrders({ substituted: id4 })
    await admin("POST", `/admin/manual-transfer/accounts/${current.id}`, { is_active: true })
    await admin("DELETE", `/admin/manual-transfer/accounts/${backup.json.account.id}`)
  }
  {
    const plain = await admin("GET", `/admin/manual-transfer/orders/${orderId}`)
    check("admin order endpoint: history authorized -> confirmed", plain.status === 200 && plain.json.payment.data.history.map((h) => h.event).join(",") === "authorized,confirmed", plain.json.payment?.data?.history)
  }

  // --- region-bound account and deactivation
  {
    const eu = await admin("POST", "/admin/manual-transfer/accounts", {
      bank_name: "Euro Bank", account_holder: "PT Contoh Jati", account_number: "DE00", currency_code: "eur", region_ids: [seed.region_eu_id],
    })
    const { session: s } = await checkout({ regionId: seed.region_eu_id, country: "de" })
    const sd = s.json.payment_collection?.payment_sessions?.[0]?.data
    check("EUR cart gets the EU account", sd?.account?.id === eu.json.account.id, s.json)
    await admin("POST", `/admin/manual-transfer/accounts/${eu.json.account.id}`, { is_active: false })
    const { session: s2 } = await checkout({ regionId: seed.region_eu_id, country: "de" })
    check("no active EUR account -> session refused", s2.status >= 400 && /No active bank account/.test(JSON.stringify(s2.json)), s2.json)
    const del = await admin("DELETE", `/admin/manual-transfer/accounts/${eu.json.account.id}`)
    const { json: list } = await admin("GET", "/admin/manual-transfer/accounts")
    check("delete account hides it from the list", del.status === 200 && !list.accounts.some((a) => a.id === eu.json.account.id), del.json)
  }
}
