// One-off data fix: merge a duplicate purity into another under the same
// metal, for ONE store. Every reference moves to the kept purity — Products
// and their metal rows (by id) and every line that stores the purity as
// text (stock, purchase, invoice, estimate, quotation, piece rows, draft
// orders, artisan receipts) — then the duplicate is deleted. Scoped by the
// store's own StoreMetal id, which no other store shares.
//
//   npx tsx scripts/merge-purity.ts "<store name>" <metal> <from label> <to label> [--apply]
//
// Without --apply it only prints what it would change.
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { prismaAdapter } from "../lib/prisma-adapter"

async function main() {
  const [storeName, metalName, fromLabel, toLabel] = process.argv.slice(2)
  const apply = process.argv.includes("--apply")
  if (!storeName || !metalName || !fromLabel || !toLabel) throw new Error("usage: <store name> <metal> <from> <to> [--apply]")
  const prisma = new PrismaClient({ adapter: prismaAdapter() })
  try {
    const stores = await prisma.store.findMany({ where: { name: { equals: storeName, mode: "insensitive" } }, select: { id: true, name: true, code: true } })
    if (stores.length !== 1) throw new Error(`expected exactly one store named "${storeName}", found ${stores.length}`)
    const store = stores[0]
    const metal = await prisma.storeMetal.findFirstOrThrow({ where: { storeId: store.id, name: { equals: metalName, mode: "insensitive" } } })
    const from = await prisma.storeMetalPurity.findFirstOrThrow({ where: { storeMetalId: metal.id, label: fromLabel } })
    const to = await prisma.storeMetalPurity.findFirstOrThrow({ where: { storeMetalId: metal.id, label: toLabel } })
    console.log(`Store ${store.name} (${store.code}) · ${metal.name}: "${from.label}" (${from.finenessPercent}%, SKU ${from.skuCode}) → "${to.label}" (${to.finenessPercent}%, SKU ${to.skuCode})`)

    const byLabel = { metalTypeId: metal.id, purityLabel: from.label }
    const counts = {
      products: await prisma.product.count({ where: { storeMetalPurityId: from.id } }),
      productMetalRows: await prisma.productMetalComponent.count({ where: { storeMetalPurityId: from.id } }),
      stock: await prisma.inventoryStock.count({ where: byLabel }),
      purchaseItems: await prisma.purchaseItem.count({ where: byLabel }),
      invoiceItems: await prisma.invoiceItem.count({ where: byLabel }),
      estimateItems: await prisma.kachaInvoiceItem.count({ where: byLabel }),
      quotationItems: await prisma.quotationItem.count({ where: byLabel }),
      pieceRows: await prisma.pieceComponent.count({ where: byLabel }),
      draftOrderItems: await prisma.draftOrderItem.count({ where: byLabel }),
      artisanReceiptItems: await prisma.karigarReceiptItem.count({ where: byLabel }),
    }
    console.log(counts)
    if (!apply) {
      console.log("Dry run — nothing changed. Re-run with --apply.")
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { storeMetalPurityId: from.id }, data: { storeMetalPurityId: to.id } })
      await tx.productMetalComponent.updateMany({ where: { storeMetalPurityId: from.id }, data: { storeMetalPurityId: to.id } })
      const data = { purityLabel: to.label }
      await tx.inventoryStock.updateMany({ where: byLabel, data })
      await tx.purchaseItem.updateMany({ where: byLabel, data })
      await tx.invoiceItem.updateMany({ where: byLabel, data })
      await tx.kachaInvoiceItem.updateMany({ where: byLabel, data })
      await tx.quotationItem.updateMany({ where: byLabel, data })
      await tx.pieceComponent.updateMany({ where: byLabel, data })
      await tx.draftOrderItem.updateMany({ where: byLabel, data })
      await tx.karigarReceiptItem.updateMany({ where: byLabel, data })
      await tx.storeMetalPurity.delete({ where: { id: from.id } })
    })
    console.log(`Applied. "${from.label}" deleted; everything now uses "${to.label}".`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
