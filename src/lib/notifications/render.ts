import fs from "node:fs"
import path from "node:path"
import type { NotificationLocale } from "../plugin-options"
import { htmlToText, renderTemplate, splitSubject } from "./template"
import { DEFAULT_BODIES, DEFAULT_LAYOUT, TemplateName, templateStrings } from "./templates"

export type RenderedEmail = { subject: string; html: string; text: string }

/** An override from templatesDir: `<name>.<locale>.html`, then `<name>.html` */
function readOverride(dir: string | undefined, name: string, locale: NotificationLocale): string | null {
  if (!dir) {
    return null
  }
  for (const file of [`${name}.${locale}.html`, `${name}.html`]) {
    const full = path.resolve(dir, file)
    if (fs.existsSync(full)) {
      return fs.readFileSync(full, "utf8")
    }
  }
  return null
}

/**
 * Renders one e-mail: the template's wording (t.*) against the context, the
 * body, then the layout around it. Templates in `templatesDir` replace the
 * defaults.
 */
export function renderEmail(
  name: TemplateName,
  locale: NotificationLocale,
  context: Record<string, unknown>,
  { templatesDir }: { templatesDir?: string } = {}
): RenderedEmail {
  const t = Object.fromEntries(
    Object.entries(templateStrings(name, locale)).map(([key, value]) => [key, renderTemplate(value, context)])
  )
  const scope = { ...context, t }
  const override = readOverride(templatesDir, name, locale)
  const { subject: overrideSubject, body } = splitSubject(override ?? DEFAULT_BODIES[name])
  const subject = htmlToText(overrideSubject !== null ? renderTemplate(overrideSubject, scope) : t.subject ?? "")

  if (override && /<html[\s>]/i.test(override)) {
    const html = renderTemplate(override, { ...scope, subject })
    return { subject, html, text: htmlToText(html) }
  }
  const content = renderTemplate(body, scope)
  const layout = readOverride(templatesDir, "layout", locale) ?? DEFAULT_LAYOUT
  const html = renderTemplate(layout, { ...scope, subject, content })
  return { subject, html, text: htmlToText(content) }
}
