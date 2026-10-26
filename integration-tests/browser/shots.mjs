// Screenshots of the plugin's Admin pages on the test app (port 9400 only).
// Runs inside the Playwright container (see ../ui.mjs).
// Usage: node shots.mjs <outDir> [prefix]
import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

const BASE = "http://127.0.0.1:9400"
const OUT = process.argv[2]
const PREFIX = process.argv[3] ?? ""
const STATE = path.resolve(new URL("../.state/", import.meta.url).pathname)
const ORDERS = JSON.parse(fs.readFileSync(path.join(STATE, "orders.json"), "utf8"))
const ORDER = ORDERS.substituted
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
})
const consoleErrors = []

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(800)
  const file = `${OUT}/${PREFIX}${name}.png`
  await page.screenshot({ path: file, ...opts })
  console.log("shot", file)
}

async function widgetShot(page, title, name) {
  const box = page.locator("div.shadow-elevation-card-rest", { has: page.getByRole("heading", { name: title, exact: true }) }).last()
  await box.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const file = `${OUT}/${PREFIX}${name}.png`
  await box.screenshot({ path: file })
  console.log("shot", file)
}

async function session(viewport, lng) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  if (lng) {
    await context.addInitScript((l) => window.localStorage.setItem("lng", l), lng)
  }
  const page = await context.newPage()
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()))
  page.on("pageerror", (e) => consoleErrors.push(String(e)))
  page.on("response", (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`))
  await page.goto(`${BASE}/app/login`)
  await page.fill('input[name="email"]', "admin@e2e.test")
  await page.fill('input[name="password"]', "e2e-password")
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 })
  return { context, page }
}

{
  const { context, page } = await session({ width: 1440, height: 900 })
  await page.goto(`${BASE}/app/settings/manual-transfer`)
  await page.getByText("Bank accounts", { exact: true }).waitFor({ timeout: 30000 })
  await shot(page, "01-settings")

  await page.getByRole("button", { name: "Add account" }).click()
  await page.getByText("Add bank account").waitFor()
  await page.fill("#mt-bank-name", "Bank Jago")
  await page.fill("#mt-label", "USD pocket")
  await page.fill("#mt-holder", "PT Contoh Jati")
  await page.fill("#mt-swift", "jagbidja")
  await shot(page, "02-create-modal")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)

  // The row menu of the last bank account (the first card on the page)
  await page.locator("div.shadow-elevation-card-rest").first().locator("button:has(svg)").filter({ hasText: /^$/ }).last().click().catch(() => {})
  const editItem = page.getByRole("menuitem", { name: "Edit" })
  if (await editItem.count()) {
    await editItem.first().click()
    await page.getByText("Edit bank account").waitFor()
    await shot(page, "03-edit-drawer")
    await page.keyboard.press("Escape")
  } else {
    console.log("no edit menu found")
  }

  await page.goto(`${BASE}/app/orders/${ORDER}`)
  await page.getByText("Manual transfer", { exact: true }).first().waitFor({ timeout: 30000 })
  await shot(page, "04-order-page")
  await widgetShot(page, "Manual transfer", "04b-order-widget")
  await context.close()
}

{
  const { context, page } = await session({ width: 390, height: 844 })
  await page.goto(`${BASE}/app/settings/manual-transfer`)
  await page.getByText("Bank accounts", { exact: true }).waitFor({ timeout: 30000 })
  await shot(page, "05-settings-mobile", { fullPage: true })
  await context.close()
}

{
  const { context, page } = await session({ width: 1440, height: 900 }, "id")
  await page.goto(`${BASE}/app/settings/manual-transfer`)
  await page.getByText("Rekening bank", { exact: true }).waitFor({ timeout: 30000 })
  await shot(page, "06-settings-id")
  await page.goto(`${BASE}/app/orders/${ORDER}`)
  await page.getByText("Transfer manual", { exact: true }).first().waitFor({ timeout: 30000 })
  await widgetShot(page, "Transfer manual", "07-order-widget-id")
  await context.close()
}

{
  const PROOF_ORDER = ORDERS.proof
  const { context, page } = await session({ width: 1440, height: 900 })
  await page.goto(`${BASE}/app/orders/${PROOF_ORDER}`)
  await page.getByText("Payment proofs", { exact: true }).waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "08-order-widget-proofs")
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "View" }).first().click(),
  ])
  await popup.waitForURL(/\/manual-transfer\/proofs\/.+\/file\?expires=/, { timeout: 15000 })
  console.log("view opened " + new URL(popup.url()).pathname)
  await context.close()
}

// --- phase 3: verification queue, actions, footer
{
  const P3 = ORDERS
  const { context, page } = await session({ width: 1440, height: 900 })
  await page.goto(`${BASE}/app/manual-transfer`)
  await page.getByText("Needs verification").first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot(page, "09-queue-needs-verification", { fullPage: true })
  await page.getByRole("tab", { name: /All/ }).click()
  await page.waitForTimeout(1500)
  await shot(page, "10-queue-all", { fullPage: true })
  await page.getByRole("tab", { name: /Expired/ }).click()
  await page.waitForTimeout(1500)
  await shot(page, "11-queue-expired")

  await page.goto(`${BASE}/app/orders/${P3.verify}`)
  await page.getByRole("button", { name: "Confirm paid" }).waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "12-widget-awaiting-verification")
  await shot(page, "12b-order-page-awaiting-verification")

  await page.getByRole("button", { name: "Confirm paid" }).click()
  await page.getByText("Confirm payment", { exact: true }).waitFor()
  await shot(page, "13-confirm-drawer")
  const amount = page.locator("#mt-confirm-amount")
  const full = Number(await amount.inputValue())
  await amount.fill(String(full - 25))
  await page.fill("#mt-confirm-ref", "FT26102600123")
  await shot(page, "13b-confirm-drawer-shortfall")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)

  await page.getByRole("button", { name: "Underpaid" }).click()
  await page.getByText("Record an underpayment", { exact: true }).waitFor()
  await page.fill("#mt-under-amount", String(full - 100))
  await page.fill("#mt-under-ref", "FT26102600456")
  await shot(page, "14-underpaid-drawer")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)

  await page.getByRole("button", { name: "Reject" }).first().click()
  await page.getByText("Reject payment proof", { exact: true }).waitFor()
  await page.fill("#mt-reject-reason", "The amount on the proof is not readable")
  await shot(page, "15-reject-drawer")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)

  await page.goto(`${BASE}/app/orders/${P3.underpaid}`)
  await page.getByText("Still to pay").first().waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "16-widget-underpaid")

  await page.goto(`${BASE}/app/orders/${P3.paid}`)
  await page.getByText("Payment confirmed").first().waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "17-widget-paid-history")

  await page.goto(`${BASE}/app/orders/${P3.expired}`)
  await page.getByText("Deadline passed, order canceled").first().waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "18-widget-expired")
  await context.close()
}

{
  const P3 = ORDERS
  const { context, page } = await session({ width: 1440, height: 900 }, "id")
  await page.goto(`${BASE}/app/manual-transfer`)
  await page.getByText("Perlu verifikasi").first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot(page, "19-queue-id", { fullPage: true })
  await page.goto(`${BASE}/app/orders/${P3.verify}`)
  await page.getByRole("button", { name: "Konfirmasi lunas" }).waitFor({ timeout: 30000 })
  await widgetShot(page, "Transfer manual", "20-widget-id-actions")
  await page.getByRole("button", { name: "Konfirmasi lunas" }).click()
  await page.getByText("Konfirmasi pembayaran", { exact: true }).waitFor()
  const amount = page.locator("#mt-confirm-amount")
  await amount.fill(String(Number(await amount.inputValue()) - 25))
  await shot(page, "21-confirm-drawer-id-shortfall")
  await page.keyboard.press("Escape")
  await page.goto(`${BASE}/app/orders/${P3.underpaid}`)
  await page.getByText("Sisa tagihan").first().waitFor({ timeout: 30000 })
  await widgetShot(page, "Transfer manual", "22-widget-id-underpaid")
  await context.close()
}

{
  const { context, page } = await session({ width: 390, height: 844 })
  await page.goto(`${BASE}/app/manual-transfer`)
  await page.getByText("Needs verification").first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot(page, "23-queue-mobile", { fullPage: true })
  await context.close()
}

// --- phase 4: late badges, store details for e-mails, invoice link
{
  const { context, page } = await session({ width: 1440, height: 900 })
  await page.goto(`${BASE}/app/manual-transfer?status=underpaid`)
  await page.getByText("Late", { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot(page, "24-queue-late-underpaid", { fullPage: true })

  await page.goto(`${BASE}/app/settings/manual-transfer`)
  await page.getByText("Store details for e-mails and invoices").waitFor({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot(page, "25-settings-store-details", { fullPage: true })
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.locator("#mt-store-name").waitFor()
  await shot(page, "26-store-details-drawer")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.getByRole("menuitem", { name: "Order placed (instructions)" }).waitFor()
  await shot(page, "27-email-preview-menu")
  await page.keyboard.press("Escape")

  await page.goto(`${BASE}/app/orders/${ORDERS.emailed}`)
  await page.getByText("Pro-forma PDF").waitFor({ timeout: 30000 })
  await widgetShot(page, "Manual transfer", "28-widget-invoice-link")
  await context.close()
}
{
  const { context, page } = await session({ width: 1440, height: 900 }, "id")
  await page.goto(`${BASE}/app/manual-transfer?status=underpaid`)
  await page.getByText("Terlambat", { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot(page, "29-queue-late-id")
  await context.close()
}

await browser.close()
fs.mkdirSync(path.join(STATE, "logs"), { recursive: true })
fs.writeFileSync(path.join(STATE, "logs/console-errors.txt"), consoleErrors.join("\n---\n"))
console.log(`console errors: ${consoleErrors.length}`)
for (const e of consoleErrors) console.log("ERR " + e.split("\n")[0].slice(0, 300))
