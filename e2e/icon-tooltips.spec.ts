import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * Every icon-only control (Edit / Delete / View / Export / close X / "+"…)
 * shows a styled tooltip on hover, and carries an aria-label so screen
 * readers get the same words. Icon-size <Button>s get it from button.tsx;
 * everything else (raw <button>s, links, size="sm" icon buttons) from
 * <IconTooltip>.
 */

const tooltip = (page: Page) => page.locator('[data-slot="tooltip-content"]')

async function expectTooltip(page: Page, trigger: Locator, text: string | RegExp) {
  await trigger.scrollIntoViewIfNeeded()
  // Re-hover until it opens: a hover that lands before hydration is lost.
  await expect(async () => {
    await page.mouse.move(0, 0, { steps: 5 })
    await trigger.hover()
    await expect(tooltip(page)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(tooltip(page)).toContainText(text)
  // Move off so the next hover starts from a closed tooltip.
  await page.mouse.move(0, 0, { steps: 5 })
  await page.keyboard.press("Escape")
  await expect(tooltip(page)).toHaveCount(0)
}

test("table row actions: Edit / Delete / View show their label", async ({ page }) => {
  await page.goto("/inventory/products")
  const edit = page.getByRole("link", { name: /^Edit / }).first()
  await expect(edit).toBeVisible()
  await expectTooltip(page, edit, (await edit.getAttribute("aria-label"))!)

  const view = page.getByRole("link", { name: /^View / }).first()
  await expectTooltip(page, view, (await view.getAttribute("aria-label"))!)

  const del = page.getByRole("button", { name: /^Delete / }).first()
  await expectTooltip(page, del, (await del.getAttribute("aria-label"))!)
})

test("Settings › Metals & Categories: edit / move to stones / delete", async ({ page }) => {
  await page.goto("/settings/taxonomy")
  await expectTooltip(page, page.getByRole("button", { name: "Edit Gold", exact: true }), "Edit Gold")
  await expectTooltip(
    page,
    page.getByRole("button", { name: "Move Gold to Stones", exact: true }),
    "Move Gold to Stones (e.g. Diamond added as a metal by mistake)",
  )
  await expectTooltip(page, page.getByRole("button", { name: "Delete Gold", exact: true }), "Delete Gold (only if unused)")
})

test("sidebar quick-add, notification bell and dialog close", async ({ page }) => {
  await page.goto("/dashboard")
  const quickAdd = page.getByRole("link", { name: /^Add new / }).first()
  await expectTooltip(page, quickAdd, (await quickAdd.getAttribute("aria-label"))!)

  await expectTooltip(page, page.getByRole("button", { name: "Notifications", exact: true }), "Notifications")

  // A dialog's close X.
  await page.goto("/settings/taxonomy")
  await page.getByRole("button", { name: /Import/ }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expectTooltip(page, dialog.getByRole("button", { name: "Close", exact: true }).last(), "Close")
})

const CRAWL_PAGES = [
  "/inventory/products",
  "/inventory/stock",
  "/billing",
  "/purchases",
  "/customers",
  "/settings/taxonomy",
  "/karigars",
  "/ledger",
]

for (const path of CRAWL_PAGES) {
  test(`every icon-only control on ${path} is labelled and shows a tooltip`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState("networkidle")

    // Visible buttons/links whose only content is an icon.
    const found = await page.evaluate(() => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
      }
      const out: { index: number; label: string; html: string }[] = []
      const els = Array.from(document.querySelectorAll("button, a[href], [role='button']"))
      els.forEach((el, index) => {
        if (!isVisible(el) || !el.querySelector("svg")) return
        if ((el as HTMLElement).innerText.trim() !== "") return
        if (el.closest('[data-slot="tooltip-content"]')) return
        // The sidebar's drag rail is a resize handle, and an empty Select is
        // a form field labelled by its <Label> — neither is an icon button.
        if (el.getAttribute("data-sidebar") === "rail" || el.getAttribute("role") === "combobox") return
        el.setAttribute("data-icon-crawl", String(index))
        out.push({ index, label: el.getAttribute("aria-label")?.trim() ?? "", html: el.outerHTML.slice(0, 200) })
      })
      return out
    })

    expect(found.length, `no icon-only controls found on ${path}`).toBeGreaterThan(0)
    const unlabelled = found.filter((f) => !f.label)
    expect(unlabelled, `icon-only controls without an aria-label on ${path}`).toEqual([])

    // Hover each distinct control (up to 30 per page — table rows repeat
    // the same actions) and expect its tooltip.
    const seen = new Set<string>()
    for (const f of found) {
      if (seen.has(f.label) || seen.size >= 30) continue
      seen.add(f.label)
      const el = page.locator(`[data-icon-crawl="${f.index}"]`)
      if (!(await el.isEnabled())) continue
      await test.step(`hover "${f.label}"`, () => expectTooltip(page, el, f.label))
    }
  })
}
