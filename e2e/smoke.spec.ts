import { expect, test } from "@playwright/test"

import { watchForPageCrash } from "./helpers"

/**
 * Every main screen an Admin uses must still open after a change: no 5xx,
 * no "Something went wrong" error boundary, no uncaught browser error, and
 * no bounce back to /login (an auth/permission regression).
 */
const PAGES = [
  "/dashboard",
  "/billing",
  "/billing/new",
  "/billing/kacha",
  "/billing/kacha/new",
  "/billing/credit-notes",
  "/customers",
  "/suppliers",
  "/purchases",
  "/purchases/new",
  "/quotations",
  "/quotations/new",
  "/orders",
  "/orders/new",
  "/inventory",
  "/inventory/products",
  "/inventory/products/new",
  "/inventory/products/archived",
  "/inventory/stock",
  "/inventory/stock/new",
  "/karigars",
  "/karigars/ledger",
  "/ledger",
  "/payments/in",
  "/payments/out",
  "/metal-rates",
  "/reports",
  "/calendar",
  "/users",
  "/settings",
  "/settings/taxonomy",
  "/settings/gst-rates",
  "/settings/locations",
  "/settings/purity",
  "/profile",
]

for (const pagePath of PAGES) {
  test(`opens ${pagePath}`, async ({ page }) => {
    const crashes = watchForPageCrash(page)

    const response = await page.goto(pagePath)
    expect(response?.status(), `${pagePath} HTTP status`).toBeLessThan(500)

    await page.waitForLoadState("networkidle")
    expect(new URL(page.url()).pathname, "should not be bounced to login").not.toBe("/login")
    await expect(page.getByText("Something went wrong")).toHaveCount(0)
    expect(crashes, `uncaught errors on ${pagePath}`).toEqual([])
  })
}
