import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { PARTY_SHEET_EXPORT_ONLY_HEADERS, PARTY_SHEET_HEADERS } from "../lib/customers/customer-sheet"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function importParties(page: Page, path: string) {
  await page.goto("/customers")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#customer-import-file").setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

/** The Party template and export share one column layout, the import applies
 *  the Add Party form's rules, and an exported row imports back unchanged. */
test("party import/export: shared layout, validation, round trip", async ({ page }) => {
  const storeId = await demoStoreId()
  const tag = `E2E Party ${Date.now()}`
  const phone = `7${String(Date.now()).slice(-9)}`
  const cleanup = () => db().customer.deleteMany({ where: { storeId, name: { startsWith: tag } } })

  try {
    // Template: shared headers, Instructions + Options with GST Type/State lists.
    await page.goto("/customers")
    await page.getByRole("button", { name: "Import from Excel" }).click()
    const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    expect(template.SheetNames).toEqual(["Parties Import", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(template.Sheets["Parties Import"], { header: 1 })[0]).toEqual(PARTY_SHEET_HEADERS)
    const options = XLSX.utils.sheet_to_json<Record<string, string>>(template.Sheets.Options)
    expect(options.map((row) => row["GST Type"]).filter(Boolean)).toEqual(["Not GST Registered", "Regular", "Composition Scheme"])
    expect(options.map((row) => row.State)).toContain("Maharashtra")

    // Bad rows reject the whole file, each with its own error.
    const before = await db().customer.count({ where: { storeId } })
    await importParties(page, sheet([
      { "Party Name": `${tag} ok` },
      { "Party Name": `${tag} bad type`, "GST Type": "B2B" },
      { "Party Name": `${tag} no gstin`, "GST Type": "Regular" },
      { "Party Name": `${tag} bad gstin`, "GST Type": "Regular", "GST Number": "27ABC" },
      { "Party Name": `${tag} bad place`, State: "Atlantis", Email: "nope", Pincode: "12" },
      { "Party Name": `${tag} bad city`, State: "Maharashtra", City: "Nowhere Town" },
    ], "test-results/party-bad.xlsx"))
    await expect(page.getByText(/Row 3: GST Type "B2B" is not one of/)).toBeVisible()
    await expect(page.getByText(/Row 4: GST Number is required/)).toBeVisible()
    await expect(page.getByText(/Row 5: Enter a valid 15-character GSTIN/)).toBeVisible()
    await expect(page.getByText(/Row 6: State "Atlantis" is not in the State list/)).toBeVisible()
    await expect(page.getByText(/Row 6: Enter a valid email address/)).toBeVisible()
    await expect(page.getByText(/Row 6: Pincode must be 6 digits/)).toBeVisible()
    await expect(page.getByText(/Row 7: City "Nowhere Town" is not in Maharashtra's city list/)).toBeVisible()
    expect(await db().customer.count({ where: { storeId } })).toBe(before)

    // A full row (lower-case state/city/GSTIN are matched and normalised).
    await importParties(page, sheet([{
      "Party Name": `${tag} full`, "GST Type": "Regular", "GST Number": "27abcde1234f1z5", Phone: phone,
      "Alternate Phone": "9123456780", Email: "party@example.com", Address: "1 Test Road", Notes: "imported",
      State: "maharashtra", City: "mumbai", Pincode: "400001", "PAN Number": "abcde1234f",
      "Aadhaar Number": "234567890124", "Registration Id": "REG-9", "Opening Balance": 1500,
    }], "test-results/party-good.xlsx"))
    await expect.poll(() => db().customer.count({ where: { storeId, name: `${tag} full` } }), { timeout: 15000 }).toBe(1)
    const full = await db().customer.findFirstOrThrow({ where: { storeId, name: `${tag} full` } })
    expect({
      gstType: full.gstType, gstin: full.gstin, state: full.state, city: full.city, pan: full.panNumber,
      aadhaar: full.aadhaarNumber, reg: full.registrationId, opening: Number(full.openingBalance),
    }).toEqual({
      gstType: "REGULAR", gstin: "27ABCDE1234F1Z5", state: "Maharashtra", city: "Mumbai", pan: "ABCDE1234F",
      aadhaar: full.aadhaarNumber, reg: "REG-9", opening: 1500,
    })
    expect(full.aadhaarNumber?.replace(/\D/g, "")).toBe("234567890124")

    // Export = the template's columns + export-only ones; the row re-imports
    // (new name/phone, since phones are unique) with every field intact.
    await page.goto(`/customers?search=${encodeURIComponent(tag)}`)
    await expect(page.getByText(`${tag} full`).first()).toBeVisible()
    const exported = await download(page, () => page.getByRole("button", { name: "Export parties" }).click())
    expect(exported.SheetNames).toEqual(["Parties", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(exported.Sheets.Parties, { header: 1 })[0]).toEqual([
      ...PARTY_SHEET_HEADERS,
      ...PARTY_SHEET_EXPORT_ONLY_HEADERS,
    ])
    const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.Parties).find((r) => r["Party Name"] === `${tag} full`)!
    expect(row["PAN Number"]).toBe("ABCDE1234F")
    expect(row["GST Type"]).toBe("Regular")
    await importParties(page, sheet([{ ...row, "Party Name": `${tag} copy`, Phone: "" }], "test-results/party-roundtrip.xlsx"))
    await expect.poll(() => db().customer.count({ where: { storeId, name: `${tag} copy` } }), { timeout: 15000 }).toBe(1)
    const copy = await db().customer.findFirstOrThrow({ where: { storeId, name: `${tag} copy` } })
    for (const field of ["gstType", "gstin", "alternatePhone", "email", "addressLine1", "notes", "state", "city", "pincode", "panNumber", "aadhaarNumber", "registrationId", "openingBalance"] as const) {
      expect(String(copy[field]), field).toBe(String(full[field]))
    }

    // Suppliers page exports suppliers only.
    await db().customer.updateMany({ where: { storeId, name: `${tag} full` }, data: { isSupplier: true } })
    const settings = await db().businessSettings.findUniqueOrThrow({ where: { storeId }, select: { supplierModuleEnabled: true } })
    await db().businessSettings.update({ where: { storeId }, data: { supplierModuleEnabled: true } })
    try {
      await page.goto("/suppliers")
      const suppliers = await download(page, () => page.getByRole("button", { name: "Export suppliers" }).click())
      const names = XLSX.utils.sheet_to_json<Record<string, unknown>>(suppliers.Sheets[suppliers.SheetNames[0]]).map((r) => r["Party Name"])
      expect(names).toContain(`${tag} full`)
      expect(names).not.toContain(`${tag} copy`)
      const supplierCount = await db().customer.count({ where: { storeId, isArchived: false, isSupplier: true } })
      expect(names.length).toBe(supplierCount)
    } finally {
      await db().businessSettings.update({ where: { storeId }, data: { supplierModuleEnabled: settings.supplierModuleEnabled } })
    }
  } finally {
    await cleanup()
  }
})
