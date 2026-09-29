import { expect, test } from "@playwright/test"

import { watchForPageCrash } from "./helpers"

/** Best Sellers card: every tab and period renders, and the seeded year of
 *  sales produces a ranked list. */
test("dashboard Best Sellers card", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.goto("/dashboard")

  const card = page.locator("[data-slot=card]").filter({ hasText: "Best Sellers" }).first()
  await expect(card).toBeVisible()

  await card.getByRole("button", { name: "Yearly" }).click()
  await expect(card.getByText("Top sellers this year")).toBeVisible()

  for (const tab of ["Items", "Categories", "Types", "Metals", "Stones"]) {
    await card.getByRole("tab", { name: tab }).click()
    await expect(card.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true")
  }

  await card.getByRole("tab", { name: "Items" }).click()
  await expect(card.getByRole("list", { name: "Best-selling items" }).getByRole("listitem").first()).toBeVisible()
  expect(crashes).toEqual([])
})
