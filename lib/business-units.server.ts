// lib/business-units.server.ts
import { BusinessUnit } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"

/** The business units the current store has configured itself to transact in — always at least one (MONEY by default). */
export async function getActiveBusinessUnits(): Promise<BusinessUnit[]> {
  const storeId = await requireStoreScope()

  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { businessUnits: true },
  })

  return settings?.businessUnits?.length ? settings.businessUnits : ["MONEY"]
}
