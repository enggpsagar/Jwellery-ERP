import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/** Products and Stock can be found by a stone's IGI / certificate number. */
test("products and stock are searchable by IGI certificate number", async ({ page }) => {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const igi = `IGI-E2E${suffix}`
  const metal = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-IGI-${suffix}`,
      name: `E2E IGI Ring ${suffix}`,
      categoryId: category.id,
      metalTypeId: metal.id,
      hasStoneComponent: true,
      stoneComponents: {
        create: { stoneMetalTypeName: "Diamond", stoneTypeNames: "Natural", caratWeight: 0.3, pieces: 4, certificateNumber: igi },
      },
    },
  })
  const stock = await db().inventoryStock.create({
    data: { storeId, productId: product.id, stockCode: `E2E-IGISTK-${suffix}`, metalTypeId: metal.id, quantity: 1, grossWeight: 2, netWeight: 1.9 },
  })

  try {
    // A partial number is enough, in any case.
    const partial = igi.slice(4).toLowerCase()
    await page.goto(`/inventory/products?search=${encodeURIComponent(partial)}`)
    await expect(page.locator("tbody tr").filter({ hasText: product.productCode })).toHaveCount(1)
    await expect(page.locator("tbody tr").filter({ hasText: /E2E IGI Ring/ })).toHaveCount(1)

    await page.goto(`/inventory/stock?search=${encodeURIComponent(partial)}`)
    await expect(page.locator("tbody tr").filter({ hasText: stock.stockCode })).toHaveCount(1)
  } finally {
    await db().inventoryStock.delete({ where: { id: stock.id } })
    await db().product.delete({ where: { id: product.id } })
  }
})
