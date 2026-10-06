import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { PrismaClient } from "@prisma/client"
import { prismaAdapter } from "../lib/prisma-adapter"
import { encode } from "next-auth/jwt"

export const E2E_ADMIN_EMAIL = "admin@aurumdemo.test"

/**
 * The app's DB is a shared production Neon instance (see CLAUDE.md), so
 * this suite must never touch it — it creates invoices, products and
 * stock. Anything but a local Postgres is refused outright.
 */
export function assertThrowawayDatabase() {
  const url = process.env.DATABASE_URL ?? ""
  let host = ""
  try {
    host = new URL(url).hostname
  } catch {
    // fall through to the error below
  }
  if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
    throw new Error(
      `Refusing to run e2e tests: DATABASE_URL must point at a throwaway local Postgres (got host "${host || "none"}").`,
    )
  }
}

/**
 * Signs in as the seeded demo Admin without going through Google/OTP: mints
 * the same NextAuth JWT the app's own jwt callback produces, signed with
 * this run's NEXTAUTH_SECRET. checkedAt: 0 makes the app re-read the user's
 * role/store/permissions from the DB on the first request, so nothing here
 * has to mirror them. No test-only login route exists in the app.
 */
export default async function globalSetup() {
  assertThrowawayDatabase()

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set for e2e tests")

  const prisma = new PrismaClient({ adapter: prismaAdapter() })
  try {
    const admin = await prisma.user.findUnique({
      where: { email: E2E_ADMIN_EMAIL },
      select: { id: true, name: true, email: true, role: true, storeId: true },
    })
    if (!admin) {
      throw new Error(`Seed the demo store first (pnpm db:seed:full-demo) — ${E2E_ADMIN_EMAIL} not found`)
    }

    const token = await encode({
      secret,
      token: {
        sub: admin.id,
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        storeId: admin.storeId,
        permissions: [],
        locationIds: [],
        disabled: false,
        checkedAt: 0,
        loginAt: Date.now(),
      },
    })

    const state = {
      cookies: [
        {
          name: "next-auth.session-token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    }

    const file = path.join(__dirname, ".auth", "admin.json")
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}
