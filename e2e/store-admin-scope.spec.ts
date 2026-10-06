import { expect, test, type Browser, type Page } from "@playwright/test"
import { encode } from "next-auth/jwt"
import fs from "node:fs"
import { db, demoStoreId } from "./helpers"
import { seedStarterMasters } from "../lib/inventory/starter-masters"

/** A browser context signed in as `userId` — same JWT shape global-setup mints
 *  for the demo Admin; checkedAt: 0 makes the app re-read role/store/location
 *  grants from the DB on the first request. */
async function signedInPage(browser: Browser, userId: string): Promise<Page> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } })
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET!,
    token: {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      permissions: [],
      locationIds: [],
      disabled: false,
      checkedAt: 0,
      loginAt: Date.now(),
    },
  })
  const context = await browser.newContext({
    storageState: {
      cookies: [
        {
          name: "next-auth.session-token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  })
  return context.newPage()
}

/** Users export honours the chosen format and the row selection. */
test("users export: CSV of the selected rows only", async ({ page }) => {
  const storeId = await demoStoreId()
  const users = await db().user.findMany({ where: { storeId, name: { not: null } }, orderBy: { createdAt: "asc" }, take: 2 })
  expect(users.length).toBe(2)

  await page.goto("/users")
  for (const user of users) await page.getByRole("checkbox", { name: `Select ${user.name}` }).click()
  await page.getByRole("button", { name: /^Export selected users \(2\)/ }).click()
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "CSV" }).click()])
  expect(file.suggestedFilename()).toMatch(/\.csv$/)
  const lines = fs.readFileSync((await file.path())!, "utf-8").trim().split("\n")
  expect(lines[0]).toContain("Name")
  expect(lines.length).toBe(3)
  for (const user of users) expect(lines.some((line) => line.includes(user.email ?? user.name!))).toBe(true)
})

/** A Staff user granted only one location never sees another location's
 *  credit note or draft order — list or detail. */
test("credit notes / draft orders are location-scoped for restricted staff", async ({ browser }) => {
  const storeId = await demoStoreId()
  const [locA, locB] = await db().storeLocation.findMany({ where: { storeId }, orderBy: { name: "asc" }, take: 2 })
  const invoice = await db().invoice.findFirstOrThrow({ where: { storeId } })
  const stamp = Date.now()
  const staff = await db().user.create({
    data: {
      name: "E2E Location Staff",
      email: `e2e-loc-${stamp}@example.test`,
      role: "STAFF",
      status: "ACTIVE",
      storeId,
      storeMemberships: { create: { storeId, role: "STAFF" } },
      locationAccess: { create: { locationId: locA.id } },
    },
  })
  const mk = (loc: string, suffix: string) =>
    db().creditNote.create({
      data: { storeId, invoiceId: invoice.id, customerId: invoice.customerId, creditNoteNumber: `E2E-CN-${stamp}-${suffix}`, locationId: loc },
    })
  const mkOrder = (loc: string, suffix: string) =>
    db().draftOrder.create({ data: { storeId, customerId: invoice.customerId, orderNumber: `E2E-DO-${stamp}-${suffix}`, locationId: loc } })
  const [cnA, cnB] = [await mk(locA.id, "A"), await mk(locB.id, "B")]
  const [doA, doB] = [await mkOrder(locA.id, "A"), await mkOrder(locB.id, "B")]

  try {
    const page = await signedInPage(browser, staff.id)
    await page.goto(`/billing/credit-notes?search=E2E-CN-${stamp}`)
    await expect(page.getByText(cnA.creditNoteNumber).first()).toBeVisible()
    await expect(page.getByText(cnB.creditNoteNumber)).toHaveCount(0)
    // notFound() inside a streamed page still answers 200 — assert the page.
    await page.goto(`/billing/credit-notes/${cnB.id}`)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
    await page.goto(`/orders/${doB.id}`)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
    // ...while their own location's credit note opens.
    await page.goto(`/billing/credit-notes/${cnA.id}`)
    await expect(page.getByText(cnA.creditNoteNumber).first()).toBeVisible()

    await page.goto(`/orders?search=E2E-DO-${stamp}`)
    await expect(page.getByText(doA.orderNumber).first()).toBeVisible()
    await expect(page.getByText(doB.orderNumber)).toHaveCount(0)
    await page.context().close()
  } finally {
    await db().creditNote.deleteMany({ where: { id: { in: [cnA.id, cnB.id] } } })
    await db().draftOrder.deleteMany({ where: { id: { in: [doA.id, doB.id] } } })
    await db().userLocationAccess.deleteMany({ where: { userId: staff.id } })
    await db().user.deleteMany({ where: { id: staff.id } })
  }
})

/** A store made the way new stores are (seedStarterMasters → styles and
 *  clarities) plus an offer with a voucher used to make Force Delete throw.
 *  Export must carry those tables; Force Delete must remove the store and
 *  leave every other store alone. */
test("store export carries every table; force delete removes a starter-seeded store", async ({ browser }) => {
  const demoId = await demoStoreId()
  const superAdmin = await db().user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } })
  const stamp = Date.now()
  const name = `E2E Doomed ${stamp}`

  const store = await db().$transaction(async (tx) => {
    const s = await tx.store.create({ data: { name, code: `E2E-DOOM-${stamp}` } })
    await seedStarterMasters(tx, s.id)
    const location = await tx.storeLocation.create({ data: { storeId: s.id, name: "Counter" } })
    await tx.store.update({ where: { id: s.id }, data: { defaultLocationId: location.id } })
    const customer = await tx.customer.create({ data: { storeId: s.id, name: "E2E Doomed Customer" } })
    const gold = await tx.storeMetal.findFirstOrThrow({ where: { storeId: s.id, name: "Gold" }, include: { purities: true } })
    const style = await tx.storeStyle.findFirstOrThrow({ where: { storeId: s.id } })
    const product = await tx.product.create({
      data: {
        storeId: s.id,
        productCode: "E2E-DOOM-1",
        name: "Doomed Ring",
        metalTypeId: gold.id,
        targetStyleId: style.id,
        metalComponents: { create: { metalTypeId: gold.id, storeMetalPurityId: gold.purities[0]?.id } },
      },
    })
    await tx.inventoryStock.create({ data: { storeId: s.id, productId: product.id, stockCode: "E2E-DOOM-STK", locationId: location.id } })
    const promotion = await tx.promotion.create({ data: { storeId: s.id, name: "Doomed Offer", type: "PERCENT_OFF", percentOff: 5, code: "DOOM5" } })
    const invoice = await tx.invoice.create({
      data: { storeId: s.id, customerId: customer.id, invoiceNumber: "DOOM-1", promotionId: promotion.id, locationId: location.id },
    })
    await tx.promotionVoucher.create({ data: { storeId: s.id, promotionId: promotion.id, code: "DOOMV1", customerId: customer.id, invoiceId: invoice.id } })
    const owner = await tx.user.create({
      data: {
        name: "E2E Doomed Owner",
        email: `e2e-doom-${stamp}@example.test`,
        role: "STAFF",
        status: "ACTIVE",
        storeId: s.id,
        storeMemberships: { create: { storeId: s.id, role: "STAFF" } },
        locationAccess: { create: { locationId: location.id } },
      },
    })
    return { ...s, ownerId: owner.id }
  })

  const demoCounts = async () => ({
    styles: await db().storeStyle.count({ where: { storeId: demoId } }),
    clarities: await db().storeStoneClarity.count({ where: { storeId: demoId } }),
    promotions: await db().promotion.count({ where: { storeId: demoId } }),
    invoices: await db().invoice.count({ where: { storeId: demoId } }),
    products: await db().product.count({ where: { storeId: demoId } }),
    users: await db().user.count({ where: { storeId: demoId } }),
  })
  const before = await demoCounts()

  try {
    const page = await signedInPage(browser, superAdmin.id)
    // The Export / Delete actions live on the list's detail panel.
    await page.goto(`/stores?search=${encodeURIComponent(name)}`)
    await page.getByRole("cell", { name }).first().click()

    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export store data" }).click()])
    const data = JSON.parse(fs.readFileSync((await file.path())!, "utf-8"))
    for (const key of [
      "storeStyles",
      "storeStoneClarities",
      "storeMetalPurities",
      "promotions",
      "promotionVouchers",
      "productMetalComponents",
      "userStoreMemberships",
      "userLocationAccess",
    ]) {
      expect(data[key]?.length, key).toBeGreaterThan(0)
    }
    expect(data.users.map((u: { id: string }) => u.id)).toContain(store.ownerId)
    expect(JSON.stringify(data.apiKeys ?? [])).not.toContain("keyHash")

    await page.getByRole("button", { name: `Delete ${name}` }).click()
    await page.locator("#confirm-store-name").fill(name)
    await page.getByRole("button", { name: "Force Delete" }).click()
    await expect.poll(async () => db().store.count({ where: { id: store.id } }), { timeout: 15000 }).toBe(0)
    expect(await db().storeStyle.count({ where: { storeId: store.id } })).toBe(0)
    expect(await db().promotionVoucher.count({ where: { storeId: store.id } })).toBe(0)
    expect(await db().user.count({ where: { id: store.ownerId } })).toBe(0)
    expect(await demoCounts()).toEqual(before)
    await page.context().close()
  } finally {
    // Only if the delete under test failed — never leave the store behind.
    if (await db().store.count({ where: { id: store.id } })) {
      const id = store.id
      await db().$transaction([
        db().store.update({ where: { id }, data: { defaultLocationId: null } }),
        db().promotionVoucher.deleteMany({ where: { storeId: id } }),
        db().invoice.deleteMany({ where: { storeId: id } }),
        db().promotion.deleteMany({ where: { storeId: id } }),
        db().inventoryStock.deleteMany({ where: { storeId: id } }),
        db().product.deleteMany({ where: { storeId: id } }),
        db().customer.deleteMany({ where: { storeId: id } }),
        db().userLocationAccess.deleteMany({ where: { userId: store.ownerId } }),
        db().user.deleteMany({ where: { id: store.ownerId } }),
        db().storeLocation.deleteMany({ where: { storeId: id } }),
        db().storeStyle.deleteMany({ where: { storeId: id } }),
        db().storeStoneClarity.deleteMany({ where: { storeId: id } }),
        db().storeCategory.deleteMany({ where: { storeId: id } }),
        db().storeMetal.deleteMany({ where: { storeId: id } }),
        db().store.delete({ where: { id } }),
      ])
    }
  }
})
