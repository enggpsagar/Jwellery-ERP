import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

const DEFAULT_QR = ["TAG_CODE", "PRODUCT_NAME", "PRODUCT_CODE", "METALS", "GROSS_WEIGHT", "NET_WEIGHT", "STONES", "MFG_DATE"]

/**
 * Settings → QR & Barcode Tags: the printed fields can be dragged into a new
 * order, an "Add a field" chip dragged into the list, and a printed row
 * dragged back onto "Add a field" to remove it.
 */
test("tag fields reorder, add and remove by drag and drop", async ({ page }) => {
  const storeId = await demoStoreId()
  await db().businessSettings.update({ where: { storeId }, data: { qrTagFields: DEFAULT_QR } })
  const saved = async () =>
    (await db().businessSettings.findUniqueOrThrow({ where: { storeId }, select: { qrTagFields: true } })).qrTagFields

  try {
    await page.goto("/settings/tags")
    const printed = page.getByTestId("qr-tag-fields-printed")
    const row = (label: string) => printed.locator("[draggable=true]").filter({ hasText: label })

    // A drag before React hydrates does nothing; wait for the page to settle
    // rather than retrying (a retried drag that half-took moves rows twice).
    await page.waitForLoadState("networkidle")

    // Drag "Manufacture date" (last) onto the top half of "Tag / stock code" (first).
    await row("Manufacture date").dragTo(row("Tag / stock code"), { targetPosition: { x: 20, y: 2 } })
    await expect(printed.locator("[draggable=true]").first()).toContainText("Manufacture date")

    // Drag the "Category & type" chip in, just above "Gross weight".
    await page
      .getByTestId("qr-tag-fields-unused")
      .getByRole("button", { name: /Category & type/ })
      .dragTo(row("Gross weight"), { targetPosition: { x: 20, y: 2 } })
    // Drag "Stones" back onto "Add a field" to remove it.
    await row("Stones").dragTo(page.getByTestId("qr-tag-fields-unused"))

    await page.getByRole("button", { name: "Save tag fields" }).click()
    await expect
      .poll(saved)
      .toEqual(["MFG_DATE", "TAG_CODE", "PRODUCT_NAME", "PRODUCT_CODE", "METALS", "CATEGORY", "GROSS_WEIGHT", "NET_WEIGHT"])
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: { qrTagFields: DEFAULT_QR } })
  }
})
