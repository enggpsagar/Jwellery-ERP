import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Billing → Offers & Vouchers (lib/actions/promotion-actions.ts): the Store
 * Owner creates an offer with a public code, bulk-generates single-use
 * voucher codes for it, and revokes an unused one.
 */
test("create a % offer with a code, issue 2 bulk vouchers, revoke one", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const stamp = Date.now() % 1_000_000
  const name = `E2E Festive ${stamp}`
  const code = `E2EFEST${stamp}`

  try {
    await page.goto("/billing/offers")
    await expect(page.getByRole("heading", { name: "Offers & Vouchers" })).toBeVisible()

    // New offer: % off is the default kind.
    await page.getByRole("button", { name: /New offer|Create your first offer/ }).first().click()
    const form = page.getByRole("dialog")
    await expect(form.getByRole("heading", { name: "New offer" })).toBeVisible()
    await form.locator("#offer-name").fill(name)
    await form.locator("#offer-percent").fill("10")
    await form.locator("#offer-code").fill(code.toLowerCase()) // normalised to upper case
    await form.locator("#offer-usage").fill("50")
    await expect(form.getByText("Shows on the bill as:")).toContainText("10% off")
    await form.getByRole("button", { name: "Create offer" }).click()
    await expect(page.getByText("Offer created")).toBeVisible()

    const promotion = await db().promotion.findFirst({ where: { storeId, name } })
    expect(promotion, "offer saved").not.toBeNull()
    expect(promotion!.code).toBe(code)
    expect(promotion!.type).toBe("PERCENT_OFF")
    expect(Number(promotion!.percentOff)).toBe(10)
    expect(promotion!.usageLimit).toBe(50)
    expect(promotion!.isActive).toBe(true)

    const card = page.locator(`[data-offer-id="${promotion!.id}"]`)
    await expect(card).toContainText("10% off")
    await expect(card).toContainText(code)

    // Bulk-generate 2 voucher codes.
    await card.getByRole("button", { name: `Vouchers for ${name}` }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByRole("tab", { name: "Bulk codes" }).click()
    await sheet.locator("#voucher-quantity").fill("2")
    await sheet.getByRole("button", { name: "Create codes" }).click()
    await expect(sheet.getByTestId("issued-codes")).toContainText("2 new voucher codes")

    const vouchers = await db().promotionVoucher.findMany({
      where: { storeId, promotionId: promotion!.id },
      orderBy: { code: "asc" },
    })
    expect(vouchers).toHaveLength(2)
    for (const voucher of vouchers) {
      // Up to 4 letters of the name ("E2E Festive" → EEFE), then 8 unambiguous characters.
      expect(voucher.code).toMatch(/^EEFE-[A-HJ-NP-Z2-9]{8}$/)
      expect(voucher.usedAt).toBeNull()
      expect(voucher.customerId).toBeNull()
      await expect(sheet.locator(`[data-voucher-code="${voucher.code}"]`)).toContainText("Unused")
    }

    // Revoke the first one.
    const [revoked, kept] = vouchers
    page.once("dialog", (dialog) => dialog.accept())
    await sheet.getByRole("button", { name: `Revoke ${revoked.code}` }).click()
    await expect(page.getByText("Voucher revoked")).toBeVisible()
    await expect(sheet.locator(`[data-voucher-code="${revoked.code}"]`)).toHaveCount(0)
    await expect(sheet.locator(`[data-voucher-code="${kept.code}"]`)).toBeVisible()

    const left = await db().promotionVoucher.findMany({ where: { storeId, promotionId: promotion!.id } })
    expect(left.map((voucher) => voucher.code)).toEqual([kept.code])

    expect(crashes).toEqual([])
  } finally {
    // Vouchers cascade with the promotion.
    await db().promotion.deleteMany({ where: { storeId, name } })
  }
})
