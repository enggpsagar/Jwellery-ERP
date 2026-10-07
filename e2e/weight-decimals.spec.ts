import { expect, test } from "@playwright/test"
import { Prisma } from "@prisma/client"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Settings > Weights "Decimals for grams" is a display setting everywhere a
 * weight is shown (lib/weight-calc.ts weightFormatter, useWeightFormat /
 * getWeightFormat): product detail, invoice detail, report tables and their
 * export, the ledger. 7.126 g reads "7.126" at the default 3 and "7.13" at 2.
 *
 * The setting is changed through the Settings UI (it invalidates the cached
 * settings the dashboard reads, and fewer than 3 decimals recalculates the
 * store's fine weights), and restored the same way.
 */
test.describe.configure({ mode: "serial" })

async function recalcLogLength(storeId: string) {
  const row = await db().businessSettings.findUnique({ where: { storeId }, select: { weightRecalcLog: true } })
  return Array.isArray(row?.weightRecalcLog) ? row!.weightRecalcLog.length : 0
}

/** Saves "Decimals for grams" through the UI and waits for any recalculation. */
async function saveGramDecimals(page: Page, storeId: string, decimals: number) {
  await page.goto("/settings/weights")
  await page.locator("#weights-decimals-gram").fill(String(decimals))
  await page.getByTestId("weights-save").click()
  const dialog = page.getByTestId("weights-confirm-counts")
  await expect(dialog).toBeVisible()
  const logBefore = await recalcLogLength(storeId)
  await page.getByTestId("weights-confirm").click()
  await expect
    .poll(
      async () => {
        const row = await db().businessSettings.findUnique({ where: { storeId }, select: { weightRecalcJob: true } })
        return row?.weightRecalcJob == null && (await recalcLogLength(storeId)) > logBefore
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  await expect(page.getByTestId("weights-recalc-progress")).toHaveCount(0)
}

/** "7.13 g" as a whole number, not the tail of "17.13 g". */
const grams = (text: string) => new RegExp(`(^|[^0-9.])${text.replace(".", "\\.")} g`)

test("weights show with the store's gram decimals on detail pages, reports and the ledger", async ({ page }) => {
  test.setTimeout(300_000)
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold", hasPurity: true }, select: { id: true } })
  const before = await db().businessSettings.findUnique({ where: { storeId }, select: { weightDecimalsGram: true } })
  expect(before?.weightDecimalsGram ?? 3).toBe(3)

  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-WD-${suffix}`,
      name: `E2E Decimals Ring ${suffix}`,
      metalTypeId: gold.id,
      defaultGrossWeight: 7.126,
      defaultNetWeight: 7.126,
    },
  })
  const created: { stockId?: string; customerId?: string; invoiceId?: string; ledgerId?: string } = {}

  try {
    // --- Default: 3 decimals -------------------------------------------
    await page.goto(`/inventory/products/${product.id}`)
    await expect(page.locator("main").last()).toContainText(grams("7.126"))

    // --- 2 decimals for grams --------------------------------------------
    await saveGramDecimals(page, storeId, 2)

    // Rows made after the switch, so the recalculation never touched them.
    const stock = await db().inventoryStock.create({
      data: {
        storeId,
        productId: product.id,
        stockCode: `E2E-WD-STK-${suffix}`,
        metalTypeId: gold.id,
        grossWeight: 7.126,
        netWeight: 7.126,
        fineWeight: 7.126,
      },
    })
    created.stockId = stock.id
    const customer = await db().customer.create({ data: { storeId, name: `E2E WD Party ${suffix}` } })
    created.customerId = customer.id
    const invoice = await db().invoice.create({
      data: {
        storeId,
        invoiceNumber: `E2E-WD-${suffix}`,
        customerId: customer.id,
        items: { create: { itemName: `E2E WD Line ${suffix}`, metalTypeId: gold.id, grossWeight: 7.126, netWeight: 7.126, fineWeight: 7.126 } },
      },
    })
    created.invoiceId = invoice.id
    const ledger = await db().ledgerEntry.create({
      data: {
        storeId,
        type: "DEBIT",
        sourceType: "ADJUSTMENT",
        metalTypeId: gold.id,
        metalWeightFine: 7.126,
        description: `E2E WD ledger ${suffix}`,
      },
    })
    created.ledgerId = ledger.id

    // Product detail.
    await page.goto(`/inventory/products/${product.id}`)
    await expect(page.locator("main").last()).toContainText(grams("7.13"))
    await expect(page.locator("main").last()).not.toContainText("7.126")

    // Invoice detail — the line's weight.
    await page.goto(`/billing/${invoice.id}`)
    const line = page.locator("tr").filter({ hasText: `E2E WD Line ${suffix}` })
    await expect(line.getByRole("cell", { name: "7.13 g", exact: true })).toBeVisible()
    await expect(line).not.toContainText("7.126")

    // Report table (Stock) and its export.
    await page.goto("/reports")
    await page.getByRole("button", { name: "Stock", exact: true }).click()
    await page.getByPlaceholder(/search/i).first().fill(stock.stockCode)
    const reportRow = page.locator("tbody tr").filter({ hasText: stock.stockCode })
    await expect(reportRow).toContainText("7.13")
    await expect(reportRow).not.toContainText("7.126")
    const csv = await (await page.request.get("/reports/export?type=stock&format=csv")).text()
    const csvLine = csv.split("\n").find((row) => row.includes(stock.stockCode)) ?? ""
    expect(csvLine).toContain("7.13")
    expect(csvLine).not.toContain("7.126")

    // Ledger.
    await page.goto("/ledger")
    const ledgerRow = page.locator("tr").filter({ hasText: `E2E WD ledger ${suffix}` }).first()
    await expect(ledgerRow).toContainText("7.13 g fine")
    await expect(ledgerRow).not.toContainText("7.126")

    expect(crashes).toEqual([])
  } finally {
    // Remove this test's rows first, so restoring never recalculates them.
    if (created.ledgerId) await db().ledgerEntry.deleteMany({ where: { id: created.ledgerId } })
    if (created.invoiceId) await db().invoice.deleteMany({ where: { id: created.invoiceId } })
    if (created.customerId) await db().customer.deleteMany({ where: { id: created.customerId } })
    if (created.stockId) await db().inventoryStock.deleteMany({ where: { id: created.stockId } })
    const current = await db().businessSettings.findUnique({ where: { storeId }, select: { weightDecimalsGram: true } })
    if ((current?.weightDecimalsGram ?? 3) !== 3) {
      try {
        await saveGramDecimals(page, storeId, 3)
      } catch {
        await db().businessSettings.update({ where: { storeId }, data: { weightDecimalsGram: 3, weightRecalcJob: Prisma.DbNull } })
      }
    }
    await db().product.deleteMany({ where: { id: product.id } })
  }
})
