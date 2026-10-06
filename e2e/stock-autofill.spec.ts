import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * An 18K gold earring with a diamond, as a store first sets one up: purity
 * picked, no selling price anywhere, no stone rate. Picking it on an
 * invoice must still fill Purity, the stone, and a Rate / g (today's 24K
 * rate × 75%) — not leave them blank.
 */
async function seedEarring() {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const metal = await db().storeMetal.create({
    data: { storeId, name: `E2E Gold ${suffix}`, hasPurity: true },
  })
  const purity = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: metal.id, label: "18", skuCode: `E2E18-${suffix}`, finenessPercent: 75 },
  })
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-EAR-${suffix}`,
      name: `E2E Earring ${suffix}`,
      categoryId: category.id,
      metalTypeId: metal.id,
      defaultPurity: "GOLD_18K",
      storeMetalPurityId: purity.id,
      defaultGrossWeight: 1.85,
      defaultNetWeight: 1.794,
      hasStoneComponent: true,
      defaultStoneMetalTypeName: "Diamond",
      defaultCaratWeight: 0.28,
      metalComponents: { create: { metalTypeId: metal.id, storeMetalPurityId: purity.id, grossWeight: 1.85, netWeight: 1.85 } },
      stoneComponents: { create: { stoneMetalTypeName: "Diamond", stoneTypeNames: "Natural", caratWeight: 0.28, pieces: 6 } },
    },
  })
  const stock = await db().inventoryStock.create({
    data: {
      storeId,
      productId: product.id,
      stockCode: `E2E-STK-${suffix}`,
      metalTypeId: metal.id,
      purity: "GOLD_18K",
      purityLabel: "18",
      quantity: 1,
      grossWeight: 1.85,
      netWeight: 1.794,
      fineWeight: 1.3455,
      stoneWeight: 0.056,
      caratWeight: 0.28,
      stoneMetalTypeName: "Diamond",
      stoneTypeNames: "Natural",
    },
  })
  const rate = await db().metalRate.findFirstOrThrow({ where: { storeId }, orderBy: { createdAt: "desc" } })
  return { stock, product, expectedRate: Number(rate.gold24k) * 0.75 }
}

test("picking a stock piece fills Purity, stone and Rate / g", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { product, expectedRate } = await seedEarring()

  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByPlaceholder(/search/i).last().fill(product.productCode)
  await page.getByRole("option", { name: new RegExp(product.productCode) }).click()

  // Rate / g: no selling price configured → today's 24K rate × 75%.
  const rateInput = page.locator('input[type="number"]').nth(2)
  await expect(rateInput).toHaveValue(String(expectedRate))
  await expect(page.getByText("Selling price is required")).toHaveCount(0)

  // Details: Purity shows the piece's own "18", and the diamond comes along.
  const details = page.getByText("Product details").locator("..")
  await expect(details.getByRole("combobox").nth(1)).toHaveText("18")
  await expect(page.getByText("Includes a Stone").first()).toBeVisible()
  await expect(page.locator('input[type="number"][value="0.28"]').first()).toBeAttached()

  expect(crashes).toEqual([])
})

test("stock tags print every metal and stone, per Settings > Tags", async ({ page }) => {
  const { stock } = await seedEarring()
  const storeId = await demoStoreId()

  await page.goto(`/inventory/stock/print-qr?ids=${stock.id}`)
  const qrTag = page.locator("#stock-qr-print-grid .stock-qr-label").first()
  await expect(qrTag).toContainText("18 KT")
  await expect(qrTag).toContainText("Diamond Natural : 0.28ct / 6pcs")

  await page.goto(`/inventory/stock/print-qr?ids=${stock.id}&layout=barcode`)
  const barcodeTag = page.locator("#stock-qr-print-grid .stock-qr-label").first()
  await expect(barcodeTag).toContainText("N.W : 1.794g")
  await expect(barcodeTag).toContainText("Diamond Natural")

  // Settings > Tags: drop Stones from the QR tag, add Category; save.
  await page.goto("/settings/tags")
  // A click that lands before React hydrates the form is silently lost
  // (seen in CI), and a "button gone" check can pass while the page is
  // still swapping in — the save then still carried STONES. Wait for the
  // page to settle, then confirm against the printed list itself.
  await page.waitForLoadState("networkidle")
  const qrCard = page.getByTestId("qr-tag-fields")
  const printed = page.getByTestId("qr-tag-fields-printed")
  const removeStones = qrCard.getByRole("button", { name: /Remove Stones/ })
  await expect(async () => {
    if (await removeStones.count()) await removeStones.click({ timeout: 1_000 })
    await expect(printed).not.toContainText("Stones (each stone", { timeout: 1_000 })
  }).toPass()
  await qrCard.getByRole("button", { name: /Category & type/ }).click()
  await expect(printed).toContainText("Category & type")
  await expect(printed).not.toContainText("Stones (each stone")
  await page.getByRole("button", { name: "Save tag fields" }).click()
  const savedFields = async () =>
    (await db().businessSettings.findUniqueOrThrow({ where: { storeId }, select: { qrTagFields: true } })).qrTagFields
  await expect.poll(savedFields).toContain("CATEGORY")
  expect(await savedFields()).not.toContain("STONES")

  await page.goto(`/inventory/stock/print-qr?ids=${stock.id}`)
  await expect(page.locator("#stock-qr-print-grid .stock-qr-label").first()).not.toContainText("Diamond")

  // Put the defaults back for the other specs.
  await db().businessSettings.update({
    where: { storeId },
    data: {
      qrTagFields: ["TAG_CODE", "PRODUCT_NAME", "PRODUCT_CODE", "METALS", "GROSS_WEIGHT", "NET_WEIGHT", "STONES", "MFG_DATE"],
    },
  })
})

test("stock list shows quantity on the code and a fine weight column", async ({ page }) => {
  const { stock } = await seedEarring()
  await page.goto(`/inventory/stock?search=${stock.stockCode}`)
  const row = page.locator("tbody tr").filter({ hasText: stock.stockCode })
  await expect(row).toContainText(`${stock.stockCode} (1)`)
  await expect(row).toContainText("1.345 g")
  await expect(page.locator("thead")).toContainText("Fine Weight")
})
