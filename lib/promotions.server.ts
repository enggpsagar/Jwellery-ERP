// Resolves an offer / gift-voucher code typed at billing (lib/promotions.ts)
// for the current store and customer: the offer's own public code, or a
// single-use PromotionVoucher code. Checks active, validity dates, usage
// limits (total and per customer) and, for a voucher, that it's unused,
// unexpired and — if issued to someone — for this customer.
import "server-only";

import { InvoiceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PromotionConfig } from "@/lib/promotions";

export type ResolvedPromotionCode =
  | { ok: true; promotion: PromotionConfig; voucherId: string | null; code: string }
  | { ok: false; reason: string };

export function normalizePromotionCode(code: string) {
  return code.trim().toUpperCase();
}

export async function lookupPromotionCode(
  storeId: string,
  rawCode: string,
  customerId: string | null,
  options: { at?: Date; db?: Prisma.TransactionClient; ignoreInvoiceId?: string } = {},
): Promise<ResolvedPromotionCode> {
  const db = options.db ?? prisma;
  const code = normalizePromotionCode(rawCode);
  if (!code) return { ok: false, reason: "Enter an offer or voucher code." };
  const at = options.at ?? new Date();

  const voucher = await db.promotionVoucher.findFirst({ where: { storeId, code }, include: { promotion: true } });
  const promotion = voucher?.promotion ?? (await db.promotion.findFirst({ where: { storeId, code } }));
  if (!promotion) return { ok: false, reason: `No offer or voucher found for "${code}".` };

  if (voucher) {
    if (voucher.usedAt && voucher.invoiceId !== options.ignoreInvoiceId) {
      return { ok: false, reason: "This voucher has already been used." };
    }
    if (voucher.expiresAt && voucher.expiresAt < at) return { ok: false, reason: "This voucher has expired." };
    if (voucher.customerId && voucher.customerId !== customerId) {
      return { ok: false, reason: "This voucher was issued to a different customer." };
    }
  }
  if (!promotion.isActive) return { ok: false, reason: "This offer is no longer running." };
  if (promotion.validFrom && promotion.validFrom > at) return { ok: false, reason: "This offer hasn't started yet." };
  if (promotion.validUntil && promotion.validUntil < at) return { ok: false, reason: "This offer has ended." };

  const live = { promotionId: promotion.id, status: { not: InvoiceStatus.CANCELLED }, ...(options.ignoreInvoiceId ? { id: { not: options.ignoreInvoiceId } } : {}) };
  if (promotion.usageLimit != null) {
    const used = await db.invoice.count({ where: { storeId, ...live } });
    if (used >= promotion.usageLimit) return { ok: false, reason: "This offer has been fully redeemed." };
  }
  if (promotion.perCustomerLimit != null) {
    if (!customerId) return { ok: false, reason: "Select the party first — this offer is limited per customer." };
    const usedByCustomer = await db.invoice.count({ where: { storeId, customerId, ...live } });
    if (usedByCustomer >= promotion.perCustomerLimit) {
      return { ok: false, reason: "This customer has already used this offer the maximum number of times." };
    }
  }

  const n = (value: Prisma.Decimal | null) => (value == null ? null : Number(value));
  return {
    ok: true,
    code,
    voucherId: voucher?.id ?? null,
    promotion: {
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      target: promotion.target,
      percentOff: n(promotion.percentOff),
      amountOff: n(promotion.amountOff),
      buyQuantity: promotion.buyQuantity,
      getQuantity: promotion.getQuantity,
      getPercentOff: n(promotion.getPercentOff),
      maxDiscount: n(promotion.maxDiscount),
      minBillAmount: n(promotion.minBillAmount),
      categoryIds: promotion.categoryIds,
      metalTypeIds: promotion.metalTypeIds,
    },
  };
}
