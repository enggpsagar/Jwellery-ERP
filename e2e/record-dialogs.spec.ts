import { expect, test } from "@playwright/test"

import { watchForPageCrash } from "./helpers"

/**
 * Every list's first column opens the record in a pop-up
 * (RecordDetailDialog), the way the Parties list's name opens
 * PartyDetailDialog. The pop-up renders the module's own detail panel, so it
 * must finish loading (its heading shows) and close again cleanly.
 */
const LISTS: { name: string; path: string; fullPage?: RegExp }[] = [
  { name: "Invoices", path: "/billing", fullPage: /\/billing\/[^/]+$/ },
  { name: "Estimates", path: "/billing/kacha", fullPage: /\/billing\/kacha\/[^/]+$/ },
  { name: "Credit notes", path: "/billing/credit-notes", fullPage: /\/billing\/credit-notes\/[^/]+$/ },
  { name: "Products", path: "/inventory/products", fullPage: /\/inventory\/products\/[^/]+$/ },
  { name: "Stock", path: "/inventory/stock", fullPage: /\/inventory\/stock\/[^/]+$/ },
  { name: "Artisans", path: "/karigars", fullPage: /\/karigars\/[^/]+$/ },
  { name: "Draft orders", path: "/orders", fullPage: /\/orders\/[^/]+$/ },
  { name: "Purchases by party", path: "/purchases", fullPage: /\/customers\/[^/]+$/ },
  { name: "Purchase bills", path: "/purchases?view=bills", fullPage: /\/purchases\/[^/]+$/ },
  { name: "Quotations", path: "/quotations", fullPage: /\/quotations\/[^/]+$/ },
  { name: "Users", path: "/users" },
  { name: "Payment In", path: "/payments/in" },
  { name: "Payment Out", path: "/payments/out" },
]

for (const list of LISTS) {
  test(`${list.name}: first column opens the record pop-up`, async ({ page }) => {
    const crashes = watchForPageCrash(page)
    await page.goto(list.path)

    const trigger = page.locator('table [data-record-open]').first()
    test.skip((await trigger.count()) === 0, `no ${list.name} rows in the demo store`)
    await trigger.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // The panel's own visible heading — only rendered once its data loaded.
    await expect(dialog.locator("h2:not(.sr-only)").first()).toBeVisible()

    if (list.fullPage) {
      await expect(dialog.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", list.fullPage)
    }

    await dialog.getByRole("button", { name: "Close" }).last().click()
    await expect(dialog).toHaveCount(0)
    expect(crashes).toEqual([])
  })
}
