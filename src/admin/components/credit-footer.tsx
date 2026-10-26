import { Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { CONFIG_QUERY_KEY, getPluginConfig } from "../lib/transfer"

const HOME_URL =
  "https://hauskayu.com/?utm_source=medusa-admin&utm_medium=plugin&utm_campaign=pg-medusa-manual-transfer"
const HELP_URL =
  "https://wa.me/6285111663330?text=Halo%20Haus%20Kayu%2C%20saya%20mau%20tanya%20soal%20PG%20Medusa%20Transfer%20Manual"

/**
 * The small plugin credit under the plugin's own Admin pages. Plain links, no
 * images or requests to hauskayu.com; hidden with the plugin option
 * `showCredit: false`, and while the setting is still loading.
 */
export const CreditFooter = () => {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: CONFIG_QUERY_KEY, queryFn: getPluginConfig, staleTime: Infinity })
  if (!data?.show_credit) {
    return null
  }
  return (
    <div className="px-6 py-4 text-center">
      <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
        <a href={HOME_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ui-fg-subtle">
          {t("manualTransfer.credit.text")}
        </a>
        {" · "}
        <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ui-fg-subtle underline">
          {t("manualTransfer.credit.help")}
        </a>
      </Text>
    </div>
  )
}
