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

async function importProducts(page: import("@playwright/test").Page, path: string) {
  await page.goto("/inventory/products")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#product-import-file").setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

/** A product with two metals and two stones, entered as its own row plus a
 *  follow-on row (blank Product Name), round-trips through the Excel export. */
test("product import/export: several metals and stones in one product", async ({ page }) => {
  const storeId = await demoStoreId()
  const name = `Two-tone ${Date.now()}`
  const created: { purities: string[]; style?: string } = { purities: [] }

  const metal = (metalName: string) => db().storeMetal.findFirstOrThrow({ where: { storeId, name: metalName } })
  const gold = await metal("Gold")
  const silver = await metal("Silver")
  const purityFor = async (metalId: string, label: string, skuCode: string) => {
    const existing = await db().storeMetalPurity.findFirst({ where: { storeId, storeMetalId: metalId, isActive: true } })
    if (existing) return existing
    const row = await db().storeMetalPurity.create({ data: { storeId, storeMetalId: metalId, label, skuCode } })
    created.purities.push(row.id)
    return row
  }
  const goldPurity = await purityFor(gold.id, "22K", "22")
  const silverPurity = await purityFor(silver.id, "925", "925")
  const existingStyle = await db().storeStyle.findFirst({ where: { storeId, isActive: true } })
  const style = existingStyle ?? (await db().storeStyle.create({ data: { storeId, name: "Multi Sheet Style" } }))
  if (!existingStyle) created.style = style.id

  try {
    await importProducts(page, sheet([
      {
        "Product Name": name, "Metal Type": "Gold", Category: "Ornament", "Category Type": "Ring", Style: style.name,
        Purity: goldPurity.label, "Gross Weight": 3.2, "Net Weight": 4.27,
        "Stone Metal Type Name": "Diamond", "Stone Type Names": "Natural", "Carat Weight": 0.1, "Stone Rate": 50000,
        "Stone Charge": 5000, "Stone Pcs": 6, "Stone Clarity": "VVS", "IGI Certificate No.": "IGI-1", "Stone Weight": 0.02,
      },
      {
        "Metal Type": "Silver", Purity: silverPurity.label, "Gross Weight": 1.1,
        "Stone Metal Type Name": "Ruby", "Carat Weight": 0.05, "Stone Rate": 20000, "Stone Charge": 1000, "Stone Pcs": 2, "Stone Weight": 0.01,
      },
    ], "test-results/multi-import.xlsx"))

    await expect.poll(async () => db().product.count({ where: { storeId, name } }), { timeout: 15000 }).toBe(1)
    const product = await db().product.findFirstOrThrow({ where: { storeId, name } })

    const partsOf = async (productId: string) => ({
      metals: (await db().productMetalComponent.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } })).map((m) => ({
        metalTypeId: m.metalTypeId, purity: m.storeMetalPurityId, gross: Number(m.grossWeight),
      })),
      stones: (await db().productStoneComponent.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } })).map((s) => ({
        name: s.stoneMetalTypeName, carat: Number(s.caratWeight), charge: Number(s.stoneCharge), pcs: s.pieces, clarity: s.clarity, igi: s.certificateNumber,
      })),
    })
    const parts = await partsOf(product.id)
    expect(parts).toEqual({
      metals: [
        { metalTypeId: gold.id, purity: goldPurity.id, gross: 3.2 },
        { metalTypeId: silver.id, purity: silverPurity.id, gross: 1.1 },
      ],
      stones: [
        { name: "Diamond", carat: 0.1, charge: 5000, pcs: 6, clarity: "VVS", igi: "IGI-1" },
        { name: "Ruby", carat: 0.05, charge: 1000, pcs: 2, clarity: null, igi: null },
      ],
    })
    // Product summary, as the Add Product form derives it.
    expect(product.metalTypeId).toBe(gold.id)
    expect(Number(product.defaultStoneCharge)).toBe(6000)
    expect(Number(product.defaultStoneWeight)).toBeCloseTo(0.03, 5)
    expect(product.hasStoneComponent).toBe(true)

    // Excel export writes the same two rows; renamed, they import back equal.
    await page.goto("/inventory/products")
    await page.getByRole("button", { name: /^Export / }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Excel" }).click()])
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(fs.readFileSync((await download.path())!)).Sheets.Products)
    const start = exported.findIndex((row) => row["Product Name"] === name)
    expect(start).toBeGreaterThanOrEqual(0)
    const own = [exported[start], exported[start + 1]]
    expect(own[1]["Product Name"] ?? "").toBe("")
    expect(own[1]["Metal Type"]).toBe("Silver")
    expect(own[1]["Stone Metal Type Name"]).toBe("Ruby")

    const copyName = `${name} copy`
    await importProducts(page, sheet([{ ...own[0], "Product Name": copyName }, own[1]], "test-results/multi-roundtrip.xlsx"))
    await expect.poll(async () => db().product.count({ where: { storeId, name: copyName } }), { timeout: 15000 }).toBe(1)
    const copy = await db().product.findFirstOrThrow({ where: { storeId, name: copyName } })
    expect(await partsOf(copy.id)).toEqual(parts)
  } finally {
    await db().product.deleteMany({ where: { storeId, name: { startsWith: name } } })
    if (created.style) await db().storeStyle.delete({ where: { id: created.style } })
    for (const id of created.purities) await db().storeMetalPurity.delete({ where: { id } })
  }
})
