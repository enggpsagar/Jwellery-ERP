import { expect, test } from "@playwright/test"

import type { Locator, Page } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * A piece made of several metals and stones (lib/piece-components.ts) —
 * Gold 22K + Silver 925 + Diamond in one ornament — on a sale line, a
 * Customer Exchange item and a purchase line: every metal/stone is its own
 * row with its own rate and GST rate, and each metal's pure weight is kept
 * under its own metal.
 */
async function setUpPurities() {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirst({ where: { storeId, name: "Gold" }, select: { id: true } })
  const silver = await db().storeMetal.findFirst({ where: { storeId, name: "Silver" }, select: { id: true } })
  expect(gold && silver, "demo store has Gold and Silver").toBeTruthy()
  for (const [metalId, label, sku, fineness] of [
    [gold!.id, "22K", "22", 91.6],
    [silver!.id, "925", "925", 92.5],
  ] as const) {
    await db().storeMetalPurity.upsert({
      where: { storeMetalId_label: { storeMetalId: metalId, label } },
      create: { storeId, storeMetalId: metalId, label, skuCode: sku, finenessPercent: fineness },
      update: { finenessPercent: fineness, isActive: true },
    })
  }
  return { storeId, goldId: gold!.id, silverId: silver!.id }
}

async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

/** Fills metal row `index` of an editor whose test ids start with `prefix`. */
async function fillMetalRow(
  page: Page,
  prefix: string,
  index: number,
  metal: string,
  purity: RegExp,
  weight: string,
  rate: string,
) {
  await pick(page, page.getByTestId(`${prefix}-metal`).nth(index), metal)
  await pick(page, page.getByTestId(`${prefix}-purity`).nth(index), purity)
  await page.getByTestId(`${prefix}-gross`).nth(index).fill(weight)
  await page.getByTestId(`${prefix}-rate`).nth(index).fill(rate)
}

test("a sale line of gold + silver + diamond prices and taxes each part on its own", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { storeId, goldId, silverId } = await setUpPurities()
  const itemName = `E2E Multi Bangle ${Date.now()}`

  await page.goto("/billing/new")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)

  await page.getByTestId("multi-part-question").click()
  await fillMetalRow(page, "sale-piece", 0, "Gold", /^22K/, "8.2", "6800")
  await fillMetalRow(page, "sale-piece", 1, "Silver", /^925/, "3", "90")
  await pick(page, page.getByTestId("sale-piece-stone").first(), "Diamond")
  await page.getByTestId("sale-piece-carat").first().fill("0.4")
  await page.getByTestId("sale-piece-stone-rate").first().fill("60000")
  // The diamond is taxed at its own rate.
  const stoneRow = page.getByTestId("sale-piece-stone-row").first()
  await pick(page, stoneRow.getByRole("combobox").nth(2), "1.5%")

  await pick(page, page.getByRole("combobox").filter({ hasText: "Select category" }), "Ornament")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Not recorded" }), /Chandra Bullion Suppliers/)
  await expect(page.getByTestId("sale-line-net")).toHaveText("11.200 g")
  await expect(page.getByText(/Still needed:/)).toHaveCount(0)

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)
  await expect(page.getByText(/Silver 925 · 3\.000 g/)).toBeVisible()

  const line = await db().invoiceItem.findFirst({
    where: { itemName, invoice: { storeId } },
    include: {
      components: { orderBy: { sortOrder: "asc" } },
      inventoryStock: { include: { components: true, product: { include: { metalComponents: true, stoneComponents: true } } } },
    },
  })
  expect(line, "invoice line saved").not.toBeNull()
  expect(line!.components.map((c) => c.kind)).toEqual(["METAL", "METAL", "STONE"])
  const [goldRow, silverRow, stone] = line!.components
  expect(goldRow.metalTypeId).toBe(goldId)
  expect(Number(goldRow.amount)).toBeCloseTo(55760, 2)
  expect(Number(goldRow.fineWeight)).toBeCloseTo(7.5112, 4)
  expect(silverRow.metalTypeId).toBe(silverId)
  expect(Number(silverRow.fineWeight)).toBeCloseTo(2.775, 4)
  expect(Number(stone.amount)).toBeCloseTo(24000, 2)
  expect(Number(stone.gstRatePercent)).toBeCloseTo(1.5, 2)

  // Line: first metal, all metals' net weight, only gold's pure weight.
  expect(line!.metalTypeId).toBe(goldId)
  expect(Number(line!.netWeight)).toBeCloseTo(11.2, 4)
  expect(Number(line!.fineWeight)).toBeCloseTo(7.5112, 4)
  expect(Number(line!.stoneCharge)).toBeCloseTo(24000, 2)
  // GST: 3% on 55,760 + 270, 1.5% on 24,000 = 1,680.90 + 360.
  const gst = Number(line!.sgstAmount) + Number(line!.cgstAmount) + Number(line!.igstAmount)
  expect(gst).toBeCloseTo(2040.9, 2)
  expect(Number(line!.lineTotal)).toBeCloseTo(82070.9, 2)

  // The minted stock row and catalog product carry the breakdown too.
  expect(line!.inventoryStock?.components).toHaveLength(3)
  expect(line!.inventoryStock?.product.metalComponents).toHaveLength(2)
  expect(line!.inventoryStock?.product.stoneComponents).toHaveLength(1)

  // Printed rate-wise GST summary: the diamond's tax sits in its own 1.5%
  // group (SGST/CGST @0.75%), the metals' in the 3% group.
  const invoiceUrl = page.url()
  await page.goto(`${invoiceUrl}/print`)
  await expect(page.getByText("SGST@0.75%").first()).toBeVisible()
  await expect(page.getByText("SGST@1.50%").first()).toBeVisible()

  // Quick edit: gold's rate 6,800 → 7,000; weights stay, each row re-taxed.
  await page.goto(invoiceUrl)
  await page.getByRole("button", { name: `Edit rate/weight for ${itemName}` }).click()
  await page.getByLabel(/^Rate for Gold 22K/).fill("7000")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Line item updated")).toBeVisible()
  const edited = await db().invoiceItem.findUnique({
    where: { id: line!.id },
    include: { components: { orderBy: { sortOrder: "asc" } }, invoice: true },
  })
  expect(Number(edited!.components[0].amount)).toBeCloseTo(57400, 2)
  // 3% on 57,400 + 270 = 1,730.10; 1.5% on 24,000 = 360.
  expect(Number(edited!.sgstAmount) + Number(edited!.cgstAmount)).toBeCloseTo(2090.1, 2)
  expect(Number(edited!.lineTotal)).toBeCloseTo(83760.1, 2)
  expect(Number(edited!.invoice.subtotal)).toBeCloseTo(57670, 2)
  expect(crashes).toEqual([])
})

test("an item bought from a customer can be gold + diamond, metals at pure weight", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { storeId } = await setUpPurities()
  const itemName = `E2E Multi Exchange Ring ${Date.now()}`

  // A plain sale line to exchange against.
  await page.goto("/billing/new")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
  await page.getByRole("combobox").filter({ hasText: "Search stock item" }).first().click()
  await page.getByRole("option", { name: "Create New Line Item" }).click()
  await page.getByPlaceholder("Item name").fill(itemName)
  const lineNumbers = page.locator('input[type="number"]')
  await lineNumbers.nth(1).fill("10")
  await lineNumbers.nth(2).fill("9000")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select metal" }).first(), "Gold")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select category" }), "Ornament")
  await page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Gross Weight", { exact: false }) })
    .locator('input[type="number"]')
    .first()
    .fill("10")
  await pick(page, page.getByRole("combobox").filter({ hasText: "Not recorded" }), /Chandra Bullion Suppliers/)

  await page.getByRole("button", { name: "Add item bought" }).click()
  const section = page.getByTestId("old-gold-section")
  await section.getByTestId("multi-part-question").click()
  // Gold 22K 10 g × ₹7,000 pure → 9.16 g × 7,000 = ₹64,120; drop the
  // starter silver row; a 0.5 ct diamond the shop pays ₹20,000 for.
  await fillMetalRow(page, "exchange-piece", 0, "Gold", /^22K/, "10", "7000")
  await section.getByTestId("exchange-piece-metal-row").nth(1).getByRole("button", { name: "Remove row", exact: true }).click()
  await pick(page, section.getByTestId("exchange-piece-stone").first(), "Diamond")
  await section.getByTestId("exchange-piece-carat").first().fill("0.5")
  await section.getByTestId("exchange-piece-stone-value").first().fill("20000")
  await expect(section.getByTestId("old-gold-value")).toHaveText("₹84,120.00")

  await page.getByRole("button", { name: "Create Invoice" }).click()
  await page.waitForURL(/\/billing\/(?!new)[^/]+$/)

  const invoice = await db().invoice.findFirst({
    where: { storeId, items: { some: { itemName } } },
    include: { oldGoldExchange: { include: { items: { include: { components: true, inventoryStock: { include: { components: true } } } } } } },
  })
  const bought = invoice!.oldGoldExchange!.items[0]
  expect(Number(bought.lineTotal)).toBeCloseTo(84120, 2)
  expect(bought.components.map((c) => c.kind).sort()).toEqual(["METAL", "STONE"])
  expect(Number(bought.fineWeight)).toBeCloseTo(9.16, 4)
  expect(bought.inventoryStock?.components).toHaveLength(2)
  expect(crashes).toEqual([])
})

test("a purchase line can be one piece of gold + silver + diamond", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { storeId, silverId } = await setUpPurities()
  const itemName = `E2E Multi Purchase Pendant ${Date.now()}`

  await page.goto("/purchases/new")
  await pick(page, page.getByRole("combobox").filter({ hasText: /Select (a|or search a) supplier/ }).first(), /Chandra Bullion Suppliers/)
  await page.getByRole("combobox").filter({ hasText: /Search product|Select a product|product/i }).first().click()
  await page.getByRole("option", { name: /Enter Manually/ }).click()
  const expand = page.getByRole("button", { name: "Expand line item details" }).first()
  if (await expand.isVisible()) await expand.click()
  await page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Item Name", { exact: true }) })
    .locator("input")
    .first()
    .fill(itemName)

  await page.getByText("Made of more than one metal or stone?").click()
  await fillMetalRow(page, "purchase-piece", 0, "Gold", /^22K/, "5", "6000")
  if ((await page.getByTestId("purchase-piece-metal-row").count()) < 2) {
    await page.getByRole("button", { name: "Add metal" }).click()
  }
  await fillMetalRow(page, "purchase-piece", 1, "Silver", /^925/, "2", "80")
  if ((await page.getByTestId("purchase-piece-stone-row").count()) < 1) {
    await page.getByRole("button", { name: "Add stone" }).click()
  }
  await pick(page, page.getByTestId("purchase-piece-stone").first(), "Diamond")
  await page.getByTestId("purchase-piece-carat").first().fill("0.2")
  await page.getByTestId("purchase-piece-stone-rate").first().fill("50000")

  await page.getByRole("button", { name: "Create Purchase" }).click()
  await page.waitForURL(/\/purchases\/(?!new)[^/]+$/)

  const item = await db().purchaseItem.findFirst({
    where: { itemName, purchase: { storeId } },
    include: { components: { orderBy: { sortOrder: "asc" } }, inventoryStock: { include: { components: true } } },
  })
  expect(item, "purchase line saved").not.toBeNull()
  expect(item!.components.map((c) => c.kind).sort()).toEqual(["METAL", "METAL", "STONE"])
  const silverPart = item!.components.find((c) => c.metalTypeId === silverId)
  expect(Number(silverPart?.fineWeight)).toBeCloseTo(1.85, 4)
  expect(Number(item!.fineWeight)).toBeCloseTo(4.58, 4)
  expect(item!.inventoryStock?.components).toHaveLength(3)
  expect(crashes).toEqual([])
})

/** A hand-typed Kacha / Quotation line of gold + silver + diamond. */
async function fillSlipPiece(page: Page, prefix: string, itemName: string) {
  await pick(page, page.getByRole("combobox").filter({ hasText: "Select a party" }), /Ananya Kulkarni/)
  await page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Item Name", { exact: true }) })
    .locator("input")
    .first()
    .fill(itemName)
  await pick(page, page.getByRole("combobox").filter({ hasText: "Not recorded" }), /Chandra Bullion Suppliers/)
  await page.getByTestId("multi-part-question").click()
  await fillMetalRow(page, prefix, 0, "Gold", /^22K/, "4", "7000")
  await fillMetalRow(page, prefix, 1, "Silver", /^925/, "2", "100")
  await pick(page, page.getByTestId(`${prefix}-stone`).first(), "Diamond")
  await page.getByTestId(`${prefix}-carat`).first().fill("0.1")
  await page.getByTestId(`${prefix}-stone-rate`).first().fill("50000")
}

test("a Kacha slip line can be gold + silver + diamond, and keeps its rows on conversion", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { storeId } = await setUpPurities()
  const itemName = `E2E Multi Kacha ${Date.now()}`

  await page.goto("/billing/kacha/new")
  await fillSlipPiece(page, "kacha-piece", itemName)
  // The diamond's "GST if billed" — not shown on the slip, used on conversion.
  await pick(page, page.getByTestId("kacha-piece-stone-row").first().getByRole("combobox").nth(2), "1.5%")
  await page.getByRole("button", { name: "Create Estimate" }).click()
  await page.waitForURL(/\/billing\/kacha\/(?!new)[^/]+$/)
  await expect(page.getByText(/Silver 925 · 2\.000 g/)).toBeVisible()

  const slipItem = await db().kachaInvoiceItem.findFirst({
    where: { itemName, kachaInvoice: { storeId } },
    include: { components: true },
  })
  expect(slipItem!.components.map((c) => c.kind).sort()).toEqual(["METAL", "METAL", "STONE"])
  // 4 × 7,000 + 2 × 100 + 0.1 × 50,000 = 28,000 + 200 + 5,000.
  expect(Number(slipItem!.lineTotal)).toBeCloseTo(33200, 2)
  expect(Number(slipItem!.fineWeight)).toBeCloseTo(3.664, 4)

  await page.goto(`${page.url()}/convert`)
  await page.getByRole("button", { name: "Convert to Tax Invoice" }).click()
  // Lands on the new invoice; its line has the piece's rows copied across.
  await page.waitForURL(/\/billing\/(?!kacha)[^/]+$/)
  await expect
    .poll(async () => db().invoiceItem.count({ where: { itemName, invoice: { storeId } } }), { timeout: 15000 })
    .toBe(1)
  const invoiceItem = await db().invoiceItem.findFirst({
    where: { itemName, invoice: { storeId } },
    include: { components: true },
  })
  expect(invoiceItem!.components).toHaveLength(3)
  // Converted at 3%: metals 28,200 × 3% = 846; the diamond's own 1.5% on 5,000 = 75.
  expect(Number(invoiceItem!.sgstAmount) + Number(invoiceItem!.cgstAmount)).toBeCloseTo(921, 2)
  expect(crashes).toEqual([])
})

test("a Quotation line can be gold + silver + diamond, and keeps its rows on conversion", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const { storeId } = await setUpPurities()
  const itemName = `E2E Multi Quote ${Date.now()}`

  await page.goto("/quotations/new")
  await fillSlipPiece(page, "quotation-piece", itemName)
  await page.getByRole("button", { name: "Create Quotation" }).click()
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/)
  await expect(page.getByText(/Silver 925 · 2\.000 g/)).toBeVisible()

  const quoteItem = await db().quotationItem.findFirst({
    where: { itemName, quotation: { storeId } },
    include: { components: true },
  })
  expect(quoteItem!.components.map((c) => c.kind).sort()).toEqual(["METAL", "METAL", "STONE"])
  expect(Number(quoteItem!.fineWeight)).toBeCloseTo(3.664, 4)

  await page.goto(`${page.url()}/convert`)
  await page.getByRole("button", { name: "Convert to Invoice" }).click()
  // Lands on the new invoice; its line has the piece's rows copied across.
  await page.waitForURL(/\/billing\/(?!kacha)[^/]+$/)
  await expect
    .poll(async () => db().invoiceItem.count({ where: { itemName, invoice: { storeId } } }), { timeout: 15000 })
    .toBe(1)
  const invoiceItem = await db().invoiceItem.findFirst({
    where: { itemName, invoice: { storeId } },
    include: { components: true },
  })
  expect(invoiceItem!.components).toHaveLength(3)
  expect(crashes).toEqual([])
})
