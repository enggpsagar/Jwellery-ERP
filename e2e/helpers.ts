import type { Page } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { prismaAdapter } from "../lib/prisma-adapter"

/** Collects uncaught browser errors (a crashed component, a failed
 *  hydration) for the page's lifetime — assert it's empty at the end. */
export function watchForPageCrash(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

let prisma: PrismaClient | undefined

/** Direct DB access for asserting what a UI flow actually wrote. Same
 *  throwaway DATABASE_URL the app under test uses (see global-setup). */
export function db() {
  prisma ??= new PrismaClient({ adapter: prismaAdapter() })
  return prisma
}

export async function demoStoreId() {
  const store = await db().store.findFirstOrThrow({ where: { code: "DEMO-AURUM" }, select: { id: true } })
  return store.id
}
