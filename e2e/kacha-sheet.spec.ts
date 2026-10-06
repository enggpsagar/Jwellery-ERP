import { expect, test, type Page } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { KACHA_SHEET_HEADERS } from "../lib/billing/kacha-sheet"
import { KACHA_SHEET_INCLUDE, kachaBackupSheets } from "../lib/billing/kacha-sheet-rows"
import { buildMultiSheetExcelExport } from "../lib/excel-export"

function sheet(rows: Record<string, unknown>[], path: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sheet1")
  XLSX.writeFile(wb, path)
  return path
}

async function importKacha(page: Page, path: string) {
  await page.goto("/billing/kacha")
  await page.getByRole("button", { name: "Import from Excel" }).click()
  await page.locator("#kacha-import-file").setInputFiles(path)
  await page.getByRole("button", { name: "Import", exact: true }).click()
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()])
  return XLSX.read(fs.readFileSync((await file.path())!))
}

/** Its own parties and a 22K purity (the demo store has none), so the
 *  ledger/party assertions only see this spec's rows. */
async function setup() {
  const storeId = await demoStoreId()
  const stamp = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" } })
  const purity = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold.id, label: "22 KT", skuCode: "22E", finenessPercent: 91.6, isHallmarkable: true },
  })
  const party = await db().customer.create({
    data: { storeId, customerCode: `E2E-KP-${stamp}`, name: `E2E Kacha Party ${stamp}`, phone: `9${String(stamp).slice(-9)}` },
  })
  const supplier = await db().customer.create({
    data: { storeId, customerCode: `E2E-KS-${stamp}`, name: `E2E Kacha Supplier ${stamp}` },
  })
  const location = await db().storeLocation.findFirstOrThrow({ where: { storeId, isActive: true }, orderBy: { name: "asc" } })
  return { storeId, stamp, gold, purity, party, supplier, location }
}

async function cleanup(ctx: Awaited<ReturnType<typeof setup>>) {
  const partyIds = [ctx.party.id, ctx.supplier.id]
  await db().kachaInvoice.deleteMany({ where: { storeId: ctx.storeId, customerId: { in: partyIds } } })
  await db().ledgerEntry.deleteMany({ where: { storeId: ctx.storeId, customerId: { in: partyIds } } })
  await db().customer.deleteMany({ where: { id: { in: partyIds } } })
  await db().storeMetalPurity.delete({ where: { id: ctx.purity.id } })
}

function importRows(ctx: Awaited<ReturnType<typeof setup>>, ref: string) {
  return [
    {
      "Slip Ref": ref, Date: "15/08/2026", "Party Name": ctx.party.name, Location: ctx.location.name,
      "Item Name": "E2E Chain", "Purchased From": ctx.supplier.name, Metal: "Gold", Purity: ctx.purity.label, Quantity: 1,
      "Gross Weight": 10.5, "Stone Weight": 0.2, "DMO Weight": 0.3, Rate: 6000, "Making Charge": 500, "Making Charge Type": "Fixed",
      Stone: "Diamond", "Stone Type": "Natural", "Carat Weight": 0.5, "Stone Rate": 20000,
      Discount: 100, "Paid Amount": 1000, "Payment Method": "UPI", "Payment Reference": "UTR123", Notes: "imported",
    },
    { "Slip Ref": ref, "Item Name": "E2E Ring", "Purchased From": ctx.supplier.name, Metal: "Gold", Purity: ctx.purity.label, "Gross Weight": 2, "Net Weight": 2, Rate: 6000, "HM Charge": 0 },
  ]
}

test("Estimate import: template, form rules, location, purity labels and the party's ledger", async ({ page }) => {
  const ctx = await setup()
  try {
    // Template: shared columns, Instructions + Options, a real party as the example.
    await page.goto("/billing/kacha")
    await page.getByRole("button", { name: "Import from Excel" }).click()
    const template = await download(page, () => page.getByRole("button", { name: "Download template" }).click())
    expect(template.SheetNames).toEqual(["Estimates Import", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(template.Sheets["Estimates Import"], { header: 1 })[0]).toEqual(KACHA_SHEET_HEADERS)
    const options = XLSX.utils.sheet_to_json<Record<string, string>>(template.Sheets.Options)
    expect(options.map((row) => row["Party Name"])).toContain(ctx.party.name)
    expect(options.map((row) => row["Making Charge Type"]).filter(Boolean)).toEqual(["Fixed", "Percentage"])
    const example = XLSX.utils.sheet_to_json<Record<string, string>>(template.Sheets["Estimates Import"])[0]
    expect(await db().customer.count({ where: { storeId: ctx.storeId, name: example["Party Name"] } })).toBeGreaterThan(0)

    // Purchased From is required on every line, like the form — the whole file is rejected.
    const before = await db().kachaInvoice.count({ where: { storeId: ctx.storeId } })
    const bad = importRows(ctx, `E2E-${ctx.stamp}`).map((row, i) => (i === 1 ? { ...row, "Purchased From": "" } : row))
    await importKacha(page, sheet(bad, "test-results/kacha-bad.xlsx"))
    await expect(page.getByText(/Purchased From is required/)).toBeVisible()
    expect(await db().kachaInvoice.count({ where: { storeId: ctx.storeId } })).toBe(before)

    await importKacha(page, sheet(importRows(ctx, `E2E-${ctx.stamp}`), "test-results/kacha-good.xlsx"))
    await expect.poll(async () => db().kachaInvoice.count({ where: { storeId: ctx.storeId, customerId: ctx.party.id } }), { timeout: 15000 }).toBe(1)

    const slip = await db().kachaInvoice.findFirstOrThrow({
      where: { storeId: ctx.storeId, customerId: ctx.party.id },
      include: { items: { orderBy: { itemName: "asc" } } },
    })
    expect(slip.slipNumber).toMatch(/^KACHA-\d{4}-\d{4}$/)
    expect(slip.locationId).toBe(ctx.location.id)
    expect(slip.invoiceDate.getDate()).toBe(15)
    const [chain, ring] = [slip.items.find((i) => i.itemName === "E2E Chain")!, slip.items.find((i) => i.itemName === "E2E Ring")!]
    expect({
      purityLabel: chain.purityLabel, purity: chain.purity, net: Number(chain.netWeight), dmo: Number(chain.dmoWeight),
      stone: Number(chain.stoneWeight), hm: Number(chain.hmCharge), stoneCharge: Number(chain.stoneCharge),
      stoneName: chain.stoneMetalTypeName, vendor: chain.vendorId, fine: Number(chain.fineWeight),
    }).toEqual({
      purityLabel: "22 KT", purity: "GOLD_22K", net: 10, dmo: 0.3, stone: 0.2, hm: 45, stoneCharge: 10000,
      stoneName: "Diamond", vendor: ctx.supplier.id, fine: 9.16,
    })
    expect(Number(ring.hmCharge)).toBe(0)
    // 60000 + 500 + 45 + 10000 + 12000 − 100
    expect(Number(slip.totalAmount)).toBe(82445)
    expect(Number(slip.balanceAmount)).toBe(81445)
    expect(slip.status).toBe("PARTIAL")

    // The party's ledger carries the sale and the payment, like the form.
    const ledger = (await db().ledgerEntry.findMany({ where: { storeId: ctx.storeId, customerId: ctx.party.id } })).sort((a, b) =>
      a.type.localeCompare(b.type),
    )
    expect(ledger.map((e) => [e.type, e.sourceType, Number(e.amount), e.paymentMethod, e.locationId])).toEqual([
      ["CREDIT", "PAYMENT_IN", 1000, "UPI", ctx.location.id],
      ["DEBIT", "SALE", 82445, null, ctx.location.id],
    ])
    expect(ledger[1].description).toContain(slip.slipNumber)
    // The supplier is flagged as one, as on the form.
    expect((await db().customer.findUniqueOrThrow({ where: { id: ctx.supplier.id } })).isSupplier).toBe(true)

    // Excel export = the template's columns; a re-import gives an equal slip (new number, the old one is live).
    await page.goto(`/billing/kacha?search=${slip.slipNumber}`)
    await page.getByRole("button", { name: /^Export / }).click()
    const exported = await download(page, () => page.getByRole("menuitem", { name: "Excel" }).click())
    expect(exported.SheetNames).toEqual(["Estimates", "Instructions", "Options"])
    expect(XLSX.utils.sheet_to_json<string[]>(exported.Sheets.Estimates, { header: 1 })[0]).toEqual(KACHA_SHEET_HEADERS)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets.Estimates)
    expect(rows).toHaveLength(2)
    expect(rows[0].Status).toBe("Partially Paid")
    expect(rows[0]["Slip Ref"]).toBe(slip.slipNumber)

    await importKacha(page, sheet(rows, "test-results/kacha-roundtrip.xlsx"))
    await expect(page.getByText(/already in use and got new numbers/)).toBeVisible()
    await expect.poll(async () => db().kachaInvoice.count({ where: { storeId: ctx.storeId, customerId: ctx.party.id } }), { timeout: 15000 }).toBe(2)
    const copy = await db().kachaInvoice.findFirstOrThrow({
      where: { storeId: ctx.storeId, customerId: ctx.party.id, NOT: { id: slip.id } },
      include: { items: { orderBy: { itemName: "asc" } } },
    })
    for (const field of ["totalAmount", "paidAmount", "balanceAmount", "discount", "subtotal", "makingCharges", "stoneCharges", "locationId", "status", "notes"] as const) {
      expect(String(copy[field]), field).toBe(String(slip[field]))
    }
    expect(copy.invoiceDate.toDateString()).toBe(slip.invoiceDate.toDateString())
    for (const [index, item] of slip.items.entries()) {
      for (const field of ["itemName", "metalTypeId", "purity", "purityLabel", "quantity", "grossWeight", "netWeight", "fineWeight", "dmoWeight", "stoneWeight", "caratWeight", "rate", "makingCharge", "makingChargeType", "hmCharge", "stoneCharge", "stoneRate", "stoneMetalTypeName", "stoneTypeNames", "vendorId", "lineTotal"] as const) {
        expect(String(copy.items[index][field]), `${item.itemName} ${field}`).toBe(String(item[field]))
      }
    }
  } finally {
    await cleanup(ctx)
  }
})

test("Estimate backup restores the slip number, DMO weight and location without doubling the ledger", async ({ page }) => {
  const ctx = await setup()
  try {
    await importKacha(page, sheet(importRows(ctx, `E2E-${ctx.stamp}`), "test-results/kacha-backup-src.xlsx"))
    await expect.poll(async () => db().kachaInvoice.count({ where: { storeId: ctx.storeId, customerId: ctx.party.id } }), { timeout: 15000 }).toBe(1)

    // The backup delete-all emails, built by the same function, then the delete (slips go, ledger rows stay).
    const slips = await db().kachaInvoice.findMany({ where: { storeId: ctx.storeId, customerId: ctx.party.id }, include: KACHA_SHEET_INCLUDE })
    const original = slips[0]
    const backup = buildMultiSheetExcelExport(kachaBackupSheets(slips), "estimates-backup")
    fs.writeFileSync("test-results/kacha-backup.xlsx", Buffer.from(backup.fileBase64, "base64"))
    await db().kachaInvoice.deleteMany({ where: { id: original.id } })
    const ledgerBefore = await db().ledgerEntry.count({ where: { storeId: ctx.storeId, customerId: ctx.party.id } })

    await importKacha(page, "test-results/kacha-backup.xlsx")
    await expect(page.getByText(/restored without new ledger entries/)).toBeVisible()
    const restored = await db().kachaInvoice.findFirstOrThrow({
      where: { storeId: ctx.storeId, customerId: ctx.party.id },
      include: { items: { orderBy: { itemName: "asc" } } },
    })
    expect(restored.slipNumber).toBe(original.slipNumber)
    expect(restored.locationId).toBe(ctx.location.id)
    expect(String(restored.totalAmount)).toBe(String(original.totalAmount))
    expect(String(restored.paidAmount)).toBe(String(original.paidAmount))
    expect(restored.status).toBe(original.status)
    const chain = restored.items.find((item) => item.itemName === "E2E Chain")!
    expect(Number(chain.dmoWeight)).toBe(0.3)
    expect(chain.vendorId).toBe(ctx.supplier.id)
    expect(chain.purityLabel).toBe("22 KT")
    expect(await db().ledgerEntry.count({ where: { storeId: ctx.storeId, customerId: ctx.party.id } })).toBe(ledgerBefore)
  } finally {
    await cleanup(ctx)
  }
})
