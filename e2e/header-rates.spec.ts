import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Header "Today's Rates" chip: the Store Owner changes a purity's selling
 * rate from the top bar, and it lands on the same column Settings edits
 * (StoreMetalPurity.sellingPrice), which billing reads, and is logged in
 * the store's selling-rate history on Metal Rates.
 */
test("the Store Owner edits a selling rate from the header", async ({ page }) => {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirst({ where: { storeId, name: "Gold" }, select: { id: true } })
  const purity = await db().storeMetalPurity.upsert({
    where: { storeMetalId_label: { storeMetalId: gold!.id, label: "22K" } },
    create: { storeId, storeMetalId: gold!.id, label: "22K", skuCode: "22", finenessPercent: 91.6, sellingPrice: 6000 },
    update: { isActive: true },
  })
  const before = purity.sellingPrice

  try {
    await page.goto("/dashboard")
    await page.getByRole("button", { name: "Today's selling rates" }).click()

    const input = page.getByLabel("Gold 22K", { exact: true })
    await input.fill("7123.45")
    await page.getByRole("button", { name: /^Save 1$/ }).click()

    await expect
      .poll(async () => Number((await db().storeMetalPurity.findUnique({ where: { id: purity.id } }))?.sellingPrice))
      .toBeCloseTo(7123.45, 2)
    // Reopening shows the saved value, read back from the server.
    await page.reload()
    await page.getByRole("button", { name: "Today's selling rates" }).click()
    await expect(page.getByLabel("Gold 22K", { exact: true })).toHaveValue("7123.45")

    // The change is logged as the store's own rate history (not MetalRate,
    // which is the market rate), and shown on Metal Rates.
    const entry = await db().sellingRateEntry.findFirst({
      where: { storeId, refId: purity.id },
      orderBy: { createdAt: "desc" },
    })
    expect(entry?.label).toBe("Gold 22K")
    expect(Number(entry?.sellingPrice)).toBeCloseTo(7123.45, 2)
    expect(entry?.changedById).toBeTruthy()

    await page.goto("/metal-rates")
    await expect(page.getByText("Your Selling Rates")).toBeVisible()
    await expect(page.getByRole("cell", { name: /₹7,123\.45/ }).first()).toBeVisible()
  } finally {
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { sellingPrice: before } })
  }
})

/**
 * The popover lists exactly the store's purities from Settings; "+ Add
 * purity" adds one there (with its first rate and a history row).
 */
test("the rates popover adds a purity to Settings with its rate", async ({ page }) => {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const keep = new Set(
    (await db().storeMetalPurity.findMany({ where: { storeMetalId: gold.id }, select: { id: true } })).map((p) => p.id),
  )

  try {
    await page.goto("/dashboard")
    await page.getByRole("button", { name: "Today's selling rates" }).click()
    // Every active Settings purity is listed, and nothing else.
    for (const p of await db().storeMetalPurity.findMany({ where: { storeMetalId: gold.id, isActive: true } })) {
      await expect(page.getByLabel(`Gold ${p.label}`, { exact: true })).toBeVisible()
    }
    await expect(page.getByRole("button", { name: /Add standard/ })).toHaveCount(0)

    const goldSection = page.getByText("Gold (per g)").locator("..")
    await goldSection.getByRole("button", { name: "Add purity" }).click()
    await page.getByLabel("New purity for Gold").fill("23K")
    await page.getByLabel("Rate for the new Gold entry").fill("6900")
    await page.getByRole("button", { name: "Add", exact: true }).click()

    await expect
      .poll(async () => Number((await db().storeMetalPurity.findFirst({ where: { storeMetalId: gold.id, label: "23K" } }))?.sellingPrice))
      .toBe(6900)
    const added = await db().storeMetalPurity.findFirstOrThrow({ where: { storeMetalId: gold.id, label: "23K" } })
    expect(Number(added.finenessPercent)).toBeCloseTo(95.8, 1)
    expect(await db().sellingRateEntry.count({ where: { storeId, refId: added.id } })).toBe(1)
    await expect(page.getByLabel("Gold 23K", { exact: true })).toBeVisible()
    await expect(page.getByText(/Last updated today/)).toBeVisible()
  } finally {
    const extra = await db().storeMetalPurity.findMany({
      where: { storeMetalId: gold.id, id: { notIn: [...keep] } },
      select: { id: true },
    })
    await db().sellingRateEntry.deleteMany({ where: { refId: { in: extra.map((p) => p.id) } } })
    await db().storeMetalPurity.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } })
  }
})

/**
 * The rates chip is cached per store (lib/selling-rates.ts). A write that
 * skips the app's actions stays invisible until the cache expires — proof
 * the cache is in use — while a change made in Settings (here, a Purities
 * import) shows on the chip at once, because that action updates the tag.
 */
test("rates chip is cached, and a Settings change shows on it at once", async ({ page }) => {
  const XLSX = await import("xlsx")
  const { PURITIES_SHEET, METALS_SHEET, CATEGORIES_SHEET, sheetHeaders } = await import("../lib/inventory/taxonomy-sheet")
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const purity = await db().storeMetalPurity.findFirstOrThrow({ where: { storeMetalId: gold.id, label: "22K" } })
  const before = purity.sellingPrice
  const openChip = async () => {
    await page.goto("/dashboard")
    await page.getByRole("button", { name: "Today's selling rates" }).click()
    return page.getByLabel("Gold 22K", { exact: true })
  }

  try {
    // A Purities import through Settings sets 6200 and must show at once.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([], { header: sheetHeaders(METALS_SHEET) }), METALS_SHEET.name)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        [{ Metal: "Gold", Label: "22K", "SKU Code": purity.skuCode, "Fineness %": Number(purity.finenessPercent), "Selling Price": 6200, Hallmarkable: purity.isHallmarkable ? "Yes" : "No" }],
        { header: sheetHeaders(PURITIES_SHEET) },
      ),
      PURITIES_SHEET.name,
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([], { header: sheetHeaders(CATEGORIES_SHEET) }), CATEGORIES_SHEET.name)
    const file = "test-results/rates-cache-purities.xlsx"
    XLSX.writeFile(wb, file)

    // Prime the cache, then write behind the app's back: the chip keeps
    // showing the cached value.
    const primed = await (await openChip()).inputValue()
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { sellingPrice: 6150 } })
    expect(await (await openChip()).inputValue()).toBe(primed)

    await page.goto("/settings/taxonomy")
    await page.getByRole("button", { name: "Import Metals & Categories" }).click()
    await page.locator("#metal-category-import-file").setInputFiles(file)
    await page.getByRole("button", { name: "Import", exact: true }).click()
    await expect
      .poll(async () => Number((await db().storeMetalPurity.findUnique({ where: { id: purity.id } }))?.sellingPrice))
      .toBe(6200)
    await expect(await openChip()).toHaveValue("6200")
  } finally {
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { sellingPrice: before } })
    await db().sellingRateEntry.deleteMany({ where: { storeId, refId: purity.id, sellingPrice: 6200 } })
  }
})
