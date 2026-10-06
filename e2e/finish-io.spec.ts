import { expect, test } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { PRODUCT_SHEET_HEADERS } from "../lib/inventory/product-sheet"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function exportFile(page: import("@playwright/test").Page, url: string, format: "CSV" | "Excel") {
  await page.goto(url)
  await page.getByRole("button", { name: /^Export / }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: format }).click()])
  return fs.readFileSync((await download.path())!)
}
const exportCsv = async (page: import("@playwright/test").Page, url: string) => (await exportFile(page, url, "CSV")).toString("utf8")

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

  // Stock import: a blank Finish inherits the product's, a filled one overrides it.
  await page.goto("/inventory/stock")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#stock-import-file").setInputFiles(sheet([
    { "Product Code": product.productCode, Quantity: 2, Finish: "" },
    { "Product Code": product.productCode, Quantity: 1, Finish: "Unfinished" },
  ], "test-results/finish-stock.xlsx"))
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect.poll(async () => db().inventoryStock.count({ where: { storeId, productId: product.id } }), { timeout: 15000 }).toBe(3)
  const stocks = await db().inventoryStock.findMany({ where: { storeId, productId: product.id } })
  expect(stocks.map((s) => `${s.quantity}:${s.finish}`).sort()).toEqual(["1:KACHA", "1:PAKKA", "2:PAKKA"])

  // Exports show labels, never raw enum values.
  const stockCsv = await exportCsv(page, "/inventory/stock")
  expect(stockCsv).not.toMatch(/KACHA|PAKKA/)
  const productCsv = await exportCsv(page, "/inventory/products")
  expect(productCsv).toContain("Finished / Hallmarked")
  expect(productCsv).not.toMatch(/KACHA|PAKKA/)
  // CSV and Excel exports carry exactly the import template's columns.
  const csvHeader = XLSX.utils.sheet_to_json<string[]>(XLSX.read(productCsv.replace(/^\uFEFF/, ""), { type: "string" }).Sheets.Sheet1, { header: 1 })[0]
  expect(csvHeader).toEqual(PRODUCT_SHEET_HEADERS)

  // Excel export = a filled-in template: same sheets (data, Instructions,
  // Options with this store's lists), same columns.
  const workbook = XLSX.read(await exportFile(page, "/inventory/products", "Excel"))
  expect(workbook.SheetNames).toEqual(["Products", "Instructions", "Options"])
  const xlsxHeader = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Products, { header: 1 })[0]
  expect(xlsxHeader).toEqual(PRODUCT_SHEET_HEADERS)
  const options = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Options, { header: 1 })
  expect(options[0]).toContain("Stone Metal Type Name")
  expect(options[0]).toContain("Finish")

  // Round trip: the exported row, renamed, imports back as an equal product.
  const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Products)
  const ownRow = exported.find((row) => row["Product Name"] === name)!
  const copyName = `${name} copy`
  await page.goto("/inventory/products")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#product-import-file").setInputFiles(sheet([{ ...ownRow, "Product Name": copyName }], "test-results/finish-roundtrip.xlsx"))
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect.poll(async () => (await db().product.findFirst({ where: { storeId, name: copyName } }))?.defaultFinish ?? null, { timeout: 15000 }).toBe("PAKKA")
  const copy = await db().product.findFirstOrThrow({ where: { storeId, name: copyName } })
  const fields = ["metalTypeId", "categoryId", "categoryTypeId", "targetStyleId", "defaultGrossWeight", "defaultNetWeight", "isActive", "hsnCode"] as const
  for (const field of fields) expect(String(copy[field]), field).toBe(String(product[field]))

  await db().product.delete({ where: { id: copy.id } })
  await db().inventoryStock.deleteMany({ where: { productId: product.id } })
  await db().product.delete({ where: { id: product.id } })
  if (!existingStyle) await db().storeStyle.delete({ where: { id: style.id } })
})
