import { expect, test } from "@playwright/test"

import { watchForPageCrash } from "./helpers"

const TABS = [
  "Sales",
  "Sales by User",
  "Vendor Purchase",
  "Inventory Valuation",
  "Stock",
  "Artisan Outstanding",
  "Party Dues",
  "Gold Flow",
  "By Metal",
  "Item Ledger",
]

test("every report tab renders", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  await page.goto("/reports")

  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click()
    await expect(page.getByRole("button", { name: `Export ${tab}` })).toBeVisible()
  }
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
  expect(crashes).toEqual([])
})

test("Stock report splits Available and Out of Stock", async ({ page }) => {
  await page.goto("/reports")
  await page.getByRole("button", { name: "Stock", exact: true }).click()

  await expect(page.getByText("Available Items")).toBeVisible()
  await expect(page.getByText("Out of Stock Items")).toBeVisible()

  await page.getByRole("button", { name: /^Out of Stock \(\d+\)$/ }).click()
  const badges = page.locator("tbody td span.rounded-full")
  const count = await badges.count()
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveText("Out of Stock")
  }

  await page.getByRole("button", { name: /^Available \(\d+\)$/ }).click()
  const availableBadges = page.locator("tbody td span.rounded-full")
  const availableCount = await availableBadges.count()
  for (let i = 0; i < availableCount; i++) {
    await expect(availableBadges.nth(i)).toHaveText("Available")
  }
})

test("report export downloads a file", async ({ page }) => {
  const response = await page.request.get("/reports/export?type=stock&format=csv")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/csv")
  expect(await response.text()).toContain("Stock Code")
})
