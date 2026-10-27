import { labelsFor, TransferLocale } from "../labels"
import { resolveTheme, ThemeOverrides } from "../theme"

/** What anyone without access sees: the same for a wrong token, someone else's order, or no order at all */
export default function TransferNotFound({
  locale,
  homeHref,
  theme,
}: {
  locale: TransferLocale
  /** Where "Continue shopping" goes */
  homeHref: string
  theme?: ThemeOverrides
}) {
  const l = labelsFor(locale)
  const t = resolveTheme(theme)
  return (
    <div className="content-container flex flex-col gap-y-4 py-16 max-w-xl" data-testid="transfer-not-found">
      <h1 className={t.title}>{l.notFoundTitle}</h1>
      <p className={t.subtle}>{l.notFoundText}</p>
      <a href={homeHref} className={t.link}>
        {l.continueShopping}
      </a>
    </div>
  )
}
