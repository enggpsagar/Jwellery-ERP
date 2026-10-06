import { expect, test } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function exportCsv(page: import("@playwright/test").Page, url: string) {
  await page.goto(url)
  await page.getByRole("button", { name: /^Export / }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "CSV" }).click()])
  return fs.readFileSync((await download.path())!, "utf8")
}

/** Finish (Unfinished / Finished-Hallmarked) round-trips: a product imported
 *  as Finished passes it to the stock it creates and to stock imported for
 *  it, and both exports print the label — never the raw KACHA/PAKKA value. */
test("finish: product import, stock import, both exports", async ({ page }) => {
  const storeId = await demoStoreId()
  const name = `Finish IO ${Date.now()}`
  // Import requires a Style; the demo store may not have one.
  const existingStyle = await db().storeStyle.findFirst({ where: { storeId, isActive: true } })
  const style = existingStyle ?? (await db().storeStyle.create({ data: { storeId, name: "Finish IO Style" } }))
  // Product import with Finish = Finished and a stock quantity.
  await page.goto("/inventory/products")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#product-import-file").setInputFiles(sheet([{
    "Product Name": name, Category: "Ornament", "Category Type": "Ring", "Metal Type": "Gold", ...(style ? { Style: style.name } : {}),
    "Gross Weight": 2, "Net Weight": 2, Finish: "Finished", "Stock Quantity": 1,
  }], "test-results/finish-products.xlsx"))
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect.poll(async () => (await db().product.findFirst({ where: { storeId, name } }))?.defaultFinish ?? null, { timeout: 15000 })
    .toBe("PAKKA")
  const product = await db().product.findFirstOrThrow({ where: { storeId, name }, include: { stockItems: true } })
  expect(product.stockItems.map((s) => s.finish)).toEqual(["PAKKA"])

  // Stock import for that product inherits its Finish.
  await page.goto("/inventory/stock")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#stock-import-file").setInputFiles(sheet([{ "Product Code": product.productCode, Quantity: 2 }], "test-results/finish-stock.xlsx"))
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect.poll(async () => db().inventoryStock.count({ where: { storeId, productId: product.id } }), { timeout: 15000 }).toBe(2)
  const stocks = await db().inventoryStock.findMany({ where: { storeId, productId: product.id } })
  expect(stocks.every((s) => s.finish === "PAKKA")).toBe(true)

  // Exports show labels, never raw enum values.
  const stockCsv = await exportCsv(page, "/inventory/stock")
  expect(stockCsv).not.toMatch(/KACHA|PAKKA/)
  const productCsv = await exportCsv(page, "/inventory/products")
  expect(productCsv).toContain("Finished / Hallmarked")
  expect(productCsv).not.toMatch(/KACHA|PAKKA/)

  await db().inventoryStock.deleteMany({ where: { productId: product.id } })
  await db().product.delete({ where: { id: product.id } })
  if (!existingStyle) await db().storeStyle.delete({ where: { id: style.id } })
})
