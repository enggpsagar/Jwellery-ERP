import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { defaultFinenessForLabel } from "../lib/purity-fineness-check"
import { METALS_SHEET, PURITIES_SHEET, CATEGORIES_SHEET, STONES_SHEET, STONE_TYPES_SHEET, sheetHeaders } from "../lib/inventory/taxonomy-sheet"

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

const headerRow = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1 })[0]
const rowsOf = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" })

function writeBook(sheets: Record<string, Record<string, unknown>[]>, headers: Record<string, string[]>, path: string) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: headers[name] }), name)
  }
  XLSX.writeFile(wb, path)
  return path
}

async function importFile(page: Page, button: string, inputId: string, path: string) {
  await page.goto("/settings/taxonomy")
  await page.getByRole("button", { name: button }).click()
  await page.locator(inputId).setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

/** Metals file: template = export layout (with a Purities sheet), the export
 *  imports back unchanged, a Has Purity metal imports with its purities and
 *  selling-price changes are logged; a metal named like a stone rejects the
 *  whole file. */
test("taxonomy metals/purities/categories: export → import round trip", async ({ page }) => {
  const storeId = await demoStoreId()
  const stamp = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" } })
  const stone = await db().storeMetal.findFirstOrThrow({ where: { storeId, isGemstone: true } })
  const existing = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold.id, label: `E2E${stamp % 1000}K`, skuCode: "E2EX", finenessPercent: 75, sellingPrice: 5000 },
  })
  const newMetal = `E2E Metal ${stamp}`
  const newCategory = `E2E Cat ${stamp}`
  const badCategory = `E2E Bad ${stamp}`
  const started = new Date()

  try {
    // Template: same sheets and headers as the export.
    await page.goto("/settings/taxonomy")
    await page.getByRole("button", { name: "Import Metals & Categories" }).click()
    const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    expect(template.SheetNames).toEqual(["Metals", "Purities", "Categories", "Instructions", "Options"])
    expect(headerRow(template, "Metals")).toEqual(sheetHeaders(METALS_SHEET))
    expect(headerRow(template, "Metals")).not.toContain("Selling Price")
    expect(headerRow(template, "Purities")).toEqual(sheetHeaders(PURITIES_SHEET))
    await page.keyboard.press("Escape")

    await page.goto("/settings/taxonomy")
    const exported = await download(page, () => page.getByRole("button", { name: "Export Metals & Categories" }).click())
    expect(exported.SheetNames).toEqual(["Metals", "Purities", "Categories", "Instructions", "Options"])
    expect(headerRow(exported, "Purities")).toEqual(sheetHeaders(PURITIES_SHEET))
    const purityRows = rowsOf(exported, "Purities")
    const exportedPurity = purityRows.find((r) => r.Label === existing.label)!
    expect(exportedPurity).toMatchObject({ Metal: "Gold", "SKU Code": "E2EX", "Fineness %": 75, "Selling Price": 5000, Hallmarkable: "No" })

    // 1) The unchanged export imports back without changing anything.
    const metalCount = await db().storeMetal.count({ where: { storeId } })
    const historyBefore = await db().sellingRateEntry.count({ where: { storeId } })
    const headers = { Metals: sheetHeaders(METALS_SHEET), Purities: sheetHeaders(PURITIES_SHEET), Categories: sheetHeaders(CATEGORIES_SHEET) }
    const same = writeBook(
      { Metals: rowsOf(exported, "Metals"), Purities: purityRows, Categories: rowsOf(exported, "Categories") },
      headers,
      "test-results/taxonomy-same.xlsx",
    )
    await importFile(page, "Import Metals & Categories", "#metal-category-import-file", same)
    await expect(page.getByText(/^Updated /).first()).toBeVisible()
    expect(await db().storeMetal.count({ where: { storeId } })).toBe(metalCount)
    expect(await db().sellingRateEntry.count({ where: { storeId } })).toBe(historyBefore)

    // 2) A metal named like an existing stone rejects the whole file.
    const bad = writeBook(
      { Metals: [{ Name: stone.name, "Has Purity": "No", "Primary Unit": "Gram" }], Purities: [], Categories: [{ "Category Name": badCategory, "Category Types": "" }] },
      headers,
      "test-results/taxonomy-bad.xlsx",
    )
    await importFile(page, "Import Metals & Categories", "#metal-category-import-file", bad)
    await expect(page.getByText(new RegExp(`"${stone.name}" already exists under Stones`))).toBeVisible()
    expect(await db().storeCategory.count({ where: { storeId, name: badCategory } })).toBe(0)

    // 3) New metal with purities, a changed price, a new category — one import.
    const changed = writeBook(
      {
        Metals: [...rowsOf(exported, "Metals"), { Name: newMetal, "Has Purity": "Yes", "Primary Unit": "Gram" }],
        Purities: [
          ...purityRows.map((r) => (r.Label === existing.label ? { ...r, "Selling Price": 5100 } : r)),
          { Metal: newMetal, Label: "22K", "SKU Code": "M22", "Fineness %": "", "Selling Price": 7000, Hallmarkable: "Yes" },
          { Metal: newMetal, Label: "18K", "SKU Code": "M18", "Fineness %": 75, "Selling Price": "", Hallmarkable: "No" },
        ],
        Categories: [{ "Category Name": newCategory, "Category Types": "Alpha, Beta" }],
      },
      headers,
      "test-results/taxonomy-changed.xlsx",
    )
    await importFile(page, "Import Metals & Categories", "#metal-category-import-file", changed)
    await expect.poll(async () => db().storeMetal.count({ where: { storeId, name: newMetal } }), { timeout: 15000 }).toBe(1)

    const metal = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: newMetal }, include: { purities: { orderBy: { label: "asc" } } } })
    expect(metal.hasPurity).toBe(true)
    expect(metal.purities.map((p) => [p.label, p.skuCode, Number(p.finenessPercent), p.sellingPrice == null ? null : Number(p.sellingPrice), p.isHallmarkable])).toEqual([
      ["18K", "M18", 75, null, false],
      ["22K", "M22", defaultFinenessForLabel(newMetal, "22K"), 7000, true],
    ])
    expect(Number((await db().storeMetalPurity.findUniqueOrThrow({ where: { id: existing.id } })).sellingPrice)).toBe(5100)
    const history = await db().sellingRateEntry.findMany({ where: { storeId, createdAt: { gte: started } } })
    const p22 = metal.purities.find((p) => p.label === "22K")!
    expect(history.map((h) => [h.refId, Number(h.sellingPrice)]).sort()).toEqual([[existing.id, 5100], [p22.id, 7000]].sort())
    const category = await db().storeCategory.findFirstOrThrow({ where: { storeId, name: newCategory }, include: { types: true } })
    expect(category.types.map((t) => t.name).sort()).toEqual(["Alpha", "Beta"])
  } finally {
    const metal = await db().storeMetal.findFirst({ where: { storeId, name: newMetal }, include: { purities: true } })
    await db().sellingRateEntry.deleteMany({ where: { storeId, refId: { in: [existing.id, ...(metal?.purities.map((p) => p.id) ?? [])] } } })
    if (metal) await db().storeMetal.delete({ where: { id: metal.id } })
    await db().storeMetalPurity.delete({ where: { id: existing.id } })
    await db().storeCategory.deleteMany({ where: { storeId, name: { in: [newCategory, badCategory] } } })
  }
})

/** Stones file: Stone Types carry Selling Price and Grams per Carat and
 *  round-trip; a stone named like a metal is rejected. */
test("taxonomy stones/stone types: export → import round trip", async ({ page }) => {
  const storeId = await demoStoreId()
  const stamp = Date.now()
  const newStone = `E2E Stone ${stamp}`
  const started = new Date()
  const headers = { Stones: sheetHeaders(STONES_SHEET), "Stone Types": sheetHeaders(STONE_TYPES_SHEET) }

  try {
    await page.goto("/settings/taxonomy")
    const exported = await download(page, () => page.getByRole("button", { name: "Export Stones & Stone Types" }).click())
    expect(exported.SheetNames).toEqual(["Stones", "Stone Types", "Instructions", "Options"])
    expect(headerRow(exported, "Stones")).toEqual(sheetHeaders(STONES_SHEET))
    expect(headerRow(exported, "Stone Types")).toEqual(sheetHeaders(STONE_TYPES_SHEET))

    const bad = writeBook({ Stones: [{ Name: "Gold", "Primary Unit": "Carat" }], "Stone Types": [] }, headers, "test-results/stones-bad.xlsx")
    await importFile(page, "Import Stones & Stone Types", "#stone-type-import-file", bad)
    await expect(page.getByText(/"Gold" already exists under Metals/)).toBeVisible()

    const file = writeBook(
      {
        Stones: [...rowsOf(exported, "Stones"), { Name: newStone, "Primary Unit": "Carat" }],
        "Stone Types": [
          ...rowsOf(exported, "Stone Types"),
          { "Stone Name": newStone, "Type Name": "Natural", "Selling Price": 42000, "Grams per Carat": 0.2 },
          { "Stone Name": newStone, "Type Name": "Lab-Grown", "Selling Price": "", "Grams per Carat": "" },
        ],
      },
      headers,
      "test-results/stones-new.xlsx",
    )
    await importFile(page, "Import Stones & Stone Types", "#stone-type-import-file", file)
    await expect.poll(async () => db().storeMetal.count({ where: { storeId, name: newStone } }), { timeout: 15000 }).toBe(1)
    const stone = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: newStone }, include: { origins: { orderBy: { name: "asc" } } } })
    expect(stone.isGemstone).toBe(true)
    expect(stone.primaryUnit).toBe("CARAT")
    expect(stone.origins.map((o) => [o.name, o.sellingPrice == null ? null : Number(o.sellingPrice), Number(o.gramsPerCarat)])).toEqual([
      ["Lab-Grown", null, 0.2],
      ["Natural", 42000, 0.2],
    ])
    const history = await db().sellingRateEntry.findMany({ where: { storeId, createdAt: { gte: started } } })
    expect(history.map((h) => [h.refId, Number(h.sellingPrice)])).toEqual([[stone.origins[1].id, 42000]])

    // And the new export carries it back out.
    await page.goto("/settings/taxonomy")
    const again = await download(page, () => page.getByRole("button", { name: "Export Stones & Stone Types" }).click())
    expect(rowsOf(again, "Stone Types")).toContainEqual({ "Stone Name": newStone, "Type Name": "Natural", "Selling Price": 42000, "Grams per Carat": 0.2 })
  } finally {
    const stone = await db().storeMetal.findFirst({ where: { storeId, name: newStone }, include: { origins: true } })
    if (stone) {
      await db().sellingRateEntry.deleteMany({ where: { storeId, refId: { in: stone.origins.map((o) => o.id) } } })
      await db().storeMetal.delete({ where: { id: stone.id } })
    }
  }
})
