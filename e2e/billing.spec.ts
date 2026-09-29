import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Product → Add Stock → Sell (lib/inventory/manual-line-stock.ts): an
 * invoice line entered via "Create New Line Item" must mint its own Product
 * and Stock row and sell it down to 0, not be saved with no stock at all.
 */
test("a new line item on an invoice creates its Product and Stock and sells it", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const itemName = `E2E Bangle ${Date.now()}`

  await page.goto("/billing/new")

  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()

  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()

  await page.getByPlaceholder("Item name").fill(itemName)
  await expect(page.getByText("A new product and stock entry will be added on save")).toBeVisible()

  // The line's compact row: Qty, Net Wt, then Rate / g (priced per gram,
  // so Net Wt is what makes the total non-zero).
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(0).fill("2")
  await lineNumbers.nth(1).fill("5")
  await lineNumbers.nth(2).fill("5000")
  await expect(page.getByText("Selling price is required")).toHaveCount(0)

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

  const storeId = await demoStoreId()
  const stock = await db().inventoryStock.findFirst({
    where: { storeId, product: { name: itemName } },
    include: { product: true, transactions: true, invoiceItems: true },
  })

  expect(stock, "stock row created for the manual line").not.toBeNull()
  expect(stock!.product.name).toBe(itemName)
  expect(stock!.quantity).toBe(0)
  expect(stock!.status).toBe("SOLD")
  expect(stock!.invoiceItems).toHaveLength(1)
  expect(stock!.transactions.map((t) => `${t.transactionType}:${t.quantity}`).sort()).toEqual([
    "ADJUSTMENT:2",
    "SALE:2",
  ])
  expect(crashes).toEqual([])
})

test("an invoice line can't be billed for more pieces than are in stock", async ({ page }) => {
  await page.goto("/billing/new")

  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  // Pick the first stock item that's actually offered (enabled).
  const option = page.getByRole("option", { name: /available\)/ }).and(page.locator(":not([data-disabled])")).first()
  const label = (await option.textContent()) ?? ""
  const available = Number(/\((\d+) available\)/.exec(label)?.[1] ?? "0")
  test.skip(available === 0, "no sellable stock in the demo store")
  await option.click()

  const qty = page.locator('input[type="number"]').first()
  await qty.fill(String(available + 5))
  await expect(qty).toHaveValue(String(available))
})
