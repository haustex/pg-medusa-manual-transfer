/**
 * Class names of the bank-transfer components. The defaults use Tailwind and
 * the tokens of `@medusajs/ui-preset` (`txt-*`, `text-ui-fg-*`, …), which both
 * Medusa starters ship; pass `theme={{ … }}` to match another design. Only the
 * keys you pass change.
 */
export type TransferTheme = {
  page: string
  inner: string
  card: string
  title: string
  heading: string
  text: string
  subtle: string
  small: string
  muted: string
  error: string
  amount: string
  row: string
  rowLabel: string
  rowValue: string
  mono: string
  notice: string
  noticeText: string
  link: string
  button: string
  copyButton: string
  fileInput: string
  textarea: string
  success: string
  badge: string
  badgeTone: Record<"green" | "orange" | "red" | "grey" | "blue", string>
}

export const defaultTheme: TransferTheme = {
  page: "py-6 min-h-[calc(100vh-64px)]",
  inner: "content-container flex flex-col gap-y-8 max-w-3xl w-full",
  card: "flex flex-col rounded-lg border border-ui-border-base bg-ui-bg-base p-6 shadow-sm",
  title: "text-3xl font-normal text-ui-fg-base",
  heading: "text-xl font-semibold text-ui-fg-base",
  text: "txt-medium text-ui-fg-base",
  subtle: "txt-medium text-ui-fg-subtle",
  small: "txt-small text-ui-fg-subtle",
  muted: "txt-small text-ui-fg-muted",
  error: "txt-small text-ui-fg-error",
  amount: "text-3xl font-semibold text-ui-fg-base tabular-nums",
  row: "flex flex-col sm:flex-row sm:items-center gap-y-1 gap-x-4 py-3 border-b border-ui-border-base last:border-b-0",
  rowLabel: "txt-small text-ui-fg-subtle sm:w-44 shrink-0",
  rowValue: "txt-medium-plus text-ui-fg-base break-words min-w-0",
  mono: "font-mono tracking-wide",
  notice: "rounded-md border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3",
  noticeText: "txt-small text-ui-tag-orange-text",
  link: "inline-flex items-center gap-x-2 txt-medium-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover",
  button:
    "inline-flex items-center justify-center gap-x-2 rounded-md bg-ui-button-inverted px-4 py-2.5 txt-compact-medium-plus text-ui-fg-on-inverted shadow-sm hover:bg-ui-button-inverted-hover disabled:cursor-not-allowed disabled:opacity-50",
  copyButton:
    "inline-flex items-center gap-x-1 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 txt-compact-small-plus text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base shrink-0",
  fileInput:
    "txt-compact-small text-ui-fg-subtle file:mr-3 file:rounded-md file:border file:border-solid file:border-ui-border-base file:bg-ui-bg-base file:px-3 file:py-1.5 file:text-ui-fg-base",
  textarea:
    "w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 txt-compact-medium text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive",
  success: "rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4",
  badge: "inline-flex items-center rounded-md border px-2 py-0.5 txt-compact-small-plus",
  badgeTone: {
    green: "border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text",
    orange: "border-ui-tag-orange-border bg-ui-tag-orange-bg text-ui-tag-orange-text",
    red: "border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text",
    grey: "border-ui-tag-neutral-border bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
    blue: "border-ui-tag-blue-border bg-ui-tag-blue-bg text-ui-tag-blue-text",
  },
}

export type ThemeOverrides = Partial<Omit<TransferTheme, "badgeTone">> & {
  badgeTone?: Partial<TransferTheme["badgeTone"]>
}

export function resolveTheme(overrides?: ThemeOverrides): TransferTheme {
  if (!overrides) {
    return defaultTheme
  }
  return { ...defaultTheme, ...overrides, badgeTone: { ...defaultTheme.badgeTone, ...overrides.badgeTone } }
}

/** Joins class names, skipping empty ones */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ")
}
