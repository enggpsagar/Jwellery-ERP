import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * The lists' "Unassigned" metal filter only appears when the store has
 * something with no metal set — otherwise it could only ever show nothing.
 */
test("the Unassigned metal filter shows only when a product has no metal", async ({ page }) => {
  const storeId = await demoStoreId()
  const metalFilter = () => page.getByRole("combobox").filter({ hasText: /All Metals/ }).first()

  // Clear any metal-less products left by other specs for the first check.
  const stray = await db().product.findMany({ where: { storeId, metalTypeId: null }, select: { id: true } })
  if (stray.length === 0) {
    await page.goto("/inventory/products")
    await page.waitForLoadState("networkidle")
    await metalFilter().click()
    await expect(page.getByRole("option", { name: "Unassigned" })).toHaveCount(0)
    await page.keyboard.press("Escape")
  }

  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const product = await db().product.create({
    data: { storeId, productCode: `E2E-NOMETAL-${Date.now()}`, name: `E2E No Metal ${Date.now()}`, categoryId: category.id },
  })
  try {
    await page.goto("/inventory/products")
    await page.waitForLoadState("networkidle")
    await metalFilter().click()
    await page.getByRole("option", { name: "Unassigned" }).click()
    await expect(page).toHaveURL(/type=UNASSIGNED/)
    await expect(page.locator("tbody tr").filter({ hasText: product.productCode })).toHaveCount(1)
  } finally {
    await db().product.delete({ where: { id: product.id } })
  }
})
