import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * A stock piece added the way Add Stock adds one — from a Product of Gold
 * 18 + Silver 925 + Diamond (12 pcs) + Ruby (2 pcs). Add Stock copies only
 * the Product's first metal and first stone onto the stock row and writes
 * no PieceComponent rows, so picking it used to open a single-metal line
 * with just the diamond and no stone rate (lib/inventory/stock-piece-rows.ts).
 * Picking it must open every metal and stone, with pieces and stone rates.
 */
async function seedPiece() {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.create({ data: { storeId, name: `E2E Gold ${suffix}`, hasPurity: true } })
  const silver = await db().storeMetal.create({ data: { storeId, name: `E2E Silver ${suffix}`, hasPurity: true } })
  const diamond = await db().storeMetal.create({
    data: { storeId, name: `E2E Diamond ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  const ruby = await db().storeMetal.create({
    data: { storeId, name: `E2E Ruby ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT", sellingPrice: 5000 },
  })
  // The diamond is priced by its Stone Type; the ruby by the Product's own stone rate.
  await db().storeMetalOrigin.create({ data: { storeId, storeMetalId: diamond.id, name: "Natural", sellingPrice: 60000 } })
  const gold18 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold.id, label: "18", skuCode: `E2E18-${suffix}`, finenessPercent: 75, sellingPrice: 7000 },
  })
  const silver925 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: silver.id, label: "925", skuCode: `E2E925-${suffix}`, finenessPercent: 92.5, sellingPrice: 100 },
  })
  const gst3 = await db().gstRate.findFirstOrThrow({ where: { storeId, ratePercent: 3 }, select: { id: true } })
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-MP-${suffix}`,
      name: `E2E Two-tone Earring ${suffix}`,
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
          { stoneMetalTypeName: diamond.name, stoneTypeNames: "Natural", caratWeight: 0.28, pieces: 12, clarity: "VVS", gstRateId: gst3.id, sortOrder: 0 },
          { stoneMetalTypeName: ruby.name, caratWeight: 0.1, pieces: 2, stoneRate: 20000, gstRateId: gst3.id, sortOrder: 1 },
        ],
      },
    },
  })
  // What Add Stock writes: the first metal and first stone only, no rows.
  const stock = await db().inventoryStock.create({
    data: {
      storeId,
      productId: product.id,
      stockCode: `E2E-MPSTK-${suffix}`,
      metalTypeId: gold.id,
      purity: "GOLD_18K",
      purityLabel: "18",
      quantity: 1,
      grossWeight: 2.35,
      netWeight: 2.294,
      fineWeight: 1.7205,
      stoneWeight: 0.056,
      caratWeight: 0.28,
      stoneMetalTypeName: diamond.name,
      stoneTypeNames: "Natural",
    },
  })
  return { storeId, gold, silver, diamond, ruby, product, stock }
}

type Seeded = Awaited<ReturnType<typeof seedPiece>>

async function cleanUp(seeded: Seeded) {
  const { stock, product, gold, silver, diamond, ruby } = seeded
  const invoiceIds = (
    await db().invoiceItem.findMany({ where: { inventoryStockId: stock.id }, select: { invoiceId: true } })
  ).map((row) => row.invoiceId)
  await db().inventoryTransaction.deleteMany({ where: { inventoryStockId: stock.id } })
  await db().invoice.deleteMany({ where: { id: { in: invoiceIds } } })
  await db().quotation.deleteMany({ where: { items: { some: { inventoryStockId: stock.id } } } })
  await db().kachaInvoice.deleteMany({ where: { items: { some: { inventoryStockId: stock.id } } } })
  await db().inventoryStock.deleteMany({ where: { productId: product.id } })
  await db().product.deleteMany({ where: { id: product.id } })
  await db().storeMetal.deleteMany({ where: { id: { in: [gold.id, silver.id, diamond.id, ruby.id] } } })
}

async function pickStock(page: Page, productCode: string) {
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByPlaceholder(/search/i).last().fill(productCode)
  await page.getByRole("option", { name: new RegExp(productCode) }).click()
}

/** The rows every form's editor shows for the seeded piece. */
async function expectPieceRows(page: Page, prefix: string) {
  await expect(page.getByTestId(`${prefix}-metal-row`)).toHaveCount(2)
  await expect(page.getByTestId(`${prefix}-stone-row`)).toHaveCount(2)
  await expect(page.getByTestId(`${prefix}-net`).nth(0)).toHaveValue("1.794")
  await expect(page.getByTestId(`${prefix}-net`).nth(1)).toHaveValue("0.5")
  // Metal rates: each purity's Selling Price.
  await expect(page.getByTestId(`${prefix}-rate`).nth(0)).toHaveValue("7000")
  await expect(page.getByTestId(`${prefix}-rate`).nth(1)).toHaveValue("100")
  await expect(page.getByTestId(`${prefix}-carat`).nth(0)).toHaveValue("0.28")
  await expect(page.getByTestId(`${prefix}-carat`).nth(1)).toHaveValue("0.1")
  // Diamond: the Stone Type's Selling Price; ruby: the Product's own stone rate.
  await expect(page.getByTestId(`${prefix}-stone-rate`).nth(0)).toHaveValue("60000")
  await expect(page.getByTestId(`${prefix}-stone-rate`).nth(1)).toHaveValue("20000")
  await expect(page.getByTestId(`${prefix}-stone-value`).nth(0)).toHaveValue("16800")
  await expect(page.getByTestId(`${prefix}-stone-value`).nth(1)).toHaveValue("2000")
  await expect(page.getByTestId(`${prefix}-stone-extras`).nth(0)).toHaveText("12 pcs · VVS")
  await expect(page.getByTestId(`${prefix}-stone-extras`).nth(1)).toHaveText("2 pcs")
}

test("picking a gold + silver + diamond + ruby stock piece opens every metal and stone", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const seeded = await seedPiece()
  const { storeId, gold, silver, diamond, ruby, product, stock } = seeded
  try {
    await page.goto("/billing/new")
    await page.getByRole("combobox").filter({ hasText: "Select a party" }).click()
    await page.getByRole("option", { name: /Ananya Kulkarni/ }).click()
    await pickStock(page, product.productCode)

    await expectPieceRows(page, "sale-piece")
    await expect(page.getByTestId("sale-line-net")).toHaveText("2.294 g")
    // The piece's facts are locked; only rates stay editable.
    await expect(page.getByTestId("sale-piece-net").first()).toHaveAttribute("readonly", "")

    await page.getByRole("button", { name: "Create Invoice" }).click()
    await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

    const line = await db().invoiceItem.findFirstOrThrow({
      where: { inventoryStockId: stock.id, invoice: { storeId } },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    expect(line.components.map((row) => row.kind)).toEqual(["METAL", "METAL", "STONE", "STONE"])
    const [goldRow, silverRow, diamondRow, rubyRow] = line.components
    expect(goldRow.metalTypeId).toBe(gold.id)
    expect(goldRow.purityLabel).toBe("18")
    expect(Number(goldRow.netWeight)).toBeCloseTo(1.794, 4)
    expect(Number(goldRow.amount)).toBeCloseTo(12558, 2)
    expect(silverRow.metalTypeId).toBe(silver.id)
    expect(silverRow.purityLabel).toBe("925")
    expect(Number(silverRow.netWeight)).toBeCloseTo(0.5, 4)
    expect(Number(silverRow.amount)).toBeCloseTo(50, 2)
    expect(diamondRow.stoneMetalTypeName).toBe(diamond.name)
    expect(diamondRow.stoneTypeNames).toBe("Natural")
    expect(Number(diamondRow.caratWeight)).toBeCloseTo(0.28, 3)
    expect(Number(diamondRow.rate)).toBeCloseTo(60000, 2)
    expect(Number(diamondRow.amount)).toBeCloseTo(16800, 2)
    expect(rubyRow.stoneMetalTypeName).toBe(ruby.name)
    expect(Number(rubyRow.caratWeight)).toBeCloseTo(0.1, 3)
    expect(Number(rubyRow.rate)).toBeCloseTo(20000, 2)
    expect(Number(rubyRow.amount)).toBeCloseTo(2000, 2)
    // The line summarises: first metal, all metals' net, both stones' value.
    expect(line.metalTypeId).toBe(gold.id)
    expect(Number(line.netWeight)).toBeCloseTo(2.294, 4)
    expect(Number(line.stoneCharge)).toBeCloseTo(18800, 2)
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(seeded)
  }
})

test("Estimate and Quotation open the same piece with every metal and stone", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const seeded = await seedPiece()
  try {
    await page.goto("/billing/kacha/new")
    await pickStock(page, seeded.product.productCode)
    await expectPieceRows(page, "kacha-piece")

    await page.goto("/quotations/new")
    await pickStock(page, seeded.product.productCode)
    await expectPieceRows(page, "quotation-piece")
    expect(crashes).toEqual([])
  } finally {
    await cleanUp(seeded)
  }
})
