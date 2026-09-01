import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      email: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          customers: true,
          vendors: true,
          karigars: true,
          products: true,
          invoices: true,
          purchases: true,
          quotations: true,
          kachaInvoices: true,
          ledgerEntries: true,
          inventoryStock: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`TOTAL STORES: ${stores.length}\n`);
  for (const s of stores) {
    console.log(`- ${s.name} (${s.code}) | ${s.email} | created ${s.createdAt.toISOString().slice(0, 10)} | active=${s.isActive}`);
    console.log(`    customers=${s._count.customers} vendors=${s._count.vendors} karigars=${s._count.karigars} products=${s._count.products} stock=${s._count.inventoryStock}`);
    console.log(`    invoices=${s._count.invoices} purchases=${s._count.purchases} quotations=${s._count.quotations} kachaSlips=${s._count.kachaInvoices} ledgerEntries=${s._count.ledgerEntries}`);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
