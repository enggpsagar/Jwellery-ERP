import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * Typing in a search box must never lose the cursor: after every character
 * (and after results arrive) focus is still in the box and the text is all
 * there. Covers the header's global search and the searchable stock picker.
 */
async function typeSlowly(page: Page, box: Locator, text: string) {
  for (const char of text) {
    await page.keyboard.type(char)
    await page.waitForTimeout(150)
    await expect(box).toBeFocused()
  }
  // Results (debounced server search / filtered list) land after typing.
  await page.waitForTimeout(800)
  await expect(box).toBeFocused()
  await expect(box).toHaveValue(text)
}

test("the header search keeps the cursor while typing and after results load", async ({ page }) => {
  await page.goto("/dashboard")
  await page.waitForLoadState("networkidle")
  const box = page.getByPlaceholder(/Search parties, invoices, products/).first()
  await box.click()
  await typeSlowly(page, box, "gold ring")
})

test("the stock picker search keeps the cursor while the list filters", async ({ page }) => {
  await page.goto("/billing/new")
  await page.waitForLoadState("networkidle")
  await page.getByRole("combobox").filter({ hasText: /Search stock item/ }).first().click()
  const box = page.getByPlaceholder(/Search by product code, name, category or stock code/)
  await expect(box).toBeFocused()
  await typeSlowly(page, box, "gold")
  // Moving the mouse over the list doesn't take the cursor away either.
  await page.getByRole("option").nth(1).hover()
  await page.keyboard.type("x")
  await expect(box).toHaveValue("goldx")
})

/**
 * List pages (Products, Stock, Parties, Artisans...) search through the URL:
 * a pause in typing reloads the list. The box must keep the cursor while
 * it reloads and after the results arrive, so typing can simply continue.
 */
for (const path of ["/inventory/products", "/inventory/stock", "/customers", "/karigars", "/billing"]) {
  test(`the ${path} list search keeps the cursor through a reload`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState("networkidle")
    // CollapsibleSearch starts as an icon button labelled with its placeholder.
    // (The header's global search also starts with "Search" — skip it.)
    const listSearch = "input[placeholder^='Search']:not([aria-controls='global-search-results'])"
    // The collapsed list search is an icon button labelled with its
    // placeholder ("Search by …..."); open it. Otherwise it's already open.
    const opener = page.getByRole("button", { name: /^Search .+\.\.\.$/ }).first()
    if (await opener.isVisible().catch(() => false)) await opener.click()
    else await page.locator(listSearch).first().click()
    // The list's own search is the one that took the cursor (a page can
    // have other "Search…" boxes further down, e.g. Artisans' ledger).
    const placeholder = await page.locator(`${listSearch}:focus`).getAttribute("placeholder")
    const box = page.getByPlaceholder(placeholder!, { exact: true })
    await expect(box).toBeFocused()
    await page.keyboard.type("go")
    // Let the debounced search reload the list (URL changes), then keep typing.
    await expect(page).toHaveURL(/search=go/)
    await page.waitForLoadState("networkidle")
    await expect(box).toBeFocused()
    await page.keyboard.type("ld")
    await expect(page).toHaveURL(/search=gold/)
    await page.waitForLoadState("networkidle")
    await expect(box).toBeFocused()
    await expect(box).toHaveValue("gold")
  })
}
