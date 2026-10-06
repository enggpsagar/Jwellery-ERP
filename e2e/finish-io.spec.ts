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
  // Export uses the import template's headers, in its order.
  const header = productCsv.replace(/^\uFEFF/, "").split(/\r?\n/)[0]
  expect(header.indexOf("Product Name")).toBeLessThan(header.indexOf("Metal Type"))
  expect(header.indexOf("Metal Type")).toBeLessThan(header.indexOf("Category"))
  expect(header.indexOf("Net Weight")).toBeLessThan(header.indexOf("Design Code"))
  expect(header.indexOf("Active")).toBeLessThan(header.indexOf("Finish"))
  expect(header).not.toContain("Default Making Charge")
  expect(productCsv).not.toMatch(/KACHA|PAKKA/)

  // Round trip: the exported row, renamed, imports back as an equal product.
  const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    XLSX.read(productCsv.replace(/^\uFEFF/, ""), { type: "string" }).Sheets.Sheet1,
  )
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
