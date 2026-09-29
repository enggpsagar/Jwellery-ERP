import { expect, test } from "@playwright/test"

import { db, demoStoreId } from "./helpers"

/**
 * Thermal receipt carries the invoice QR split in two: QR on the left,
 * invoice facts + E-Invoice IRN/Ack on the right. The A4 templates don't.
 * Switches the demo store to THERMAL (and back) for the duration.
 */
test("thermal receipt prints the QR with details beside it", async ({ page }) => {
  const storeId = await demoStoreId()
  const invoice = await db().invoice.findFirstOrThrow({
    where: { storeId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, invoiceNumber: true, irnNumber: true, ackNumber: true, ackDate: true },
  })
  const settings = await db().businessSettings.findUniqueOrThrow({
    where: { storeId },
    select: { printLayout: true, eInvoiceEnabled: true },
  })
  const irn = "a".repeat(32) + "b".repeat(32)

  await db().businessSettings.update({ where: { storeId }, data: { printLayout: "THERMAL", eInvoiceEnabled: true } })
  await db().invoice.update({
    where: { id: invoice.id },
    data: { irnNumber: irn, ackNumber: "112610000123456", ackDate: new Date() },
  })

  try {
    await page.setViewportSize({ width: 800, height: 1400 })
    await page.goto(`/billing/${invoice.id}/print`)
    // The page streams in; wait for it to settle so only the final receipt
    // is in the DOM.
    await page.waitForLoadState("networkidle")
    await expect(page.getByAltText(`QR code for invoice ${invoice.invoiceNumber}`, { exact: true })).toHaveCount(1)

    const qr = page.getByAltText(`QR code for invoice ${invoice.invoiceNumber}`, { exact: true })
    await expect(qr).toBeVisible()
    const details = qr.locator("xpath=following-sibling::div[1]")
    await expect(details).toContainText(`Invoice ${invoice.invoiceNumber}`)
    await expect(details).toContainText(`IRN: ${irn}`)
    await expect(details).toContainText("Ack No: 112610000123456")

    // Side by side: the details column starts to the right of the QR.
    const qrBox = await qr.boundingBox()
    const detailsBox = await details.boundingBox()
    expect(detailsBox!.x).toBeGreaterThan(qrBox!.x + qrBox!.width - 1)

    await page.locator("main").last().screenshot({ path: "test-results/thermal-receipt.png" })
  } finally {
    await db().businessSettings.update({ where: { storeId }, data: settings })
    await db().invoice.update({
      where: { id: invoice.id },
      data: { irnNumber: invoice.irnNumber, ackNumber: invoice.ackNumber, ackDate: invoice.ackDate },
    })
  }
})

test("A4 invoice print has no QR code", async ({ page }) => {
  const storeId = await demoStoreId()
  const invoice = await db().invoice.findFirstOrThrow({ where: { storeId }, select: { id: true, invoiceNumber: true } })
  await page.goto(`/billing/${invoice.id}/print`)
  await expect(page.getByAltText(`QR code for invoice ${invoice.invoiceNumber}`)).toHaveCount(0)
})
