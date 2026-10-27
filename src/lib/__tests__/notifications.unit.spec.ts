import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib"
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

const warnings: string[] = []

function container(options: Record<string, unknown> = {}) {
  const config = {
    plugins: [{ resolve: "medusa-payment-manual-transfer", options }],
    projectConfig: { http: { jwtSecret: "unit-secret" } },
    modules: {},
  }
  const logger = { warn: (message: string) => warnings.push(message) }
  return { resolve: (key: string) => (key === "logger" ? logger : config) } as never
}

/**
 * The text of every page, read back the way a PDF viewer copies it: glyph ids
 * of each `Tj` mapped to Unicode through the font's ToUnicode CMap.
 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes)
  const decode = (stream: unknown) => Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1")
  const lines: string[] = []
  for (const page of pdf.getPages()) {
    const fonts = new Map<string, Map<string, string>>()
    const fontDict = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict)
    for (const [name, ref] of fontDict.entries()) {
      const font = pdf.context.lookup(ref as PDFRef, PDFDict)
      const cmap = new Map<string, string>()
      for (const [, glyph, unicode] of decode(font.lookup(PDFName.of("ToUnicode"))).matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/gi)) {
        cmap.set(glyph.toLowerCase(), String.fromCharCode(...unicode.match(/.{4}/g)!.map((h) => parseInt(h, 16))))
      }
      fonts.set(name.asString(), cmap)
    }
    const contents = page.node.Contents()!
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents]
    let current = new Map<string, string>()
    for (const stream of streams) {
      for (const [, font, hex] of decode(stream).matchAll(/(\/\S+) [\d.]+ Tf|<([0-9a-f]*)> Tj/gi)) {
        if (font) {
          current = fonts.get(font) ?? new Map()
        } else {
          lines.push(hex.match(/.{4}/g)?.map((id) => current.get(id.toLowerCase()) ?? "\ufffd").join("") ?? "")
        }
      }
    }
  }
  return lines.join("\n")
}

/** The fonts the first page uses (BaseFont without pdf-lib's numeric suffix) */
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes)
  const fonts = pdf.getPages()[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict)
  const names = fonts.values().map((ref) => {
    const font = pdf.context.lookup(ref as PDFRef, PDFDict)
    const descendant = font.lookup(PDFName.of("DescendantFonts"), PDFArray).lookup(0, PDFDict)
    expect(descendant.lookup(PDFName.of("FontDescriptor"), PDFDict).has(PDFName.of("FontFile2"))).toBe(true)
    return font.lookup(PDFName.of("BaseFont"), PDFName).asString().replace(/^\/|-\d+$/g, "")
  })
  return [...new Set(names)].sort()
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

  it("embeds a Latin font, so accented names stay intact", async () => {
    const doc = sampleDocument({ ...store, name: "Mueble Ñandú S.L." })
    doc.order.billing_lines = ["José Müller-Ñúñez", "Calle Señor 5", "Łódź, Polska"]
    doc.order.items[0].title = "Bangku jati “Çatal” — ½ m²"
    const bytes = await defaultInvoicePdf(invoiceContext(container(), doc, "en"))
    const text = await pdfText(bytes)
    for (const part of ["José Müller-Ñúñez", "Calle Señor 5", "Łódź, Polska", "Mueble Ñandú S.L.", "Bangku jati “Çatal” — ½ m²", "MT-7K3QX-9PA2B"]) {
      expect(text).toContain(part)
    }
    expect(text).not.toContain("\ufffd")
    // Subset: the PDF carries the glyphs it uses, not the whole font files (~410 KB)
    expect(bytes.length).toBeLessThan(120_000)
    expect(await fontNames(bytes)).toEqual(["NotoSans-Bold", "NotoSans-Regular", "NotoSansMono-Bold"])
  })

  it("replaces characters outside the font instead of drawing empty boxes", async () => {
    const doc = sampleDocument(store)
    doc.order.billing_lines = ["山田 太郎 Ā"]
    const text = await pdfText(await defaultInvoicePdf(invoiceContext(container(), doc, "en")))
    expect(text).toContain("?? ?? Ā")
  })

  it("uses the store's font from invoice.fontPath, and the bundled one when it is unreadable", async () => {
    const regular = path.resolve(__dirname, "../../../assets/fonts/NotoSansMono-Bold.ttf")
    const ctx = invoiceContext(container({ invoice: { fontPath: path.relative(process.cwd(), regular) } }), sampleDocument(store), "en")
    expect(Buffer.from(ctx.fonts.regular).equals(fs.readFileSync(regular))).toBe(true)
    expect(ctx.fonts.bold).toBe(ctx.fonts.regular)
    const pdf = await PDFDocument.load(await defaultInvoicePdf(ctx))
    expect(await fontNames(await pdf.save())).toEqual(["NotoSansMono-Bold"])
    // regular, bold and (the bundled) mono are the same file here: embedded once
    const embedded = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font") && object.has(PDFName.of("DescendantFonts")))
    expect(embedded).toHaveLength(1)

    warnings.length = 0
    const missing = invoiceContext(container({ invoice: { fontPath: "./no-such-font.ttf" } }), sampleDocument(store), "en")
    expect(warnings[0]).toMatch(/invoice.fontPath unreadable/)
    expect(await fontNames(await defaultInvoicePdf(missing))).toContain("NotoSans-Regular")
  })

  it("shows what is left after a partial transfer, in Indonesian", () => {
    const ctx = invoiceContext(container(), sampleDocument(store, "underpaid"), "id")
    expect(ctx.labels.title).toBe("Invoice pro-forma")
    expect(ctx.totals.slice(-2).map((t) => t.label)).toEqual(["Sudah diterima", "Sisa tagihan"])
    expect(ctx.totals.at(-1)!.value).toMatch(/25,00/)
  })
})
