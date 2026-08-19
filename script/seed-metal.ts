import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const store = await prisma.store.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { name: "Main Store", code: "MAIN" },
  })

  await prisma.metalRate.create({
    data: {
      storeId: store.id,
      gold22k: 7420,
      gold24k: 8090,
      gold18k: 6068,
      silver: 108,
    },
  })
}

main()