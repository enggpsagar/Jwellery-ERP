import { PrismaClient } from "@prisma/client"
import { prismaAdapter } from "@/lib/prisma-adapter"

const globalForPrisma = globalThis as unknown as {
  db: PrismaClient | undefined
}

export const db =
  globalForPrisma.db ??
  new PrismaClient({
    adapter: prismaAdapter(),
    log: ["warn", "error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db
}