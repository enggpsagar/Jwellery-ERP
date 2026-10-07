import "server-only"

import { prisma } from "@/lib/prisma"
import { getStoreIdForRead } from "@/lib/store-context"

/**
 * Whether the active store has any product / stock piece / artisan with no
 * metal set — the only case where the lists' "Unassigned" metal filter can
 * find anything. It exists for records left without a metal when metals
 * became store-configurable; a store with none shouldn't see the option
 * (an empty filter just reads as a bug). One indexed existence check.
 */
export async function hasUnassignedMetal(kind: "product" | "stock" | "karigar"): Promise<boolean> {
  const storeId = await getStoreIdForRead()
  const where = { storeId, metalTypeId: null }
  const row =
    kind === "product"
      ? await prisma.product.findFirst({ where, select: { id: true } })
      : kind === "stock"
        ? await prisma.inventoryStock.findFirst({ where, select: { id: true } })
        : await prisma.karigar.findFirst({ where, select: { id: true } })
  return row !== null
}
