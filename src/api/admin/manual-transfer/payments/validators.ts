import { z } from "@medusajs/framework/zod"

export const PostAdminConfirmPayment = z.object({
  amount_received: z.number().positive(),
  received_at: z.iso.date({ message: "Tanggal dana masuk, format YYYY-MM-DD" }),
  bank_reference: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(1000).nullish(),
  accept_shortfall: z.boolean().optional(),
})
export type PostAdminConfirmPaymentType = z.infer<typeof PostAdminConfirmPayment>
