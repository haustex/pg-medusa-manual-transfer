// Checks the plugin's credit footer in the Admin: present with the default
// options, absent with showCredit: false. Runs inside the Playwright container.
// Usage: node credit.mjs present|absent <outDir>
import { chromium } from "playwright-core"
import fs from "node:fs"

const BASE = "http://127.0.0.1:9400"
const expect = process.argv[2]
const OUT = process.argv[3]
if (!["present", "absent"].includes(expect) || !OUT) {
  console.error("usage: node credit.mjs present|absent <outDir>")
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/app/login`)
await page.fill('input[name="email"]', "admin@e2e.test")
await page.fill('input[name="password"]', "e2e-password")
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 })

let failed = 0
const pages = [
  ["/app/manual-transfer", "Manual transfers"],
  ["/app/settings/manual-transfer", "Bank accounts"],
]
for (const [path, heading] of pages) {
  const config = page.waitForResponse((r) => r.url().includes("/admin/manual-transfer/config"), { timeout: 30000 })
  await page.goto(BASE + path)
  await page.getByText(heading, { exact: true }).first().waitFor({ timeout: 30000 })
  const { show_credit } = await (await config).json()
  await page.waitForTimeout(1000)
  const links = await page.locator('a[href*="hauskayu.com"], a[href*="wa.me"]').count()
  const text = await page.getByText("by Haus Kayu").count()
  const ok = expect === "present" ? show_credit === true && links === 2 && text === 1 : show_credit === false && links === 0 && text === 0
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  footer ${expect} on ${path} (show_credit=${show_credit}, links=${links}, text=${text})`)
  await page.screenshot({ path: `${OUT}/credit-${expect}${path.replaceAll("/", "-")}.png`, fullPage: true })
}

await browser.close()
process.exit(failed ? 1 : 0)
