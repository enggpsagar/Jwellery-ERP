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

  // Custom date range (the shared DateRangePicker) replaces the period:
  // the whole of the current month, which the seeded + test sales fall in.
  await card.getByRole("button", { name: "Date range" }).click()
  const calendar = page.locator("[data-slot=popover-content]")
  const today = new Date()
  const dayButton = (day: number) =>
    calendar.locator(
      `button[data-day="${new Date(today.getFullYear(), today.getMonth(), day).toLocaleDateString("en-US")}"]`,
    ).first()
  // The shared picker applies a one-day range on the first click and
  // closes; reopening it and clicking a second day extends the range.
  await dayButton(1).click()
  await card.getByRole("button", { name: /\d{2}\/\d{2}\/\d{2}/ }).click()
  await dayButton(today.getDate() === 1 ? 2 : today.getDate()).click()
  await expect(card.getByText(/^Top sellers \S+ – \S+, by revenue$/)).toBeVisible()
  await expect(card.getByRole("button", { name: "Yearly" })).not.toHaveAttribute("data-variant", "default")

  // A period button clears the range again.
  await card.getByRole("button", { name: "Monthly" }).click()
  await expect(card.getByText("Top sellers this month, by revenue")).toBeVisible()
  expect(crashes).toEqual([])
})
