import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import {
  PostAdminCreateAccount,
  PostAdminUpdateAccount,
} from "./admin/manual-transfer/accounts/validators"

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
  ],
})
