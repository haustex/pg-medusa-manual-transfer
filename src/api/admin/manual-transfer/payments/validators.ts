import { z } from "@medusajs/framework/zod"

export const PostAdminConfirmPayment = z.object({
  amount_received: z.number().positive(),
  received_at: z.iso.date({ message: "Tanggal dana masuk, format YYYY-MM-DD" }),
  bank_reference: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(1000).nullish(),
  accept_shortfall: z.boolean().optional(),
})
export type PostAdminConfirmPaymentType = z.infer<typeof PostAdminConfirmPayment>

export const PostAdminRecordUnderpayment = PostAdminConfirmPayment.omit({ accept_shortfall: true })
export type PostAdminRecordUnderpaymentType = z.infer<typeof PostAdminRecordUnderpayment>

export const GetAdminTransfers = z.object({
  status: z
    .enum(["awaiting_payment", "awaiting_verification", "paid", "underpaid", "rejected", "expired", "canceled"])
    .optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
