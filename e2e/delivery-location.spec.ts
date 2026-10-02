import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Settings → Delivery Locations: with none picked, New Invoice hides the
 * Delivery Location field entirely (the sale bills intra-state); once any
 * state is picked, the field is back (lib/delivery-location.ts).
 */
test("Delivery Location shows on New Invoice only when Settings has some", async ({ page }) => {
  const storeId = await demoStoreId()
  const settings = await db().businessSettings.findUnique({
    where: { storeId },
    select: { allowedDeliveryStateIds: true },
  })
  const original = settings?.allowedDeliveryStateIds ?? []

  try {
    await db().businessSettings.update({ where: { storeId }, data: { allowedDeliveryStateIds: [] } })
    await page.goto("/billing/new")
    await expect(page.getByRole("button", { name: "Create Invoice" })).toBeVisible()
    await expect(page.getByText("Delivery Location", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Add a delivery location/ })).toHaveCount(0)

    const state = await db().state.findFirst({ select: { id: true } })
    expect(state, "states are seeded").not.toBeNull()
    await db().businessSettings.update({ where: { storeId }, data: { allowedDeliveryStateIds: [state!.id] } })
    await page.goto("/billing/new")
    await expect(page.getByRole("button", { name: /Add a delivery location/ })).toBeVisible()
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: { allowedDeliveryStateIds: original } })
  }
})
