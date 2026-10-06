import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const store = await prisma.store.findFirst({
  where: { name: { contains: "Giri", mode: "insensitive" } },
  select: { id: true, name: true },
});
console.log("Store:", JSON.stringify(store));
if (store) {
  const stocks = await prisma.inventoryStock.findMany({
    where: { storeId: store.id, stockCode: { startsWith: "STK-2026-" } },
    select: { id: true, stockCode: true, createdAt: true },
    orderBy: { stockCode: "asc" },
  });
  console.log("Count:", stocks.length);
  console.log(JSON.stringify(stocks, null, 2));
}
await prisma.$disconnect();
