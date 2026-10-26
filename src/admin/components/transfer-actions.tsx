import { ExclamationCircle } from "@medusajs/icons"
import { Alert, Button, Checkbox, Drawer, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  confirmPayment,
  formatAmount,
  OrderTransfer,
  orderTransferQueryKey,
  recordUnderpayment,
  rejectProof,
  roundAmount,
  today,
  TransferProof,
  TRANSFERS_QUERY_KEY,
} from "../lib/transfer"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** After any action: the widget, the queue and Medusa's own order queries (payment status) */
function useInvalidate(orderId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: orderTransferQueryKey(orderId) })
    queryClient.invalidateQueries({ queryKey: TRANSFERS_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ["orders"] })
  }
}

/** The warning every money action carries */
export const BankCheckWarning = () => {
  const { t } = useTranslation()
  return (
    <Alert variant="warning">
      <Text size="small" leading="compact" weight="plus">
        {t("manualTransfer.actions.bankCheckTitle")}
      </Text>
      <Text size="small" leading="compact">
        {t("manualTransfer.actions.bankCheck")}
      </Text>
    </Alert>
  )
}

type AmountValue = { amount: string; receivedAt: string; bankReference: string; note: string }

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-x-4">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" leading="compact" weight={strong ? "plus" : "regular"}>
      {value}
    </Text>
  </div>
)

/** Amount, date, bank reference and note, shared by "confirm" and "underpaid" */
const AmountFields = ({
  idPrefix,
  value,
  onChange,
  currencyCode,
}: {
  idPrefix: string
  value: AmountValue
  onChange: (value: AmountValue) => void
  currencyCode: string
}) => {
  const { t } = useTranslation()
  const set = (key: keyof AmountValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value })
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus" htmlFor={`${idPrefix}-amount`}>
          {t("manualTransfer.actions.amountReceived", { currency: currencyCode.toUpperCase() })}
        </Label>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value.amount}
          onChange={set("amount")}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus" htmlFor={`${idPrefix}-date`}>
          {t("manualTransfer.actions.receivedAt")}
        </Label>
        <Input id={`${idPrefix}-date`} type="date" max={today()} value={value.receivedAt} onChange={set("receivedAt")} />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus" htmlFor={`${idPrefix}-ref`}>
          {t("manualTransfer.actions.bankReference")}
        </Label>
        <Input
          id={`${idPrefix}-ref`}
          maxLength={120}
          placeholder={t("manualTransfer.actions.bankReferenceHint")}
          value={value.bankReference}
          onChange={set("bankReference")}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus" htmlFor={`${idPrefix}-note`}>
          {t("manualTransfer.actions.note")}
        </Label>
        <Textarea id={`${idPrefix}-note`} maxLength={1000} rows={3} value={value.note} onChange={set("note")} />
      </div>
    </div>
  )
}

const emptyAmount = (amount: number): AmountValue => ({
  amount: amount > 0 ? String(amount) : "",
  receivedAt: today(),
  bankReference: "",
  note: "",
})

function parseAmount(value: string): number | null {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null
}

function toBody(value: AmountValue, amount: number) {
  return {
    amount_received: amount,
    received_at: value.receivedAt,
    bank_reference: value.bankReference.trim() || null,
    note: value.note.trim() || null,
  }
}

type DrawerProps = {
  orderId: string
  transfer: OrderTransfer
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** "Confirm paid": captures the payment; below the remaining amount it needs an explicit shortfall tick */
export const ConfirmPaymentDrawer = ({ orderId, transfer, open, onOpenChange }: DrawerProps) => {
  const { t, i18n } = useTranslation()
  const invalidate = useInvalidate(orderId)
  const { payment } = transfer
  const remaining = roundAmount(payment.amount - transfer.amount_received)
  const [value, setValue] = useState<AmountValue>(() => emptyAmount(remaining))
  const [acceptShortfall, setAcceptShortfall] = useState(false)
  const money = (n: number) => formatAmount(n, payment.currency_code, i18n.language)

  const amount = parseAmount(value.amount)
  const shortfall = amount === null ? 0 : roundAmount(remaining - amount)
  const valid = amount !== null && !!value.receivedAt && (shortfall <= 0 || acceptShortfall)

  const confirm = useMutation({
    mutationFn: () => confirmPayment(payment.id, { ...toBody(value, amount!), accept_shortfall: shortfall > 0 }),
    onSuccess: () => {
      invalidate()
      toast.success(t("manualTransfer.toasts.confirmed"))
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  // Fresh form each time the drawer opens
  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setValue(emptyAmount(remaining))
      setAcceptShortfall(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("manualTransfer.actions.confirmTitle")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-1 flex-col gap-y-6 overflow-auto p-4">
          <BankCheckWarning />
          <div className="flex flex-col gap-y-2">
            <SummaryRow label={t("manualTransfer.widget.amount")} value={money(payment.amount)} />
            {transfer.amount_received > 0 && (
              <SummaryRow label={t("manualTransfer.widget.received")} value={money(transfer.amount_received)} />
            )}
            <SummaryRow label={t("manualTransfer.widget.remaining")} value={money(remaining)} strong />
          </div>
          <AmountFields idPrefix="mt-confirm" value={value} onChange={setValue} currencyCode={payment.currency_code} />
          {amount !== null && shortfall > 0 && (
            <div className="flex flex-col gap-y-3">
              <Alert variant="error">
                <Text size="small" leading="compact" weight="plus">
                  {t("manualTransfer.actions.shortfallTitle", { amount: money(shortfall) })}
                </Text>
                <Text size="small" leading="compact">
                  {t("manualTransfer.actions.shortfallText")}
                </Text>
              </Alert>
              <div className="flex items-start gap-x-2">
                <Checkbox
                  id="mt-confirm-shortfall"
                  checked={acceptShortfall}
                  onCheckedChange={(checked) => setAcceptShortfall(checked === true)}
                />
                <Label size="small" htmlFor="mt-confirm-shortfall">
                  {t("manualTransfer.actions.acceptShortfall", { amount: money(shortfall) })}
                </Label>
              </div>
            </div>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <Drawer.Close asChild>
              <Button size="small" variant="secondary" disabled={confirm.isPending}>
                {t("manualTransfer.actions.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              disabled={!valid || confirm.isPending}
              isLoading={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {t("manualTransfer.actions.confirm")}
            </Button>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

/** "Underpaid": records a partial transfer and shows what is left */
export const UnderpaymentDrawer = ({ orderId, transfer, open, onOpenChange }: DrawerProps) => {
  const { t, i18n } = useTranslation()
  const invalidate = useInvalidate(orderId)
  const { payment } = transfer
  const remaining = roundAmount(payment.amount - transfer.amount_received)
  const [value, setValue] = useState<AmountValue>(() => emptyAmount(0))
  const money = (n: number) => formatAmount(n, payment.currency_code, i18n.language)

  const amount = parseAmount(value.amount)
  const left = amount === null ? remaining : roundAmount(remaining - amount)
  const tooMuch = amount !== null && left <= 0
  const valid = amount !== null && !tooMuch && !!value.receivedAt

  const record = useMutation({
    mutationFn: () => recordUnderpayment(payment.id, toBody(value, amount!)),
    onSuccess: () => {
      invalidate()
      toast.success(t("manualTransfer.toasts.underpaid"))
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setValue(emptyAmount(0))
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("manualTransfer.actions.underpaidTitle")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-1 flex-col gap-y-6 overflow-auto p-4">
          <BankCheckWarning />
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("manualTransfer.actions.underpaidText")}
          </Text>
          <AmountFields idPrefix="mt-under" value={value} onChange={setValue} currencyCode={payment.currency_code} />
          <div className="bg-ui-bg-subtle flex flex-col gap-y-2 rounded-md px-4 py-3">
            <SummaryRow label={t("manualTransfer.widget.amount")} value={money(payment.amount)} />
            {transfer.amount_received > 0 && (
              <SummaryRow label={t("manualTransfer.widget.received")} value={money(transfer.amount_received)} />
            )}
            <SummaryRow label={t("manualTransfer.actions.thisTransfer")} value={amount === null ? "-" : money(amount)} />
            <SummaryRow label={t("manualTransfer.actions.leftToPay")} value={money(Math.max(left, 0))} strong />
          </div>
          {tooMuch && (
            <Alert variant="info">
              <Text size="small" leading="compact">
                {t("manualTransfer.actions.coversAll")}
              </Text>
            </Alert>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <Drawer.Close asChild>
              <Button size="small" variant="secondary" disabled={record.isPending}>
                {t("manualTransfer.actions.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              disabled={!valid || record.isPending}
              isLoading={record.isPending}
              onClick={() => record.mutate()}
            >
              {t("manualTransfer.actions.recordUnderpaid")}
            </Button>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

/** "Reject": a reason is required and shown to the buyer, who may then upload again */
export const RejectProofDrawer = ({
  orderId,
  proof,
  onClose,
}: {
  orderId: string
  proof: TransferProof | null
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const invalidate = useInvalidate(orderId)
  const [reason, setReason] = useState("")
  const [forId, setForId] = useState<string | null>(null)
  if (proof && proof.id !== forId) {
    setForId(proof.id)
    setReason("")
  }
  const valid = reason.trim().length >= 3

  const reject = useMutation({
    mutationFn: () => rejectProof(proof!.id, reason.trim()),
    onSuccess: () => {
      invalidate()
      toast.success(t("manualTransfer.toasts.rejected"))
      setForId(null)
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer
      open={!!proof}
      onOpenChange={(next) => {
        if (!next) {
          setForId(null)
          onClose()
        }
      }}
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("manualTransfer.actions.rejectTitle")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-1 flex-col gap-y-6 overflow-auto p-4">
          {proof && (
            <Text size="small" leading="compact" className="text-ui-fg-subtle break-words">
              {proof.filename}
            </Text>
          )}
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus" htmlFor="mt-reject-reason">
              {t("manualTransfer.actions.reason")}
            </Label>
            <Textarea
              id="mt-reject-reason"
              rows={4}
              maxLength={500}
              placeholder={t("manualTransfer.actions.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex items-start gap-x-1.5">
              <ExclamationCircle className="text-ui-fg-muted mt-0.5 shrink-0" />
              <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                {t("manualTransfer.actions.reasonHint")}
              </Text>
            </div>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <Drawer.Close asChild>
              <Button size="small" variant="secondary" disabled={reject.isPending}>
                {t("manualTransfer.actions.cancel")}
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              variant="danger"
              disabled={!valid || reject.isPending}
              isLoading={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {t("manualTransfer.actions.reject")}
            </Button>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
