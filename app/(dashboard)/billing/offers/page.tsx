import type { Metadata } from "next"
import { UserRole } from "@prisma/client"

import { getPromotionCustomerOptions, getPromotions } from "@/lib/actions/promotion-actions"
import { getStoreCategories, getStoreMetals } from "@/lib/actions/taxonomy-actions"
import { getCurrentUser } from "@/lib/auth/auth"
import { OffersManager } from "@/components/offers/offers-manager"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Offers & Vouchers",
}

export const dynamic = "force-dynamic"

/**
 * Billing → Offers & Vouchers: the Store Owner's promotions (lib/promotions.ts
 * maths, redeemed by code on New Invoice) and their single-use vouchers.
 * Anyone with Billing access can see them (middleware gates /billing/*);
 * only Admin / Super Admin can change them — the actions enforce that too.
 */
export default async function OffersPage() {
  const currentUser = await getCurrentUser()
  const canEdit = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_ADMIN

  const [offers, categories, metals, customers] = await Promise.all([
    getPromotions(),
    getStoreCategories(),
    getStoreMetals(),
    canEdit ? getPromotionCustomerOptions() : Promise.resolve([]),
  ])

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <PageBackHeader
        title="Offers & Vouchers"
        description="Discounts customers redeem with a code on New Invoice — open to everyone, or as single-use vouchers you hand out."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <OffersManager
        offers={offers}
        categories={categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))}
        metals={metals.map((m) => ({
          id: m.id,
          name: m.name,
          isActive: m.isActive,
          hint: m.isGemstone ? "stone" : undefined,
        }))}
        customers={customers}
        canEdit={canEdit}
      />
    </main>
  )
}
