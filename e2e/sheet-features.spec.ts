import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { ALL_SHEET_FEATURES } from "../lib/sheet-features"
import { productSheetHeaders } from "../lib/inventory/product-sheet"
import { STOCK_SHEET_HEADERS, stockSheetHeaders } from "../lib/inventory/stock-sheet"
import { karigarSheetHeaders } from "../lib/karigars/karigar-sheet"
import { kachaSheetHeaders } from "../lib/billing/kacha-sheet"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

const headerRow = (book: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1 })[0]
const instructionColumns = (book: XLSX.WorkBook) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Instructions, { defval: "" }).map((row) => String(row.Column ?? ""))

/** A switched-off feature's column leaves the sheet definitions themselves. */
test("sheet features: columns hang off their feature", () => {
  const off = (key: keyof typeof ALL_SHEET_FEATURES) => ({ ...ALL_SHEET_FEATURES, [key]: false })
  expect(productSheetHeaders()).toContain("Style")
  expect(productSheetHeaders(off("style"))).not.toContain("Style")
  expect(productSheetHeaders(off("gstRates"))).not.toContain("Metal GST Rate")
  expect(productSheetHeaders(off("gstRates"))).not.toContain("Stone GST Rate")
  expect(productSheetHeaders(off("locations"))).not.toContain("Location")
  expect(stockSheetHeaders(off("locations"))).not.toContain("Location")
  expect(karigarSheetHeaders(off("locations"))).not.toContain("Location")
  expect(kachaSheetHeaders(off("locations"))).not.toContain("Location")
  expect(stockSheetHeaders()).toEqual(STOCK_SHEET_HEADERS)
})

/** Style turned off: the product template/export drop the Style column, the
 *  stock sheets carry none, and an older file that still has Style imports
 *  with the column ignored (no error, nothing written). */
test("style off: no Style column in product/stock sheets; an old file with Style still imports", async ({ page }) => {
  const storeId = await demoStoreId()
  const settings = await db().businessSettings.findUniqueOrThrow({ where: { storeId }, select: { styleFieldEnabled: true } })
  const name = `E2E No-Style ${Date.now()}`
  const tag = `TAG-NOSTYLE-${Date.now()}`
  await db().businessSettings.update({ where: { storeId }, data: { styleFieldEnabled: false } })

  try {
    // Product template.
    await page.goto("/inventory/products")
    await page.getByRole("button", { name: "Import from Excel" }).click()
    await expect(page.getByRole("dialog").getByText("Style", { exact: true })).toHaveCount(0)
    const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    const templateHeaders = headerRow(template, "Products Import")
    expect(templateHeaders).not.toContain("Style")
    expect(templateHeaders).toEqual(productSheetHeaders({ ...ALL_SHEET_FEATURES, style: false }))
    expect(instructionColumns(template)).not.toContain("Style")
    expect(headerRow(template, "Options")).not.toContain("Style")
    await page.keyboard.press("Escape")

    // An old file with a Style column (even a name the store doesn't have)
    // imports; the product gets no style.
    await page.getByRole("button", { name: "Import from Excel" }).click()
    await page.locator("#product-import-file").setInputFiles(
      sheet([
        { "Product Name": name, "Metal Type": "Gold", Category: "Ornament", "Category Type": "Ring", Style: "No Such Style", "Gross Weight": 3, "Net Weight": 2.9 },
      ], "test-results/no-style-products.xlsx"),
    )
    await page.getByRole("button", { name: "Import", exact: true }).click()
    await expect.poll(async () => db().product.count({ where: { storeId, name } }), { timeout: 15000 }).toBe(1)
    const product = await db().product.findFirstOrThrow({ where: { storeId, name } })
    expect(product.targetStyleId).toBeNull()

    // Product export.
    await page.goto("/inventory/products")
    await page.getByRole("button", { name: /^Export / }).click()
    const exported = await download(page, () => page.getByRole("menuitem", { name: "Excel" }).click())
    expect(headerRow(exported, "Products")).toEqual(templateHeaders)
    expect(instructionColumns(exported)).not.toContain("Style")

    // Stock template + export: no Style, and an old stock file with a Style column still imports.
    await page.goto("/inventory/stock")
    await page.getByRole("button", { name: "Import from Excel" }).click()
    const stockTemplate = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    expect(headerRow(stockTemplate, "Stock Import")).not.toContain("Style")
    await page.locator("#stock-import-file").setInputFiles(
      sheet([{ "Product Code": product.productCode, "Tag Number": tag, Style: "Ladies" }], "test-results/no-style-stock.xlsx"),
    )
    await page.getByRole("button", { name: "Import", exact: true }).click()
    await expect.poll(async () => db().inventoryStock.count({ where: { storeId, tagNumber: tag } }), { timeout: 15000 }).toBe(1)
    await page.goto("/inventory/stock")
    await page.getByRole("button", { name: /^Export / }).click()
    const stockExport = await download(page, () => page.getByRole("menuitem", { name: "Excel" }).click())
    expect(headerRow(stockExport, "Stock")).not.toContain("Style")
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: { styleFieldEnabled: settings.styleFieldEnabled } })
    const products = await db().product.findMany({ where: { storeId, name }, select: { id: true } })
    const ids = products.map((p) => p.id)
    if (ids.length) {
      await db().inventoryStock.deleteMany({ where: { storeId, productId: { in: ids } } })
      await db().product.deleteMany({ where: { id: { in: ids } } })
    }
  }
})

/** E-way Bill and E-Invoice turned off: the invoice export has no E-way Bill
 *  No. / IRN columns (the invoices' saved values are untouched). */
test("e-way bill / e-invoice off: invoice export has no E-way / IRN columns", async ({ page }) => {
  const storeId = await demoStoreId()
  const settings = await db().businessSettings.findUniqueOrThrow({ where: { storeId }, select: { ewayBillEnabled: true, eInvoiceEnabled: true } })
  const exportKeys = async () => {
    await page.goto("/billing")
    await page.getByRole("button", { name: /^Export / }).click()
    const book = await download(page, () => page.getByRole("menuitem", { name: "Excel" }).click())
    return headerRow(book, book.SheetNames[0])
  }

  try {
    await db().businessSettings.update({ where: { storeId }, data: { ewayBillEnabled: false, eInvoiceEnabled: false } })
    const keys = await exportKeys()
    expect(keys).not.toContain("E-way Bill No.")
    expect(keys).not.toContain("IRN")
    expect(keys).toEqual(expect.arrayContaining(["Invoice #", "Location", "CGST", "Total"]))

    // Each flag on its own.
    await db().businessSettings.update({ where: { storeId }, data: { ewayBillEnabled: true, eInvoiceEnabled: false } })
    const ewayOnly = await exportKeys()
    expect(ewayOnly).toContain("E-way Bill No.")
    expect(ewayOnly).not.toContain("IRN")
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: settings })
  }
})
