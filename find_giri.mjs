import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
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
