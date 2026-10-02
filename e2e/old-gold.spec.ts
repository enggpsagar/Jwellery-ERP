import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Old Gold Exchange (lib/old-gold/exchange.ts): on a new invoice the
 * customer hands in old gold, which is bought as a linked OG- purchase,
 * lands in stock at its 24K weight, and is adjusted against the bill —
 * the excess either stays as store credit or is paid out.
 */
const grossWeightInput = (page: Page) =>
  page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Gross Weight", { exact: false }) })
    .locator('input[type="number"]')
    .first()

async function setUpGold22K() {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirst({
    where: { storeId, name: "Gold", hasPurity: true },
    select: { id: true },
  })
  expect(gold, "demo store has Gold").not.toBeNull()
  await db().storeMetalPurity.upsert({
    where: { storeMetalId_label: { storeMetalId: gold!.id, label: "22K" } },
    create: { storeId, storeMetalId: gold!.id, label: "22K", skuCode: "22", finenessPercent: 91.6 },
    update: { finenessPercent: 91.6, isActive: true },
  })
  return storeId
}

/** One 22K new-jewellery line: 10 g net at the given rate per gram. */
async function fillSaleLine(page: Page, itemName: string, ratePerGram: string) {
  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()

  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(1).fill("10")
  await lineNumbers.nth(2).fill(ratePerGram)
  await page.getByRole("combobox").filter({ hasText: "Select metal" }).first().click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await page.getByRole("combobox").filter({ hasText: "Select category" }).click()
  await page.getByRole("option", { name: "Ornament", exact: true }).click()
  await grossWeightInput(page).fill("10")
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
}

/** One old-gold line: 22K, given net weight, deduction and 24K rate. */
async function addOldGold(page: Page, netWeight: string, deduction: string, rate: string) {
  const section = page.getByTestId("old-gold-section")
  await section.getByRole("button", { name: "Add old gold" }).click()
  await section.getByPlaceholder("e.g. Old chain").fill("Old chain")
  await section.getByTestId("old-gold-metal").click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await section.getByTestId("old-gold-purity").click()
  await page.getByRole("option", { name: /^22K/ }).click()
  await section.getByTestId("old-gold-net").fill(netWeight)
  await section.getByTestId("old-gold-deduction").fill(deduction)
  await section.getByTestId("old-gold-rate").fill(rate)
  return section
}

test("old gold worth less than the bill is bought, stocked at 24K and adjusted", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await setUpGold22K()
  const itemName = `E2E Exchange Ring ${Date.now()}`

  await fillSaleLine(page, itemName, "6000")
  // 2 g of 22K → 1.832 g fine × ₹7,000 = ₹12,824.
  const section = await addOldGold(page, "2", "0", "7000")
  await expect(section.getByTestId("old-gold-fine")).toContainText("1.832 g")
  await expect(section.getByTestId("old-gold-value")).toHaveText("₹12824.00")
  await expect(page.getByTestId("old-gold-applied")).toContainText("-₹12824.00")

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  await expect(page.getByText("Old Gold Exchange")).toBeVisible()

  const invoice = await db().invoice.findFirst({
    where: { storeId, items: { some: { itemName } } },
    include: { oldGoldExchange: { include: { items: { include: { inventoryStock: true } }, ledgerEntries: true } } },
  })
  expect(invoice, "invoice saved").not.toBeNull()
  const exchange = invoice!.oldGoldExchange
  expect(exchange?.isOldGoldExchange).toBe(true)
  expect(exchange?.purchaseNumber).toMatch(/^OG-\d{4}-\d{4}$/)
  expect(exchange?.vendorId).toBe(invoice!.customerId)
  expect(Number(exchange?.totalAmount)).toBeCloseTo(12824, 2)
  expect(Number(exchange?.oldGoldAppliedAmount)).toBeCloseTo(12824, 2)
  expect(Number(exchange?.oldGoldExcessAmount)).toBe(0)

  const line = exchange!.items[0]
  expect(Number(line.netWeight)).toBeCloseTo(2, 4)
  expect(Number(line.fineWeight)).toBeCloseTo(1.832, 4)
  expect(line.inventoryStock?.status).toBe("IN_STOCK")
  expect(Number(line.inventoryStock?.fineWeight)).toBeCloseTo(1.832, 4)

  // The old gold counts as paid; the customer owes the rest.
  expect(Number(invoice!.paidAmount)).toBeCloseTo(12824, 2)
  expect(Number(invoice!.balanceAmount)).toBeCloseTo(Number(invoice!.totalAmount) - 12824, 2)
  const credit = exchange!.ledgerEntries.find((entry) => entry.sourceType === "OLD_GOLD_EXCHANGE")
  expect(credit?.type).toBe("CREDIT")
  expect(Number(credit?.amount)).toBeCloseTo(12824, 2)
  expect(credit?.customerId).toBe(invoice!.customerId)

  await page.goto("/billing/old-gold")
  await expect(page.getByRole("link", { name: exchange!.purchaseNumber })).toBeVisible()
  expect(crashes).toEqual([])
})

test("old gold worth more than the bill pays the difference out", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await setUpGold22K()
  const itemName = `E2E Exchange Pendant ${Date.now()}`

  await fillSaleLine(page, itemName, "1000")
  // 20 g of 22K → 18.32 g fine × ₹7,000 − 2% = ₹1,25,675.20 — far above the bill.
  const section = await addOldGold(page, "20", "2", "7000")
  await expect(section.getByTestId("old-gold-value")).toHaveText("₹125675.20")

  await section.getByLabel("Pay it out now").check()
  await expect(page.getByRole("button", { name: "Create Invoice" })).toBeDisabled()
  await section.getByRole("combobox").filter({ hasText: "Paid by…" }).click()
  await page.getByRole("option", { name: "Cash", exact: true }).click()
  await expect(page.getByTestId("net-payable")).toContainText("₹0.00")

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

  const invoice = await db().invoice.findFirst({
    where: { storeId, items: { some: { itemName } } },
    include: { oldGoldExchange: { include: { ledgerEntries: true } } },
  })
  const exchange = invoice!.oldGoldExchange!
  const total = Number(invoice!.totalAmount)
  expect(invoice!.status).toBe("PAID")
  expect(Number(exchange.oldGoldAppliedAmount)).toBeCloseTo(total, 2)
  expect(Number(exchange.oldGoldExcessAmount)).toBeCloseTo(125675.2 - total, 2)
  expect(exchange.oldGoldExcessMode).toBe("PAID_OUT")
  const payout = exchange.ledgerEntries.find((entry) => entry.sourceType === "PAYMENT_OUT")
  expect(payout?.type).toBe("DEBIT")
  expect(payout?.paymentMethod).toBe("CASH")
  expect(Number(payout?.amount)).toBeCloseTo(125675.2 - total, 2)
  expect(crashes).toEqual([])
})
