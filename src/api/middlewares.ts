import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import {
  PostAdminCreateAccount,
  PostAdminUpdateAccount,
} from "./admin/manual-transfer/accounts/validators"
import {
  PostAdminConfirmPayment,
  PostAdminRecordUnderpayment,
} from "./admin/manual-transfer/payments/validators"
import { PostAdminRejectProof } from "./admin/manual-transfer/proofs/validators"
import { proofRateLimit, proofUploadParser } from "./manual-transfer-http"

// Logged-in customers are recognised; guests use the upload token instead
const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/manual-transfer/accounts",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminCreateAccount)],
    },
    {
      matcher: "/admin/manual-transfer/accounts/:id",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminUpdateAccount)],
    },
    {
      matcher: "/admin/manual-transfer/payments/:id/confirm",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminConfirmPayment)],
    },
    {
      matcher: "/admin/manual-transfer/payments/:id/underpaid",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminRecordUnderpayment)],
    },
    {
      matcher: "/admin/manual-transfer/proofs/:id/reject",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminRejectProof)],
    },
    {
      matcher: "/store/manual-transfer/orders/:id",
      method: "GET",
      middlewares: [proofRateLimit("read"), optionalCustomer],
    },
    {
      matcher: "/store/manual-transfer/orders/:id/invoice",
      method: "GET",
      middlewares: [proofRateLimit("read"), optionalCustomer],
    },
    {
      matcher: "/store/manual-transfer/orders/:id/proofs",
      method: "POST",
      // Rate limit before the body is buffered
      middlewares: [proofRateLimit("upload"), optionalCustomer, proofUploadParser],
    },
    {
      matcher: "/store/manual-transfer/carts/:id/upload-token",
      method: "GET",
      // Its own, tighter budget: each call tries a cart id
      middlewares: [proofRateLimit("token")],
    },
    {
      matcher: "/manual-transfer/proofs/:id/file",
      method: "GET",
      middlewares: [proofRateLimit("read")],
    },
  ],
})
