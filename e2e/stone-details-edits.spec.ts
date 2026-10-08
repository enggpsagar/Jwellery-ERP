import { expect, test } from "@playwright/test"

import type { Locator, Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Follow-ups to saving a stone's pcs / clarity / certificate:
 * - the invoice detail page's line quick edit corrects them, on a
 *   single-stone line and on each stone row of a multi-part line;
 * - Purchase and Customer Exchange stone rows suggest the store's
 *   Settings → Stone Clarity list;
 * - editing an Add Stock piece's weight re-splits the metal / stone rows
 *   Add Stock wrote (newStockPieceRows), while rows entered row by row are
 *   left alone (lib/actions/inventory/stock-actions.ts planStockPieceRowsEdit).
 */
async function seedMasters() {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.create({ data: { storeId, name: `E2E SDE Gold ${suffix}`, hasPurity: true } })
  const silver = await db().storeMetal.create({ data: { storeId, name: `E2E SDE Silver ${suffix}`, hasPurity: true } })
  const diamond = await db().storeMetal.create({
    data: { storeId, name: `E2E SDE Diamond ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  const ruby = await db().storeMetal.create({
    data: { storeId, name: `E2E SDE Ruby ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  await db().storeMetalOrigin.create({ data: { storeId, storeMetalId: diamond.id, name: "Natural", sellingPrice: 60000 } })
  const gold18 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold.id, label: "18", skuCode: `SDE18-${suffix}`, finenessPercent: 75, sellingPrice: 7000 },
  })
  const silver925 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: silver.id, label: "925", skuCode: `SDE925-${suffix}`, finenessPercent: 92.5, sellingPrice: 100 },
  })
  const gst3 = await db().gstRate.findFirstOrThrow({ where: { storeId, ratePercent: 3 }, select: { id: true } })
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const clarity = await db().storeStoneClarity.create({ data: { storeId, name: `E2E SDE Clarity ${suffix}` } })
  // Gold 18 1.794 g + Silver 925 0.5 g + Diamond 0.28 ct (12 pcs) + Ruby 0.1 ct (2 pcs).
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-SDE-${suffix}`,
      name: `E2E SDE Earring ${suffix}`,
      categoryId: category.id,
      metalTypeId: gold.id,
      defaultPurity: "GOLD_18K",
      storeMetalPurityId: gold18.id,
      defaultGrossWeight: 2.35,
      defaultNetWeight: 2.294,
      hasStoneComponent: true,
      defaultStoneMetalTypeName: diamond.name,
      defaultStoneTypeNames: "Natural",
      defaultCaratWeight: 0.28,
      metalComponents: {
        create: [
          { metalTypeId: gold.id, storeMetalPurityId: gold18.id, grossWeight: 1.85, netWeight: 1.794, gstRateId: gst3.id, sortOrder: 0 },
          { metalTypeId: silver.id, storeMetalPurityId: silver925.id, grossWeight: 0.5, netWeight: 0.5, gstRateId: gst3.id, sortOrder: 1 },
        ],
      },
      stoneComponents: {
        create: [
          { stoneMetalTypeName: diamond.name, stoneTypeNames: "Natural", caratWeight: 0.28, pieces: 12, clarity: "VVS", certificateNumber: "IGI-123", stoneRate: 60000, gstRateId: gst3.id, sortOrder: 0 },
          { stoneMetalTypeName: ruby.name, caratWeight: 0.1, pieces: 2, stoneRate: 20000, gstRateId: gst3.id, sortOrder: 1 },
        ],
      },
    },
  })
  return { storeId, suffix, gold, silver, diamond, ruby, gold18, silver925, clarity, product }
}

type Masters = Awaited<ReturnType<typeof seedMasters>>

/** A stock row the way Add Stock used to write one: no rows of its own. */
async function seedStock(masters: Masters, code: string) {
  return db().inventoryStock.create({
    data: {
      storeId: masters.storeId,
      productId: masters.product.id,
      stockCode: code,
      metalTypeId: masters.gold.id,
      purity: "GOLD_18K",
      purityLabel: "18",
      quantity: 1,
      grossWeight: 2.35,
      netWeight: 2.294,
      fineWeight: 1.3455,
      caratWeight: 0.28,
      stoneMetalTypeName: masters.diamond.name,
      stoneTypeNames: "Natural",
    },
  })
}

async function cleanUp(masters: Masters) {
  const { storeId, product } = masters
  const stockIds = (await db().inventoryStock.findMany({ where: { productId: product.id }, select: { id: true, stockCode: true } }))
  const invoiceIds = (
    await db().invoiceItem.findMany({ where: { inventoryStockId: { in: stockIds.map((s) => s.id) } }, select: { invoiceId: true } })
  ).map((row) => row.invoiceId)
  await db().ledgerEntry.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
  for (const stock of stockIds) {
    await db().ledgerEntry.deleteMany({ where: { storeId, description: { startsWith: `Stock added — ${stock.stockCode}` } } })
  }
  await db().inventoryTransaction.deleteMany({ where: { inventoryStockId: { in: stockIds.map((s) => s.id) } } })
  await db().invoice.deleteMany({ where: { id: { in: invoiceIds } } })
  await db().inventoryStock.deleteMany({ where: { productId: product.id } })
  await db().product.deleteMany({ where: { id: product.id } })
  const metalIds = [masters.gold.id, masters.silver.id, masters.diamond.id, masters.ruby.id]
  await db().ledgerEntry.deleteMany({ where: { storeId, metalTypeId: { in: metalIds } } })
  await db().storeMetal.deleteMany({ where: { id: { in: metalIds } } })
  await db().storeStoneClarity.deleteMany({ where: { id: masters.clarity.id } })
}

async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

/** New Invoice → Ananya → the seeded piece → Create Invoice; returns the line. */
async function sellPiece(page: Page, masters: Masters, stockId: string) {
  await page.goto("/billing/new")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByPlaceholder(/search/i).last().fill(masters.product.productCode)
  await page.getByRole("option", { name: new RegExp(masters.product.productCode) }).click()
  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  return db().invoiceItem.findFirstOrThrow({
    where: { inventoryStockId: stockId },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  })
}

test("invoice quick edit corrects each stone row's pcs / clarity / certificate on a multi-part line", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  try {
    const stock = await seedStock(masters, `E2E-SDE-QE-${masters.suffix}`)
    const line = await sellPiece(page, masters, stock.id)
    expect(line.components.map((row) => row.kind)).toEqual(["METAL", "METAL", "STONE", "STONE"])
    const before = { lineTotal: Number(line.lineTotal), stoneCharge: Number(line.stoneCharge) }

    await page.getByRole("button", { name: /^Edit rate\/weight for / }).click()
    const quickEdit = page.getByTestId("piece-quick-edit")
    await expect(quickEdit.getByTestId("quick-edit-piece-stone-pcs")).toHaveCount(2)
    await expect(quickEdit.getByTestId("quick-edit-piece-stone-cert").first()).toHaveValue("IGI-123")
    // The store's Stone Clarity list is suggested.
    await expect(quickEdit.locator(`datalist option[value="${masters.clarity.name}"]`).first()).toBeAttached()
    // The ruby: 2 → 3 pcs, a clarity and a certificate it never had.
    await quickEdit.getByTestId("quick-edit-piece-stone-pcs").nth(1).fill("3")
    await quickEdit.getByTestId("quick-edit-piece-stone-clarity").nth(1).fill(masters.clarity.name)
    await quickEdit.getByTestId("quick-edit-piece-stone-cert").nth(1).fill("GRS-9")
    // The diamond's certificate cleared.
    await quickEdit.getByTestId("quick-edit-piece-stone-cert").first().fill("")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Line item updated")).toBeVisible()

    const edited = await db().invoiceItem.findUniqueOrThrow({
      where: { id: line.id },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    const [, , diamondRow, rubyRow] = edited.components
    expect(rubyRow.pieces).toBe(3)
    expect(rubyRow.clarity).toBe(masters.clarity.name)
    expect(rubyRow.certificateNumber).toBe("GRS-9")
    expect(diamondRow.pieces).toBe(12)
    expect(diamondRow.clarity).toBe("VVS")
    expect(diamondRow.certificateNumber).toBeNull()
    // Nothing priced moved, and no "revised" ledger entry.
    expect(Number(edited.lineTotal)).toBe(before.lineTotal)
    expect(Number(edited.stoneCharge)).toBe(before.stoneCharge)
    expect(await db().ledgerEntry.count({ where: { invoiceId: line.invoiceId, description: { contains: "revised" } } })).toBe(0)
    // The stock piece's own record is untouched (it has no rows of its own).
    expect(await db().pieceComponent.count({ where: { inventoryStockId: stock.id } })).toBe(0)
    await expect(page.getByText(new RegExp(`0\\.10 ct · 3 pcs · ${masters.clarity.name} · Cert GRS-9`)).first()).toBeVisible()
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(masters)
  }
})

test("invoice quick edit corrects a single-stone line's pcs / clarity / certificate", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  // Gold + diamond only: an ordinary line with "Includes a Stone".
  await db().productMetalComponent.deleteMany({ where: { productId: masters.product.id, metalTypeId: masters.silver.id } })
  await db().productStoneComponent.deleteMany({ where: { productId: masters.product.id, stoneMetalTypeName: masters.ruby.name } })
  try {
    const stock = await seedStock(masters, `E2E-SDE-QS-${masters.suffix}`)
    const line = await sellPiece(page, masters, stock.id)
    expect(line.components).toHaveLength(0)
    expect(line.stonePieces).toBe(12)
    const before = Number(line.lineTotal)

    await page.getByRole("button", { name: /^Edit rate\/weight for / }).click()
    await expect(page.getByTestId("quick-edit-stone-pcs")).toHaveValue("12")
    await expect(page.locator(`datalist option[value="${masters.clarity.name}"]`).first()).toBeAttached()
    await page.getByTestId("quick-edit-stone-pcs").fill("15")
    await page.getByTestId("quick-edit-stone-clarity").fill("VS")
    await page.getByTestId("quick-edit-stone-cert").fill("IGI-999")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Line item updated")).toBeVisible()

    const edited = await db().invoiceItem.findUniqueOrThrow({ where: { id: line.id } })
    expect(edited.stonePieces).toBe(15)
    expect(edited.stoneClarity).toBe("VS")
    expect(edited.stoneCertificateNumber).toBe("IGI-999")
    expect(Number(edited.lineTotal)).toBe(before)
    expect(await db().ledgerEntry.count({ where: { invoiceId: line.invoiceId, description: { contains: "revised" } } })).toBe(0)
    await expect(page.getByTestId("line-stone-details").first()).toContainText("15 pcs · VS · Cert IGI-999")
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(masters)
  }
})

test("Purchase and Customer Exchange stone rows suggest the store's Stone Clarity list", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  try {
    await page.goto("/purchases/new")
    await pick(page, page.getByRole("combobox").filter({ hasText: /Select (a|or search a) supplier/ }).first(), /Chandra Bullion Suppliers/)
    await page.getByRole("combobox").filter({ hasText: /Search product|Select a product|product/i }).first().click()
    await page.getByRole("option", { name: /New product/ }).click()
    const expand = page.getByRole("button", { name: "Expand line item details" }).first()
    if (await expand.isVisible()) await expand.click()
    await page.getByText("Made of more than one metal or stone?").click()
    if ((await page.getByTestId("purchase-piece-stone-row").count()) < 1) {
      await page.getByRole("button", { name: "Add stone" }).click()
    }
    await expect(page.getByTestId("purchase-piece-clarity").first()).toHaveAttribute("list", /purchase-piece-clarities-/)
    await expect(page.locator(`datalist option[value="${masters.clarity.name}"]`).first()).toBeAttached()

    await page.goto("/billing/new")
    await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
    await page.getByRole("button", { name: "Add item bought" }).click()
    const section = page.getByTestId("old-gold-section")
    await section.getByTestId("multi-part-question").click()
    await expect(section.getByTestId("exchange-piece-clarity").first()).toHaveAttribute("list", /exchange-piece-clarities-/)
    await expect(section.locator(`datalist option[value="${masters.clarity.name}"]`).first()).toBeAttached()
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(masters)
  }
})

/** Stock → Edit: new gross / net weight, saved; waits for the row to change. */
async function editStockWeights(page: Page, stockId: string, gross: string, net: string) {
  await page.goto(`/inventory/stock/${stockId}/edit`)
  await page.locator("#grossWeight").fill(gross)
  await page.locator("#netWeight").fill(net)
  await page.getByRole("button", { name: "Update Stock" }).click()
  await expect
    .poll(async () => Number((await db().inventoryStock.findUniqueOrThrow({ where: { id: stockId } })).netWeight), { timeout: 15000 })
    .toBeCloseTo(Number(net), 4)
}

test("editing an Add Stock piece's weight re-splits its metal rows; hand-entered rows are left alone", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  const { storeId, product, gold, silver } = masters
  let stockCode = `E2E-SDE-AS-${masters.suffix}`
  try {
    // Add Stock at twice the Product's weight: gold 3.588 g, silver 1 g.
    await page.goto("/inventory/stock/new")
    await page.getByRole("combobox").filter({ hasText: "Select Product" }).click()
    await page.getByPlaceholder(/search/i).last().fill(product.productCode)
    await page.getByRole("option", { name: new RegExp(product.productCode) }).click()
    // Stock Code is system-generated (hidden on Add Stock) — read it so the
    // row can be found afterwards.
    stockCode = await page.locator('input[name="stockCode"]').inputValue()
    await page.locator("#grossWeight").fill("4.7")
    await page.locator("#netWeight").fill("4.588")
    await page.getByRole("button", { name: "Add Stock" }).click()
    await page.waitForURL(/\/inventory\/stock$/)
    const created = await db().inventoryStock.findFirstOrThrow({
      where: { storeId, stockCode },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    expect(Number(created.components[0].netWeight)).toBeCloseTo(3.588, 4)
    const ledgerBefore = await db().ledgerEntry.count({ where: { storeId, description: { startsWith: `Stock added — ${stockCode}` } } })
    expect(ledgerBefore).toBe(2)

    // Back to the Product's own weight: the rows follow, in proportion.
    await editStockWeights(page, created.id, "2.35", "2.294")
    const edited = await db().inventoryStock.findUniqueOrThrow({
      where: { id: created.id },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    const [goldRow, silverRow, diamondRow, rubyRow] = edited.components
    expect(edited.components.map((row) => row.id)).toEqual(created.components.map((row) => row.id))
    expect(goldRow.metalTypeId).toBe(gold.id)
    expect(Number(goldRow.netWeight)).toBeCloseTo(1.794, 4)
    expect(Number(goldRow.grossWeight)).toBeCloseTo(1.85, 4)
    expect(Number(goldRow.fineWeight)).toBeCloseTo(1.3455, 4)
    expect(silverRow.metalTypeId).toBe(silver.id)
    expect(Number(silverRow.netWeight)).toBeCloseTo(0.5, 4)
    // Stones keep their carats (none entered for a gold piece), pcs and value.
    expect(Number(diamondRow.caratWeight)).toBeCloseTo(0.28, 3)
    expect(diamondRow.pieces).toBe(12)
    expect(diamondRow.certificateNumber).toBe("IGI-123")
    expect(Number(diamondRow.amount)).toBeCloseTo(16800, 2)
    expect(Number(rubyRow.amount)).toBeCloseTo(2000, 2)
    // Summaries as on create: only gold's pure weight; both stones' value.
    expect(Number(edited.fineWeight)).toBeCloseTo(1.3455, 4)
    expect(Number(edited.stoneCharge)).toBeCloseTo(18800, 2)
    // Edits don't post to the ledger (same as before this change).
    expect(await db().ledgerEntry.count({ where: { storeId, description: { startsWith: `Stock added — ${stockCode}` } } })).toBe(
      ledgerBefore,
    )

    // A piece whose rows were entered row by row (not the Product's
    // proportions — e.g. a multi-part sale line): untouched by a weight edit,
    // and so are its summaries.
    const handEntered = await db().inventoryStock.create({
      data: {
        storeId,
        productId: product.id,
        stockCode: `${stockCode}-H`,
        metalTypeId: gold.id,
        purity: "GOLD_18K",
        purityLabel: "18",
        quantity: 1,
        grossWeight: 2.4,
        netWeight: 2.3,
        fineWeight: 1.5,
        stoneCharge: 999,
        components: {
          create: [
            { kind: "METAL", sortOrder: 0, metalTypeId: gold.id, purityLabel: "18", grossWeight: 2, netWeight: 2, fineWeight: 1.5, amount: 0 },
            { kind: "METAL", sortOrder: 1, metalTypeId: silver.id, purityLabel: "925", grossWeight: 0.3, netWeight: 0.3, fineWeight: 0.2775, amount: 0 },
            { kind: "STONE", sortOrder: 2, stoneMetalTypeName: masters.diamond.name, caratWeight: 0.3, stoneWeight: 0.06, rate: 3330, amount: 999 },
          ],
        },
      },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    await editStockWeights(page, handEntered.id, "3.2", "3.1")
    const kept = await db().inventoryStock.findUniqueOrThrow({
      where: { id: handEntered.id },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    expect(kept.components.map((row) => Number(row.netWeight ?? row.caratWeight))).toEqual([2, 0.3, 0.3])
    expect(Number(kept.fineWeight)).toBeCloseTo(1.5, 4)
    expect(Number(kept.stoneCharge)).toBeCloseTo(999, 2)
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(masters)
  }
})
