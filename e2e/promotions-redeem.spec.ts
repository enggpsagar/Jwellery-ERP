import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Offers & gift vouchers redeemed on New Invoice (lib/promotions.ts): the
 * discount comes off the qualifying lines before GST, the server re-checks
 * the code, and a single-use voucher can't be used twice.
 */
const grossWeightInput = (page: Page) =>
  page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Gross Weight", { exact: false }) })
    .locator('input[type="number"]')
    .first()

/** One new Gold line: `quantity` pieces of 10 g at ₹6,000/g, no making. */
async function fillLine(page: Page, itemName: string, quantity: string) {
  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(0).fill(quantity)
  await lineNumbers.nth(1).fill("10")
  await lineNumbers.nth(2).fill("6000")
  await page.getByRole("combobox").filter({ hasText: "Select metal" }).first().click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await page.getByRole("combobox").filter({ hasText: "Select category" }).click()
  await page.getByRole("option", { name: "Ornament", exact: true }).click()
  await grossWeightInput(page).fill("10")
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
}

async function applyCode(page: Page, code: string) {
  await page.getByLabel("Offer or voucher code").fill(code)
  await page.getByRole("button", { name: "Apply", exact: true }).click()
}

async function createPromotion(data: Record<string, unknown>) {
  const storeId = await demoStoreId()
  return db().promotion.create({ data: { storeId, isActive: true, ...data } as never })
}

test("a 10% offer comes off the bill before GST", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const code = `E2E10${Date.now() % 100000}`
  await createPromotion({ name: "E2E Ten Percent", type: "PERCENT_OFF", target: "BILL", percentOff: 10, code })
  const itemName = `E2E Offer Chain ${Date.now()}`

  await fillLine(page, itemName, "1")
  await applyCode(page, code)
  await expect(page.getByTestId("promo-total")).toContainText("-₹6000.00")
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  await expect(page.getByText(`incl. offer ${code}`).first()).toBeVisible()

  const invoice = await db().invoice.findFirst({ where: { storeId, items: { some: { itemName } } }, include: { items: true } })
  expect(invoice!.promotionCode).toBe(code)
  expect(Number(invoice!.promotionDiscount)).toBeCloseTo(6000, 2)
  // 60,000 − 6,000 = 54,000 taxable; 3% GST = 1,620; total 55,620.
  expect(Number(invoice!.items[0].schemeDiscount)).toBeCloseTo(6000, 2)
  expect(Number(invoice!.taxAmount)).toBeCloseTo(1620, 2)
  expect(Number(invoice!.totalAmount)).toBeCloseTo(55620, 2)
  expect(crashes).toEqual([])
})

test("a single-use voucher works once, and again after its bill is cancelled", async ({ page }) => {
  const storeId = await demoStoreId()
  const promotion = await createPromotion({ name: "E2E Flat 500", type: "FLAT_OFF", target: "BILL", amountOff: 500 })
  const code = `E2EV${Date.now() % 1000000}`
  await db().promotionVoucher.create({ data: { storeId, promotionId: promotion.id, code } })

  const first = `E2E Voucher Ring ${Date.now()}`
  await fillLine(page, first, "1")
  await applyCode(page, code)
  await expect(page.getByTestId("promo-total")).toContainText("-₹500.00")
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  const voucher = await db().promotionVoucher.findFirst({ where: { storeId, code } })
  expect(voucher!.usedAt).not.toBeNull()

  // Second bill: refused.
  await fillLine(page, `E2E Voucher Ring 2 ${Date.now()}`, "1")
  await applyCode(page, code)
  await expect(page.getByText("This voucher has already been used.")).toBeVisible()

  // Cancel the first bill → the voucher is free again.
  const invoice = await db().invoice.findFirst({ where: { storeId, items: { some: { itemName: first } } } })
  await page.goto(`/billing/${invoice!.id}`)
  await page.getByRole("button", { name: "Cancel Invoice" }).first().click()
  const dialog = page.getByRole("dialog")
  const reason = dialog.locator("textarea")
  if (await reason.count()) await reason.first().fill("E2E: voucher release")
  await dialog.getByRole("button", { name: "Cancel Invoice" }).click()
  await expect.poll(async () => (await db().promotionVoucher.findFirst({ where: { storeId, code } }))?.usedAt ?? null).toBeNull()
})

test("buy 1 get 1 free on a 2-piece line frees one piece", async ({ page }) => {
  const storeId = await demoStoreId()
  const code = `E2EBOGO${Date.now() % 100000}`
  await createPromotion({ name: "E2E BOGO", type: "BUY_X_GET_Y", target: "BILL", buyQuantity: 1, getQuantity: 1, getPercentOff: 100, code })
  const itemName = `E2E BOGO Studs ${Date.now()}`

  await fillLine(page, itemName, "2")
  await applyCode(page, code)
  // 2 × ₹60,000 → one free.
  await expect(page.getByTestId("promo-total")).toContainText("-₹60000.00")
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  const invoice = await db().invoice.findFirst({ where: { storeId, items: { some: { itemName } } } })
  expect(Number(invoice!.promotionDiscount)).toBeCloseTo(60000, 2)
})
