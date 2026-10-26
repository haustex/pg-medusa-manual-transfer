import { z } from "@medusajs/framework/zod"

export const PostAdminRejectProof = z.object({
  reason: z.string().trim().min(3, { message: "Alasan penolakan wajib diisi" }).max(500),
})
export type PostAdminRejectProofType = z.infer<typeof PostAdminRejectProof>
