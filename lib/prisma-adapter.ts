// lib/prisma-adapter.ts
// Prisma runs with engineType = "client" (see prisma/schema.prisma): queries
// are planned in TypeScript and sent over node-postgres, instead of through
// the Rust query-engine binary. That engine spent noticeable CPU serialising
// every result between Rust and JS — billed on Vercel as Fluid Active CPU —
// and was a ~15MB native file in every function bundle.
//
// With that engine type, every PrismaClient must be given a driver adapter;
// a bare `new PrismaClient()` throws at construction. Every client in the app,
// seeds, scripts and e2e helpers is built with this.
import { PrismaPg } from "@prisma/adapter-pg";

export function prismaAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaPg({ connectionString });
}
