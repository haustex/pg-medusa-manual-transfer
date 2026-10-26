/**
 * A small Mustache-style renderer for the e-mail templates, so stores can
 * replace them with plain HTML files:
 *
 *   {{name}}            value, HTML-escaped (dotted paths: {{account.bank_name}})
 *   {{{name}}}          value, as is
 *   {{#name}}…{{/name}} shown when truthy; repeated for each item of a list,
 *                       with the item's fields in scope (and {{.}} for the item)
 *   {{^name}}…{{/name}} shown when falsy or an empty list
 *
 * No partials, no lambdas, no custom delimiters.
 */

import { MedusaError } from "@medusajs/framework/utils"

type Scope = Record<string, unknown>

type Node =
  | { type: "text"; value: string }
  | { type: "var"; name: string; raw: boolean }
  | { type: "section"; name: string; inverted: boolean; children: Node[] }

const TAG = /\{\{(\{?)\s*([#^/]?)\s*([\w.]+|\.)\s*\}?\}\}/g

export function parseTemplate(template: string): Node[] {
  const root: Node[] = []
  const stack: { name: string; children: Node[] }[] = [{ name: "", children: root }]
  let last = 0
  for (const match of template.matchAll(TAG)) {
    const [whole, brace, sigil, name] = match
    const index = match.index ?? 0
    const children = stack[stack.length - 1].children
    if (index > last) {
      children.push({ type: "text", value: template.slice(last, index) })
    }
    last = index + whole.length
    if (sigil === "#" || sigil === "^") {
      const section: Node = { type: "section", name, inverted: sigil === "^", children: [] }
      children.push(section)
      stack.push({ name, children: section.children })
    } else if (sigil === "/") {
      const open = stack.pop()
      if (!open || open.name !== name || stack.length === 0) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `template: unexpected {{/${name}}}`)
      }
    } else {
      children.push({ type: "var", name, raw: brace === "{" })
    }
  }
  if (stack.length !== 1) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `template: {{#${stack[stack.length - 1].name}}} is not closed`)
  }
  if (last < template.length) {
    root.push({ type: "text", value: template.slice(last) })
  }
  return root
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function lookup(scopes: Scope[], name: string): unknown {
  if (name === ".") {
    return scopes[scopes.length - 1]?.["."]
  }
  const [head, ...rest] = name.split(".")
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i] && head in scopes[i]) {
      let value: unknown = scopes[i][head]
      for (const key of rest) {
        value = value && typeof value === "object" ? (value as Scope)[key] : undefined
      }
      return value
    }
  }
  return undefined
}

function isTruthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value
}

function renderNodes(nodes: Node[], scopes: Scope[]): string {
  let out = ""
  for (const node of nodes) {
    if (node.type === "text") {
      out += node.value
    } else if (node.type === "var") {
      const value = lookup(scopes, node.name)
      const text = value === undefined || value === null ? "" : String(value)
      out += node.raw ? text : escapeHtml(text)
    } else {
      const value = lookup(scopes, node.name)
      if (node.inverted) {
        out += isTruthy(value) ? "" : renderNodes(node.children, scopes)
      } else if (Array.isArray(value)) {
        for (const item of value) {
          const scope = item && typeof item === "object" ? { ...(item as Scope), ".": item } : { ".": item }
          out += renderNodes(node.children, [...scopes, scope])
        }
      } else if (isTruthy(value)) {
        out += renderNodes(
          node.children,
          value && typeof value === "object" ? [...scopes, value as Scope] : scopes
        )
      }
    }
  }
  return out
}

export function renderTemplate(template: string, data: Scope): string {
  return renderNodes(parseTemplate(template), [data])
}

/** The plain-text part of an e-mail, from its HTML */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, "")
    // Line breaks come from the markup, not from how the template source is laid out
    .replace(/\s*\n\s*/g, " ")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim()
      return text && text !== href ? `${text} (${href})` : href
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|table|ol|ul)>/gi, "\n\n")
    .replace(/<\/(tr|li)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Subject from the template's <title>, and the body without it */
export function splitSubject(html: string): { subject: string | null; body: string } {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i)
  if (!match) {
    return { subject: null, body: html }
  }
  return { subject: match[1].trim(), body: html.replace(match[0], "").trim() }
}
