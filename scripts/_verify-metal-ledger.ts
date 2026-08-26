import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  console.log("stores:", stores);

  for (const store of stores) {
    const [purchaseCount, invoiceCount, kachaCount, settings] = await Promise.all([
      prisma.purchaseItem.count({ where: { purchase: { storeId: store.id } } }),
      prisma.invoiceItem.count({ where: { invoice: { storeId: store.id } } }),
      prisma.kachaInvoiceItem.count({ where: { kachaInvoice: { storeId: store.id } } }),
      prisma.businessSettings.findUnique({ where: { storeId: store.id }, select: { businessUnits: true } }),
    ]);
    console.log(store.name, { purchaseCount, invoiceCount, kachaCount, businessUnits: settings?.businessUnits });
  }
}

main().finally(() => prisma.$disconnect());
