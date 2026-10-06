import { expect, test } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"

function parseCsv(text: string) {
  const book = XLSX.read(text, { type: "string", raw: true })
  return XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets[book.SheetNames[0]], { defval: "" })
}

/** The Ledger export isn't capped at the page's 500 rows, and it applies
 *  the page's account / date / search filters. */
test("ledger export: every matching row, page filters respected", async ({ page }) => {
  const storeId = await demoStoreId()
  const name = `E2E Ledger Party ${Date.now()}`
  const customer = await db().customer.create({ data: { storeId, name } })

  try {
    const day = (iso: string) => new Date(`${iso}T06:00:00.000Z`)
    await db().ledgerEntry.createMany({
      data: [
        ...Array.from({ length: 515 }, (_, i) => ({
          storeId,
          customerId: customer.id,
          type: "DEBIT" as const,
          entryDate: day(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
          amount: 100 + i,
          paymentMethod: "CASH" as const,
          description: i === 0 ? "needle-in-haystack" : "bulk",
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          storeId,
          customerId: customer.id,
          type: "CREDIT" as const,
          entryDate: day(`2025-06-${String(i + 1).padStart(2, "0")}`),
          amount: 50,
          paymentMethod: "UPI" as const,
          description: "older",
        })),
      ],
    })

    const csv = async (query: string) => {
      const res = await page.request.get(`/ledger/export?scope=entries&format=csv&${query}`)
      expect(res.ok()).toBeTruthy()
      return parseCsv(await res.text())
    }

    const all = await csv(`account=${encodeURIComponent(name)}`)
    expect(all).toHaveLength(522)
    expect(Object.keys(all[0])).toEqual(expect.arrayContaining(["Account Type", "Payment Method"]))
    expect(all.every((row) => row.Account === name && row["Account Type"] === "Party")).toBe(true)
    expect(all.filter((row) => row["Payment Method"] === "UPI")).toHaveLength(7)

    const june = await csv(`account=${encodeURIComponent(name)}&dateFrom=2025-06-01&dateTo=2025-06-30`)
    expect(june).toHaveLength(7)
    expect(june.every((row) => row.Type === "Credit")).toBe(true)

    expect(await csv(`search=needle-in-haystack`)).toHaveLength(1)

    // The page's export menu passes its filters along.
    await page.goto("/ledger")
    await page.evaluate(() => {
      ;(window as unknown as { __opened: string[] }).__opened = []
      window.open = ((url: string) => {
        ;(window as unknown as { __opened: string[] }).__opened.push(url)
        return null
      }) as typeof window.open
    })
    await page.getByPlaceholder("Search accounts, invoices, notes...").fill("needle-in-haystack")
    await page.getByRole("button", { name: "Export", exact: true }).first().click()
    await page.getByRole("menuitem", { name: "Export as CSV" }).click()
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)
    expect(opened[0]).toContain("search=needle-in-haystack")
    expect(opened[0]).toContain("format=csv")
  } finally {
    await db().ledgerEntry.deleteMany({ where: { storeId, customerId: customer.id } })
    await db().customer.delete({ where: { id: customer.id } })
  }
})

/** Invoices export carries the GST split, round-off, offer and location
 *  columns, and statuses as labels. */
test("invoice export: GST split, round-off, location, status label", async ({ page }) => {
  await page.goto("/billing")
  await page.getByRole("button", { name: /^Export / }).click()
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Excel" }).click()])
  const book = XLSX.read(fs.readFileSync((await file.path())!))
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "" })
  expect(rows.length).toBeGreaterThan(0)
  expect(Object.keys(rows[0])).toEqual(
    expect.arrayContaining(["Location", "GST Rate(s) %", "CGST", "SGST", "IGST", "Round Off", "Offer / Voucher Discount", "Old Gold Exchange Value", "E-way Bill No.", "IRN"]),
  )
  for (const row of rows) {
    expect(["Draft", "Paid", "Partially Paid", "Cancelled"]).toContain(row.Status)
  }

  // CGST + SGST + IGST adds up to the tax on each invoice.
  const storeId = await demoStoreId()
  const invoice = await db().invoice.findFirstOrThrow({ where: { storeId, taxAmount: { gt: 0 } }, include: { items: true } })
  const row = rows.find((r) => r["Invoice #"] === invoice.invoiceNumber)!
  const split = Number(row.CGST) + Number(row.SGST) + Number(row.IGST)
  const itemTax = invoice.items.reduce((s, i) => s + Number(i.cgstAmount) + Number(i.sgstAmount) + Number(i.igstAmount), 0)
  expect(split).toBeCloseTo(itemTax, 2)
})
