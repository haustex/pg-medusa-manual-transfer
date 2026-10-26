import { htmlToText, parseTemplate, renderTemplate, splitSubject } from "../notifications/template"

describe("e-mail template syntax", () => {
  it("escapes values, keeps triple-brace values, follows dotted paths", () => {
    const data = { name: "<b>Ana</b> & co", html: "<i>ok</i>", account: { bank_name: "Bank \"Jago\"" } }
    expect(renderTemplate("Hi {{name}} {{{html}}} {{ account.bank_name }} {{missing}}!", data)).toBe(
      "Hi &lt;b&gt;Ana&lt;/b&gt; &amp; co <i>ok</i> Bank &quot;Jago&quot; !"
    )
  })

  it("renders sections, lists and inverted sections", () => {
    const tpl = "{{#url}}<a href=\"{{url}}\">go</a>{{/url}}{{^url}}none{{/url}}|{{#items}}[{{n}}:{{label}}]{{/items}}{{^items}}empty{{/items}}|{{#lines}}{{.}};{{/lines}}"
    expect(renderTemplate(tpl, { url: "https://x.test/?a=1&b=2", label: "outer", items: [{ n: 1 }, { n: 2, label: "own" }], lines: ["a", "b"] })).toBe(
      '<a href="https://x.test/?a=1&amp;b=2">go</a>|[1:outer][2:own]|a;b;'
    )
    expect(renderTemplate(tpl, { items: [], lines: [] })).toBe("none|empty|")
    expect(renderTemplate("{{#obj}}{{a}}{{/obj}}", { obj: { a: "inner" } })).toBe("inner")
  })

  it("refuses unbalanced sections", () => {
    expect(() => parseTemplate("{{#a}}x")).toThrow(/not closed/)
    expect(() => parseTemplate("{{#a}}x{{/b}}")).toThrow(/unexpected/)
  })

  it("turns HTML into readable text and finds the subject", () => {
    const html = '<title>Pay &amp; go</title><h1>Hello</h1><p>Line<br>two <a href="https://s.test/u">Upload</a></p><table><tr><td>Bank</td><td>X</td></tr></table>'
    const { subject, body } = splitSubject(html)
    expect(subject).toBe("Pay &amp; go")
    expect(htmlToText(subject!)).toBe("Pay & go")
    expect(htmlToText(body)).toBe("Hello\n\nLine\ntwo Upload (https://s.test/u)\n\nBank X")
  })
})
