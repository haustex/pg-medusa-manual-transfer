import fontkit from "@pdf-lib/fontkit"
import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import fs from "node:fs"
import path from "node:path"
import * as pdfLib from "pdf-lib"
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib"
import {
  documentContext,
  formatDay,
  formatMoney,
  orderNumber,
  StoreIdentity,
  TransferDocument,
} from "./notifications/context"
import { getPluginOptions, NotificationLocale } from "./plugin-options"

/**
 * The pro-forma invoice: what to pay, to which account, by when. It carries
 * the store's own name, logo and address only.
 *
 * The plugin option `invoice.render` replaces the default layout: a function,
 * or a module path (relative to the app's working directory) whose default
 * export is one. It gets the InvoiceContext below and pdf-lib, and returns the
 * PDF bytes.
 *
 * Text is set in Noto Sans (SIL Open Font License, subset to the Latin
 * ranges, shipped in assets/fonts), embedded as a subset, so names like
 * "José Müller-Ñúñez" keep their accents. `invoice.fontPath` swaps in the
 * store's own TTF/OTF files.
 */

const LABELS: Record<NotificationLocale, Record<string, string>> = {
  en: {
    title: "Pro-forma invoice",
    number: "Invoice no.",
    order: "Order",
    issued: "Date",
    due: "Pay by",
    bill_to: "Bill to",
    item: "Item",
    quantity: "Qty",
    unit_price: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    shipping: "Shipping",
    discount: "Discount",
    tax: "Tax",
    total: "Total",
    received: "Received so far",
    remaining: "Still to pay",
    pay_to: "Pay by bank transfer to",
    bank: "Bank",
    account_holder: "Account holder",
    account_number: "Account number",
    swift: "SWIFT / BIC",
    bank_address: "Bank address",
    currency: "Currency",
    reference: "Reference",
    reference_note: "Put the reference in the transfer note.",
    fees_note: "International transfers: choose OUR (all fees paid by the sender) so the full amount arrives.",
    footer: "This pro-forma invoice is a request for payment, not a receipt or a tax invoice.",
  },
  id: {
    title: "Invoice pro-forma",
    number: "No. invoice",
    order: "Pesanan",
    issued: "Tanggal",
    due: "Bayar sebelum",
    bill_to: "Ditagihkan kepada",
    item: "Barang",
    quantity: "Jml",
    unit_price: "Harga satuan",
    amount: "Jumlah",
    subtotal: "Subtotal",
    shipping: "Ongkos kirim",
    discount: "Diskon",
    tax: "Pajak",
    total: "Total",
    received: "Sudah diterima",
    remaining: "Sisa tagihan",
    pay_to: "Bayar lewat transfer bank ke",
    bank: "Bank",
    account_holder: "Nama penerima",
    account_number: "Nomor rekening",
    swift: "SWIFT / BIC",
    bank_address: "Alamat bank",
    currency: "Mata uang",
    reference: "Referensi",
    reference_note: "Tulis referensi di berita transfer.",
    fees_note: "Transfer internasional: pilih biaya OUR (ditanggung pengirim) agar jumlahnya diterima utuh.",
    footer: "Invoice pro-forma ini adalah permintaan pembayaran, bukan kuitansi atau faktur pajak.",
  },
}

export type InvoiceContext = {
  locale: NotificationLocale
  labels: Record<string, string>
  store: StoreIdentity
  number: string
  order_number: string
  issued_on: string | null
  due: string | null
  bill_to: string[]
  items: { title: string; subtitle: string | null; quantity: string; unit_price: string; total: string }[]
  totals: { label: string; value: string; strong?: boolean }[]
  account: TransferDocument["payment"]["data"]["account"] | null
  reference: string | null
  currency: string
  notes: string[]
  /** Font files (TTF/OTF bytes) of the invoice: the bundled Noto Sans, or `invoice.fontPath` */
  fonts: InvoiceFontFiles
  /** Embeds `fonts` into a document, for custom layouts: `const { regular, bold, mono } = await ctx.embedFonts(pdf)` */
  embedFonts: (pdf: PDFDocument) => Promise<Fonts>
  /** The loaded order and payment, for custom layouts */
  document: TransferDocument
}

export type InvoiceFontFiles = { regular: Uint8Array; bold: Uint8Array; mono: Uint8Array }

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont }

const BUNDLED_FONTS = { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf", mono: "NotoSansMono-Bold.ttf" }

/** assets/fonts of the package: two levels above src/lib, four above .medusa/server/src/lib */
function bundledFontDir(): string {
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "assets", "fonts")
    if (fs.existsSync(path.join(candidate, BUNDLED_FONTS.regular))) {
      return candidate
    }
    dir = path.dirname(dir)
  }
  throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "manual transfer: the bundled invoice fonts are missing (assets/fonts)")
}

/** Font files are read once per process: they never change while the app runs */
const fontFiles = new Map<string, Uint8Array>()

function readFont(file: string): Uint8Array {
  let bytes = fontFiles.get(file)
  if (!bytes) {
    bytes = fs.readFileSync(file)
    fontFiles.set(file, bytes)
  }
  return bytes
}

/**
 * The bundled fonts, or the store's (`invoice.fontPath`, relative to the app's
 * working directory): one file for every style, or { regular, bold?, mono? }
 * where bold falls back to regular and mono to the bundled mono font. A file
 * that cannot be read logs a warning and the bundled fonts are used.
 */
export function invoiceFontFiles(container: MedusaContainer): InvoiceFontFiles {
  const bundled = bundledFontDir()
  const fallback = () => ({
    regular: readFont(path.join(bundled, BUNDLED_FONTS.regular)),
    bold: readFont(path.join(bundled, BUNDLED_FONTS.bold)),
    mono: readFont(path.join(bundled, BUNDLED_FONTS.mono)),
  })
  const option = getPluginOptions(container).invoice?.fontPath
  if (!option) {
    return fallback()
  }
  const paths = typeof option === "string" ? { regular: option } : option
  const resolve = (file: string) => path.resolve(process.cwd(), file)
  try {
    const regular = readFont(resolve(paths.regular))
    return {
      regular,
      bold: paths.bold ? readFont(resolve(paths.bold)) : regular,
      mono: paths.mono ? readFont(resolve(paths.mono)) : readFont(path.join(bundled, BUNDLED_FONTS.mono)),
    }
  } catch (error) {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(`manual transfer: invoice.fontPath unreadable (${(error as Error).message}), using the bundled fonts`)
    return fallback()
  }
}

/** Embeds the font files as subsets: only the glyphs the invoice uses end up in the PDF */
export async function embedInvoiceFonts(pdf: PDFDocument, files: InvoiceFontFiles): Promise<Fonts> {
  pdf.registerFontkit(fontkit)
  // The same file for several styles (fontPath as one string) is embedded once
  const embedded = new Map<Uint8Array, Promise<PDFFont>>()
  const embed = (bytes: Uint8Array) => {
    if (!embedded.has(bytes)) {
      embedded.set(bytes, pdf.embedFont(bytes, { subset: true }))
    }
    return embedded.get(bytes)!
  }
  const [regular, bold, mono] = await Promise.all([embed(files.regular), embed(files.bold), embed(files.mono)])
  return { regular, bold, mono }
}

export function invoiceContext(
  container: MedusaContainer,
  doc: TransferDocument,
  locale: NotificationLocale
): InvoiceContext {
  const labels = LABELS[locale]
  const currency = doc.payment.currency_code
  const money = (amount: number) => formatMoney(amount, currency, locale)
  const base = documentContext(container, doc, locale)
  const { order } = doc
  const totals: InvoiceContext["totals"] = [{ label: labels.subtotal, value: money(order.subtotal) }]
  if (order.shipping_total) totals.push({ label: labels.shipping, value: money(order.shipping_total) })
  if (order.discount_total) totals.push({ label: labels.discount, value: `-${money(order.discount_total)}` })
  if (order.tax_total) totals.push({ label: labels.tax, value: money(order.tax_total) })
  totals.push({ label: labels.total, value: money(doc.payment.amount), strong: true })
  if (doc.amount_received > 0 && doc.payment.data.status !== "paid") {
    totals.push({ label: labels.received, value: `-${money(doc.amount_received)}` })
    totals.push({ label: labels.remaining, value: money(doc.amount_remaining), strong: true })
  }
  const note = getPluginOptions(container).invoice?.note
  const fonts = invoiceFontFiles(container)
  return {
    locale,
    labels,
    store: doc.store,
    number: doc.payment.data.reference ?? orderNumber(order.display_id, order.id),
    order_number: orderNumber(order.display_id, order.id),
    issued_on: formatDay(order.created_at, locale, doc.timezone),
    due: base.payment.deadline,
    bill_to: [
      ...(order.billing_lines.length ? order.billing_lines : [order.customer_name].filter((v): v is string => !!v)),
      ...(order.email ? [order.email] : []),
    ],
    items: order.items.map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
      quantity: String(item.quantity),
      unit_price: money(item.unit_price),
      total: money(item.total),
    })),
    totals,
    account: doc.payment.data.account ?? null,
    reference: doc.payment.data.reference ?? null,
    currency: currency.toUpperCase(),
    notes: [labels.reference_note, labels.fees_note, ...(note ? [note] : [])],
    fonts,
    embedFonts: (pdf) => embedInvoiceFonts(pdf, fonts),
    document: doc,
  }
}

const characterSets = new WeakMap<PDFFont, Set<number>>()

function supports(font: PDFFont, char: string): boolean {
  let set = characterSets.get(font)
  if (!set) {
    set = new Set(font.getCharacterSet())
    characterSets.set(font, set)
  }
  return set.has(char.codePointAt(0)!)
}

/**
 * Characters the font has no glyph for (the bundled fonts cover the Latin
 * scripts) lose their accents, or become "?", instead of an empty box
 */
export function encodable(font: PDFFont, value: string): string {
  let out = ""
  for (const char of value) {
    if (char === "\n" || supports(font, char)) {
      out += char
      continue
    }
    const plain = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    out += plain && [...plain].every((c) => supports(font, c)) ? plain : "?"
  }
  return out
}

function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of encodable(font, value).split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

async function loadLogo(pdf: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url) {
    return null
  }
  try {
    let bytes: Uint8Array
    const data = url.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i)
    if (data) {
      bytes = Buffer.from(data[1], "base64")
    } else if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) {
        return null
      }
      bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 2 * 1024 * 1024) {
        return null
      }
    } else {
      return null
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      return await pdf.embedPng(bytes)
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return await pdf.embedJpg(bytes)
    }
  } catch {
    // no logo then
  }
  return null
}

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.44, 0.44, 0.48)
const RULE = rgb(0.89, 0.89, 0.91)
const MARGIN = 48

/** The default layout: A4, one page per ~20 items */
export async function defaultInvoicePdf(ctx: InvoiceContext): Promise<Uint8Array> {
  // No library producer line: the document names the store only
  const pdf = await PDFDocument.create({ updateMetadata: false })
  pdf.setCreationDate(new Date())
  pdf.setTitle(`${ctx.labels.title} ${ctx.number}`)
  pdf.setAuthor(ctx.store.name)
  pdf.setCreator(ctx.store.name)
  pdf.setProducer(ctx.store.name)
  const fonts = await ctx.embedFonts(pdf)
  const logo = await loadLogo(pdf, ctx.store.logo_url)

  let page: PDFPage = pdf.addPage([595.28, 841.89])
  const width = page.getWidth() - MARGIN * 2
  let y = page.getHeight() - MARGIN

  const draw = (value: string, x: number, at: number, { size = 10, font = fonts.regular, color = INK } = {}) =>
    page.drawText(encodable(font, value), { x, y: at, size, font, color })
  const drawRight = (value: string, right: number, at: number, { size = 10, font = fonts.regular, color = INK } = {}) => {
    const safe = encodable(font, value)
    page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y: at, size, font, color })
  }
  const rule = (at: number) =>
    page.drawLine({ start: { x: MARGIN, y: at }, end: { x: MARGIN + width, y: at }, thickness: 0.7, color: RULE })
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      page = pdf.addPage([595.28, 841.89])
      y = page.getHeight() - MARGIN
    }
  }

  // --- header: store on the left, title on the right
  let left = y
  if (logo) {
    const scale = Math.min(40 / logo.height, 160 / logo.width, 1)
    page.drawImage(logo, { x: MARGIN, y: left - logo.height * scale, width: logo.width * scale, height: logo.height * scale })
    left -= logo.height * scale + 10
  } else {
    draw(ctx.store.name, MARGIN, left - 14, { size: 16, font: fonts.bold })
    left -= 24
  }
  const contact = [...ctx.store.address_lines, ctx.store.email, ctx.store.phone, ctx.store.website].filter(
    (line): line is string => !!line
  )
  for (const line of logo ? [ctx.store.name, ...contact] : contact) {
    draw(line, MARGIN, left - 9, { size: 9, color: MUTED })
    left -= 12
  }
  drawRight(ctx.labels.title, MARGIN + width, y - 16, { size: 18, font: fonts.bold })
  let right = y - 36
  for (const [label, value] of [
    [ctx.labels.number, ctx.number],
    [ctx.labels.order, ctx.order_number],
    [ctx.labels.issued, ctx.issued_on],
    [ctx.labels.due, ctx.due],
  ] as const) {
    if (!value) continue
    drawRight(`${label}: ${value}`, MARGIN + width, right, { size: 9, color: label === ctx.labels.due ? INK : MUTED, font: label === ctx.labels.due ? fonts.bold : fonts.regular })
    right -= 13
  }
  y = Math.min(left, right) - 18

  // --- bill to
  draw(ctx.labels.bill_to.toUpperCase(), MARGIN, y, { size: 8, font: fonts.bold, color: MUTED })
  y -= 14
  for (const line of ctx.bill_to) {
    draw(line, MARGIN, y, { size: 10 })
    y -= 13
  }
  y -= 14

  // --- items
  const cols = { qty: MARGIN + width * 0.62, unit: MARGIN + width * 0.8, total: MARGIN + width }
  const header = () => {
    draw(ctx.labels.item, MARGIN, y, { size: 8, font: fonts.bold, color: MUTED })
    drawRight(ctx.labels.quantity, cols.qty, y, { size: 8, font: fonts.bold, color: MUTED })
    drawRight(ctx.labels.unit_price, cols.unit, y, { size: 8, font: fonts.bold, color: MUTED })
    drawRight(ctx.labels.amount, cols.total, y, { size: 8, font: fonts.bold, color: MUTED })
    y -= 8
    rule(y)
    y -= 14
  }
  header()
  for (const item of ctx.items) {
    const title = wrap(fonts.regular, item.title, 10, width * 0.55)
    const sub = item.subtitle ? wrap(fonts.regular, item.subtitle, 8, width * 0.55) : []
    ensure(title.length * 13 + sub.length * 11 + 10)
    drawRight(item.quantity, cols.qty, y)
    drawRight(item.unit_price, cols.unit, y)
    drawRight(item.total, cols.total, y)
    for (const line of title) {
      draw(line, MARGIN, y)
      y -= 13
    }
    for (const line of sub) {
      draw(line, MARGIN, y + 1, { size: 8, color: MUTED })
      y -= 11
    }
    y -= 4
    rule(y + 6)
    y -= 6
  }

  // --- totals
  ensure(ctx.totals.length * 16 + 10)
  for (const total of ctx.totals) {
    const font = total.strong ? fonts.bold : fonts.regular
    drawRight(total.label, cols.unit, y, { size: total.strong ? 11 : 10, font, color: total.strong ? INK : MUTED })
    drawRight(total.value, cols.total, y, { size: total.strong ? 11 : 10, font })
    y -= 16
  }
  y -= 16

  // --- payment instructions
  const account = ctx.account
  const rows: [string, string | null | undefined, boolean?][] = [
    [ctx.labels.bank, account?.bank_name],
    [ctx.labels.account_holder, account?.account_holder],
    [ctx.labels.account_number, account?.account_number, true],
    [ctx.labels.swift, account?.swift_code, true],
    [ctx.labels.bank_address, account?.bank_address],
    [ctx.labels.currency, ctx.currency],
    [ctx.labels.reference, ctx.reference, true],
  ]
  const shown = rows.filter(([, value]) => !!value)
  const noteLines = ctx.notes.flatMap((note) => wrap(fonts.regular, note, 9, width - 32))
  const boxHeight = 30 + shown.length * 15 + 8 + noteLines.length * 12 + 10
  ensure(boxHeight + 10)
  page.drawRectangle({ x: MARGIN, y: y - boxHeight + 10, width, height: boxHeight, borderColor: RULE, borderWidth: 1, color: rgb(0.98, 0.98, 0.98) })
  y -= 8
  draw(ctx.labels.pay_to, MARGIN + 16, y, { size: 10, font: fonts.bold })
  y -= 20
  for (const [label, value, mono] of shown) {
    draw(label, MARGIN + 16, y, { size: 9, color: MUTED })
    for (const [i, line] of wrap(mono ? fonts.mono : fonts.regular, value!, 10, width - 170).entries()) {
      draw(line, MARGIN + 150, y - i * 12, { size: 10, font: mono ? fonts.mono : fonts.bold })
      if (i > 0) y -= 12
    }
    y -= 15
  }
  y -= 6
  for (const line of noteLines) {
    draw(line, MARGIN + 16, y, { size: 9, color: MUTED })
    y -= 12
  }

  // --- footer on every page
  for (const each of pdf.getPages()) {
    const safe = encodable(fonts.regular, ctx.labels.footer)
    each.drawText(safe, { x: MARGIN, y: MARGIN - 18, size: 8, font: fonts.regular, color: MUTED })
  }
  return pdf.save()
}

type InvoiceRenderer = (ctx: InvoiceContext, lib: typeof pdfLib) => Promise<Uint8Array> | Uint8Array

async function customRenderer(container: MedusaContainer): Promise<InvoiceRenderer | null> {
  const render = getPluginOptions(container).invoice?.render
  if (!render) {
    return null
  }
  if (typeof render === "function") {
    return render as InvoiceRenderer
  }
  const loaded = await import(path.resolve(process.cwd(), render))
  const fn = loaded.default?.default ?? loaded.default ?? loaded.render
  if (typeof fn !== "function") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `manual transfer: invoice.render module ${render} has no default export function`
    )
  }
  return fn as InvoiceRenderer
}

export async function renderInvoicePdf(
  container: MedusaContainer,
  doc: TransferDocument,
  locale: NotificationLocale
): Promise<Buffer> {
  const ctx = invoiceContext(container, doc, locale)
  const custom = await customRenderer(container)
  return Buffer.from(custom ? await custom(ctx, pdfLib) : await defaultInvoicePdf(ctx))
}

export function invoiceFilename(doc: TransferDocument): string {
  const id = doc.payment.data.reference ?? String(doc.order.display_id ?? doc.order.id)
  return `invoice-${id.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`
}
