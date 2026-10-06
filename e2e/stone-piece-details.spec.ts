import { expect, test } from "@playwright/test"

import type { Locator, Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * A stone's number of stones (pcs), clarity and certificate number are saved
 * — on a hand-typed single-stone line (stonePieces / stoneClarity /
 * stoneCertificateNumber), kept when an Estimate becomes a Tax Invoice — and
 * Add Stock of a Product made of several metals and stones writes the
 * piece's PieceComponent rows (lib/inventory/stock-piece-rows.ts
 * newStockPieceRows) with them.
 */
async function seedMasters() {
  const storeId = await demoStoreId()
  const suffix = Date.now()
  const gold = await db().storeMetal.create({ data: { storeId, name: `E2E SPD Gold ${suffix}`, hasPurity: true } })
  const silver = await db().storeMetal.create({ data: { storeId, name: `E2E SPD Silver ${suffix}`, hasPurity: true } })
  const diamond = await db().storeMetal.create({
    data: { storeId, name: `E2E SPD Diamond ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  const ruby = await db().storeMetal.create({
    data: { storeId, name: `E2E SPD Ruby ${suffix}`, isGemstone: true, hasPurity: false, primaryUnit: "CARAT" },
  })
  await db().storeMetalOrigin.create({ data: { storeId, storeMetalId: diamond.id, name: "Natural", sellingPrice: 60000 } })
  const gold18 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold.id, label: "18", skuCode: `SPD18-${suffix}`, finenessPercent: 75, sellingPrice: 7000 },
  })
  const silver925 = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: silver.id, label: "925", skuCode: `SPD925-${suffix}`, finenessPercent: 92.5, sellingPrice: 100 },
  })
  return { storeId, suffix, gold, silver, diamond, ruby, gold18, silver925 }
}

type Masters = Awaited<ReturnType<typeof seedMasters>>

async function cleanUpMasters(masters: Masters) {
  const ids = [masters.gold.id, masters.silver.id, masters.diamond.id, masters.ruby.id]
  await db().ledgerEntry.deleteMany({ where: { storeId: masters.storeId, metalTypeId: { in: ids } } })
  await db().storeMetal.deleteMany({ where: { id: { in: ids } } })
}

async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

const fieldByLabel = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("xpath=..").locator("input").first()

test("a hand-typed stone's pcs / clarity / certificate are saved, shown, and kept on Estimate → Tax Invoice", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  const itemName = `E2E SPD Ring ${masters.suffix}`
  let slipId: string | null = null
  let invoiceId: string | null = null
  try {
    await page.goto("/billing/kacha/new")
    await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
    await page
      .locator("div.space-y-1")
      .filter({ has: page.getByText("Item Name", { exact: true }) })
      .locator("input")
      .first()
      .fill(itemName)
    await pick(page, page.getByRole("combobox").filter({ hasText: "Not recorded" }), /Chandra Bullion Suppliers/)
    await pick(page, page.getByRole("combobox").filter({ hasText: "Select metal" }), masters.gold.name)
    await pick(page, page.getByText("Purity", { exact: true }).locator("xpath=..").getByRole("combobox").first(), /^18\b/)
    await fieldByLabel(page, "Gross Weight").fill("5")
    await fieldByLabel(page, "Rate / g").fill("7000")

    await page.getByText("Includes a Stone", { exact: true }).click()
    await page.getByRole("combobox").filter({ hasText: "Select a stone" }).click()
    await page.getByRole("option", { name: masters.diamond.name, exact: true }).click()
    await page.getByRole("radio", { name: "Natural" }).check()
    await fieldByLabel(page, "Stone Carat Weight (ct)").fill("0.28")
    await page.getByTestId("kacha-line-stone-pcs").fill("12")
    await page.getByTestId("kacha-line-stone-clarity").fill("VVS")
    await page.getByTestId("kacha-line-stone-cert").fill("IGI-123")

    await page.getByRole("button", { name: "Create Estimate" }).click()
    await page.waitForURL(/\/billing\/kacha\/(?!new)[^/]+$/)
    const slipItem = await db().kachaInvoiceItem.findFirstOrThrow({
      where: { itemName, kachaInvoice: { storeId: masters.storeId } },
    })
    slipId = slipItem.kachaInvoiceId
    expect(slipItem.stoneMetalTypeName).toBe(masters.diamond.name)
    expect(slipItem.stonePieces).toBe(12)
    expect(slipItem.stoneClarity).toBe("VVS")
    expect(slipItem.stoneCertificateNumber).toBe("IGI-123")
    await expect(page.getByTestId("line-stone-details").first()).toContainText("12 pcs · VVS · Cert IGI-123")

    await page.goto(`${page.url()}/convert`)
    await page.getByRole("button", { name: "Convert to Tax Invoice" }).click()
    await page.waitForURL(/\/billing\/(?!kacha)[^/]+$/)
    await expect
      .poll(async () => db().invoiceItem.count({ where: { itemName, invoice: { storeId: masters.storeId } } }), { timeout: 15000 })
      .toBe(1)
    const invoiceItem = await db().invoiceItem.findFirstOrThrow({
      where: { itemName, invoice: { storeId: masters.storeId } },
    })
    invoiceId = invoiceItem.invoiceId
    expect(invoiceItem.stonePieces).toBe(12)
    expect(invoiceItem.stoneClarity).toBe("VVS")
    expect(invoiceItem.stoneCertificateNumber).toBe("IGI-123")

    await page.goto(`/billing/${invoiceId}`)
    await expect(page.getByTestId("line-stone-details").first()).toContainText(
      `${masters.diamond.name} Natural 0.28 ct · 12 pcs · VVS · Cert IGI-123`,
    )
    await page.goto(`/billing/${invoiceId}/print`)
    await expect(page.getByText(/12 pcs · VVS · Cert IGI-123/).first()).toBeVisible()
    expect(crashes).toEqual([])
  } finally {
    if (invoiceId) {
      const stockIds = (
        await db().invoiceItem.findMany({ where: { invoiceId, inventoryStockId: { not: null } }, select: { inventoryStockId: true } })
      ).map((row) => row.inventoryStockId as string)
      await db().ledgerEntry.deleteMany({ where: { invoiceId } })
      await db().inventoryTransaction.deleteMany({ where: { inventoryStockId: { in: stockIds } } })
      await db().invoice.deleteMany({ where: { id: invoiceId } })
      const productIds = (
        await db().inventoryStock.findMany({ where: { id: { in: stockIds } }, select: { productId: true } })
      ).map((row) => row.productId)
      await db().inventoryStock.deleteMany({ where: { id: { in: stockIds } } })
      await db().product.deleteMany({ where: { id: { in: productIds } } })
    }
    if (slipId) {
      const slip = await db().kachaInvoice.findUnique({ where: { id: slipId }, select: { slipNumber: true } })
      if (slip) {
        await db().ledgerEntry.deleteMany({
          where: { storeId: masters.storeId, description: { contains: `Estimate ${slip.slipNumber} ` } },
        })
      }
      await db().kachaInvoice.deleteMany({ where: { id: slipId } })
    }
    await cleanUpMasters(masters)
  }
})

test("Add Stock of a gold + silver + diamond + ruby Product writes its rows, with pcs", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const masters = await seedMasters()
  const { storeId, gold, silver, diamond, ruby, gold18, silver925, suffix } = masters
  const gst3 = await db().gstRate.findFirstOrThrow({ where: { storeId, ratePercent: 3 }, select: { id: true } })
  const category = await db().storeCategory.findFirstOrThrow({ where: { storeId }, select: { id: true } })
  const product = await db().product.create({
    data: {
      storeId,
      productCode: `E2E-SPD-${suffix}`,
      name: `E2E SPD Earring ${suffix}`,
      categoryId: category.id,
      metalTypeId: gold.id,
      defaultPurity: "GOLD_18K",
      storeMetalPurityId: gold18.id,
      defaultGrossWeight: 2.35,
      defaultNetWeight: 2.294,
      hasStoneComponent: true,
      defaultStoneMetalTypeName: diamond.name,
      defaultStoneTypeNames: "Natural",
      defaultCaratWeight: 0.38,
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
  const stockCode = `E2E-SPDSTK-${suffix}`
  try {
    await page.goto("/inventory/stock/new")
    await page.getByRole("combobox").filter({ hasText: "Select Product" }).click()
    await page.getByPlaceholder(/search/i).last().fill(product.productCode)
    await page.getByRole("option", { name: new RegExp(product.productCode) }).click()
    await page.locator("#stockCode").fill(stockCode)
    // Twice the Product's weight: the metals share it in the Product's
    // proportions. (Carats aren't asked for a gold piece — the stones keep
    // the Product's own.)
    await page.locator("#grossWeight").fill("4.7")
    await page.locator("#netWeight").fill("4.588")
    await page.getByRole("button", { name: "Add Stock" }).click()
    await page.waitForURL(/\/inventory\/stock$/)

    const stock = await db().inventoryStock.findFirstOrThrow({
      where: { storeId, stockCode },
      include: { components: { orderBy: { sortOrder: "asc" } } },
    })
    expect(stock.components.map((row) => row.kind)).toEqual(["METAL", "METAL", "STONE", "STONE"])
    const [goldRow, silverRow, diamondRow, rubyRow] = stock.components
    expect(goldRow.metalTypeId).toBe(gold.id)
    expect(goldRow.purityLabel).toBe("18")
    expect(Number(goldRow.netWeight)).toBeCloseTo(3.588, 4)
    expect(Number(goldRow.fineWeight)).toBeCloseTo(2.691, 4)
    expect(silverRow.metalTypeId).toBe(silver.id)
    expect(Number(silverRow.netWeight)).toBeCloseTo(1, 4)
    expect(diamondRow.stoneMetalTypeName).toBe(diamond.name)
    expect(Number(diamondRow.caratWeight)).toBeCloseTo(0.28, 3)
    expect(diamondRow.pieces).toBe(12)
    expect(diamondRow.clarity).toBe("VVS")
    expect(diamondRow.certificateNumber).toBe("IGI-123")
    expect(Number(diamondRow.amount)).toBeCloseTo(16800, 2)
    expect(rubyRow.pieces).toBe(2)
    expect(Number(rubyRow.amount)).toBeCloseTo(2000, 2)
    // The stock row summarises: all metals' net, only gold's pure weight, both stones' value.
    expect(Number(stock.netWeight)).toBeCloseTo(4.588, 4)
    expect(Number(stock.fineWeight)).toBeCloseTo(2.691, 4)
    expect(Number(stock.stoneCharge)).toBeCloseTo(18800, 2)
    // One stock-added ledger entry per metal.
    const ledger = await db().ledgerEntry.findMany({
      where: { storeId, description: { startsWith: `Stock added — ${stockCode}` } },
      select: { metalTypeId: true, metalWeightFine: true },
    })
    expect(ledger.map((row) => row.metalTypeId).sort()).toEqual([gold.id, silver.id].sort())
    expect(crashes).toEqual([])
  } finally {
    await db().ledgerEntry.deleteMany({ where: { storeId, description: { startsWith: `Stock added — ${stockCode}` } } })
    await db().inventoryStock.deleteMany({ where: { productId: product.id } })
    await db().product.deleteMany({ where: { id: product.id } })
    await cleanUpMasters(masters)
  }
})
