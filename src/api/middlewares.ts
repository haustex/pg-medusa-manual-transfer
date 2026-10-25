import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import {
  PostAdminCreateAccount,
  PostAdminUpdateAccount,
} from "./admin/manual-transfer/accounts/validators"
import { PostAdminConfirmPayment } from "./admin/manual-transfer/payments/validators"

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
  ],
})
