import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Pure-metal weight (lib/fine-weight.ts): every metal line stores its 24K
 * equivalent next to the physical weight — 22K at 91.6%, so 10 g → 9.16 g —
 * and every total reads that. Covers the backfill of existing rows and the
 * invoice write path.
 */
const grossWeightInput = (page: Page) =>
  page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Gross Weight", { exact: false }) })
    .locator('input[type="number"]')
    .first()

async function goldMetalId(storeId: string) {
  const gold = await db().storeMetal.findFirst({
    where: { storeId, name: "Gold", hasPurity: true },
    select: { id: true },
  })
  expect(gold, "demo store has a Gold metal with purities").not.toBeNull()
  return gold!.id
}

test("existing 22K stock is backfilled at 91.6% fine", async () => {
  const storeId = await demoStoreId()
  const goldId = await goldMetalId(storeId)

  const rows = await db().inventoryStock.findMany({
    where: { storeId, metalTypeId: goldId, purity: "GOLD_22K", netWeight: { not: null } },
    select: { netWeight: true, fineWeight: true },
    take: 20,
  })
  expect(rows.length, "demo store has 22K gold stock").toBeGreaterThan(0)
  for (const row of rows) {
    expect(Number(row.fineWeight)).toBeCloseTo(Number(row.netWeight) * 0.916, 4)
  }
})

test("a 22K invoice line saves its 24K fine weight on the line and its stock", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const goldId = await goldMetalId(storeId)
  const itemName = `E2E Fine Chain ${Date.now()}`

  // The demo seed has no per-metal purity rows; give Gold a 22K at 91.6%.
  await db().storeMetalPurity.upsert({
    where: { storeMetalId_label: { storeMetalId: goldId, label: "22K" } },
    create: { storeId, storeMetalId: goldId, label: "22K", skuCode: "22", finenessPercent: 91.6 },
    update: { finenessPercent: 91.6, isActive: true },
  })

  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()

  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)

  // Compact row: Qty, Net Wt, Rate / g.
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(1).fill("10")
  await lineNumbers.nth(2).fill("5000")

  await page.getByRole("combobox").filter({ hasText: "Select metal" }).click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Purity", { exact: true }) })
    .getByRole("combobox")
    .first()
    .click()
  await page.getByRole("option", { name: "22K", exact: true }).click()
  await page.getByRole("combobox").filter({ hasText: "Select category" }).click()
  await page.getByRole("option", { name: "Ornament", exact: true }).click()
  await grossWeightInput(page).fill("10")
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
  await expect(page.getByText(/Still needed:/)).toHaveCount(0)

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

  const line = await db().invoiceItem.findFirst({
    where: { itemName, invoice: { storeId } },
    include: { inventoryStock: true },
  })
  expect(line, "invoice line saved").not.toBeNull()
  expect(Number(line!.netWeight)).toBeCloseTo(10, 4)
  expect(Number(line!.fineWeight)).toBeCloseTo(9.16, 4)
  expect(Number(line!.inventoryStock?.fineWeight)).toBeCloseTo(9.16, 4)
  expect(crashes).toEqual([])
})
