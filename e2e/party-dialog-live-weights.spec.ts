import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Parties list → pop-up (PartyDetailDialog): clicking a party's name opens
 * its details, net balance and the full ledger history (open, not behind
 * "View Details") in one place; the side panel's expand icon opens the same.
 */
test("party pop-up: name click shows details, net balance and the full ledger", async ({ page }) => {
  const storeId = await demoStoreId()
  const tag = `E2E Pop ${Date.now()}`
  const party = await db().customer.create({
    data: { storeId, name: tag, city: "Surat", gstin: "24AUDPS6825L1Z7" },
  })
  const day = (n: number) => new Date(Date.UTC(2026, 0, n, 6))

  try {
    await db().ledgerEntry.createMany({
      data: [
        { storeId, type: "DEBIT", sourceType: "SALE", customerId: party.id, amount: 10000, description: `${tag} sale`, entryDate: day(5) },
        { storeId, type: "CREDIT", sourceType: "PURCHASE", vendorId: party.id, amount: 25000, description: `${tag} purchase`, entryDate: day(6) },
      ],
    })
    // 10,000 − 25,000 = 15,000 Payable

    await page.goto(`/customers?search=${encodeURIComponent(tag)}`)
    const row = page.getByRole("row").filter({ hasText: tag })
    await row.getByRole("button", { name: tag }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: tag })).toBeVisible()
    await expect(dialog.getByTestId("party-ledger-net")).toContainText("15,000.00")
    await expect(dialog.getByTestId("party-ledger-net")).toContainText("Payable")
    await expect(dialog.getByText("You owe this party")).toBeVisible()
    // Full history straight away — both entries, no "View Details" step.
    await expect(dialog.getByText(`${tag} sale`)).toBeVisible()
    await expect(dialog.getByText(`${tag} purchase`)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Hide Details" })).toBeVisible()
    await expect(dialog.getByText("24AUDPS6825L1Z7")).toBeVisible()

    await dialog.getByRole("button", { name: "Close" }).first().click()
    await expect(dialog).toHaveCount(0)

    // Side panel (now showing this party) → expand icon → same pop-up.
    await page.getByRole("button", { name: "Open in pop-up with full ledger" }).click()
    await expect(page.getByRole("dialog").getByText(`${tag} purchase`)).toBeVisible()
  } finally {
    await db().ledgerEntry.deleteMany({ where: { storeId, OR: [{ customerId: party.id }, { vendorId: party.id }] } })
    await db().customer.deleteMany({ where: { id: party.id } })
  }
})

/**
 * Product detail: with stock on hand, the weights shown are the live stock
 * (they move with purchases and sales); the product's template weights only
 * show while nothing is in stock, labelled as purchase pre-fills.
 */
test("product detail shows live stock weights, not the template, once stocked", async ({ page }) => {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-LW-${suffix}`,
      name: `E2E Live Weight Bar ${suffix}`,
      metalTypeId: gold.id,
      soldByWeight: true,
      defaultGrossWeight: 100,
      defaultNetWeight: 100,
      metalComponents: { create: { metalTypeId: gold.id, grossWeight: 100, netWeight: 100 } },
    },
  })

  try {
    // No stock yet: the template is what there is, labelled as such.
    await page.goto(`/inventory/products/${product.id}`)
    const main = page.locator("main").last()
    await expect(main).toContainText("Default Net Weight (pre-fills new purchases)")
    await expect(main).toContainText("Metal & Weights")

    // Two purchased lots: 30.5 g + 22.48 g.
    await db().inventoryStock.createMany({
      data: [
        { storeId, productId: product.id, stockCode: `E2E-LW-A-${suffix}`, metalTypeId: gold.id, quantity: 1, grossWeight: 30.5, netWeight: 30.5, fineWeight: 30.5 },
        { storeId, productId: product.id, stockCode: `E2E-LW-B-${suffix}`, metalTypeId: gold.id, quantity: 1, grossWeight: 22.48, netWeight: 22.48, fineWeight: 22.48 },
      ],
    })

    await page.goto(`/inventory/products/${product.id}`)
    await expect(main).toContainText("Net weight in stock")
    await expect(main).toContainText("52.98")
    await expect(main).not.toContainText("pre-fills new purchases")
    await expect(main).not.toContainText("100.000")
    await expect(main).toContainText("Metal Details")
  } finally {
    await db().inventoryStock.deleteMany({ where: { productId: product.id } })
    await db().product.deleteMany({ where: { id: product.id } })
  }
})
