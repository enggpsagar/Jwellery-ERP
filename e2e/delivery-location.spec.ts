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

test("Delivery Locations are set on Settings → Locations and saved on their own", async ({ page }) => {
  const storeId = await demoStoreId()
  const original =
    (await db().businessSettings.findUnique({ where: { storeId }, select: { allowedDeliveryStateIds: true } }))
      ?.allowedDeliveryStateIds ?? []
  const state = await db().state.findFirst({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  try {
    await db().businessSettings.update({ where: { storeId }, data: { allowedDeliveryStateIds: [] } })
    await page.goto("/settings/locations")
    await expect(page.getByText("Delivery Locations", { exact: true })).toBeVisible()
    await page.getByLabel(state!.name, { exact: true }).check()
    await page.getByRole("button", { name: "Save Delivery Locations" }).click()
    await expect(page.getByText(/Delivery Locations saved/)).toBeVisible()
    const saved = await db().businessSettings.findUnique({ where: { storeId }, select: { allowedDeliveryStateIds: true } })
    expect(saved?.allowedDeliveryStateIds).toEqual([state!.id])

    // No longer on the main Settings page.
    await page.goto("/settings")
    await expect(page.getByText("Delivery Locations", { exact: true })).toHaveCount(0)
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: { allowedDeliveryStateIds: original } })
  }
})
