import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PDFDocument } from "pdf-lib"
import { defaultInvoicePdf, invoiceContext } from "../invoice"
import { documentContext, StoreIdentity } from "../notifications/context"
import { renderEmail } from "../notifications/render"
import { renderSample, sampleDocument } from "../notifications/sample"
import { ADMIN_TEMPLATES, BUYER_TEMPLATES, TemplateName } from "../notifications/templates"
import { uploadToken } from "../tokens"

const store: StoreIdentity = {
  name: "Toko <Jati> & Co",
  logo_url: null,
  address_lines: ["Jl. Contoh 1", "Jepara"],
  email: "hello@toko.test",
  phone: null,
  website: "https://toko.test",
}

function container(options: Record<string, unknown> = {}) {
  const config = {
    plugins: [{ resolve: "medusa-payment-manual-transfer", options }],
    projectConfig: { http: { jwtSecret: "unit-secret" } },
    modules: {},
  }
  return { resolve: () => config } as never
}

const ALL: TemplateName[] = [...BUYER_TEMPLATES, ...ADMIN_TEMPLATES]

describe("default e-mails", () => {
  const c = container({ notifications: { paymentUrl: "https://toko.test/pay/{order_id}?token={token}", adminUrl: "https://toko.test/app/" } })

  it.each(["en", "id"] as const)("renders every template in %s with the store's identity only", (locale) => {
    for (const name of ALL) {
      const email = renderSample(c, store, name, locale)
      expect(email.subject.length).toBeGreaterThan(5)
      expect(email.subject).not.toMatch(/\{\{|&amp;|<|undefined|null/)
      expect(email.html).toContain("Toko &lt;Jati&gt; &amp; Co")
      for (const text of [email.html, email.text, email.subject]) {
        expect(text).not.toMatch(/\{\{|\}\}|undefined/)
        expect(text).not.toMatch(/haus\s*kayu|hauskayu/i)
      }
    }
  })

  it("puts the instructions, the exact amount and the buyer's upload link in the order e-mail", () => {
    const email = renderSample(c, store, "order_placed", "en")
    expect(email.subject).toBe("Order #1042: please transfer $1,499.50")
    for (const part of ["1234567890", "EXAMIDJA", "MT-7K3QX-9PA2B", "$1,499.50", "OUR", "Example Bank"]) {
      expect(email.html).toContain(part)
    }
    const token = uploadToken("unit-secret", "order_sample")
    expect(email.html).toContain(`https://toko.test/pay/order_sample?token=${token}`)
    expect(email.text).toContain("Upload proof of transfer (https://toko.test/pay/order_sample?token=")
    // Deadline in the provider's time zone
    expect(email.html).toMatch(/October 29, 2026.*2:30\s?PM.*GMT\+7/)
  })

  it("asks only for the rest after an underpayment", () => {
    const email = renderSample(c, store, "payment_underpaid", "id")
    expect(email.subject).toMatch(/^Pesanan #1042: sisa US\$\s?25,00 belum dibayar$/)
    expect(email.html).toContain("1.474,50")
  })

  it("links the admin e-mails to the Admin, never to the storefront upload page", () => {
    const email = renderSample(c, store, "admin_status_changed", "en")
    expect(email.html).toContain("https://toko.test/app/orders/order_sample")
    expect(email.html).not.toContain("/pay/")
    expect(email.html).toContain("Check the bank statement first")
  })

  it("leaves the link out without paymentUrl", () => {
    const email = renderSample(container(), store, "order_placed", "en")
    expect(email.html).not.toContain("Upload proof of transfer</a>")
  })

  it("uses templates from templatesDir: per locale, plain, full documents and the layout", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-templates-"))
    fs.writeFileSync(path.join(dir, "order_placed.id.html"), "<title>Bayar {{order.number}}</title><p>Ref {{payment.reference}}</p>")
    fs.writeFileSync(path.join(dir, "payment_confirmed.html"), "<html><head><title>Lunas {{order.number}}</title></head><body>{{store.name}}</body></html>")
    fs.writeFileSync(path.join(dir, "layout.html"), "<div class=frame>{{{content}}}</div>")
    const doc = sampleDocument(store)
    const ctx = documentContext(c, doc, "id")
    const placed = renderEmail("order_placed", "id", ctx, { templatesDir: dir })
    expect(placed).toEqual({ subject: "Bayar #1042", html: "<div class=frame><p>Ref MT-7K3QX-9PA2B</p></div>", text: "Ref MT-7K3QX-9PA2B" })
    const english = renderEmail("order_placed", "en", documentContext(c, doc, "en"), { templatesDir: dir })
    expect(english.subject).toBe("Order #1042: please transfer $1,499.50")
    expect(english.html).toMatch(/^<div class=frame>/)
    const paid = renderEmail("payment_confirmed", "en", ctx, { templatesDir: dir })
    expect(paid.subject).toBe("Lunas #1042")
    expect(paid.html).toContain("<body>Toko &lt;Jati&gt; &amp; Co</body>")
    fs.rmSync(dir, { recursive: true })
  })
})

describe("pro-forma invoice", () => {
  it("is a one-page PDF with the store's name and no vendor credit", async () => {
    const doc = sampleDocument({ ...store, name: "Toko Jati Čakovec — ü ☃" })
    const ctx = invoiceContext(container({ invoice: { note: "Bank fees are paid by the buyer." } }), doc, "en")
    expect(ctx.totals.map((t) => t.label)).toEqual(["Subtotal", "Shipping", "Total"])
    expect(ctx.notes).toContain("Bank fees are paid by the buyer.")
    const bytes = await defaultInvoicePdf(ctx)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-")
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe("Pro-forma invoice MT-7K3QX-9PA2B")
    expect(pdf.getProducer()).toBe("Toko Jati Čakovec — ü ☃")
    expect(Buffer.from(bytes).toString("latin1")).not.toMatch(/haus\s*kayu|hauskayu|pdf-lib/i)
  })

  it("shows what is left after a partial transfer, in Indonesian", () => {
    const ctx = invoiceContext(container(), sampleDocument(store, "underpaid"), "id")
    expect(ctx.labels.title).toBe("Invoice pro-forma")
    expect(ctx.totals.slice(-2).map((t) => t.label)).toEqual(["Sudah diterima", "Sisa tagihan"])
    expect(ctx.totals.at(-1)!.value).toMatch(/25,00/)
  })
})
