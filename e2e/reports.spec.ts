import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

const TABS = [
  "Sales",
  "Sales by User",
  "Vendor Purchase",
  "Inventory Valuation",
  "Stock",
  "Artisan Outstanding",
  "Party Dues",
  "Gold Flow",
  "By Metal",
  "Item Ledger",
]

test("every report tab renders", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  await page.goto("/reports")

  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click()
    await expect(page.getByRole("button", { name: `Export ${tab}` })).toBeVisible()
  }
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
  expect(crashes).toEqual([])
})

test("Stock report splits Available and Out of Stock", async ({ page }) => {
  await page.goto("/reports")
  await page.getByRole("button", { name: "Stock", exact: true }).click()

  await expect(page.getByText("Available Items")).toBeVisible()
  await expect(page.getByText("Out of Stock Items")).toBeVisible()

  await page.getByRole("button", { name: /^Out of Stock \(\d+\)$/ }).click()
  const badges = page.locator("tbody td span.rounded-full")
  const count = await badges.count()
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveText("Out of Stock")
  }

  await page.getByRole("button", { name: /^Available \(\d+\)$/ }).click()
  const availableBadges = page.locator("tbody td span.rounded-full")
  const availableCount = await availableBadges.count()
  for (let i = 0; i < availableCount; i++) {
    await expect(availableBadges.nth(i)).toHaveText("Available")
  }
})

test("report export downloads a file", async ({ page }) => {
  const response = await page.request.get("/reports/export?type=stock&format=csv")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/csv")
  expect(await response.text()).toContain("Stock Code")
})

/**
 * Stones count in the By Metal report under their gemstone, in carats — a
 * stone set in a gold piece (on the stock row itself, and as a STONE
 * PieceComponent of a multi-part piece) and a loose stone (stock row with no
 * metal). In stock: 0.15 + 0.20 + 2 × 0.50 = 1.35 ct. The gold pieces' own
 * metal stays under the gold row in grams.
 */
test("By Metal counts set and loose stones under their gemstone in carats", async ({ page }) => {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.create({ data: { storeId, name: `E2E RptGold ${suffix}`, hasPurity: true } })
  const gem = await db().storeMetal.create({
    data: { storeId, name: `E2E RptEmerald ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  const goldProduct = await db().product.create({
    data: { storeId, productCode: `E2E-RPTG-${suffix}`, name: `E2E Emerald Ring ${suffix}`, metalTypeId: gold.id },
  })
  const looseProduct = await db().product.create({
    data: { storeId, productCode: `E2E-RPTL-${suffix}`, name: `E2E Loose Emerald ${suffix}`, defaultStoneMetalTypeName: gem.name },
  })
  try {
    // Gold piece with its stone on the row itself.
    await db().inventoryStock.create({
      data: {
        storeId,
        productId: goldProduct.id,
        stockCode: `E2E-RPT-A-${suffix}`,
        metalTypeId: gold.id,
        quantity: 1,
        netWeight: 4,
        fineWeight: 4,
        caratWeight: 0.15,
        stoneMetalTypeName: gem.name,
      },
    })
    // Multi-part gold piece: the stone is a STONE component (the row's own
    // caratWeight is a summary and must not count twice).
    await db().inventoryStock.create({
      data: {
        storeId,
        productId: goldProduct.id,
        stockCode: `E2E-RPT-B-${suffix}`,
        metalTypeId: gold.id,
        quantity: 1,
        netWeight: 2,
        fineWeight: 2,
        caratWeight: 0.2,
        stoneMetalTypeName: gem.name,
        components: {
          create: [
            { kind: "METAL", metalTypeId: gold.id, netWeight: 2, fineWeight: 2 },
            { kind: "STONE", stoneMetalTypeName: gem.name, caratWeight: 0.2 },
          ],
        },
      },
    })
    // Loose stones: no metal, two pieces of 0.5 ct.
    await db().inventoryStock.create({
      data: {
        storeId,
        productId: looseProduct.id,
        stockCode: `E2E-RPT-L-${suffix}`,
        metalTypeId: null,
        quantity: 2,
        caratWeight: 0.5,
        stoneMetalTypeName: gem.name,
      },
    })

    await page.goto("/reports")
    await page.getByRole("button", { name: "By Metal", exact: true }).click()
    await page.getByPlaceholder("Search metal...").fill(`E2E RptEmerald ${suffix}`)
    const gemRow = page.locator("tbody tr").filter({ hasText: gem.name })
    await expect(gemRow).toHaveCount(1)
    // In Stock column (4th cell): 1.35 ct across 1 loose row.
    await expect(gemRow.locator("td").nth(3)).toContainText(/1\.350? ct/)
    await expect(gemRow.locator("td").nth(3)).toContainText("1 item(s)")

    await page.getByPlaceholder("Search metal...").fill(`E2E RptGold ${suffix}`)
    const goldRow = page.locator("tbody tr").filter({ hasText: gold.name })
    await expect(goldRow.locator("td").nth(3)).toContainText(/6\.0+g/)
    await expect(goldRow.locator("td").nth(3)).toContainText("2 item(s)")

    const csv = await (await page.request.get("/reports/export?type=metalWise&format=csv")).text()
    const gemLine = csv.split("\n").find((line) => line.includes(`${gem.name} (ct)`))
    expect(gemLine).toBeTruthy()
    expect(gemLine).toContain("1.35")
  } finally {
    await db().inventoryStock.deleteMany({ where: { productId: { in: [goldProduct.id, looseProduct.id] } } })
    await db().product.deleteMany({ where: { id: { in: [goldProduct.id, looseProduct.id] } } })
    await db().storeMetal.deleteMany({ where: { id: { in: [gold.id, gem.id] } } })
  }
})
