import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { STOCK_SHEET_HEADERS } from "../lib/inventory/stock-sheet"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function importStock(page: Page, path: string) {
  await page.goto("/inventory/stock")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#stock-import-file").setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

/** Stock import takes every Add Stock field, only for existing products, and
 *  the stock template, Excel export and import share one column layout. */
test("stock import/export: full piece details, existing products only", async ({ page }) => {
  const storeId = await demoStoreId()
  // Its own product (the demo products carry no default weights).
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" } })
  const product = await db().product.create({
    data: { storeId, productCode: `E2E-STK-${Date.now()}`, name: "E2E Stock Sheet Ring", metalTypeId: gold.id, defaultGrossWeight: 4, defaultNetWeight: 3.9 },
  })
  const location = await db().storeLocation.findFirstOrThrow({ where: { storeId, isActive: true } })
  const tag = `TAG-${Date.now()}`

  // Template: same columns as the export, with the store's products listed.
  await page.goto("/inventory/stock")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
  expect(template.SheetNames).toEqual(["Stock Import", "Instructions", "Options"])
  expect(XLSX.utils.sheet_to_json<string[]>(template.Sheets["Stock Import"], { header: 1 })[0]).toEqual(STOCK_SHEET_HEADERS)
  const options = XLSX.utils.sheet_to_json<Record<string, string>>(template.Sheets.Options)
  expect(options.map((row) => row["Product Code"])).toContain(product.productCode)

  // An unknown product rejects the whole file — stock is never added to a product that doesn't exist.
  const before = await db().inventoryStock.count({ where: { storeId } })
  await importStock(page, sheet([{ "Product Code": product.productCode }, { "Product Code": "NO-SUCH-PRODUCT" }], "test-results/stock-bad.xlsx"))
  await expect(page.getByText(/No product found with code "NO-SUCH-PRODUCT"/)).toBeVisible()
  expect(await db().inventoryStock.count({ where: { storeId } })).toBe(before)

  // Full row + a code-only row (weights from the product).
  const ledgerBefore = await db().ledgerEntry.count({ where: { storeId } })
  await importStock(page, sheet([
    {
      "Product Code": product.productCode, "Tag Number": tag, Status: "Reserved", Finish: "Finished / Hallmarked", Quantity: 2,
      "Gross Weight (g)": 5.5, "Less Weight (g)": 0.1, "Stone Weight (g)": 0.2, "Carat Weight (ct)": 1,
      "Purchase Rate": 6000, "Sale Rate": 6500, "Other Charge": 150, "Purchase Amount": 31000, "Sale Amount": 34000,
      "Vendor Name": "E2E Vendor", "Purchase Date": "15/08/2026", "Date of Manufacture": "01/08/2026", Location: location.name, Remarks: "imported",
    },
    { "Product Code": product.productCode, "Tag Number": `${tag}-B` },
  ], "test-results/stock-good.xlsx"))
  await expect.poll(async () => db().inventoryStock.count({ where: { storeId, tagNumber: { startsWith: tag } } }), { timeout: 15000 }).toBe(2)

  const full = await db().inventoryStock.findFirstOrThrow({ where: { storeId, tagNumber: tag } })
  expect({
    status: full.status, finish: full.finish, quantity: full.quantity, gross: Number(full.grossWeight), less: Number(full.lessWeight),
    net: Number(full.netWeight), stone: Number(full.stoneWeight), carat: Number(full.caratWeight), purchaseRate: Number(full.purchaseRate),
    saleAmount: Number(full.saleAmount), vendor: full.vendorName, location: full.locationId, remarks: full.remarks,
    purchaseDate: full.purchaseDate?.getDate(), purchaseMonth: full.purchaseDate?.getMonth(),
  }).toEqual({
    status: "RESERVED", finish: "PAKKA", quantity: 2, gross: 5.5, less: 0.1, net: 5.2, stone: 0.2, carat: 1, purchaseRate: 6000,
    saleAmount: 34000, vendor: "E2E Vendor", location: location.id, remarks: "imported", purchaseDate: 15, purchaseMonth: 7,
  })
  expect(full.stockCode).toMatch(/^STK-\d{4}-\d{4}$/)
  const plain = await db().inventoryStock.findFirstOrThrow({ where: { storeId, tagNumber: `${tag}-B` } })
  expect(Number(plain.grossWeight)).toBe(Number(product.defaultGrossWeight))
  expect(Number(plain.netWeight)).toBe(Number(product.defaultNetWeight))
  expect(plain.status).toBe("IN_STOCK")
  expect(plain.finish).toBe(product.defaultFinish)
  // Each entry is on the Ledger, like Add Stock.
  expect(await db().ledgerEntry.count({ where: { storeId } })).toBe(ledgerBefore + 2)

  // Excel export = the same layout; with Stock Code cleared, a row imports back as an equal new piece.
  await page.goto("/inventory/stock")
  await page.getByRole("button", { name: /^Export / }).click()
  const exported = await download(page, () => page.getByRole("menuitem", { name: "Excel" }).click())
  expect(exported.SheetNames).toEqual(["Stock", "Instructions", "Options"])
  expect(XLSX.utils.sheet_to_json<string[]>(exported.Sheets.Stock, { header: 1 })[0]).toEqual(STOCK_SHEET_HEADERS)
  const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.Stock).find((r) => r["Tag Number"] === tag)!
  expect(row["Stock Code"]).toBe(full.stockCode)
  await importStock(page, sheet([{ ...row, "Stock Code": "", "Tag Number": `${tag}-C` }], "test-results/stock-roundtrip.xlsx"))
  await expect.poll(async () => db().inventoryStock.count({ where: { storeId, tagNumber: `${tag}-C` } }), { timeout: 15000 }).toBe(1)
  const copy = await db().inventoryStock.findFirstOrThrow({ where: { storeId, tagNumber: `${tag}-C` } })
  for (const field of ["productId", "status", "finish", "quantity", "grossWeight", "lessWeight", "netWeight", "stoneWeight", "caratWeight", "purchaseRate", "saleRate", "otherCharge", "purchaseAmount", "saleAmount", "vendorName", "locationId", "remarks"] as const) {
    expect(String(copy[field]), field).toBe(String(full[field]))
  }
  expect(copy.purchaseDate?.toDateString()).toBe(full.purchaseDate?.toDateString())
  expect(copy.manufactureDate?.toDateString()).toBe(full.manufactureDate?.toDateString())

  await db().inventoryStock.deleteMany({ where: { storeId, productId: product.id } })
  await db().product.delete({ where: { id: product.id } })
})
