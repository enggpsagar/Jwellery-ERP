import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Settings → Metals & Categories flags a purity whose fineness doesn't match
 * its name (a "22K" saved at 100% would count as pure gold in every 24K
 * total) and fixes it in one click (lib/purity-fineness-check.ts).
 */
test("a 22K purity saved at 100% is flagged and fixed to 91.6%", async ({ page }) => {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirst({ where: { storeId, name: "Gold" }, select: { id: true } })
  const purity = await db().storeMetalPurity.upsert({
    where: { storeMetalId_label: { storeMetalId: gold!.id, label: "22K" } },
    create: { storeId, storeMetalId: gold!.id, label: "22K", skuCode: "22", finenessPercent: 100 },
    update: { finenessPercent: 100 },
  })

  try {
    await page.goto("/settings/taxonomy")
    await expect(page.getByText(/look(s)? wrong/).first()).toBeVisible()
    await page.getByRole("button", { name: "Fix" }).first().click()
    await expect
      .poll(async () => Number((await db().storeMetalPurity.findUnique({ where: { id: purity.id } }))?.finenessPercent))
      .toBeCloseTo(91.6, 2)
  } finally {
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { finenessPercent: 91.6 } })
  }
})

/**
 * "Ignore" keeps a deliberate fineness (e.g. a house 76% for 18K): the
 * warning disappears and stays gone, until the fineness is changed again.
 */
test("a flagged purity can be ignored, and is flagged again if its fineness changes", async ({ page }) => {
  const storeId = await demoStoreId()
  const gold = await db().storeMetal.findFirst({ where: { storeId, name: "Gold" }, select: { id: true } })
  const purity = await db().storeMetalPurity.create({
    data: { storeId, storeMetalId: gold!.id, label: "18K", skuCode: "18IG", finenessPercent: 76 },
  })

  try {
    await page.goto("/settings/taxonomy")
    await page.waitForLoadState("networkidle")
    const banner = page.getByText(/Gold 18K is saved at 76% fine/)
    await expect(banner).toBeVisible()
    await banner.locator("..").getByRole("button", { name: "Ignore" }).click()
    await expect
      .poll(async () => Number((await db().storeMetalPurity.findUnique({ where: { id: purity.id } }))?.finenessCheckIgnoredAt))
      .toBe(76)
    await page.reload()
    await expect(page.getByText(/Gold 18K is saved at 76% fine/)).toHaveCount(0)

    // A different wrong value is flagged again.
    await db().storeMetalPurity.update({ where: { id: purity.id }, data: { finenessPercent: 77 } })
    await page.reload()
    await expect(page.getByText(/Gold 18K is saved at 77% fine/)).toBeVisible()
  } finally {
    await db().storeMetalPurity.delete({ where: { id: purity.id } })
  }
})
