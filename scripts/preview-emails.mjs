// Renders every e-mail (English and Indonesian) and the pro-forma invoice with a
// made-up order, without Medusa, a database or an e-mail provider. Open the
// .html files in a browser. Uses the built plugin: run `npm run build` first.
//
// Usage: node scripts/preview-emails.mjs [outDir] [--templates <dir>] [--store <store.json>]
//   outDir       default ./email-previews
//   --templates  a notifications.templatesDir to try your own templates
//   --store      JSON with name, logo_url, address_lines, email, phone, website
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const built = path.join(root, ".medusa/server/src/lib")
if (!fs.existsSync(path.join(built, "notifications/sample.js"))) {
  console.error("Build the plugin first: npm run build")
  process.exit(1)
}
const require = createRequire(import.meta.url)
const { renderSample, sampleDocument } = require(path.join(built, "notifications/sample.js"))
const { ADMIN_TEMPLATES, BUYER_TEMPLATES } = require(path.join(built, "notifications/templates.js"))
const { defaultInvoicePdf, invoiceContext } = require(path.join(built, "invoice.js"))

const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const outDir = path.resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "email-previews")
const templatesDir = option("--templates")
const store = option("--store")
  ? JSON.parse(fs.readFileSync(option("--store"), "utf8"))
  : {
      name: "Example Store",
      logo_url: null,
      address_lines: ["Jl. Example No. 1", "Jepara 59400, Indonesia"],
      email: "hello@store.example",
      phone: "+62 000 0000 0000",
      website: "https://store.example",
    }

// Just enough of a Medusa container for the plugin options the e-mails read
const config = {
  plugins: [
    {
      resolve: "medusa-payment-manual-transfer",
      options: {
        notifications: {
          paymentUrl: "https://store.example/transfer/{order_id}?token={token}",
          adminUrl: "https://store.example/app",
        },
      },
    },
  ],
  projectConfig: { http: { jwtSecret: "preview-only" } },
  modules: {},
}
const container = { resolve: () => config }

fs.mkdirSync(outDir, { recursive: true })
const index = []
for (const locale of ["en", "id"]) {
  for (const name of [...BUYER_TEMPLATES, ...ADMIN_TEMPLATES]) {
    const email = renderSample(container, store, name, locale, { templatesDir })
    const file = `${name}.${locale}.html`
    fs.writeFileSync(path.join(outDir, file), email.html)
    fs.writeFileSync(path.join(outDir, `${name}.${locale}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`)
    index.push({ locale, name, file, subject: email.subject })
  }
  for (const status of ["awaiting_payment", "underpaid"]) {
    const pdf = await defaultInvoicePdf(invoiceContext(container, sampleDocument(store, status), locale))
    const file = `invoice-${status}.${locale}.pdf`
    fs.writeFileSync(path.join(outDir, file), pdf)
    index.push({ locale, name: `invoice (${status})`, file, subject: "" })
  }
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>E-mail previews</title>
<body style="font-family:system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px">
<h1>E-mail previews</h1><p>Rendered with a made-up order${templatesDir ? ` and the templates in ${escape(templatesDir)}` : ""}.</p>
<table cellpadding="6" style="border-collapse:collapse">${index
    .map((e) => `<tr><td>${e.locale}</td><td><a href="${e.file}">${escape(e.name)}</a></td><td>${escape(e.subject)}</td></tr>`)
    .join("")}</table></body>`
)
console.log(`${index.length} previews in ${outDir} (open index.html)`)
