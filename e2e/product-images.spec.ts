import path from "node:path"
import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

import { db, demoStoreId, watchForPageCrash } from "./helpers"

/**
 * Optional Product Images on Add/Edit Product. Vercel Blob isn't available
 * in CI, so the upload route and the returned image URLs are stubbed; the
 * test checks the form, the saved order (first = cover) and that mixed
 * photo shapes keep the grid's square tiles intact.
 */
const FIXTURES = ["wide.png", "tall.png", "square.png"].map((name) => path.join(__dirname, "fixtures", name))

test("add, reorder and remove product images, then save", async ({ page }) => {
  const crashes = watchForPageCrash(page)
  const storeId = await demoStoreId()
  const product = await db().product.findFirstOrThrow({
    where: { storeId, isActive: true, metalType: { isGemstone: false } },
    orderBy: { createdAt: "asc" },
    select: { id: true, imageUrls: true },
  })

  let n = 0
  await page.route("**/api/products/photo", async (route) => {
    n += 1
    await route.fulfill({ json: { url: `https://e2e.public.blob.vercel-storage.com/product-photos/img-${n}.png` } })
  })
  await page.route("https://e2e.public.blob.vercel-storage.com/**", async (route) => {
    const file = FIXTURES[(Number(/img-(\d+)/.exec(route.request().url())?.[1] ?? 1) - 1) % FIXTURES.length]
    await route.fulfill({ body: readFileSync(file), contentType: "image/png" })
  })

  // Start from no images so leftovers from any earlier run can't skew counts.
  await db().product.update({ where: { id: product.id }, data: { imageUrls: [] } })

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/inventory/products/${product.id}/edit`)

    await page.getByLabel("Add product images").setInputFiles(FIXTURES)
    const tiles = page.getByRole("list", { name: "Product images" }).getByRole("img")
    await expect(tiles).toHaveCount(3)

    // Every tile is square regardless of the photo's own shape.
    for (const box of await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) {
      expect(Math.abs(box.width - box.height)).toBeLessThan(1.5)
    }

    await page.getByRole("button", { name: "Make image 3 the cover" }).click()
    await page.getByRole("button", { name: "Remove image 2" }).click()
    await expect(tiles).toHaveCount(2)

    await page.getByRole("button", { name: "Update Product" }).click()
    await page.waitForURL("**/inventory/products")

    const saved = await db().product.findUniqueOrThrow({ where: { id: product.id }, select: { imageUrls: true } })
    expect(saved.imageUrls).toEqual([
      "https://e2e.public.blob.vercel-storage.com/product-photos/img-3.png",
      "https://e2e.public.blob.vercel-storage.com/product-photos/img-2.png",
    ])
    expect(crashes).toEqual([])
  } finally {
    await db().product.update({ where: { id: product.id }, data: { imageUrls: product.imageUrls } })
  }
})

test("a non-Blob image URL is never saved", async ({ page }) => {
  const storeId = await demoStoreId()
  const product = await db().product.findFirstOrThrow({
    where: { storeId, isActive: true, metalType: { isGemstone: false } },
    orderBy: { createdAt: "asc" },
    select: { id: true, imageUrls: true },
  })
  try {
    await page.goto(`/inventory/products/${product.id}/edit`)
    await page.locator('input[name="imageUrlsJson"]').evaluate((el: HTMLInputElement) => {
      // Simulates a tampered submit; React would re-render the value, so
      // it's set right before submitting.
      el.form?.addEventListener("submit", () => {
        el.value = JSON.stringify(["https://evil.example.com/x.png"])
      }, { capture: true })
    })
    await page.getByRole("button", { name: "Update Product" }).click()
    await page.waitForURL("**/inventory/products")
    const saved = await db().product.findUniqueOrThrow({ where: { id: product.id }, select: { imageUrls: true } })
    expect(saved.imageUrls).toEqual([])
  } finally {
    await db().product.update({ where: { id: product.id }, data: { imageUrls: product.imageUrls } })
  }
})
