import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Header "Today's Rates" chip: the Store Owner changes a purity's selling
 * rate from the top bar, and it lands on the same column Settings edits
 * (StoreMetalPurity.sellingPrice), which billing reads.
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
  } finally {
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { sellingPrice: before } })
  }
})
