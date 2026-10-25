import { z } from "@medusajs/framework/zod"

const SWIFT_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

const accountFields = {
  label: z.string().trim().max(120).nullish(),
  bank_name: z.string().trim().min(1).max(120),
  account_holder: z.string().trim().min(1).max(200),
  account_number: z.string().trim().min(1).max(64),
  swift_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(SWIFT_PATTERN, { message: "SWIFT/BIC harus 8 atau 11 karakter, mis. JAGBIDJA" })
    .nullish(),
  bank_address: z.string().trim().max(500).nullish(),
  currency_code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/, { message: "Kode mata uang ISO 4217, mis. usd" }),
  region_ids: z.array(z.string().min(1)).optional(),
  is_active: z.boolean().optional(),
  rank: z.number().int().min(0).optional(),
}

export const PostAdminCreateAccount = z.object(accountFields)
export type PostAdminCreateAccountType = z.infer<typeof PostAdminCreateAccount>

export const PostAdminUpdateAccount = z.object(accountFields).partial()
export type PostAdminUpdateAccountType = z.infer<typeof PostAdminUpdateAccount>
