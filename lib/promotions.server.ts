// Resolves an offer / gift-voucher code typed at billing (lib/promotions.ts)
// for the current store and customer: the offer's own public code, or a
// single-use PromotionVoucher code. Checks active, validity dates, usage
// limits (total and per customer) and, for a voucher, that it's unused,
// unexpired and — if issued to someone — for this customer.
import "server-only";

import { InvoiceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computePromotion, type PromotionConfig, type PromotionLine } from "@/lib/promotions";

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
  options: { at?: Date; db?: Prisma.TransactionClient; ignoreInvoiceId?: string; ignoreKachaInvoiceId?: string } = {},
): Promise<ResolvedPromotionCode> {
  const db = options.db ?? prisma;
  const code = normalizePromotionCode(rawCode);
  if (!code) return { ok: false, reason: "Enter an offer or voucher code." };
  const at = options.at ?? new Date();

  const voucher = await db.promotionVoucher.findFirst({ where: { storeId, code }, include: { promotion: true } });
  const promotion = voucher?.promotion ?? (await db.promotion.findFirst({ where: { storeId, code } }));
  if (!promotion) return { ok: false, reason: `No offer or voucher found for "${code}".` };

  if (voucher) {
    const heldByIgnored =
      (options.ignoreInvoiceId != null && voucher.invoiceId === options.ignoreInvoiceId) ||
      (options.ignoreKachaInvoiceId != null && voucher.kachaInvoiceId === options.ignoreKachaInvoiceId);
    if (voucher.usedAt && !heldByIgnored) {
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

  // A redemption is a live invoice or an estimate not yet converted (a
  // converted estimate's invoice already counts). Quotations reserve nothing.
  const live = { promotionId: promotion.id, status: { not: InvoiceStatus.CANCELLED }, ...(options.ignoreInvoiceId ? { id: { not: options.ignoreInvoiceId } } : {}) };
  const liveEstimate = { promotionId: promotion.id, convertedToId: null, ...(options.ignoreKachaInvoiceId ? { id: { not: options.ignoreKachaInvoiceId } } : {}) };
  const redemptions = async (extra: { customerId?: string }) =>
    (await db.invoice.count({ where: { storeId, ...extra, ...live } })) +
    (await db.kachaInvoice.count({ where: { storeId, ...extra, ...liveEstimate } }));
  if (promotion.usageLimit != null) {
    const used = await redemptions({});
    if (used >= promotion.usageLimit) return { ok: false, reason: "This offer has been fully redeemed." };
  }
  if (promotion.perCustomerLimit != null) {
    if (!customerId) return { ok: false, reason: "Select the party first — this offer is limited per customer." };
    const usedByCustomer = await redemptions({ customerId });
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

export type DocumentPromotionLine = PromotionLine & {
  /** The share of the offer the form put on this line. */
  promoDiscount: number;
};

export type ResolvedDocumentPromotion =
  | { error: string }
  | { promotionId: string; voucherId: string | null; code: string; total: number; perLine: Record<string, number> }
  | null;

/**
 * An offer / voucher code typed on an Invoice, Estimate or Quotation:
 * re-checks the code for this store and party (lookupPromotionCode) and
 * recomputes each line's share with the same engine the form previews
 * (computePromotion), from the line's value before the offer. Refuses if the
 * form's per-line figures no longer match (e.g. the offer was edited
 * meanwhile) rather than silently charging something else. null = no code
 * and no offer discount on any line.
 */
export async function resolveDocumentPromotion(
  storeId: string,
  customerId: string,
  lines: DocumentPromotionLine[],
  rawCode: string,
  options: { at?: Date; ignoreInvoiceId?: string; ignoreKachaInvoiceId?: string } = {},
): Promise<ResolvedDocumentPromotion> {
  if (!rawCode.trim()) {
    if (lines.some((line) => line.promoDiscount > 0)) {
      return { error: "The offer was removed — re-apply it or clear its discount." };
    }
    return null;
  }
  const found = await lookupPromotionCode(storeId, rawCode, customerId, options);
  if (!found.ok) return { error: found.reason };
  const result = computePromotion(found.promotion, lines);
  if (!result.ok) return { error: result.reason };
  const mismatch = lines.some((line) => Math.abs((result.perLine[line.key] ?? 0) - line.promoDiscount) > 0.05);
  if (mismatch) return { error: "The offer's discount has changed — remove it and apply the code again." };
  return {
    promotionId: found.promotion.id,
    voucherId: found.voucherId,
    code: found.code,
    total: result.total,
    perLine: result.perLine,
  };
}

/** Thrown inside a save transaction when a voucher was spent meanwhile. */
export class PromotionVoucherSpentError extends Error {
  constructor() {
    super("This voucher was just used on another bill — remove it and try again.");
  }
}

type SaleDocumentLine = {
  inventoryStockId?: string | null;
  metalTypeId?: string | null;
  quantity: number;
  makingCharge: number;
  hmCharge?: number;
  stoneCharge: number;
  promoDiscount?: number;
  piece?: { components: { kind: string; metalTypeId?: string | null }[] };
};

/**
 * Offer lines for an Estimate / Quotation (the same shape the Invoice builds
 * in resolveInvoicePromotion): category from the linked stock's Product
 * (a hand-typed line has none, so a category-limited offer skips it), every
 * metal of the line, and its value before the offer.
 */
export async function saleDocumentPromotionLines<T extends SaleDocumentLine>(
  storeId: string,
  items: T[],
  metalValue: (item: T) => number,
): Promise<DocumentPromotionLine[]> {
  const stockIds = items.flatMap((item) => (item.inventoryStockId ? [item.inventoryStockId] : []));
  const stocks = stockIds.length
    ? await prisma.inventoryStock.findMany({
        where: { storeId, id: { in: stockIds } },
        select: { id: true, product: { select: { categoryId: true } } },
      })
    : [];
  const categoryOfStock = new Map(stocks.map((stock) => [stock.id, stock.product.categoryId]));
  const num = (value: unknown) => Number(value ?? 0) || 0;
  return items.map((item, index) => ({
    key: `line-${index}`,
    categoryId: (item.inventoryStockId ? categoryOfStock.get(item.inventoryStockId) : null) ?? null,
    metalTypeIds: item.piece
      ? item.piece.components.flatMap((row) => (row.kind === "METAL" && row.metalTypeId ? [row.metalTypeId] : []))
      : item.metalTypeId
        ? [item.metalTypeId]
        : [],
    quantity: num(item.quantity) || 1,
    value: Math.round((metalValue(item) + num(item.makingCharge) + num(item.hmCharge) + num(item.stoneCharge)) * 100) / 100,
    making: num(item.makingCharge) + num(item.hmCharge),
    promoDiscount: num(item.promoDiscount),
  }));
}
