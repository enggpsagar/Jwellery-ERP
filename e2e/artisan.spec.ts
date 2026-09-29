import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/** Open Jobs on the artisan page must link to Receive Items, which is the
 *  only path that turns an artisan's finished pieces into Products/Stock. */
test("an artisan with an open job can reach Receive Items", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const job = await db().karigarJob.findFirst({
    where: { storeId, status: "issued" },
    select: { id: true, karigarId: true, jobNumber: true },
  })
  test.skip(!job, "demo store has no open artisan job")

  await page.goto(`/karigars/${job!.karigarId}`)
  await expect(page.getByText(/Open Jobs \(\d+\)/)).toBeVisible()

  await page.locator(`a[href="/karigars/${job!.karigarId}/receive-items/${job!.id}"]`).click()
  await page.waitForURL(`**/receive-items/${job!.id}`)
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
  expect(crashes).toEqual([])
})

test("Receive Material shows the calculated net weight", async ({ page }) => {
  const storeId = await demoStoreId()
  const karigar = await db().karigar.findFirst({
    where: { storeId, isActive: true, assignedMetals: { some: {} } },
    select: { id: true },
  })
  test.skip(!karigar, "demo store has no artisan with assigned metals")

  await page.goto(`/karigars/${karigar!.id}`)
  await page.getByRole("button", { name: /^Receive Material/ }).first().click()

  const dialog = page.getByRole("dialog")
  await dialog.locator('input[type="number"]').nth(0).fill("10")
  await dialog.locator('input[type="number"]').nth(1).fill("1.5")
  await expect(dialog.locator("input[readonly]")).toHaveValue("8.500g")
})
