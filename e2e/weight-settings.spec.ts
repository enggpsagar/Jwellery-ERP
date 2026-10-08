import { expect, test } from "@playwright/test"
import { Prisma } from "@prisma/client"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Settings > Weights (lib/weight-calc.ts): net deductions, fine basis,
 * wastage in fine, rounding — and the confirmed, store-scoped
 * recalculation of existing records (lib/weight-recalc.server.ts).
 *
 * Worked example: Gross 10, Less/DMO 0.1, Stone 0.2, 22K 91.6 %, wastage 2 %.
 */
test.describe.configure({ mode: "serial" })

type Toggles = {
  stone?: boolean
  dmo?: boolean
  wastage?: boolean
  basis?: "NET" | "GROSS"
  gram?: number
}

const DEFAULTS: Required<Toggles> = { stone: true, dmo: true, wastage: false, basis: "NET", gram: 3 }

async function fillToggles(page: Page, t: Toggles) {
  if (t.stone !== undefined) await page.locator("#weights-net-stone").setChecked(t.stone)
  if (t.dmo !== undefined) await page.locator("#weights-net-dmo").setChecked(t.dmo)
  if (t.wastage !== undefined) await page.locator("#weights-add-wastage").setChecked(t.wastage)
  if (t.basis) await page.getByTestId(`weights-basis-${t.basis}`).check()
  if (t.gram !== undefined) await page.locator("#weights-decimals-gram").fill(String(t.gram))
}

async function recalcLogLength(storeId: string) {
  const row = await db().businessSettings.findUnique({ where: { storeId }, select: { weightRecalcLog: true } })
  return Array.isArray(row?.weightRecalcLog) ? row!.weightRecalcLog.length : 0
}

/** Saves through the UI; confirms the recalculation and waits for it to finish. */
async function saveSettings(page: Page, storeId: string, t: Toggles, onConfirm?: (page: Page) => Promise<void>) {
  await page.goto("/settings/weights")
  await fillToggles(page, t)
  await page.getByTestId("weights-save").click()
  const dialog = page.getByTestId("weights-confirm-counts")
  await expect(dialog).toBeVisible()
  if (onConfirm) await onConfirm(page)
  const logBefore = await recalcLogLength(storeId)
  await page.getByTestId("weights-confirm").click()
  // Done = this run's entry is in the log and no job is left running.
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

const n = (value: unknown) => Number(value)

/** Every weight-bearing row of a store, for a byte-for-byte comparison. */
async function storeSnapshot(storeId: string) {
  const [stock, invoiceItems, components, ledger] = await Promise.all([
    db().inventoryStock.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
    db().invoiceItem.findMany({ where: { invoice: { storeId } }, orderBy: { id: "asc" } }),
    db().pieceComponent.findMany({ where: { inventoryStock: { storeId } }, orderBy: { id: "asc" } }),
    db().ledgerEntry.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
  ])
  return JSON.stringify({ stock, invoiceItems, components, ledger })
}

/** Rows in ANOTHER store (MAIN) that a leaking recalculation would change. */
async function seedOtherStore(suffix: number) {
  const main = await db().store.findFirstOrThrow({ where: { code: "MAIN" }, select: { id: true } })
  const metal = await db().storeMetal.create({ data: { storeId: main.id, name: `E2E WT Gold ${suffix}`, hasPurity: true } })
  await db().storeMetalPurity.create({
    data: { storeId: main.id, storeMetalId: metal.id, label: "22K", skuCode: `WT${suffix}`, finenessPercent: 91.6, wastagePercent: 5 },
  })
  const product = await db().product.create({ data: { storeId: main.id, productCode: `E2E-WT-OTHER-${suffix}`, name: "Other store chain", metalTypeId: metal.id } })
  const stock = await db().inventoryStock.create({
    data: {
      storeId: main.id,
      productId: product.id,
      stockCode: `E2E-WT-OTHER-${suffix}`,
      metalTypeId: metal.id,
      purityLabel: "22K",
      purity: "GOLD_22K",
      grossWeight: 10,
      lessWeight: 0.1,
      stoneWeight: 0.2,
      netWeight: 9.7,
      fineWeight: 8.8852,
      wastagePercent: 5,
      components: {
        create: { kind: "METAL", metalTypeId: metal.id, purityLabel: "22K", grossWeight: 10, netWeight: 9.7, fineWeight: 8.8852, wastagePercent: 5 },
      },
    },
  })
  const customer = await db().customer.create({ data: { storeId: main.id, name: `E2E WT Other ${suffix}` } })
  const invoice = await db().invoice.create({
    data: {
      storeId: main.id,
      invoiceNumber: `E2E-WT-${suffix}`,
      customerId: customer.id,
      items: {
        create: { itemName: "Other store line", metalTypeId: metal.id, purityLabel: "22K", grossWeight: 10, netWeight: 10, fineWeight: 9.16, wastagePercent: 5 },
      },
    },
  })
  await db().ledgerEntry.create({
    data: {
      storeId: main.id,
      type: "DEBIT",
      sourceType: "ADJUSTMENT",
      metalTypeId: metal.id,
      metalWeightFine: 8.8852,
      description: `Stock added — E2E-WT-OTHER-${suffix}`,
    },
  })
  return { mainId: main.id, metalId: metal.id, productId: product.id, stockId: stock.id, customerId: customer.id, invoiceId: invoice.id }
}

async function cleanupOtherStore(seed: Awaited<ReturnType<typeof seedOtherStore>>) {
  await db().ledgerEntry.deleteMany({ where: { storeId: seed.mainId, metalTypeId: seed.metalId } })
  await db().invoice.deleteMany({ where: { id: seed.invoiceId } })
  await db().customer.deleteMany({ where: { id: seed.customerId } })
  await db().inventoryStock.deleteMany({ where: { id: seed.stockId } })
  await db().product.deleteMany({ where: { id: seed.productId } })
  await db().storeMetalPurity.deleteMany({ where: { storeMetalId: seed.metalId } })
  await db().storeMetal.deleteMany({ where: { id: seed.metalId } })
}

/** Adds one piece and returns its system-generated stock code. */
async function addStock(page: Page, productCode: string, expectedNet: string): Promise<string> {
  await page.goto("/inventory/stock/new")
  await page.getByRole("combobox").filter({ hasText: "Select Product" }).click()
  await page.getByPlaceholder(/search/i).last().fill(productCode)
  await page.getByRole("option", { name: new RegExp(productCode) }).click()
  // Stock Code is system-generated (hidden on Add Stock) — read it so the
  // row can be found afterwards.
  const stockCode = await page.locator('input[name="stockCode"]').inputValue()
  await page.locator("#grossWeight").fill("10")
  await page.locator("#lessWeight").fill("0.1")
  await page.locator("#stoneWeight").fill("0.2")
  await expect(page.locator("#netWeight")).toHaveValue(expectedNet)
  await page.getByRole("button", { name: "Add Stock" }).click()
  await page.waitForURL(/\/inventory\/stock$/)
  return stockCode
}

/** A "Create New Line Item" 22K gold line: net 10 typed, gross 10. */
async function invoiceLine(page: Page, itemName: string, wastage?: { expect: string; set: string; fine: string }) {
  await page.goto("/billing/new")
  await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
  await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(2).fill("10")
  await lineNumbers.nth(3).fill("5000")
  await page.getByRole("combobox").filter({ hasText: "Select metal" }).click()
  await page.getByRole("option", { name: "Gold", exact: true }).click()
  await page.locator("div.space-y-1").filter({ has: page.getByText("Purity", { exact: true }) }).getByRole("combobox").first().click()
  await page.getByRole("option", { name: "22K", exact: true }).click()
  await page.getByRole("combobox").filter({ hasText: "Select category" }).click()
  await page.getByRole("option", { name: "Ornament", exact: true }).click()
  await page.getByLabel("Gross weight", { exact: true })
    .first()
    .fill("10")
  if (wastage) {
    // The purity's default is copied onto the line and stays editable.
    await expect(page.getByTestId("line-wastage")).toHaveValue(wastage.expect)
    await page.getByTestId("line-wastage").fill(wastage.set)
    await expect(page.getByTestId("line-wastage-fine")).toContainText(wastage.fine)
  } else {
    // Wastage off in fine: still copied and shown, but not counted.
    await expect(page.getByTestId("line-wastage")).toHaveValue("2")
    await expect(page.getByTestId("line-wastage-fine")).toContainText("9.160")
    await expect(page.getByTestId("line-wastage-fine")).toContainText("not counted")
  }
  await page.getByRole("combobox").filter({ hasText: "Not recorded" }).click()
  await page.getByRole("option", { name: /Chandra Bullion Suppliers/ }).click()
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  return db().invoiceItem.findFirstOrThrow({ where: { itemName }, include: { invoice: true, inventoryStock: true } })
}

test("weight settings drive Add Stock and invoice lines, and recalculate only this store", async ({ page }) => {
  test.setTimeout(300_000)
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold", hasPurity: true }, select: { id: true } })
  const purity = await db().storeMetalPurity.upsert({
    where: { storeMetalId_label: { storeMetalId: gold.id, label: "22K" } },
    create: { storeId, storeMetalId: gold.id, label: "22K", skuCode: "22", finenessPercent: 91.6 },
    update: { finenessPercent: 91.6, isActive: true },
  })
  const purityWastageBefore = purity.wastagePercent
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId, name: "Ornament" }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-WT-${suffix}`,
      name: `E2E Weights Chain ${suffix}`,
      categoryId: category.id,
      metalTypeId: gold.id,
      defaultPurity: "GOLD_22K",
      storeMetalPurityId: purity.id,
    },
  })
  const other = await seedOtherStore(suffix)
  const otherBefore = await storeSnapshot(other.mainId)
  // Set from Add Stock's generated codes; the placeholders keep cleanup safe
  // if a step fails before then.
  let stockA = `E2E-WT-A-${suffix}`
  let stockB = `E2E-WT-B-${suffix}`

  try {
    // Default wastage for 22K, edited in Settings › Metals & Categories.
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { wastagePercent: 2 } })

    // --- Live example follows every option (nothing saved) --------------
    await page.goto("/settings/weights")
    const example = page.getByTestId("weights-example")
    await expect(example).toContainText("Net 9.700 g, Fine 8.885 g")
    await fillToggles(page, { dmo: false })
    await expect(example).toContainText("Net 9.800 g")
    await fillToggles(page, { dmo: true, stone: false })
    await expect(example).toContainText("Net 9.900 g, Fine 9.068 g")
    await fillToggles(page, { wastage: true })
    await expect(example).toContainText("Fine 9.266 g")
    await fillToggles(page, { basis: "GROSS" })
    await expect(example).toContainText("Fine 9.360 g")
    await fillToggles(page, { gram: 2 })
    await expect(example).toContainText("Net 9.90 g, Fine 9.36 g")
    await page.getByRole("button", { name: "Reset" }).click()
    await expect(example).toContainText("Net 9.700 g, Fine 8.885 g")

    // --- Defaults: today's behaviour -------------------------------------
    stockA = await addStock(page, product.productCode, "9.7")
    const a0 = await db().inventoryStock.findFirstOrThrow({ where: { storeId, stockCode: stockA } })
    expect(n(a0.netWeight)).toBeCloseTo(9.7, 5)
    expect(n(a0.fineWeight)).toBeCloseTo(8.8852, 5)
    expect(n(a0.wastagePercent)).toBe(2) // copied from the purity

    const line0 = await invoiceLine(page, `E2E WT Line ${suffix}`)
    expect(n(line0.netWeight)).toBeCloseTo(10, 5)
    expect(n(line0.fineWeight)).toBeCloseTo(9.16, 5) // wastage recorded, not counted
    expect(n(line0.wastagePercent)).toBe(2)

    // --- Stone not deducted + wastage in fine: confirm with counts -------
    const expectedStock = await db().inventoryStock.count({ where: { storeId, netWeight: { not: null } } })
    const expectedLines = await db().invoiceItem.count({ where: { invoice: { storeId }, netWeight: { not: null } } })
    await saveSettings(page, storeId, { stone: false, wastage: true }, async (p) => {
      await expect(p.getByTestId("weights-count-inventoryStock-rows")).toHaveText(String(expectedStock))
      await expect(p.getByTestId("weights-count-invoiceItem-rows")).toHaveText(String(expectedLines))
      expect(Number(await p.getByTestId("weights-count-inventoryStock-net").textContent())).toBeGreaterThanOrEqual(1)
      await expect(p.getByTestId("weights-count-invoiceItem-net")).toHaveText("0")
    })

    // Unsold stock: net AND fine follow the new rules.
    const a1 = await db().inventoryStock.findFirstOrThrow({ where: { storeId, stockCode: stockA } })
    expect(n(a1.netWeight)).toBeCloseTo(9.9, 5)
    expect(n(a1.fineWeight)).toBeCloseTo(9.2664, 5)
    const ledgerA = await db().ledgerEntry.findFirstOrThrow({ where: { storeId, description: { startsWith: `Stock added — ${stockA}` } } })
    expect(n(ledgerA.metalWeightFine)).toBeCloseTo(9.2664, 5)

    // Issued invoice: fine changes, net / amounts / GST never do.
    const line1 = await db().invoiceItem.findUniqueOrThrow({ where: { id: line0.id }, include: { invoice: true, inventoryStock: true } })
    expect(n(line1.fineWeight)).toBeCloseTo(9.36, 5)
    expect(n(line1.netWeight)).toBe(n(line0.netWeight))
    expect(n(line1.lineTotal)).toBe(n(line0.lineTotal))
    expect(n(line1.sgstAmount) + n(line1.cgstAmount) + n(line1.igstAmount)).toBe(n(line0.sgstAmount) + n(line0.cgstAmount) + n(line0.igstAmount))
    expect(n(line1.invoice.totalAmount)).toBe(n(line0.invoice.totalAmount))
    expect(n(line1.inventoryStock!.netWeight)).toBe(n(line0.inventoryStock!.netWeight)) // sold: net kept
    expect(n(line1.inventoryStock!.fineWeight)).toBeCloseTo(9.36, 5)

    // Another store's rows are byte-for-byte untouched.
    expect(await storeSnapshot(other.mainId)).toBe(otherBefore)

    // --- New settings on the forms ---------------------------------------
    stockB = await addStock(page, product.productCode, "9.9")
    const b = await db().inventoryStock.findFirstOrThrow({ where: { storeId, stockCode: stockB } })
    expect(n(b.netWeight)).toBeCloseTo(9.9, 5)
    expect(n(b.fineWeight)).toBeCloseTo(9.2664, 5)

    const line2 = await invoiceLine(page, `E2E WT Line2 ${suffix}`, { expect: "2", set: "3", fine: "9.460" })
    expect(n(line2.wastagePercent)).toBe(3)
    expect(n(line2.fineWeight)).toBeCloseTo(9.46, 5)

    // --- Rounding: 2 decimals for grams ----------------------------------
    await saveSettings(page, storeId, { gram: 2 })
    const a2 = await db().inventoryStock.findFirstOrThrow({ where: { storeId, stockCode: stockA } })
    expect(n(a2.fineWeight)).toBe(9.27)
    expect(n(a2.netWeight)).toBe(9.9)

    // --- Fine on gross ---------------------------------------------------
    await saveSettings(page, storeId, { basis: "GROSS" })
    const a3 = await db().inventoryStock.findFirstOrThrow({ where: { storeId, stockCode: stockA } })
    expect(n(a3.fineWeight)).toBe(9.36)
    expect(await storeSnapshot(other.mainId)).toBe(otherBefore)
  } finally {
    // Restore the defaults through the same path, which recalculates the
    // demo store back to today's figures.
    const current = await db().businessSettings.findUnique({ where: { storeId } })
    const atDefaults =
      current &&
      current.netDeductStoneWeight &&
      current.netDeductDmoWeight &&
      current.fineWeightBasis === "NET" &&
      !current.addWastageToFineWeight &&
      current.weightDecimalsGram === 3
    if (!atDefaults) {
      try {
        await saveSettings(page, storeId, DEFAULTS)
      } catch {
        await db().businessSettings.update({
          where: { storeId },
          data: { netDeductStoneWeight: true, netDeductDmoWeight: true, fineWeightBasis: "NET", addWastageToFineWeight: false, weightDecimalsGram: 3, weightRecalcJob: Prisma.DbNull },
        })
      }
    }
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { wastagePercent: purityWastageBefore } })
    await db().ledgerEntry.deleteMany({ where: { storeId, description: { in: [`Stock added — ${stockA}`, `Stock added — ${stockB}`] } } })
    await db().inventoryStock.deleteMany({ where: { storeId, stockCode: { in: [stockA, stockB] } } })
    await db().product.deleteMany({ where: { id: product.id } })
    await cleanupOtherStore(other)
  }

  expect(crashes).toEqual([])
})
