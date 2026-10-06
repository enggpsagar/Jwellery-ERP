import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/** Stock QR tags print for an 80mm thermal printer: QR on the left with the
 *  store name and tag code under it, the piece's details on the right, one
 *  tag per row. */
test("Print Stock QR Codes lays each tag out QR-left, details-right", async ({ page }) => {
  const storeId = await demoStoreId()
  const stocks = await db().inventoryStock.findMany({ where: { storeId }, take: 3, select: { id: true, stockCode: true, tagNumber: true } })
  await page.goto(`/inventory/stock/print-qr?ids=${stocks.map((s) => s.id).join(",")}`)

  const labels = page.locator("#stock-qr-print-grid .stock-qr-label")
  await expect(labels).toHaveCount(stocks.length)

  const first = labels.first()
  const qr = first.locator("img")
  const qrColumn = first.getByTestId("stock-tag-qr")
  const details = first.getByTestId("stock-tag-details")
  // The QR is drawn asynchronously — measure only once it's on screen.
  await expect(qr).toBeVisible()
  await expect(details).toBeVisible()
  const qrBox = (await qr.boundingBox())!
  const detailsBox = (await details.boundingBox())!
  expect(detailsBox.x).toBeGreaterThanOrEqual(qrBox.x + qrBox.width - 1)
  // Tag code prints under the QR, not in the details column.
  // (The grid's order isn't the query's — match whichever tag is first.)
  const tagCodes = stocks.map((s) => s.tagNumber || s.stockCode)
  const escaped = tagCodes.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  await expect(qrColumn).toContainText(new RegExp(escaped.join("|")))
  const qrText = (await qrColumn.textContent()) ?? ""
  const firstCode = tagCodes.find((code) => qrText.includes(code))!
  await expect(details).not.toContainText(firstCode)

  // Print render: only the tags print, each an 80mm-wide label at the
  // paper's left edge (outside the dashboard layout), one per page.
  await page.emulateMedia({ media: "print" })
  const printed = page.locator(".stock-qr-print-root .stock-qr-label")
  await expect(printed).toHaveCount(stocks.length)
  await expect(page.locator("#stock-qr-print-grid")).toBeHidden()
  const boxes = await printed.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, width: r.width, height: r.height, breakAfter: getComputedStyle(el).breakAfter }
    }),
  )
  const mm = 96 / 25.4
  for (const box of boxes) {
    expect(Math.abs(box.width - 80 * mm)).toBeLessThan(2)
    expect(Math.abs(box.height - 30 * mm)).toBeLessThan(2)
    expect(box.left).toBeLessThan(1)
  }
  expect(boxes.slice(0, -1).every((box) => box.breakAfter === "page")).toBe(true)
})
