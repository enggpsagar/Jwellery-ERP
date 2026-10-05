"use server";

// Offers & Vouchers admin (Billing → Offers & Vouchers). The discount maths
// and the billing-time code lookup live in lib/promotions.ts /
// lib/promotions.server.ts — this file only manages the Promotion and
// PromotionVoucher rows. Every query is store-scoped (CLAUDE.md).

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, Prisma, PromotionTarget, PromotionType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { requireRole } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";

const OFFERS_PATH = "/billing/offers";
const OWNER_ONLY = "Only the Store Owner can manage offers and vouchers.";

export type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  target: PromotionTarget;
  percentOff: number | null;
  amountOff: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  getPercentOff: number | null;
  maxDiscount: number | null;
  minBillAmount: number | null;
  categoryIds: string[];
  metalTypeIds: string[];
  /** ISO timestamps (validFrom = start of its IST day, validUntil = end). */
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  code: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  createdAt: string;
  /** Invoices carrying this offer that aren't cancelled. */
  redemptions: number;
  /** Σ promotionDiscount on those invoices. */
  discountGiven: number;
  vouchersIssued: number;
  vouchersUsed: number;
};

export type PromotionFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  id?: string;
};

export type IssueVouchersState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  codes?: string[];
};

export type PromotionVoucherRow = {
  id: string;
  code: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  issuedAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

export type PromotionCustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  customerCode: string | null;
};

const num = (value: Prisma.Decimal | null | undefined) => (value == null ? null : Number(value));

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPromotions(): Promise<PromotionRow[]> {
  const storeId = await getStoreIdForRead();

  const promotions = await prisma.promotion.findMany({
    where: { storeId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  if (!promotions.length) return [];
  const ids = promotions.map((p) => p.id);

  const [redemptions, issued, used] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["promotionId"],
      where: { storeId, promotionId: { in: ids }, status: { not: InvoiceStatus.CANCELLED } },
      _count: { _all: true },
      _sum: { promotionDiscount: true },
    }),
    prisma.promotionVoucher.groupBy({
      by: ["promotionId"],
      where: { storeId, promotionId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.promotionVoucher.groupBy({
      by: ["promotionId"],
      where: { storeId, promotionId: { in: ids }, usedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const redemptionMap = new Map(redemptions.map((r) => [r.promotionId, r]));
  const issuedMap = new Map(issued.map((r) => [r.promotionId, r._count._all]));
  const usedMap = new Map(used.map((r) => [r.promotionId, r._count._all]));

  return promotions.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    target: p.target,
    percentOff: num(p.percentOff),
    amountOff: num(p.amountOff),
    buyQuantity: p.buyQuantity,
    getQuantity: p.getQuantity,
    getPercentOff: num(p.getPercentOff),
    maxDiscount: num(p.maxDiscount),
    minBillAmount: num(p.minBillAmount),
    categoryIds: p.categoryIds,
    metalTypeIds: p.metalTypeIds,
    validFrom: p.validFrom?.toISOString() ?? null,
    validUntil: p.validUntil?.toISOString() ?? null,
    isActive: p.isActive,
    code: p.code,
    usageLimit: p.usageLimit,
    perCustomerLimit: p.perCustomerLimit,
    createdAt: p.createdAt.toISOString(),
    redemptions: redemptionMap.get(p.id)?._count._all ?? 0,
    discountGiven: Number(redemptionMap.get(p.id)?._sum.promotionDiscount ?? 0),
    vouchersIssued: issuedMap.get(p.id) ?? 0,
    vouchersUsed: usedMap.get(p.id) ?? 0,
  }));
}

export async function getPromotionVouchers(promotionId: string): Promise<PromotionVoucherRow[]> {
  const storeId = await getStoreIdForRead();
  if (!promotionId) return [];

  const vouchers = await prisma.promotionVoucher.findMany({
    where: { storeId, promotionId },
    orderBy: [{ issuedAt: "desc" }, { code: "asc" }],
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  });

  return vouchers.map((v) => ({
    id: v.id,
    code: v.code,
    customerId: v.customer?.id ?? null,
    customerName: v.customer?.name ?? null,
    customerPhone: v.customer?.phone ?? null,
    note: v.note,
    issuedAt: v.issuedAt.toISOString(),
    expiresAt: v.expiresAt?.toISOString() ?? null,
    usedAt: v.usedAt?.toISOString() ?? null,
    invoiceId: v.invoice?.id ?? null,
    invoiceNumber: v.invoice?.invoiceNumber ?? null,
  }));
}

/** Customers for the "issue to a customer" picker. */
export async function getPromotionCustomerOptions(): Promise<PromotionCustomerOption[]> {
  const storeId = await getStoreIdForRead();
  return prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, customerCode: true },
  });
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** "" → null; otherwise a finite number or NaN (caller reports it). */
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dates are typed as calendar days in the store's (Indian) time zone — the
// server runs in UTC, so anchor them to IST explicitly: an offer "until
// 31 Oct" stays usable through 23:59 IST on the 31st.
function istDayStart(day: string) {
  return new Date(`${day}T00:00:00.000+05:30`);
}
function istDayEnd(day: string) {
  return new Date(`${day}T23:59:59.999+05:30`);
}

const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

/** A code typed at billing must resolve to exactly one thing — check both tables. */
async function isCodeTaken(storeId: string, code: string, exceptPromotionId?: string) {
  const [promotion, voucher] = await Promise.all([
    prisma.promotion.findFirst({
      where: { storeId, code, ...(exceptPromotionId ? { NOT: { id: exceptPromotionId } } : {}) },
      select: { id: true },
    }),
    prisma.promotionVoucher.findFirst({ where: { storeId, code }, select: { id: true } }),
  ]);
  return Boolean(promotion || voucher);
}

// ---------------------------------------------------------------------------
// Offer create / edit
// ---------------------------------------------------------------------------

export async function upsertPromotion(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  let userId: string | undefined;
  try {
    const user = await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    userId = user.id;
  } catch {
    return { success: false, message: OWNER_ONLY };
  }

  try {
    const errors: Record<string, string[]> = {};
    const fail = (key: string, message: string) => {
      (errors[key] ??= []).push(message);
    };

    const id = text(formData, "id");
    const name = text(formData, "name");
    const description = text(formData, "description") || null;
    const typeRaw = text(formData, "type");
    const targetRaw = text(formData, "target") || PromotionTarget.BILL;

    if (!name) fail("name", "Name is required");
    if (name.length > 120) fail("name", "Keep the name under 120 characters");

    const type = (Object.values(PromotionType) as string[]).includes(typeRaw) ? (typeRaw as PromotionType) : null;
    if (!type) fail("type", "Choose the kind of offer");
    let target = (Object.values(PromotionTarget) as string[]).includes(targetRaw)
      ? (targetRaw as PromotionTarget)
      : null;
    if (!target) fail("target", "Choose what the discount applies to");
    if (type === PromotionType.BUY_X_GET_Y) target = PromotionTarget.BILL;

    let percentOff: number | null = null;
    let amountOff: number | null = null;
    let buyQuantity: number | null = null;
    let getQuantity: number | null = null;
    let getPercentOff: number | null = null;

    if (type === PromotionType.PERCENT_OFF) {
      percentOff = optionalNumber(formData, "percentOff");
      if (percentOff == null || !(percentOff > 0 && percentOff <= 100)) {
        fail("percentOff", "Enter a percentage above 0 and up to 100");
      }
    } else if (type === PromotionType.FLAT_OFF) {
      amountOff = optionalNumber(formData, "amountOff");
      if (amountOff == null || !(amountOff > 0)) fail("amountOff", "Enter an amount above ₹0");
    } else if (type === PromotionType.BUY_X_GET_Y) {
      buyQuantity = optionalNumber(formData, "buyQuantity");
      getQuantity = optionalNumber(formData, "getQuantity");
      getPercentOff = optionalNumber(formData, "getPercentOff") ?? 100;
      if (buyQuantity == null || !Number.isInteger(buyQuantity) || buyQuantity < 1) {
        fail("buyQuantity", "Buy quantity must be a whole number, at least 1");
      }
      if (getQuantity == null || !Number.isInteger(getQuantity) || getQuantity < 1) {
        fail("getQuantity", "Get quantity must be a whole number, at least 1");
      }
      if (!(getPercentOff > 0 && getPercentOff <= 100)) {
        fail("getPercentOff", "Enter a percentage above 0 and up to 100 (100 = free)");
      }
    }

    // A cap on a flat ₹ amount means nothing — only kept for % and Buy X Get Y.
    const maxDiscount = type === PromotionType.FLAT_OFF ? null : optionalNumber(formData, "maxDiscount");
    if (maxDiscount != null && !(maxDiscount > 0)) fail("maxDiscount", "Maximum discount must be above ₹0");
    const minBillAmount = optionalNumber(formData, "minBillAmount");
    if (minBillAmount != null && !(minBillAmount > 0)) fail("minBillAmount", "Minimum bill must be above ₹0");

    const usageLimit = optionalNumber(formData, "usageLimit");
    if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      fail("usageLimit", "Total uses must be a whole number, at least 1");
    }
    const perCustomerLimit = optionalNumber(formData, "perCustomerLimit");
    if (perCustomerLimit != null && (!Number.isInteger(perCustomerLimit) || perCustomerLimit < 1)) {
      fail("perCustomerLimit", "Uses per customer must be a whole number, at least 1");
    }

    const validFromRaw = text(formData, "validFrom");
    const validUntilRaw = text(formData, "validUntil");
    if (validFromRaw && !DATE_RE.test(validFromRaw)) fail("validFrom", "Enter a valid date");
    if (validUntilRaw && !DATE_RE.test(validUntilRaw)) fail("validUntil", "Enter a valid date");
    const validFrom = validFromRaw && DATE_RE.test(validFromRaw) ? istDayStart(validFromRaw) : null;
    const validUntil = validUntilRaw && DATE_RE.test(validUntilRaw) ? istDayEnd(validUntilRaw) : null;
    if ((validFrom && Number.isNaN(validFrom.getTime())) || (validUntil && Number.isNaN(validUntil.getTime()))) {
      fail("validFrom", "Enter valid dates");
    } else if (validFrom && validUntil && validFrom > validUntil) {
      fail("validUntil", "The end date can't be before the start date");
    }

    const codeRaw = text(formData, "code").toUpperCase();
    const code = codeRaw || null;
    if (code && !CODE_RE.test(code)) {
      fail("code", "Use 3–30 letters, digits, - or _ (no spaces)");
    }

    const categoryIds = [...new Set(formData.getAll("categoryIds").map(String).filter(Boolean))];
    const metalTypeIds = [...new Set(formData.getAll("metalTypeIds").map(String).filter(Boolean))];

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    if (categoryIds.length) {
      const found = await prisma.storeCategory.count({ where: { storeId, id: { in: categoryIds } } });
      if (found !== categoryIds.length) {
        return { success: false, message: "A selected category isn't in this store", errors: { categoryIds: ["Pick categories from the list"] } };
      }
    }
    if (metalTypeIds.length) {
      const found = await prisma.storeMetal.count({ where: { storeId, id: { in: metalTypeIds } } });
      if (found !== metalTypeIds.length) {
        return { success: false, message: "A selected metal isn't in this store", errors: { metalTypeIds: ["Pick metals from the list"] } };
      }
    }

    if (code && (await isCodeTaken(storeId, code, id || undefined))) {
      const message = `The code ${code} is already used by another offer or voucher`;
      return { success: false, message, errors: { code: [message] } };
    }

    const data = {
      name,
      description,
      type: type!,
      target: target!,
      percentOff,
      amountOff,
      buyQuantity,
      getQuantity,
      getPercentOff,
      maxDiscount,
      minBillAmount,
      categoryIds,
      metalTypeIds,
      validFrom,
      validUntil,
      code,
      usageLimit,
      perCustomerLimit,
    };

    let savedId = id;
    if (id) {
      const { count } = await prisma.promotion.updateMany({ where: { id, storeId }, data });
      if (count === 0) return { success: false, message: "Offer not found" };
    } else {
      const created = await prisma.promotion.create({
        data: { ...data, storeId, createdById: userId ?? null },
        select: { id: true },
      });
      savedId = created.id;
    }

    revalidatePath(OFFERS_PATH);
    return { success: true, message: id ? "Offer updated" : "Offer created", id: savedId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, message: "That code is already in use", errors: { code: ["That code is already in use"] } };
    }
    logger.error("upsertPromotion failed", error);
    return { success: false, message: actionErrorMessage(error, "Failed to save the offer") };
  }
}

export async function setPromotionActive(
  id: string,
  active: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: OWNER_ONLY };
  }

  try {
    const storeId = await requireStoreScope();
    const { count } = await prisma.promotion.updateMany({ where: { id, storeId }, data: { isActive: Boolean(active) } });
    if (count === 0) return { success: false, message: "Offer not found" };
    revalidatePath(OFFERS_PATH);
    return { success: true, message: active ? "Offer is running" : "Offer paused" };
  } catch (error) {
    logger.error("setPromotionActive failed", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update the offer") };
  }
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

// No 0/O or 1/I — a code read out over the phone or off a printed card
// shouldn't be ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function voucherPrefix(promotionName: string) {
  return promotionName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function randomVoucherCode(prefix: string) {
  let body = "";
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return prefix ? `${prefix}-${body}` : body;
}

const MAX_BULK = 200;

export async function issueVouchers(
  _prev: IssueVouchersState,
  formData: FormData,
): Promise<IssueVouchersState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: OWNER_ONLY };
  }

  try {
    const promotionId = text(formData, "promotionId");
    const mode = text(formData, "mode") === "customer" ? "customer" : "bulk";
    const customerId = text(formData, "voucherCustomerId") || null;
    const note = text(formData, "note") || null;
    const expiresRaw = text(formData, "expiresAt");
    const quantity = mode === "customer" ? 1 : Number(text(formData, "quantity") || "0");

    const errors: Record<string, string[]> = {};
    if (!promotionId) errors.promotionId = ["Choose an offer"];
    if (mode === "customer" && !customerId) errors.voucherCustomerId = ["Choose the customer"];
    if (mode === "bulk" && (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BULK)) {
      errors.quantity = [`Enter how many codes to create (1–${MAX_BULK})`];
    }
    if (note && note.length > 200) errors.note = ["Keep the note under 200 characters"];
    let expiresAt: Date | null = null;
    if (expiresRaw) {
      if (!DATE_RE.test(expiresRaw)) errors.expiresAt = ["Enter a valid date"];
      else {
        expiresAt = istDayEnd(expiresRaw);
        if (Number.isNaN(expiresAt.getTime())) errors.expiresAt = ["Enter a valid date"];
        else if (expiresAt < new Date()) errors.expiresAt = ["The expiry date is already past"];
      }
    }
    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    const storeId = await requireStoreScope();

    const promotion = await prisma.promotion.findFirst({
      where: { id: promotionId, storeId },
      select: { id: true, name: true },
    });
    if (!promotion) return { success: false, message: "Offer not found" };

    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
      if (!customer) return { success: false, message: "Customer not found", errors: { voucherCustomerId: ["Customer not found"] } };
    }

    const prefix = voucherPrefix(promotion.name);
    const created: string[] = [];
    const startedAt = new Date(Date.now() - 1000);

    // Generate, drop anything already taken (either table), insert with
    // skipDuplicates (a concurrent insert of the same code just loses that
    // one), and top up whatever is still missing.
    for (let attempt = 0; attempt < 6 && created.length < quantity; attempt++) {
      const needed = quantity - created.length;
      const candidates = new Set<string>();
      while (candidates.size < needed) candidates.add(randomVoucherCode(prefix));
      const list = [...candidates].filter((code) => !created.includes(code));

      const [takenVouchers, takenOffers] = await Promise.all([
        prisma.promotionVoucher.findMany({ where: { storeId, code: { in: list } }, select: { code: true } }),
        prisma.promotion.findMany({ where: { storeId, code: { in: list } }, select: { code: true } }),
      ]);
      const taken = new Set([...takenVouchers, ...takenOffers].map((row) => row.code));
      const fresh = list.filter((code) => !taken.has(code));
      if (!fresh.length) continue;

      await prisma.promotionVoucher.createMany({
        data: fresh.map((code) => ({ storeId, promotionId: promotion.id, code, customerId, note, expiresAt })),
        skipDuplicates: true,
      });
      const mine = await prisma.promotionVoucher.findMany({
        where: { storeId, promotionId: promotion.id, code: { in: fresh }, issuedAt: { gte: startedAt } },
        select: { code: true },
      });
      created.push(...mine.map((row) => row.code));
    }

    if (!created.length) return { success: false, message: "Couldn't generate unique codes — please try again" };

    revalidatePath(OFFERS_PATH);
    const message =
      created.length < quantity
        ? `Created ${created.length} of ${quantity} vouchers — try again for the rest`
        : created.length === 1
          ? `Voucher ${created[0]} issued`
          : `${created.length} vouchers created`;
    return { success: true, message, codes: created.sort() };
  } catch (error) {
    logger.error("issueVouchers failed", error);
    return { success: false, message: actionErrorMessage(error, "Failed to issue vouchers") };
  }
}

export async function revokeVoucher(id: string): Promise<{ success: boolean; message: string }> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return { success: false, message: OWNER_ONLY };
  }

  try {
    const storeId = await requireStoreScope();
    const { count } = await prisma.promotionVoucher.deleteMany({ where: { id, storeId, usedAt: null } });
    if (count === 0) {
      const exists = await prisma.promotionVoucher.findFirst({ where: { id, storeId }, select: { id: true } });
      return {
        success: false,
        message: exists ? "This voucher has already been used — it can't be revoked" : "Voucher not found",
      };
    }
    revalidatePath(OFFERS_PATH);
    return { success: true, message: "Voucher revoked" };
  } catch (error) {
    logger.error("revokeVoucher failed", error);
    return { success: false, message: actionErrorMessage(error, "Failed to revoke the voucher") };
  }
}
