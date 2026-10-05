"use server";

import { requireStoreScope } from "@/lib/store-context";
import { lookupPromotionCode, type ResolvedPromotionCode } from "@/lib/promotions.server";

/**
 * New Invoice's "Apply" for an offer / voucher code: resolves it for this
 * store and party (lib/promotions.server.ts). The form then previews the
 * discount with lib/promotions.ts; createInvoice re-checks and recomputes.
 */
export async function checkPromotionCode(code: string, customerId: string | null): Promise<ResolvedPromotionCode> {
  const storeId = await requireStoreScope();
  return lookupPromotionCode(storeId, code, customerId || null);
}
