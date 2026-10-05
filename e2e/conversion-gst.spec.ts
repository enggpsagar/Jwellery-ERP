import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Converting an Estimate or a Quotation to a Tax Invoice taxes each line on
 * metal × QUANTITY + making + HM + stone (lib/conversion-gst.ts) — it used
 * to tax a 2-piece line as if it were one piece.
 */
async function fillTwoPieceLine(page: Page, itemName: string) {
  const field = (label: string) =>
    page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) }).locator("input").first()
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()
  await field("Item Name").fill(itemName)
  await field("Quantity").fill("2")
  await field("Net Weight").fill("5")
  await field("Rate / g").fill("6000")
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
}

async function convertedTax(storeId: string, itemName: string) {
  await expect
    .poll(async () => db().invoiceItem.count({ where: { itemName, invoice: { storeId } } }), { timeout: 15000 })
    .toBe(1)
  const line = await db().invoiceItem.findFirst({ where: { itemName, invoice: { storeId } } })
  return Number(line!.sgstAmount) + Number(line!.cgstAmount) + Number(line!.igstAmount)
}

test("an Estimate line of 2 pieces is taxed on both when converted", async ({ page }) => {
  const storeId = await demoStoreId()
  const itemName = `E2E Two Bangles Slip ${Date.now()}`
  await page.goto("/billing/kacha/new")
  await fillTwoPieceLine(page, itemName)
  await page.getByRole("button", { name: "Create Estimate" }).click()
  await page.waitForURL(/\/billing\/kacha\/(?!new)[^/]+$/)
  await page.goto(`${page.url()}/convert`)
  // 2 × 5 g × ₹6,000 = ₹60,000 at the default 3% → ₹1,800 (not ₹900).
  await expect(page.getByText(/1,?800\.00/).first()).toBeVisible()
  await page.getByRole("button", { name: "Convert to Tax Invoice" }).click()
  expect(await convertedTax(storeId, itemName)).toBeCloseTo(1800, 2)
})

test("a Quotation line of 2 pieces is taxed on both when converted", async ({ page }) => {
  const storeId = await demoStoreId()
  const itemName = `E2E Two Bangles Quote ${Date.now()}`
  await page.goto("/quotations/new")
  await fillTwoPieceLine(page, itemName)
  await page.getByRole("button", { name: "Create Quotation" }).click()
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/)
  await page.goto(`${page.url()}/convert`)
  await page.getByRole("button", { name: "Convert to Invoice" }).click()
  expect(await convertedTax(storeId, itemName)).toBeCloseTo(1800, 2)
})
