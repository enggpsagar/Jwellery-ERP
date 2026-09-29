import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/** Category → Type filters, the Stone Type swap for a stone, and the
 *  footer totals on the Products and Stock lists. */
for (const listPath of ["/inventory/products", "/inventory/stock"]) {
  test(`${listPath}: Category/Type filters and footer total`, async ({ page }) => {
    await page.goto(listPath)

    await expect(page.locator("tfoot").getByRole("row", { name: /^Total/ })).toBeVisible()

    // Type is hidden (not just disabled) until a Category with Types is picked.
    await expect(page.getByRole("combobox", { name: "Category Type" })).toHaveCount(0)

    await page.getByRole("combobox", { name: "Category", exact: true }).click()
    const firstCategory = page.getByRole("option").nth(1)
    await firstCategory.click()
    await expect(page).toHaveURL(/category=/)
  })

  test(`${listPath}: a stone swaps Category for Stone Type`, async ({ page }) => {
    const storeId = await demoStoreId()
    const stone = await db().storeMetal.findFirst({
      where: { storeId, isActive: true, isGemstone: true },
      select: { id: true, name: true },
    })
    test.skip(!stone, "demo store has no stone configured")

    await page.goto(`${listPath}?category=anything`)
    await page.getByRole("combobox").filter({ hasText: "All Metals" }).click()
    await page.getByRole("option", { name: stone!.name, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`type=${stone!.id}`))
    await expect(page).not.toHaveURL(/category=/)
    await expect(page.getByRole("combobox", { name: "Stone Type" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveCount(0)
  })
}
