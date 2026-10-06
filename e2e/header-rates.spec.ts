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
