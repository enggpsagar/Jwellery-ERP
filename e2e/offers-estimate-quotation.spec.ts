import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Offers & gift vouchers on Estimates and Quotations (lib/promotions.ts,
 * resolveDocumentPromotion): an estimate spends a voucher when saved and the
 * offer moves to the invoice on conversion, taken off each line before GST;
 * a quotation spends nothing until it is converted, and a quoted offer that
 * no longer applies is refused unless the shop converts without it. Plus
 * Apply Credit offering money the store owes a party.
 */

/** 2 pieces × 5 g × ₹6,000/g = ₹60,000 on the Estimate / Quotation form. */
async function fillTwoPieceLine(page: Page, itemName: string, party = /Ananya Kulkarni/) {
  const field = (label: string) =>
    page.locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) }).locator("input").first()
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: party }).click()
  await field("Item Name").fill(itemName)
  await field("Quantity").fill("2")
  await field("Net Weight").fill("5")
  await field("Rate / g").fill("6000")
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

async function invoiceFor(storeId: string, itemName: string) {
  await expect
    .poll(async () => db().invoiceItem.count({ where: { itemName, invoice: { storeId } } }), { timeout: 15000 })
    .toBe(1)
  return db().invoice.findFirstOrThrow({
    where: { storeId, items: { some: { itemName } } },
    include: { items: true },
  })
}

const lineTax = (item: { sgstAmount: unknown; cgstAmount: unknown; igstAmount: unknown }) =>
  Number(item.sgstAmount) + Number(item.cgstAmount) + Number(item.igstAmount)

test("an estimate spends its voucher, and the offer moves to the invoice before GST", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const promotion = await createPromotion({ name: "E2E Estimate Flat 500", type: "FLAT_OFF", target: "BILL", amountOff: 500 })
  const code = `E2EK${Date.now() % 1000000}`
  await db().promotionVoucher.create({ data: { storeId, promotionId: promotion.id, code } })
  const itemName = `E2E Offer Estimate ${Date.now()}`

  await page.goto("/billing/kacha/new")
  await fillTwoPieceLine(page, itemName)
  await applyCode(page, code)
  await expect(page.getByTestId("promo-total")).toContainText("-₹500.00")
  await page.getByRole("button", { name: "Create Estimate" }).click()
  await page.waitForURL(/\/billing\/kacha\/(?!new)[^/]+$/)
  const kachaId = page.url().split("/").pop()!

  const kacha = await db().kachaInvoice.findUniqueOrThrow({ where: { id: kachaId }, include: { items: true } })
  expect(kacha.promotionCode).toBe(code)
  expect(Number(kacha.promotionDiscount)).toBeCloseTo(500, 2)
  expect(Number(kacha.items[0].promoDiscount)).toBeCloseTo(500, 2)
  expect(Number(kacha.totalAmount)).toBeCloseTo(59500, 2)
  const spent = await db().promotionVoucher.findFirstOrThrow({ where: { storeId, code } })
  expect(spent.usedAt).not.toBeNull()
  expect(spent.kachaInvoiceId).toBe(kachaId)

  // Convert: 60,000 − 500 = 59,500 taxable at the default 3% → 1,785.
  await page.goto(`/billing/kacha/${kachaId}/convert`)
  await expect(page.getByTestId("convert-offer")).toContainText(code)
  await page.getByRole("button", { name: "Convert to Tax Invoice" }).click()
  const invoice = await invoiceFor(storeId, itemName)
  expect(invoice.promotionCode).toBe(code)
  expect(Number(invoice.promotionDiscount)).toBeCloseTo(500, 2)
  expect(Number(invoice.items[0].schemeDiscount)).toBeCloseTo(500, 2)
  expect(lineTax(invoice.items[0])).toBeCloseTo(1785, 2)
  const moved = await db().promotionVoucher.findFirstOrThrow({ where: { storeId, code } })
  expect(moved.invoiceId).toBe(invoice.id)
  expect(moved.kachaInvoiceId).toBeNull()
  expect(crashes).toEqual([])
})

test("a quotation spends nothing; converting it spends the voucher and keeps the quoted offer", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const promotion = await createPromotion({ name: "E2E Quote 10%", type: "PERCENT_OFF", target: "BILL", percentOff: 10 })
  const code = `E2EQ${Date.now() % 1000000}`
  await db().promotionVoucher.create({ data: { storeId, promotionId: promotion.id, code } })
  const itemName = `E2E Offer Quote ${Date.now()}`

  await page.goto("/quotations/new")
  await fillTwoPieceLine(page, itemName)
  await applyCode(page, code)
  await expect(page.getByTestId("promo-total")).toContainText("-₹6000.00")
  await page.getByRole("button", { name: "Create Quotation" }).click()
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/)
  const quotationId = page.url().split("/").pop()!

  const quotation = await db().quotation.findUniqueOrThrow({ where: { id: quotationId } })
  expect(quotation.promotionCode).toBe(code)
  expect(Number(quotation.promotionDiscount)).toBeCloseTo(6000, 2)
  expect((await db().promotionVoucher.findFirstOrThrow({ where: { storeId, code } })).usedAt).toBeNull()

  await page.goto(`/quotations/${quotationId}/convert`)
  await page.getByRole("button", { name: "Convert to Invoice" }).click()
  const invoice = await invoiceFor(storeId, itemName)
  expect(invoice.promotionCode).toBe(code)
  expect(Number(invoice.items[0].schemeDiscount)).toBeCloseTo(6000, 2)
  // 60,000 − 6,000 = 54,000 at 3% → 1,620.
  expect(lineTax(invoice.items[0])).toBeCloseTo(1620, 2)
  const voucher = await db().promotionVoucher.findFirstOrThrow({ where: { storeId, code } })
  expect(voucher.usedAt).not.toBeNull()
  expect(voucher.invoiceId).toBe(invoice.id)
  expect(crashes).toEqual([])
})

test("a quoted offer that has ended is refused, or dropped when the shop says so", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const code = `E2EEND${Date.now() % 100000}`
  const promotion = await createPromotion({ name: "E2E Ending Offer", type: "PERCENT_OFF", target: "BILL", percentOff: 10, code })
  const itemName = `E2E Ended Offer Quote ${Date.now()}`

  await page.goto("/quotations/new")
  await fillTwoPieceLine(page, itemName)
  await applyCode(page, code)
  await expect(page.getByTestId("promo-total")).toContainText("-₹6000.00")
  await page.getByRole("button", { name: "Create Quotation" }).click()
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/)
  const quotationId = page.url().split("/").pop()!

  await db().promotion.update({ where: { id: promotion.id }, data: { isActive: false } })

  await page.goto(`/quotations/${quotationId}/convert`)
  await page.getByRole("button", { name: "Convert to Invoice" }).click()
  await expect(page.getByText(/no longer applies/).first()).toBeVisible()
  expect((await db().quotation.findUniqueOrThrow({ where: { id: quotationId } })).convertedToId).toBeNull()

  await page.getByLabel("Convert without the offer").check()
  await page.getByRole("button", { name: "Convert to Invoice" }).click()
  const invoice = await invoiceFor(storeId, itemName)
  expect(invoice.promotionCode).toBeNull()
  expect(Number(invoice.promotionDiscount)).toBe(0)
  expect(Number(invoice.items[0].schemeDiscount)).toBe(0)
  expect(lineTax(invoice.items[0])).toBeCloseTo(1800, 2)
  expect(crashes).toEqual([])
})

test("Apply Credit offers what the store owes a party, and using it brings the balance down", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const stamp = Date.now()
  // The store owes this supplier ₹2,000 (a Payable opening balance).
  const party = await db().customer.create({
    data: { storeId, name: `E2E Payable Supplier ${stamp}`, phone: `9${String(stamp).slice(-9)}`, openingBalance: -2000 },
  })
  const itemName = `E2E Credit Ring ${stamp}`

  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: new RegExp(party.name) }).click()
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(0).fill("1")
  await lineNumbers.nth(2).fill("10")
  await lineNumbers.nth(3).fill("6000")
  await page.getByRole("combobox").filter({ hasText: "Select metal" }).first().click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await page.getByRole("combobox").filter({ hasText: "Select category" }).click()
  await page.getByRole("option", { name: "Ornament", exact: true }).click()
  await page.getByLabel("Gross weight", { exact: true }).first().fill("10")
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()

  await expect(page.getByText(/You owe this party/)).toContainText("₹2000.00")
  await page.getByRole("button", { name: "Apply Credit" }).click()
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

  // Net = −2,000 opening + total − 2,000 applied + 2,000 used = total − 2,000:
  // the ₹2,000 owed to them is used up. Before the fix the "used" debit was
  // missing, so the net came to total − 4,000 and the credit stayed on offer.
  const invoice = await invoiceFor(storeId, itemName)
  const entries = await db().ledgerEntry.findMany({ where: { storeId, customerId: party.id } })
  const net = entries.reduce((sum, e) => sum + (e.type === "DEBIT" ? Number(e.amount) : -Number(e.amount)), -2000)
  expect(net).toBeCloseTo(Number(invoice.totalAmount) - 2000, 2)
  expect(entries.filter((e) => e.sourceType === "CREDIT_APPLIED").map((e) => [e.type, Number(e.amount)]).sort()).toEqual([
    ["CREDIT", 2000],
    ["DEBIT", 2000],
  ])
  expect(crashes).toEqual([])
})
