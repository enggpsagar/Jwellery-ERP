import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Sell by weight (Product.soldByWeight, lib/inventory/weight-lot.ts): a bulk
 * lot — here a 100 g gold bar — sells part of its weight per invoice line,
 * turns SOLD only when its weight runs out, and every restore path gives
 * back exactly the weight its line drew. Plus the Edit Product identity
 * guard once a product has stock.
 */

async function seedBarLot() {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-BAR-${suffix}`,
      name: `E2E Gold Bar ${suffix}`,
      metalTypeId: gold.id,
      soldByWeight: true,
      defaultGrossWeight: 100,
      defaultNetWeight: 100,
      metalComponents: { create: { metalTypeId: gold.id, grossWeight: 100, netWeight: 100 } },
    },
  })
  const stock = await db().inventoryStock.create({
    data: {
      storeId,
      productId: product.id,
      stockCode: `E2E-LOT-${suffix}`,
      metalTypeId: gold.id,
      quantity: 1,
      grossWeight: 100,
      netWeight: 100,
      fineWeight: 100,
      saleRate: 7000,
    },
  })
  return { storeId, product, stock }
}

async function lot(stockId: string) {
  const row = await db().inventoryStock.findUniqueOrThrow({
    where: { id: stockId },
    select: { quantity: true, status: true, grossWeight: true, netWeight: true, fineWeight: true },
  })
  return {
    quantity: row.quantity,
    status: row.status,
    gross: Number(row.grossWeight ?? 0),
    net: Number(row.netWeight ?? 0),
    fine: Number(row.fineWeight ?? 0),
  }
}

/** New Invoice: one line taking `grams` off the lot. Returns the invoice id. */
async function sellFromLot(page: Page, stockCode: string, grams: string) {
  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()

  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByPlaceholder(/search/i).last().fill(stockCode)
  await page.getByRole("option", { name: new RegExp(stockCode) }).click()

  // A lot's weight stays editable, defaults to everything left.
  const sold = page.getByLabel("Net weight", { exact: true }).first()
  await expect(sold).toBeEditable()
  await expect(page.getByTestId("sale-line-lot-hint").first()).toContainText("left — sold by weight")
  await sold.fill(grams)
  const rate = page.locator('input[type="number"]').nth(3)
  if (!(Number(await rate.inputValue()) > 0)) await rate.fill("7000")

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  return page.url().split("/").pop()!
}

test("a sold-by-weight lot sells part of its weight and gets exactly that back", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { stock } = await seedBarLot()

  // 1. 30 g of the 100 g bar: the lot keeps 70 g and stays one piece in stock.
  const firstId = await sellFromLot(page, stock.stockCode, "30")
  expect(await lot(stock.id)).toMatchObject({ quantity: 1, status: "IN_STOCK", gross: 70, net: 70, fine: 70 })
  const firstLine = await db().invoiceItem.findFirstOrThrow({ where: { invoiceId: firstId, inventoryStockId: stock.id } })
  expect(Number(firstLine.netWeight)).toBe(30)
  expect(firstLine.quantity).toBe(1)
  expect(firstLine.lotDraw).toMatchObject({ measure: "netWeight", netWeight: 30, grossWeight: 30, fineWeight: 30 })
  const sale = await db().inventoryTransaction.findFirstOrThrow({
    where: { inventoryStockId: stock.id, referenceId: firstId, transactionType: "SALE" },
  })
  expect(sale.byWeight).toBe(true)
  expect(sale.quantity).toBe(0)
  expect(Number(sale.netWeight)).toBe(30)

  // 2. Can't bill more than is left.
  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByPlaceholder(/search/i).last().fill(stock.stockCode)
  await page.getByRole("option", { name: new RegExp(stock.stockCode) }).click()
  await page.getByLabel("Net weight", { exact: true }).first().fill("80")
  await expect(page.getByText(/is left, but .* is on this bill/).first()).toBeVisible()
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await expect(page).toHaveURL(/\/billing\/new/)
  expect(await lot(stock.id)).toMatchObject({ net: 70 })

  // 3. The remaining 70 g: the lot is sold out.
  const secondId = await sellFromLot(page, stock.stockCode, "70")
  expect(await lot(stock.id)).toMatchObject({ quantity: 0, status: "SOLD", gross: 0, net: 0, fine: 0 })

  // 4. Cancelling the first invoice gives back its 30 g — the sold-out lot
  //    is back in stock with exactly that.
  await page.goto(`/billing/${firstId}`)
  await page.getByRole("button", { name: "Cancel Invoice" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancel Invoice" }).click()
  await expect.poll(async () => (await lot(stock.id)).net).toBe(30)
  expect(await lot(stock.id)).toMatchObject({ quantity: 1, status: "IN_STOCK", gross: 30, fine: 30 })

  // 5. Cancelling the second gives back its 70 g: the whole 100 g bar again.
  await page.goto(`/billing/${secondId}`)
  await page.getByRole("button", { name: "Cancel Invoice" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancel Invoice" }).click()
  await expect.poll(async () => (await lot(stock.id)).net).toBe(100)
  expect(await lot(stock.id)).toMatchObject({ quantity: 1, status: "IN_STOCK", gross: 100, fine: 100 })

  const returns = await db().inventoryTransaction.findMany({
    where: { inventoryStockId: stock.id, transactionType: "SALE_RETURN" },
    orderBy: { createdAt: "asc" },
  })
  expect(returns.map((t) => [t.byWeight, Number(t.netWeight), t.quantity])).toEqual([
    [true, 30, 1],
    [true, 70, 0],
  ])
  expect(crashes).toEqual([])
})

test("a product with stock can't change its identity, only its other details", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { product } = await seedBarLot()

  await page.goto(`/inventory/products/${product.id}/edit`)

  // Identity fields are locked in the form, with a way out.
  await expect(page.getByText(/its name, metal, purity, stone and category are locked/).first()).toBeVisible()
  const name = page.locator('input[name="name"]').first()
  await expect(name).not.toBeEditable()
  await expect(page.getByRole("link", { name: "Create new product" })).toHaveAttribute(
    "href",
    new RegExp(`fromProductId=${product.id}`),
  )
  await expect(page.getByRole("switch", { name: "Sold by weight" })).toBeChecked()

  // The server refuses a renamed product even if the form is bypassed.
  await name.evaluate((input: HTMLInputElement) => {
    input.readOnly = false
    input.disabled = false
  })
  await name.fill(`${product.name} renamed`)
  await page.getByRole("button", { name: "Update Product" }).click()
  await expect(
    page.getByText("This product already has stock or bills, so its name, metal, purity, stone and category can't change — create a new product instead.").first(),
  ).toBeVisible()
  expect((await db().product.findUniqueOrThrow({ where: { id: product.id } })).name).toBe(product.name)

  expect(crashes).toEqual([])
})
