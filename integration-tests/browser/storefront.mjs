// The example storefront in Chromium, against the storefront on 9410 and the
// test app (with the Admin) on 9400. Runs inside the Playwright container (see
// ../storefront.mjs).
//
// Usage: node storefront.mjs flow <outDir> <prefix> <emailDir>
//        node storefront.mjs settings-fallback <outDir> <prefix>
import { chromium } from "playwright-core"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const SHOP = "http://localhost:9410"
const ADMIN = "http://127.0.0.1:9400"
const [MODE, OUT, PREFIX = "", EMAIL_DIR] = process.argv.slice(2)
const STATE = path.resolve(new URL("../.state/", import.meta.url).pathname)
const BUYER = { first: "José", last: "Müller-Ñúñez", email: `jose-${Date.now()}@e2e.test` }

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let passed = 0
let failed = 0
/** Uncaught errors and console errors of the storefront pages */
const errors = []

function check(name, ok, detail) {
  if (ok) passed++
  else failed++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 400)}`}`)
}

async function shot(page, name, opts = {}) {
  // Full-page shots start at the top, under the starter's sticky header
  if (opts.fullPage) await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  const file = `${OUT}/${PREFIX}${name}.png`
  await page.screenshot({ path: file, ...opts })
  console.log("shot", file)
}

const text = async (page, testId) => (await page.getByTestId(testId).first().innerText()).trim()

async function adminSession(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`${ADMIN}/app/login`)
  await page.fill('input[name="email"]', "admin@e2e.test")
  await page.fill('input[name="password"]', "e2e-password")
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 })
  return { context, page }
}

/** E-mails the email-preview provider wrote for one template and recipient */
function emails(template, to) {
  if (!fs.existsSync(EMAIL_DIR)) return []
  return fs
    .readdirSync(EMAIL_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: path.join(EMAIL_DIR, f), ...JSON.parse(fs.readFileSync(path.join(EMAIL_DIR, f), "utf8")) }))
    .filter((e) => e.template === `manual-transfer.${template}` && e.to === to)
}

async function waitEmail(template, to, ms = 30000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const found = emails(template, to)
    if (found.length) return found.at(-1)
    await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}

async function emailShot(context, email, name) {
  const page = await context.newPage()
  await page.setViewportSize({ width: 680, height: 900 })
  await page.goto(`file://${email.file.replace(/\.json$/, ".html")}`)
  await shot(page, name, { fullPage: true })
  await page.close()
}

/**
 * Renders page 1 of a PDF with pdf.js (loaded from node_modules, no network)
 * into a canvas and returns its text, the way a viewer copies it
 */
async function renderPdf(context, bytes, name) {
  const page = await context.newPage()
  await page.setViewportSize({ width: 900, height: 1200 })
  await page.setContent('<body style="margin:0;background:#888"><canvas id="pdf"></canvas></body>')
  await page.addScriptTag({ path: require.resolve("pdfjs-dist/legacy/build/pdf.min.js") })
  // The worker in the page itself: pdf.js then needs no Worker or URL to fetch
  await page.addScriptTag({ path: require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.js") })
  const result = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const pdf = await window.pdfjsLib.getDocument({ data }).promise
    const first = await pdf.getPage(1)
    const viewport = first.getViewport({ scale: 1.5 })
    const canvas = document.getElementById("pdf")
    canvas.width = viewport.width
    canvas.height = viewport.height
    await first.render({ canvasContext: canvas.getContext("2d"), viewport }).promise
    const content = await first.getTextContent()
    return { pages: pdf.numPages, text: content.items.map((item) => item.str).join("\n") }
  }, Buffer.from(bytes).toString("base64"))
  await page.locator("#pdf").screenshot({ path: `${OUT}/${PREFIX}${name}.png` })
  console.log("shot", `${OUT}/${PREFIX}${name}.png`)
  await page.close()
  return result
}

async function flow() {
  const { customer, publishable_key } = JSON.parse(fs.readFileSync(path.join(STATE, "storefront.json"), "utf8"))
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: SHOP })
  const page = await context.newPage()
  page.on("pageerror", (e) => errors.push(String(e.stack ?? e)))

  // --- checkout as a guest
  await page.goto(`${SHOP}/us/products/teak-bench`)
  const add = page.getByTestId("add-product-button")
  await add.waitFor({ timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="add-product-button"]')?.disabled, null, { timeout: 30000 })
  await add.click()
  await page.getByTestId("nav-cart-link").filter({ hasText: "Cart (1)" }).first().waitFor({ timeout: 30000 })
  await page.goto(`${SHOP}/us/checkout?step=address`)
  await page.getByTestId("shipping-first-name-input").fill(BUYER.first)
  await page.getByTestId("shipping-last-name-input").fill(BUYER.last)
  await page.getByTestId("shipping-address-input").fill("Calle Señor 5")
  await page.getByTestId("shipping-postal-code-input").fill("78701")
  await page.getByTestId("shipping-city-input").fill("Austin")
  await page.getByTestId("shipping-country-select").selectOption("us")
  await page.getByTestId("shipping-province-input").fill("TX")
  await page.getByTestId("shipping-email-input").fill(BUYER.email)
  await page.getByTestId("submit-address-button").click()
  await page.getByTestId("delivery-option-radio").first().waitFor({ timeout: 30000 })
  await page.getByTestId("delivery-option-radio").first().click()
  await page.getByTestId("submit-delivery-option-button").click()
  const method = page.getByText("Bank transfer", { exact: true }).first()
  await method.waitFor({ timeout: 30000 })
  check("checkout lists the payment method as \"Bank transfer\"", await method.isVisible())
  await method.click()
  await shot(page, "01-checkout-payment")
  await page.getByTestId("submit-payment-button").click()
  await page.getByTestId("submit-order-button").waitFor({ timeout: 30000 })
  await shot(page, "02-checkout-review")
  await page.getByTestId("submit-order-button").click()
  await page.waitForURL(/\/us\/transfer\/order_[^?]+\?token=/, { timeout: 60000 })
  const url = new URL(page.url())
  const orderId = url.pathname.split("/").at(-1)
  const token = url.searchParams.get("token")
  check("placing the order leads to the payment page with the guest token", /^order_/.test(orderId) && /^[A-Za-z0-9_-]{40,}$/.test(token ?? ""), page.url())

  // --- instructions
  await page.getByTestId("transfer-page").waitFor()
  const reference = await text(page, "transfer-reference")
  check("status: awaiting payment", (await text(page, "transfer-status")) === "Awaiting payment")
  check("exact amount (600.25 + 50 shipping)", (await text(page, "transfer-amount")) === "$650.25", await text(page, "transfer-amount"))
  check("reference shown", /^TEST-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(reference), reference)
  // The account the provider copied into this order, as the Store API gives it
  const api = await (
    await page.request.get(`${ADMIN}/store/manual-transfer/orders/${orderId}`, {
      headers: { "x-publishable-api-key": publishable_key, "x-manual-transfer-token": token },
    })
  ).json()
  const account = api.manual_transfer?.account ?? {}
  check(
    "account details shown as copied into the order",
    !!account.account_number &&
      (await text(page, "transfer-account-number")) === account.account_number &&
      (await text(page, "transfer-bank")) === account.bank_name &&
      (await text(page, "transfer-holder")) === account.account_holder &&
      (!account.swift_code || (await text(page, "transfer-swift")) === account.swift_code),
    account
  )
  check("OUR fee note", (await text(page, "transfer-fees-note")).includes("OUR"))
  await page.waitForTimeout(1200)
  check("countdown runs", /^\d+d \d\dh \d\dm \d\ds$/.test(await text(page, "transfer-countdown")), await text(page, "transfer-countdown"))
  check("deadline in the viewer's time zone", /\d{4}/.test(await text(page, "transfer-deadline")))
  await page.getByTestId("transfer-reference-copy").click()
  check("copy button copies the reference", (await page.evaluate(() => navigator.clipboard.readText())) === reference)
  check("copy button says it copied", (await text(page, "transfer-reference-copy")) === "Copied")
  await page.getByTestId("transfer-amount-copy").click()
  check("amount copies as plain digits", (await page.evaluate(() => navigator.clipboard.readText())) === "650.25")
  check("no Haus Kayu credit on the buyer's page", !/haus\s*kayu|hauskayu/i.test(await page.content()))
  await page.mouse.move(0, 0)
  await page.waitForTimeout(2200)
  await shot(page, "03-instructions", { fullPage: true })

  // --- the pro-forma invoice through the storefront, with the accented name intact
  const invoiceHref = await page.getByTestId("transfer-invoice-link").getAttribute("href")
  const invoice = await page.request.get(`${SHOP}${invoiceHref}`)
  const pdfBytes = await invoice.body()
  check("invoice downloads as PDF", invoice.status() === 200 && invoice.headers()["content-type"] === "application/pdf" && pdfBytes.subarray(0, 5).toString() === "%PDF-")
  fs.writeFileSync(path.join(STATE, "storefront-invoice.pdf"), pdfBytes)
  const rendered = await renderPdf(context, pdfBytes, "04-invoice")
  check("invoice text keeps \"José Müller-Ñúñez\"", rendered.text.includes("José Müller-Ñúñez"), rendered.text.slice(0, 300))
  check("invoice text keeps \"Calle Señor 5\" and the reference", rendered.text.includes("Calle Señor 5") && rendered.text.includes(reference))
  check("invoice subtotal lists the items only, shipping apart", /Subtotal\s+\$600\.25\s+Shipping\s+\$50\.00\s+Total\s+\$650\.25/.test(rendered.text), rendered.text)
  check("invoice carries no Haus Kayu credit", !/haus\s*kayu|hauskayu/i.test(rendered.text))

  // --- mobile and Indonesian
  {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
    const m = await mobile.newPage()
    await m.goto(`${SHOP}/us/transfer/${orderId}?token=${token}`)
    await m.getByTestId("transfer-page").waitFor()
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check("no horizontal scroll at 390 px", overflow <= 0, overflow)
    await m.waitForTimeout(1200)
    await shot(m, "05-instructions-mobile", { fullPage: true })
    await m.goto(`${SHOP}/us/transfer/${orderId}?token=${token}&lang=id`)
    await m.getByTestId("transfer-page").waitFor()
    check("Indonesian texts (?lang=id)", (await text(m, "transfer-status")) === "Menunggu pembayaran" && (await m.getByText("Bayar dengan transfer bank").count()) > 0)
    check("Indonesian amount format", (await text(m, "transfer-amount")).includes("650,25"), await text(m, "transfer-amount"))
    await m.waitForTimeout(1200)
    await shot(m, "06-instructions-id-mobile", { fullPage: true })
    await mobile.close()
  }

  // --- proof upload
  await page.getByTestId("proof-file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a proof") })
  await page.getByTestId("proof-upload-button").click()
  check("a text file is refused in the browser", (await text(page, "proof-upload-error")) === "Choose a JPG, PNG or PDF file.")
  const proof = await page.screenshot({ type: "png" })
  await page.getByTestId("proof-file-input").setInputFiles({ name: "bukti-transfer.png", mimeType: "image/png", buffer: proof })
  await page.getByTestId("proof-note-input").fill("Sent from Chase, fee option OUR")
  await page.getByTestId("proof-upload-button").click()
  await page.getByTestId("proof-uploaded").waitFor({ timeout: 30000 })
  await page.reload()
  await page.getByTestId("transfer-page").waitFor()
  check("after the upload: checking your payment", (await text(page, "transfer-status")) === "Checking your payment")
  check("the proof is listed as being checked", (await text(page, "transfer-proof-status")).startsWith("Being checked"))
  check("no upload form while the proof is checked", (await page.getByTestId("proof-upload-form").count()) === 0)
  await shot(page, "07-proof-uploaded", { fullPage: true })

  // --- the link in the order e-mail works on its own (guest, no cookies)
  const placed = await waitEmail("order_placed", BUYER.email)
  check("order e-mail sent to the buyer", !!placed)
  const link = placed?.data?.payment_url ?? ""
  check("order e-mail links to the storefront page", link.startsWith(`${SHOP}/transfer/${orderId}?token=`), link)
  {
    const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const g = await guest.newPage()
    await g.goto(link)
    await g.getByTestId("transfer-page").waitFor({ timeout: 30000 })
    check("e-mail link opens the page (country code added by the starter)", new URL(g.url()).pathname === `/us/transfer/${orderId}` && (await text(g, "transfer-order-number")).includes(reference))
    await g.goto(`${SHOP}/us/transfer/${orderId}`)
    check("without the token: not found", (await g.getByTestId("transfer-not-found").count()) === 1)
    await g.goto(`${SHOP}/us/transfer/${orderId}?token=${"0".repeat(token.length)}`)
    check("with a wrong token: not found", (await g.getByTestId("transfer-not-found").count()) === 1)
    await shot(g, "08-not-found")
    await guest.close()
  }
  if (placed) await emailShot(context, placed, "09-email-order-placed")

  // --- the admin confirms in the Admin
  {
    const { context: adminContext, page: a } = await adminSession()
    await a.goto(`${ADMIN}/app/orders/${orderId}`)
    await a.getByRole("button", { name: "Confirm paid" }).waitFor({ timeout: 30000 })
    await a.getByRole("button", { name: "Confirm paid" }).click()
    await a.getByText("Confirm payment", { exact: true }).waitFor()
    await a.fill("#mt-confirm-ref", "FT26102700777")
    await shot(a, "10-admin-confirm")
    await a.getByRole("dialog").getByRole("button", { name: "Confirm paid" }).click()
    await a.getByText("Payment confirmed").first().waitFor({ timeout: 30000 })
    check("admin confirmed the payment in the Admin", true)
    await adminContext.close()
  }

  // --- paid, on the page and by e-mail
  await page.reload()
  await page.getByTestId("transfer-page").waitFor()
  check("storefront page: paid", (await text(page, "transfer-status")) === "Paid")
  check("no instructions or upload once paid", (await page.getByTestId("transfer-amount").count()) === 0 && (await page.getByTestId("proof-upload-form").count()) === 0)
  check("the proof shows as accepted", (await text(page, "transfer-proof-status")).startsWith("Accepted"))
  await shot(page, "11-paid", { fullPage: true })
  const paid = await waitEmail("payment_confirmed", BUYER.email)
  check("\"paid\" e-mail sent to the buyer", !!paid, paid?.subject)
  check("\"paid\" e-mail names the order and the store only", !!paid && /#\d+/.test(paid.subject) && !/haus\s*kayu|hauskayu/i.test(fs.readFileSync(paid.file.replace(/\.json$/, ".html"), "utf8")))
  if (paid) await emailShot(context, paid, "12-email-paid")

  // --- a logged-in customer: the order page links to the instructions, no token needed
  {
    const custContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await custContext.addCookies([{ name: "_medusa_jwt", value: customer.token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Strict" }])
    const c = await custContext.newPage()
    await c.goto(`${SHOP}/us/account/orders/details/${customer.order_id}`)
    await c.getByTestId("order-transfer-link").waitFor({ timeout: 30000 })
    await shot(c, "13-account-order")
    check("account order page: no \"paid at\" for a transfer", !(await c.getByTestId("order-details-container").innerText()).includes("paid at"))
    await c.getByTestId("order-transfer-link").click()
    await c.waitForURL(new RegExp(`/us/transfer/${customer.order_id}$`), { timeout: 30000 })
    await c.getByTestId("transfer-page").waitFor()
    check("logged-in customer sees the instructions without a token", (await text(c, "transfer-status")) === "Awaiting payment")
    await custContext.close()
  }

  // --- the Admin settings: who receives the admin e-mails
  {
    const { context: adminContext, page: a } = await adminSession()
    await a.goto(`${ADMIN}/app/settings/manual-transfer`)
    const recipients = a.getByTestId("mt-admin-recipients")
    await recipients.waitFor({ timeout: 30000 })
    check("settings: admin recipients from notifications.adminEmails", (await recipients.innerText()).includes("ops@e2e.test") && (await a.getByText("From notifications.adminEmails.").count()) === 1)
    check("settings: payment link points at the storefront", (await a.getByText(`${SHOP}/transfer/{order_id}?token={token}`).count()) === 1)
    await a.getByText("E-mail notifications", { exact: true }).scrollIntoViewIfNeeded()
    await shot(a, "14-admin-settings-notifications", { fullPage: true })
    await adminContext.close()
  }

  check("no page errors on the storefront", errors.length === 0, errors)
  await context.close()
}

async function settingsFallback() {
  const { context, page } = await adminSession()
  await page.goto(`${ADMIN}/app/settings/manual-transfer`)
  const recipients = page.getByTestId("mt-admin-recipients")
  await recipients.waitFor({ timeout: 30000 })
  check("settings without adminEmails: every Admin user is listed", (await recipients.innerText()).includes("admin@e2e.test"))
  check("settings without adminEmails: says so and recommends the option", (await page.getByText(/notifications\.adminEmails is not set, so every Admin user \(\d+\) receives the admin e-mails/).count()) === 1)
  await page.getByText("E-mail notifications", { exact: true }).scrollIntoViewIfNeeded()
  await shot(page, "15-admin-settings-notifications-fallback", { fullPage: true })
  await context.close()
}

try {
  if (MODE === "flow") await flow()
  else if (MODE === "settings-fallback") await settingsFallback()
  else throw new Error(`unknown mode ${MODE}`)
} catch (error) {
  failed++
  console.log(`FAIL  ${MODE}: ${error.message}`)
  for (const e of errors) console.log(`      page error: ${e.slice(0, 1500)}`)
  // Whatever was on screen, for the post-mortem
  let n = 0
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const file = `${OUT}/${PREFIX}failure-${++n}.png`
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
      console.log(`      ${page.url()} -> ${file}`)
    }
  }
}
await browser.close()
console.log(`storefront ${MODE}: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
