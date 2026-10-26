import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import fs from "node:fs"

export default async function seed({ container }: ExecArgs) {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const storeModule = container.resolve(Modules.STORE)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const [store] = await storeModule.listStores()
  const { result: [channel] } = await createSalesChannelsWorkflow(container).run({
    input: { salesChannelsData: [{ name: "E2E" }] },
  })
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        // Store identity used by the e-mails and the invoice (Settings → Store, or the plugin's settings page)
        name: "Contoh Jati Store",
        metadata: {
          address: "Jl. Contoh No. 1\nJepara 59400, Indonesia",
          support_email: "hello@shop.example.test",
          phone: "+62 000 0000 0000",
          website: "https://shop.example.test",
        },
        supported_currencies: [{ currency_code: "usd", is_default: true }, { currency_code: "eur" }],
        default_sales_channel_id: channel.id,
      },
    },
  })
  const { result: [region] } = await createRegionsWorkflow(container).run({
    input: { regions: [{ name: "US", currency_code: "usd", countries: ["us"], payment_providers: ["pp_manual-transfer_manual-transfer"] }] },
  })
  const { result: [regionEu] } = await createRegionsWorkflow(container).run({
    input: { regions: [{ name: "EU", currency_code: "eur", countries: ["de"], payment_providers: ["pp_manual-transfer_manual-transfer"] }] },
  })
  const { result: [location] } = await createStockLocationsWorkflow(container).run({
    input: { locations: [{ name: "Jepara" }] },
  })
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })
  await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [channel.id] } })
  const { result: [profile] } = await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: "Default", type: "default" }] },
  })
  const fset = await fulfillment.createFulfillmentSets({
    name: "Jepara shipping", type: "shipping",
    service_zones: [{ name: "World", geo_zones: [{ country_code: "us", type: "country" }, { country_code: "de", type: "country" }] }],
  })
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fset.id },
  })
  const { result: [option] } = await createShippingOptionsWorkflow(container).run({
    input: [{
      name: "Freight", price_type: "flat", provider_id: "manual_manual",
      service_zone_id: fset.service_zones[0].id, shipping_profile_id: profile.id,
      type: { label: "Freight", description: "Sea freight", code: "freight" },
      prices: [{ currency_code: "usd", amount: 50 }, { currency_code: "eur", amount: 45 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    }],
  })
  const { result: [product] } = await createProductsWorkflow(container).run({
    input: { products: [{
      title: "Teak bench", status: "published", shipping_profile_id: profile.id,
      sales_channels: [{ id: channel.id }], options: [{ title: "Size", values: ["L"] }],
      variants: [{ title: "L", sku: "BENCH-L", manage_inventory: true, options: { Size: "L" },
        prices: [{ currency_code: "usd", amount: 600.25 }, { currency_code: "eur", amount: 550 }] }],
    }] },
  })
  const variant = product.variants[0]
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [v] }: any = await query.graph({ entity: "variant", fields: ["inventory_items.inventory_item_id"], filters: { id: variant.id } })
  const inventoryItemId = v.inventory_items[0].inventory_item_id
  await createInventoryLevelsWorkflow(container).run({
    input: { inventory_levels: [{ inventory_item_id: inventoryItemId, location_id: location.id, stocked_quantity: 10 }] },
  })
  const { result: [key] } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: "E2E", type: "publishable", created_by: "" }] },
  })
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } })

  const out = { region_id: region.id, region_eu_id: regionEu.id, variant_id: variant.id, option_id: option.id, publishable_key: key.token, inventory_item_id: inventoryItemId, location_id: location.id }
  fs.writeFileSync(process.env.SEED_OUT!, JSON.stringify({ ...out, store_id: store.id }, null, 2))
  console.log("SEEDED", out)
}
