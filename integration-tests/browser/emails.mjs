// Screenshots of the e-mail previews: every .html under <dir> (except index.html)
// gets a .png next to it, at a phone-ish and a desktop width.
// Runs inside the Playwright container (see ../ui.mjs --emails).
// Usage: node emails.mjs <dir>
import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

const DIR = process.argv[2]
const files = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith(".html") && entry.name !== "index.html") files.push(full)
  }
}
walk(DIR)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 1 })
// The e-mails are files: no request may leave the container
await context.route(/^https?:/, (route) => route.abort())
const page = await context.newPage()
for (const file of files) {
  await page.goto(`file://${file}`)
  await page.screenshot({ path: file.replace(/\.html$/, ".png"), fullPage: true })
}
await browser.close()
console.log(`${files.length} e-mail screenshots in ${DIR}`)
