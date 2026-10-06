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
 * Stores created before 2026-10-05 only have the purities they added by
 * hand. "Add standard purities & stone types" fills in the missing standard
 * ones under metals the store already has; "+ Add purity" adds any other.
 */
test("the rates popover adds missing standard purities and a custom one", async ({ page }) => {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirstOrThrow({ where: { storeId, name: "Gold" }, select: { id: true } })
  const before = await db().storeMetalPurity.findMany({ where: { storeMetalId: gold.id }, select: { id: true } })
  const keep = new Set(before.map((p) => p.id))
  // Take 14K away so the standard add has something to restore.
  const fourteen = await db().storeMetalPurity.findFirst({ where: { storeMetalId: gold.id, label: "14K" } })
  if (fourteen) await db().storeMetalPurity.delete({ where: { id: fourteen.id } }).catch(() => {})
  const stillThere = fourteen && (await db().storeMetalPurity.findUnique({ where: { id: fourteen.id } }))

  try {
    await page.goto("/dashboard")
    await page.getByRole("button", { name: "Today's selling rates" }).click()
    await page.getByRole("button", { name: /Add standard purities/ }).click()
    if (!stillThere) {
      await expect
        .poll(async () => db().storeMetalPurity.count({ where: { storeMetalId: gold.id, label: "14K" } }))
        .toBe(1)
      await expect(page.getByLabel("Gold 14K", { exact: true })).toBeVisible()
    }

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
    await expect(page.getByText(/Last updated today/)).toBeVisible()
  } finally {
    const extra = await db().storeMetalPurity.findMany({
      where: { storeMetalId: gold.id, id: { notIn: [...keep] } },
      select: { id: true },
    })
    await db().sellingRateEntry.deleteMany({ where: { refId: { in: extra.map((p) => p.id) } } })
    await db().storeMetalPurity.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } })
    if (fourteen && !(await db().storeMetalPurity.findUnique({ where: { id: fourteen.id } }))) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = fourteen
      await db().storeMetalPurity.create({ data: rest }).catch(() => {})
    }
  }
})
