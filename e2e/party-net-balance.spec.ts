import { expect, test } from "@playwright/test"
import { db, demoStoreId } from "./helpers"

/**
 * One party, one ledger, one net balance (2026-10-13): a sale and a purchase
 * on the same party net into a single Receivable/Payable figure, shown the
 * same on the Parties list, the party page, its running ledger and the
 * payment picker. The Payable opening balance goes through the real form;
 * the sale / purchase / payment are written as the ledger rows
 * createInvoice / createPurchase / recordCustomerPayment post (SALE DEBIT on
 * customerId, PURCHASE CREDIT on vendorId, PAYMENT_IN CREDIT on customerId)
 * so the arithmetic is exact and independent of billing-form details other
 * specs cover.
 */
test("party net balance: sale then purchase nets to one figure with a running ledger", async ({ page }) => {
  const storeId = await demoStoreId()
  const tag = `E2E Net ${Date.now()}`

  // Opening balance: ₹500 the store owes this party (Payable) → stored -500.
  await page.goto("/customers/new")
  await page.locator('input[name="name"]').fill(tag)
  await page.locator("#openingBalance").fill("500")
  await page.getByRole("radio", { name: "Payable" }).click()
  await page.getByRole("button", { name: "Save party" }).click()
  await expect
    .poll(
      async () => {
        const row = await db().customer.findFirst({ where: { storeId, name: tag }, select: { openingBalance: true } })
        return row ? Number(row.openingBalance) : null
      },
      { timeout: 15000 },
    )
    .toBe(-500)
  const party = await db().customer.findFirstOrThrow({ where: { storeId, name: tag }, select: { id: true } })
  const day = (n: number) => new Date(Date.UTC(2026, 0, n, 6))

  try {
    await db().ledgerEntry.createMany({
      data: [
        { storeId, type: "DEBIT", sourceType: "SALE", customerId: party.id, amount: 10000, description: `${tag} sale`, entryDate: day(5) },
        { storeId, type: "CREDIT", sourceType: "PURCHASE", vendorId: party.id, amount: 4000, description: `${tag} purchase`, entryDate: day(6) },
        { storeId, type: "CREDIT", sourceType: "PAYMENT_IN", customerId: party.id, amount: 1500, paymentMethod: "CASH", description: `${tag} payment`, entryDate: day(7) },
      ],
    })
    // -500 + 10,000 - 4,000 - 1,500 = 4,000 Receivable

    // Parties list: one Balance column, no separate Outstanding / Payable.
    await page.goto(`/customers?search=${encodeURIComponent(tag)}`)
    const listRow = page.getByRole("row").filter({ hasText: tag })
    await expect(listRow.getByTestId("party-balance")).toContainText("4,000")
    await expect(listRow.getByTestId("party-balance")).toContainText("Receivable")
    await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Outstanding" })).toHaveCount(0)
    await expect(page.getByRole("columnheader", { name: "Payable" })).toHaveCount(0)

    // Party page: the net balance and the running ledger from the opening balance.
    await page.goto(`/customers/${party.id}`)
    await expect(page.getByTestId("party-ledger-net")).toContainText("4,000.00")
    await expect(page.getByTestId("party-ledger-net")).toContainText("Receivable")
    await expect(page.getByText("Supplier Ledger")).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Purchase", exact: true })).toHaveAttribute(
      "href",
      `/purchases/new?vendorId=${party.id}`,
    )
    await page.getByRole("button", { name: "View Details" }).click()
    const table = page.getByTestId("party-ledger-table")
    await expect(table.getByText("Opening balance")).toBeVisible()
    const rows = page.getByTestId("party-ledger-row")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText("Sale")
    await expect(rows.nth(0)).toContainText("10,000.00")
    await expect(rows.nth(0)).toContainText("9,500.00")
    await expect(rows.nth(1)).toContainText("Purchase")
    await expect(rows.nth(1)).toContainText("5,500.00")
    await expect(rows.nth(2)).toContainText("Payment In")
    await expect(rows.nth(2)).toContainText("4,000.00")
    await expect(rows.nth(2)).toContainText("Receivable")

    // A bigger purchase tips the same party over to Payable.
    await db().ledgerEntry.create({
      data: { storeId, type: "CREDIT", sourceType: "PURCHASE", vendorId: party.id, amount: 6000, description: `${tag} purchase 2`, entryDate: day(8) },
    })
    await page.reload()
    await expect(page.getByTestId("party-ledger-net")).toContainText("2,000.00")
    await expect(page.getByTestId("party-ledger-net")).toContainText("Payable")

    // The payment picker shows the same net figure.
    await page.goto(`/payments/out?vendorId=${party.id}`)
    await expect(page.getByTestId("party-picker-balance")).toContainText("2,000.00")
    await expect(page.getByTestId("party-picker-balance")).toContainText("Payable")

    // Dashboard: ledger-based totals replace "Outstanding Receivables".
    await page.goto("/dashboard")
    await expect(page.getByText("Total Receivable")).toBeVisible()
    await expect(page.getByText("Total Payable")).toBeVisible()
    await expect(page.getByText("Outstanding Receivables")).toHaveCount(0)

    // No separate Suppliers section.
    await page.goto("/suppliers")
    await expect(page).toHaveURL(/\/customers/)
  } finally {
    await db().ledgerEntry.deleteMany({ where: { storeId, OR: [{ customerId: party.id }, { vendorId: party.id }] } })
    await db().customer.deleteMany({ where: { id: party.id, storeId } })
  }
})
