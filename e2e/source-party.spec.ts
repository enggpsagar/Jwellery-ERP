import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * "Purchased From" (lib/inventory/line-source-party.ts): a hand-typed line
 * on a Kacha slip or Quotation can't be saved until it names the party its
 * piece came in from, and the party is stored on the line itself (those
 * forms never mint a stock row). The Invoice side is in billing.spec.ts.
 */
const lineInput = (page: Page, label: string) =>
  page
    .locator("div.space-y-1")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("input")
    .first()

async function fillHandTypedLine(page: Page, itemName: string) {
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()

  await lineInput(page, "Item Name").fill(itemName)
  await lineInput(page, "Net Weight").fill("5")
  await lineInput(page, "Rate / g").fill("5000")
}

async function pickSourceParty(page: Page) {
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
}

test("a hand-typed Kacha line needs its Purchased From party, and saves it", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const itemName = `E2E Kacha Chain ${Date.now()}`

  await page.goto("/billing/kacha/new")
  await fillHandTypedLine(page, itemName)

  const submit = page.getByRole("button", { name: "Create Estimate" })
  await expect(page.getByText("Select who this piece was purchased from")).toBeVisible()
  await expect(submit).toBeDisabled()

  await pickSourceParty(page)
  await expect(page.getByText("Select who this piece was purchased from")).toHaveCount(0)
  await submit.click()
  await page.waitForURL(/\/billing\/kacha\/(?!new)[^/]+$/)
  await expect(page.getByText("Purchased from Chandra Bullion Suppliers")).toBeVisible()

  const storeId = await demoStoreId()
  const item = await db().kachaInvoiceItem.findFirst({
    where: { itemName, kachaInvoice: { storeId } },
    include: { vendor: true },
  })
  expect(item?.vendor?.name).toBe("Chandra Bullion Suppliers")
  expect(item?.vendorName).toBe("Chandra Bullion Suppliers")
  expect(crashes).toEqual([])
})

test("a hand-typed Quotation line needs its Purchased From party, and saves it", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const itemName = `E2E Quote Ring ${Date.now()}`

  await page.goto("/quotations/new")
  await fillHandTypedLine(page, itemName)

  const submit = page.getByRole("button", { name: "Create Quotation" })
  await expect(submit).toBeDisabled()

  await pickSourceParty(page)
  await submit.click()
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/)
  await expect(page.getByText("Purchased from Chandra Bullion Suppliers")).toBeVisible()

  const storeId = await demoStoreId()
  const item = await db().quotationItem.findFirst({
    where: { itemName, quotation: { storeId } },
  })
  expect(item?.vendorName).toBe("Chandra Bullion Suppliers")
  expect(crashes).toEqual([])
})
