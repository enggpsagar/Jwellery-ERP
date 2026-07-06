import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  await prisma.metalRate.create({
    data: {
      gold22k: 7420,
      gold24k: 8090,
      silver: 108,
    },
  })
}

main()