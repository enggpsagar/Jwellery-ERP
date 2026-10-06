import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { KARIGAR_EXPORT_HEADERS, KARIGAR_SHEET_HEADERS } from "../lib/karigars/karigar-sheet"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function importArtisans(page: Page, path: string) {
  await page.goto("/karigars")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#karigar-import-file").setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

/** The artisan template, export and import share one column layout, so an
 *  exported artisan imports back with the same details; mobiles stay unique. */
test("artisan export → import round trip; duplicate mobile rejected", async ({ page }) => {
  const storeId = await demoStoreId()
  const stamp = Date.now()
  const prefix = `E2E Sheet Artisan ${stamp}`
  const mobile = `9${String(stamp).slice(-9)}`
  const [gold, silver] = await Promise.all([
    db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" } }),
    db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Silver" } }),
  ])
  const location = await db().storeLocation.findFirstOrThrow({ where: { storeId, isActive: true } })
  const original = await db().karigar.create({
    data: {
      storeId, code: `E2E-${stamp}`, name: prefix, mobile, city: "Pune", state: "Maharashtra",
      gstType: "REGULAR", gstNumber: "27ABCDE1234F1Z5", openingCash: 1234.5, openingGold: 2.5,
      metalTypeId: gold.id, locationId: location.id, notes: "round trip",
      assignedMetals: { create: [{ metalTypeId: gold.id }, { metalTypeId: silver.id }] },
    },
  })

  try {
    // Template: the shared columns, Instructions and dropdowns.
    await page.goto("/karigars")
    await page.getByRole("button", { name: "Import from Excel" }).click()
    const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    expect(template.SheetNames).toEqual(["Artisans Import", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(template.Sheets["Artisans Import"], { header: 1 })[0]).toEqual(KARIGAR_SHEET_HEADERS)
    const options = XLSX.utils.sheet_to_json<Record<string, string>>(template.Sheets.Options)
    expect(options.map((row) => row.Location)).toContain(location.name)
    expect(options.map((row) => row["GST Type"])).toContain("Regular")
    await page.keyboard.press("Escape")

    // Export it (selected while still listed, disabled before exporting, so
    // the file carries an inactive artisan).
    await page.goto(`/karigars?search=${encodeURIComponent(prefix)}`)
    await page.getByRole("checkbox", { name: `Select ${prefix}` }).check()
    await db().karigar.update({ where: { id: original.id }, data: { isActive: false } })
    const exported = await download(page, () => page.getByRole("button", { name: /^Export selected artisans/ }).click())
    expect(exported.SheetNames).toEqual(["Artisans", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(exported.Sheets.Artisans, { header: 1 })[0]).toEqual(KARIGAR_EXPORT_HEADERS)
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.Artisans)
    expect(row).toMatchObject({
      "Artisan Code": original.code, "Opening Cash": 1234.5, "Opening Gold (g)": 2.5, Active: "No",
      "GST Number": "27ABCDE1234F1Z5", "GST Type": "Regular", Location: location.name, "Assigned Metals/Stones": "Gold, Silver",
    })

    // Re-importing it unchanged is refused: the mobile is already this artisan's.
    const before = await db().karigar.count({ where: { storeId } })
    await importArtisans(page, sheet([row], "test-results/karigar-dup.xlsx"))
    await expect(page.getByText(new RegExp(`Mobile ${mobile} already belongs to an artisan`))).toBeVisible()
    // Two rows sharing one new mobile are refused too.
    const otherMobile = `8${String(stamp).slice(-9)}`
    await importArtisans(page, sheet([
      { Name: `${prefix} A`, Mobile: otherMobile },
      { Name: `${prefix} B`, Mobile: otherMobile },
    ], "test-results/karigar-dup2.xlsx"))
    await expect(page.getByText(new RegExp(`Mobile ${otherMobile} is repeated in this file`))).toBeVisible()
    expect(await db().karigar.count({ where: { storeId } })).toBe(before)

    // With a new name and mobile it imports back as an equal artisan.
    await importArtisans(page, sheet([{ ...row, Name: `${prefix} copy`, Mobile: otherMobile }], "test-results/karigar-roundtrip.xlsx"))
    await expect.poll(async () => db().karigar.count({ where: { storeId, name: `${prefix} copy` } }), { timeout: 15000 }).toBe(1)
    const copy = await db().karigar.findFirstOrThrow({
      where: { storeId, name: `${prefix} copy` },
      include: { assignedMetals: { select: { metalTypeId: true } } },
    })
    expect({
      openingCash: Number(copy.openingCash), openingGold: Number(copy.openingGold), isActive: copy.isActive,
      gstNumber: copy.gstNumber, gstType: copy.gstType, locationId: copy.locationId, metalTypeId: copy.metalTypeId,
      city: copy.city, state: copy.state, notes: copy.notes, mobile: copy.mobile,
      assigned: copy.assignedMetals.map((m) => m.metalTypeId).sort(),
    }).toEqual({
      openingCash: 1234.5, openingGold: 2.5, isActive: false, gstNumber: "27ABCDE1234F1Z5", gstType: "REGULAR",
      locationId: location.id, metalTypeId: gold.id, city: "Pune", state: "Maharashtra", notes: "round trip", mobile: otherMobile,
      assigned: [gold.id, silver.id].sort(),
    })
    expect(copy.code).toMatch(/^KAR-\d{4}-\d{4}$/)
  } finally {
    await db().karigar.deleteMany({ where: { storeId, name: { startsWith: prefix } } })
  }
})

/** The artisan ledger export reads like the page: Source carries the
 *  artisan's name, Issued By and payment method labels are there. */
test("artisan ledger export: name in Source, Issued By column", async ({ page }) => {
  const storeId = await demoStoreId()
  const entry = await db().ledgerEntry.findFirst({
    where: { storeId, karigarId: { not: null }, sourceType: { in: ["KARIGAR_ISSUE", "KARIGAR_RECEIPT"] } },
    select: { karigarId: true, karigar: { select: { name: true } } },
  })
  test.skip(!entry, "demo store has no artisan ledger entries")

  const response = await page.request.get(`/karigars/${entry!.karigarId}/ledger-export?format=excel`)
  expect(response.status()).toBe(200)
  const workbook = XLSX.read(await response.body())
  const financial = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Financial)
  expect(Object.keys(financial[0] ?? {})).toContain("Issued By")
  expect(financial.map((row) => String(row.Source))).toEqual(
    expect.arrayContaining([expect.stringMatching(new RegExp(`^${entry!.karigar!.name} (Issue|Receipt)$`))]),
  )

  const missing = await page.request.get(`/karigars/no-such-artisan/ledger-export?format=csv`)
  expect(missing.status()).toBe(404)
})
