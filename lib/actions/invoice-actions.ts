// lib/actions/invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  OldGoldExcessMode,
  PaymentMethod,
  PurityType,
  ChargeType,
  Prisma,
  TransportMode,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { METALS_AND_STONES_COLUMN, describePieceComponentsText } from "@/lib/piece-components-text";
import { getWeightFormat } from "@/lib/weight-settings.server";
import { getFineWeightResolver, lineWeights, storedLineWeights } from "@/lib/fine-weight";
import { lookupPromotionCode } from "@/lib/promotions.server";
import { computePromotion, type PromotionLine } from "@/lib/promotions";
import {
  getPieceResolver,
  resolveLineStoneDetails,
  parseStoneDetails,
  pieceComponentCreates,
  serializeStoredComponents,
  type ResolvedPiece,
} from "@/lib/piece-components.server";
import type { PieceComponentPayload, StoredPieceComponent } from "@/lib/piece-components";
import { recordOldGoldExchange, resolveOldGoldLines, type OldGoldLineInput } from "@/lib/old-gold/exchange";
import { round2, splitOldGoldValue } from "@/lib/old-gold/value";
import { computeRoundOff } from "@/lib/round-off";
import { requirePermission, requirePermissionInStore } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope, resolveActingStoreId, getStoreIdForRead, assertPlanActiveForExport } from "@/lib/store-context";
import { invoiceStatusLabel } from "@/lib/status-labels";
import { actionErrorMessage } from "@/lib/action-error";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { sendMail } from "@/lib/mailer";
import { invoiceEmail } from "@/lib/email-templates";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { resolveGstRateSnapshot, type GstRateSnapshot } from "@/lib/actions/gst-rate-actions";
import { getCustomerAvailableCredit } from "@/lib/actions/payments-actions";
import { getReturnEligibility } from "@/lib/return-window";
import { amountInWords } from "@/lib/number-to-words";
import { resolveStoreName } from "@/lib/invite-email";
import { buildExcelExport, buildCsvExportBase64, buildPdfExportBase64 } from "@/lib/excel-export";
import { omitHiddenKeys, type SheetFeature } from "@/lib/sheet-features";
import { getSheetFeatures } from "@/lib/sheet-features.server";
import { OversellError } from "@/lib/inventory/oversell-error";
import {
  createStockForManualSaleLine,
  validateManualSaleLines,
  withManualStockCodeRetry,
} from "@/lib/inventory/manual-line-stock";
import { formatShortDate } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseDateRangeBoundary } from "@/lib/date-range";
import { stockOptionProductDetailsSelect, toStockOptionProductDetails } from "@/lib/inventory/stock-option-details";
import { lockedStockPieceRows, stockPieceOption } from "@/lib/inventory/stock-piece-rows";

export type InvoiceLineItemInput = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  // The real per-Metal Purity's own label — see StoreMetalPurity in
  // schema.prisma and InvoiceItem.purityLabel's own doc comment. `purity`
  // above stays populated on a best-effort basis for anything not yet
  // reading this.
  purityLabel?: string | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  rate?: number | null;
  makingCharge: number;
  makingChargeType?: ChargeType | string | null;
  stoneCharge: number;
  stoneRate?: number | null;
  stoneMetalTypeName?: string | null;
  stoneTypeNames?: string | null;
  // A single stone's pcs / clarity / certificate (resolveLineStoneDetails).
  stonePieces?: number | null;
  stoneClarity?: string | null;
  stoneCertificateNumber?: string | null;
  dmoWeight?: number | null;
  stoneWeight?: number | null;
  // Wastage / touch % (Settings > Weights; default from the purity).
  // Absent = the purity's default, null = none.
  wastagePercent?: number | null;
  hmCharge?: number;
  schemeDiscount?: number;
  // The part of schemeDiscount that is an offer / voucher (lib/promotions.ts)
  // — re-checked by resolveInvoicePromotion.
  promoDiscount?: number;
  sgstAmount?: number;
  cgstAmount?: number;
  // Charged instead of sgst+cgst on an inter-state sale — see computeGst()
  // in lib/gst.ts, the single source of truth for this split. Optional
  // (not required) purely so older-shaped payloads don't fail to parse;
  // treated as 0 when absent.
  igstAmount?: number;
  hsnCode?: string | null;
  inventoryStockId?: string | null;
  // Which configured GstRate THIS line uses — see InvoiceItem.gstRateId's
  // own doc comment in schema.prisma. Optional so an older-shaped payload
  // (or a caller like quick-sale-actions.ts that never sets a per-line
  // rate) still parses; resolved into a snapshot the same way Invoice's own
  // (legacy) gstRateId is, just per-distinct-id rather than once per
  // document — see resolvePerLineGstRateSnapshots below.
  gstRateId?: string | null;
  // Only read for a "Create New Line Item" line (no inventoryStockId) —
  // the Product minted for it on save gets these, same as Add Product.
  // See validateManualSaleLines in lib/inventory/manual-line-stock.ts.
  categoryId?: string | null;
  categoryTypeId?: string | null;
  targetStyleId?: string | null;
  // "Purchased From" party for that line's minted stock — see
  // ManualSaleLine.vendorId.
  vendorId?: string | null;
  // A piece made of several metals/stones — its rows (lib/piece-components.ts).
  multiPart?: boolean | null;
  components?: PieceComponentPayload[] | null;
  // Server-only: the resolved rows (resolvePieceLines), never from the client.
  piece?: ResolvedPiece;
};

export type InvoiceFormState = {
  success: boolean;
  message: string;
  invoiceId?: string;
};

const initialState: InvoiceFormState = { success: false, message: "" };

export type PaymentEntryInput = {
  method: string;
  amount: number;
  reference?: string | null;
  bankName?: string | null;
  attachmentUrl?: string | null;
};

/**
 * 0-2 payment-method rows, each with a real positive amount — zero rows is
 * valid (a fully-on-credit createInvoice, or a recordInvoicePayment covered
 * entirely by applied store credit; see each caller's own creditApplied
 * handling), a row with a zero/blank amount is not (the caller is expected
 * to drop those before building paymentsJson, same as invoice-form.tsx's
 * and record-payment-dialog.tsx's own `.filter((row) => row.amount > 0)`).
 */
function parseOptionalPayments(raw: string): PaymentEntryInput[] | null {
  let payments: PaymentEntryInput[];
  try {
    payments = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(payments) || payments.length > 2) {
    return null;
  }

  for (const payment of payments) {
    if (!Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
      return null;
    }
    if (!(Number(payment.amount) > 0)) {
      return null;
    }
  }

  return payments;
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

/**
 * Resolves each line's own gstRateId into a verified snapshot — GST is
 * picked per line now, not once for the whole document (see
 * InvoiceItem.gstRateId's doc comment in schema.prisma), but a single
 * invoice commonly has far fewer DISTINCT rates in use than it has lines
 * (e.g. two lines both on the store's one 3% metal rate). Deduping first
 * means at most one `resolveGstRateSnapshot` DB call per distinct id
 * actually used, not one per line item. Must run to completion BEFORE the
 * `prisma.$transaction` callback that builds the nested `items.create`
 * array — that array has to be plain, already-resolved objects, not
 * promises, so this can't be inlined inside the `items.map(...)` below it.
 */
async function resolvePerLineGstRateSnapshots(
  storeId: string,
  items: InvoiceLineItemInput[],
): Promise<Map<string, GstRateSnapshot>> {
  const distinctIds = [
    ...new Set(items.map((item) => item.gstRateId).filter((id): id is string => !!id)),
  ];
  const snapshots = await Promise.all(
    distinctIds.map((id) => resolveGstRateSnapshot(storeId, id)),
  );
  const map = new Map<string, GstRateSnapshot>();
  distinctIds.forEach((id, index) => {
    const snapshot = snapshots[index];
    if (snapshot) map.set(id, snapshot);
  });
  return map;
}

/** A voucher redeemed by another bill between the check and the save. */
class PromotionVoucherUsedError extends Error {
  constructor() {
    super("This voucher was just used on another bill.");
  }
}

/**
 * Diamond items price per carat, not per gram — every other purity still
 * prices off netWeight. Net Weight/Carat Weight is a per-piece figure (see
 * Product.defaultNetWeight and product-form.tsx's own "prefill" comment),
 * so the actual priced quantity is that per-piece weight times how many
 * pieces (item.quantity) — this used to ignore quantity entirely, pricing
 * every line as if exactly one piece were being bought no matter what
 * Quantity said. Duplicated per action file (same convention as the
 * generateXNumber helpers in this codebase) rather than a shared import.
 */
function lineQuantity(item: {
  purity?: PurityType | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  quantity?: number | null;
}) {
  const perPiece = item.purity === PurityType.DIAMOND ? toNumber(item.caratWeight) : toNumber(item.netWeight);
  return perPiece * (toNumber(item.quantity, 1) || 1);
}

/** Metal value of a line — row by row for a multi-part piece. */
function lineMetalValue(item: InvoiceLineItemInput) {
  return item.piece
    ? item.piece.metalValue * (toNumber(item.quantity, 1) || 1)
    : toNumber(item.rate) * lineQuantity(item);
}

/**
 * Multi-part lines ("Made of more than one metal or stone?"): validates and
 * values each piece's rows (lib/piece-components.server.ts) and folds the
 * result into the line's own summary fields — first metal, combined net
 * weight, stones' value as the line's stoneCharge (× quantity, the line-
 * level convention) and no single rate. A stock piece's metals and stones
 * come from its own stored rows; only rates and GST come from the client.
 */
async function resolvePieceLines(
  storeId: string,
  items: InvoiceLineItemInput[],
): Promise<{ error: string } | InvoiceLineItemInput[]> {
  const resolved = await resolvePieceRows(storeId, items);
  if ("error" in resolved) return resolved;
  const out: InvoiceLineItemInput[] = [];
  for (const item of resolved) {
    const next = resolveLineStoneDetails(item, Boolean(item.piece));
    if ("error" in next) return next;
    out.push(next);
  }
  return out;
}

async function resolvePieceRows(
  storeId: string,
  items: InvoiceLineItemInput[],
): Promise<{ error: string } | InvoiceLineItemInput[]> {
  const isPiece = (item: InvoiceLineItemInput) => Boolean(item.multiPart && item.components?.length);
  if (!items.some(isPiece)) return items.map((item) => ({ ...item, piece: undefined }));

  const resolvePiece = await getPieceResolver(storeId, { valuation: "net" });
  const linkedIds = items.filter((item) => isPiece(item) && item.inventoryStockId).map((item) => item.inventoryStockId as string);
  // A linked piece's rows: its own, else its multi-metal/multi-stone
  // Product's (lib/inventory/stock-piece-rows.ts) — physical facts locked.
  const storedByStock = await lockedStockPieceRows(storeId, linkedIds);

  const out: InvoiceLineItemInput[] = [];
  for (const item of items) {
    if (!isPiece(item)) {
      out.push({ ...item, multiPart: false, components: null, piece: undefined });
      continue;
    }
    let rows = item.components as PieceComponentPayload[];
    if (item.inventoryStockId) {
      const own = storedByStock.get(item.inventoryStockId) ?? [];
      if (!own.length) {
        out.push({ ...item, multiPart: false, components: null, piece: undefined });
        continue;
      }
      rows = own.map((row, index) => {
        const sent = rows[index];
        return {
          kind: row.kind,
          metalTypeId: row.metalTypeId,
          purityLabel: row.purityLabel,
          purity: row.purity,
          grossWeight: row.grossWeight,
          netWeight: row.netWeight,
          // Wastage stays editable on a stock piece's row (the form's value).
          wastagePercent: sent && sent.wastagePercent !== undefined ? sent.wastagePercent : row.wastagePercent ?? undefined,
          stoneMetalTypeName: row.stoneMetalTypeName,
          stoneTypeNames: row.stoneTypeNames,
          caratWeight: row.caratWeight,
          stoneWeight: row.stoneWeight,
          // The piece's own count / clarity / certificate win; the form may
          // fill one the stock never recorded.
          pieces: row.pieces ?? sent?.pieces ?? null,
          clarity: row.clarity ?? sent?.clarity ?? null,
          certificateNumber: row.certificateNumber ?? sent?.certificateNumber ?? null,
          rate: sent?.rate ?? null,
          amount: row.kind === "STONE" ? sent?.amount ?? null : null,
          gstRateId: sent?.gstRateId ?? row.gstRateId,
        };
      });
    }
    const label = `"${item.itemName || "a line item"}"`;
    if (!rows.some((row) => row.kind === "METAL")) {
      return { error: `${label} needs at least one metal — sell loose stones as their own line.` };
    }
    const piece = resolvePiece(rows, label);
    if ("error" in piece) return piece;
    if (!(piece.metalValue + piece.stoneValue > 0)) {
      return { error: `Enter the rates for the metals and stones of ${label}.` };
    }
    const quantity = toNumber(item.quantity, 1) || 1;
    const summary = piece.summary;
    out.push({
      ...item,
      piece,
      metalTypeId: summary.metalTypeId,
      purity: summary.purity,
      purityLabel: summary.purityLabel,
      grossWeight: summary.grossWeight,
      netWeight: summary.netWeight,
      caratWeight: summary.caratWeight,
      stoneWeight: summary.stoneWeight,
      stoneCharge: Math.round(piece.stoneValue * quantity * 100) / 100,
      stoneRate: null,
      stoneMetalTypeName: summary.stoneMetalTypeName,
      stoneTypeNames: summary.stoneTypeNames,
      rate: null,
    });
  }
  return out;
}

/**
 * Offer / gift voucher typed on New Invoice: re-checks the code for this
 * store and party (lib/promotions.server.ts) and recomputes each line's share
 * with the same engine the form previews (lib/promotions.ts), from the
 * line's value before the offer. Refuses the save if the form's figures no
 * longer match (e.g. the offer was edited meanwhile) rather than silently
 * charging something else.
 */
async function resolveInvoicePromotion(
  storeId: string,
  customerId: string,
  items: InvoiceLineItemInput[],
  rawCode: string,
): Promise<{ error: string } | { promotionId: string; voucherId: string | null; code: string; total: number } | null> {
  if (!rawCode.trim()) {
    if (items.some((item) => toNumber(item.promoDiscount) > 0)) {
      return { error: "The offer was removed — re-apply it or clear its discount." };
    }
    return null;
  }
  const found = await lookupPromotionCode(storeId, rawCode, customerId);
  if (!found.ok) return { error: found.reason };

  const stockIds = items.flatMap((item) => (item.inventoryStockId ? [item.inventoryStockId] : []));
  const stocks = stockIds.length
    ? await prisma.inventoryStock.findMany({
        where: { storeId, id: { in: stockIds } },
        select: { id: true, product: { select: { categoryId: true } } },
      })
    : [];
  const categoryOfStock = new Map(stocks.map((stock) => [stock.id, stock.product.categoryId]));
  const keyOf = (index: number) => `line-${index}`;
  const lines: PromotionLine[] = items.map((item, index) => ({
    key: keyOf(index),
    categoryId: (item.inventoryStockId ? categoryOfStock.get(item.inventoryStockId) : item.categoryId) ?? null,
    metalTypeIds: item.piece
      ? item.piece.components.flatMap((row) => (row.kind === "METAL" && row.metalTypeId ? [row.metalTypeId] : []))
      : item.metalTypeId
        ? [item.metalTypeId]
        : [],
    quantity: toNumber(item.quantity, 1) || 1,
    value:
      Math.round(
        (lineMetalValue(item) +
          toNumber(item.makingCharge) +
          toNumber(item.hmCharge) +
          toNumber(item.stoneCharge) -
          (toNumber(item.schemeDiscount) - toNumber(item.promoDiscount))) *
          100,
      ) / 100,
    making: toNumber(item.makingCharge) + toNumber(item.hmCharge),
  }));
  const result = computePromotion(found.promotion, lines);
  if (!result.ok) return { error: result.reason };
  const mismatch = items.some(
    (item, index) => Math.abs((result.perLine[keyOf(index)] ?? 0) - toNumber(item.promoDiscount)) > 0.05,
  );
  if (mismatch) return { error: "The offer's discount has changed — remove it and apply the code again." };
  return { promotionId: found.promotion.id, voucherId: found.voucherId, code: found.code, total: result.total };
}

function lineTotal(item: InvoiceLineItemInput) {
  const metalValue = lineMetalValue(item);
  return (
    metalValue +
    toNumber(item.makingCharge) +
    toNumber(item.hmCharge) +
    toNumber(item.stoneCharge) -
    toNumber(item.schemeDiscount) +
    toNumber(item.sgstAmount) +
    toNumber(item.cgstAmount) +
    toNumber(item.igstAmount)
  );
}

/**
 * A disabled input on invoice-form.tsx (and Kacha Invoice/Quotation, which
 * share the same "linked line locks to the master record" pattern) is a UI
 * courtesy, not enforcement — a direct/tampered POST can still submit
 * anything for a field the UI locks once a real stock item is picked. This
 * overwrites every physical field (item name, metal/purity, weights,
 * embedded stone, HSN) with that InventoryStock row's own saved values
 * before they ever reach the DB, for every line that explicitly linked one.
 * Unlike Purchase's lockLinkedProductFields, a line with no
 * `inventoryStockId` at all is always a genuinely manual entry here — there
 * is no placeholder-product substitution step to worry about racing against,
 * so `explicitStockIds` can be captured straight off `items` with no
 * ordering trap. A stock id that doesn't resolve (wrong store, deleted,
 * tampered) is left unmatched here — createInvoice/updateInvoice then
 * reject the save rather than this function guessing at a fallback.
 * Mirrors invoice-form.tsx's own applyStockToItem field-for-field.
 */
async function lockLinkedStockFields(
  storeId: string,
  items: InvoiceLineItemInput[],
  explicitStockIds: ReadonlySet<string>,
): Promise<InvoiceLineItemInput[]> {
  if (explicitStockIds.size === 0) return items;

  const stocks = await prisma.inventoryStock.findMany({
    where: { id: { in: [...explicitStockIds] }, storeId },
    select: {
      id: true,
      metalTypeId: true,
      purity: true,
      purityLabel: true,
      grossWeight: true,
      netWeight: true,
      caratWeight: true,
      stoneWeight: true,
      stoneMetalTypeName: true,
      stoneTypeNames: true,
      product: { select: { name: true, hsnCode: true } },
    },
  });
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));

  return items.map((item) => {
    if (!item.inventoryStockId) return item;
    const stock = stockById.get(item.inventoryStockId);
    if (!stock) return item;

    return {
      ...item,
      itemName: stock.product.name,
      metalTypeId: stock.metalTypeId,
      purity: stock.purity,
      purityLabel: stock.purityLabel,
      grossWeight: stock.grossWeight !== null ? Number(stock.grossWeight) : null,
      netWeight: stock.netWeight !== null ? Number(stock.netWeight) : null,
      caratWeight: stock.caratWeight !== null ? Number(stock.caratWeight) : null,
      stoneWeight: stock.stoneWeight !== null ? Number(stock.stoneWeight) : null,
      stoneMetalTypeName: stock.stoneMetalTypeName,
      stoneTypeNames: stock.stoneTypeNames,
      hsnCode: stock.product.hsnCode,
    };
  });
}

/**
 * `{prefix}-{YYYYMMDD}-{padded sequence}`, e.g. `MJJ-20260904-0001` — unlike
 * the old `{prefix}-{year}-{padded count}` shape, the full date is encoded
 * directly into the number so it's readable at a glance without opening the
 * invoice (same reasoning as the support ticket number's own date/time
 * encoding — see generateTicketNumber in support-ticket-actions.ts). The
 * sequence resets daily rather than yearly to match: `invoiceStartingNo`
 * still seeds the first number of each day, same as it always seeded the
 * first number of each year before.
 */
async function generateInvoiceNumber(storeId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });
  const prefix = settings?.invoicePrefix?.trim() || "INV";
  const startingNo = settings?.invoiceStartingNo ?? 1;
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  // The trailing sequence number counts every invoice this store has ever
  // raised (matched on the bare prefix, e.g. "GJ-"), not just today's — it
  // used to be scoped to today's own datePart, which reset it to
  // startingNo again at the start of every calendar day (GJ-20260922-0101
  // followed the next morning by GJ-20260923-0001), even though it reads
  // as one running invoice count. The date segment still always reflects
  // today, so the number changes shape day to day, but the number itself
  // now only ever goes up.
  const count = await prisma.invoice.count({
    where: {
      storeId,
      invoiceNumber: { startsWith: `${prefix}-` },
    },
  });

  return `${prefix}-${datePart}-${String(count + startingNo).padStart(4, "0")}`;
}

/**
 * One line item as the UI sees it. `mapInvoice` takes `any`, so without
 * naming this the mapped items came out as `any[]` and every consumer's
 * `.map(item => ...)` callback was an implicit any.
 */
export type InvoiceItemView = {
  id: string;
  itemName: string;
  metalTypeId: string | null;
  purity: PurityType | null;
  purityLabel: string | null;
  quantity: number;
  grossWeight: number | null;
  netWeight: number | null;
  caratWeight: number | null;
  rate: number | null;
  makingCharge: number;
  makingChargeType: ChargeType;
  stoneCharge: number;
  stoneRate: number | null;
  stoneMetalTypeName: string | null;
  stoneTypeNames: string | null;
  stonePieces: number | null;
  stoneClarity: string | null;
  stoneCertificateNumber: string | null;
  dmoWeight: number | null;
  wastagePercent: number | null;
  stoneWeight: number | null;
  hmCharge: number;
  schemeDiscount: number;
  sgstAmount: number;
  cgstAmount: number;
  igstAmount: number;
  gstRateId: string | null;
  gstRateName: string | null;
  gstRatePercent: number | null;
  hsnCode: string | null;
  lineTotal: number;
  inventoryStockId: string | null;
  /** A piece of several metals/stones — its rows (lib/piece-components.ts). */
  components: StoredPieceComponent[];
};

function mapInvoice(invoice: any) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status as InvoiceStatus,
    subtotal: Number(invoice.subtotal),
    makingCharges: Number(invoice.makingCharges),
    stoneCharges: Number(invoice.stoneCharges),
    discount: Number(invoice.discount),
    // Offer / gift voucher redeemed on this bill (part of `discount`).
    promotionCode: invoice.promotionCode ?? null,
    promotionDiscount: Number(invoice.promotionDiscount ?? 0),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    roundOffAmount: Number(invoice.roundOffAmount ?? 0),
    paidAmount: Number(invoice.paidAmount),
    balanceAmount: Number(invoice.balanceAmount),
    notes: invoice.notes,
    locationId: invoice.locationId ?? null,
    locationName: invoice.location?.name ?? null,
    gstRateId: invoice.gstRateId ?? null,
    gstRateName: invoice.gstRateName ?? null,
    gstRatePercent: invoice.gstRatePercent != null ? Number(invoice.gstRatePercent) : null,
    ewayBillNumber: invoice.ewayBillNumber ?? null,
    ewayBillDate: invoice.ewayBillDate?.toISOString() ?? null,
    transporterName: invoice.transporterName ?? null,
    vehicleNumber: invoice.vehicleNumber ?? null,
    transportMode: (invoice.transportMode ?? null) as TransportMode | null,
    distanceKm: invoice.distanceKm ?? null,
    irnNumber: invoice.irnNumber ?? null,
    ackNumber: invoice.ackNumber ?? null,
    ackDate: invoice.ackDate?.toISOString() ?? null,
    deliveryState: invoice.deliveryState ?? null,
    deliveryStateCode: invoice.deliveryStateCode ?? null,
    createdByName: invoice.createdByName ?? invoice.createdBy?.name ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelledByName: invoice.cancelledByName ?? invoice.cancelledBy?.name ?? null,
    cancellationReason: invoice.cancellationReason ?? null,
    replaces: invoice.replaces
      ? { id: invoice.replaces.id, invoiceNumber: invoice.replaces.invoiceNumber }
      : null,
    replacedBy: invoice.replacedBy
      ? { id: invoice.replacedBy.id, invoiceNumber: invoice.replacedBy.invoiceNumber }
      : null,
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
          gstin: invoice.customer.gstin ?? null,
          panNumber: invoice.customer.panNumber ?? null,
          registrationId: invoice.customer.registrationId ?? null,
          addressLine1: invoice.customer.addressLine1 ?? null,
          addressLine2: invoice.customer.addressLine2 ?? null,
          city: invoice.customer.city ?? null,
          state: invoice.customer.state ?? null,
          pincode: invoice.customer.pincode ?? null,
        }
      : null,
    // Cast the array, not just the callback: `.map()` on an `any` returns
    // `any` whatever the callback is annotated to produce, so without this
    // the typed item shape never reaches consumers.
    items: ((invoice.items ?? []) as any[]).map((item): InvoiceItemView => ({
      id: item.id,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
      purityLabel: item.purityLabel ?? null,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      caratWeight: item.caratWeight ? Number(item.caratWeight) : null,
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      makingChargeType: item.makingChargeType as ChargeType,
      stoneCharge: Number(item.stoneCharge),
      stoneRate: item.stoneRate ? Number(item.stoneRate) : null,
      stoneMetalTypeName: item.stoneMetalTypeName ?? null,
      stoneTypeNames: item.stoneTypeNames ?? null,
      stonePieces: item.stonePieces ?? null,
      stoneClarity: item.stoneClarity ?? null,
      stoneCertificateNumber: item.stoneCertificateNumber ?? null,
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
      wastagePercent: item.wastagePercent != null ? Number(item.wastagePercent) : null,
      stoneWeight: item.stoneWeight ? Number(item.stoneWeight) : null,
      hmCharge: Number(item.hmCharge ?? 0),
      schemeDiscount: Number(item.schemeDiscount ?? 0),
      sgstAmount: Number(item.sgstAmount ?? 0),
      cgstAmount: Number(item.cgstAmount ?? 0),
      igstAmount: Number(item.igstAmount ?? 0),
      gstRateId: item.gstRateId ?? null,
      gstRateName: item.gstRateName ?? null,
      gstRatePercent: item.gstRatePercent ? Number(item.gstRatePercent) : null,
      hsnCode: item.hsnCode ?? null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
      components: item.components ? serializeStoredComponents(item.components) : [],
    })),
    convertedFromKacha: invoice.convertedFromKacha
      ? {
          id: invoice.convertedFromKacha.id,
          slipNumber: invoice.convertedFromKacha.slipNumber,
        }
      : null,
    // The per-payment breakdown behind the Paid/Balance totals — every real
    // cash payment (PAYMENT_IN) plus any store credit drawn down against
    // this invoice (CREDIT_APPLIED), since both actually reduce the
    // balance; createInvoice/recordInvoicePayment's own DEBIT/SALE
    // balance-due accrual row is excluded, same reasoning as
    // Purchase.payments filtering out its CREDIT/PURCHASE row.
    payments: ((invoice.ledgerEntries ?? []) as any[])
      .filter(
        (entry) =>
          entry.sourceType === LedgerSourceType.PAYMENT_IN ||
          entry.sourceType === LedgerSourceType.CREDIT_APPLIED,
      )
      .map((entry) => ({
        id: entry.id,
        entryDate: entry.entryDate.toISOString(),
        amount: Number(entry.amount),
        paymentMethod: entry.paymentMethod as PaymentMethod | null,
        paymentReference: entry.paymentReference as string | null,
        bankName: entry.bankName as string | null,
        isCreditApplied: entry.sourceType === LedgerSourceType.CREDIT_APPLIED,
      })),
  };
}

export type InvoiceSortField = "invoiceDate" | "invoiceNumber" | "totalAmount";

const INVOICE_SORT_FIELDS: InvoiceSortField[] = ["invoiceDate", "invoiceNumber", "totalAmount"];

function isInvoiceSortField(value: unknown): value is InvoiceSortField {
  return INVOICE_SORT_FIELDS.includes(value as InvoiceSortField);
}

export type GetInvoicesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: InvoiceSortField | string;
  sortOrder?: "asc" | "desc";
  /** "YYYY-MM-DD", inclusive on both ends — filters on invoiceDate. */
  dateFrom?: string;
  dateTo?: string;
};

type InvoiceQueryParams = {
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: InvoiceSortField | string;
  sortOrder?: "asc" | "desc" | string;
  selectedIds?: string[];
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Shared where/orderBy builder for the invoice list and the export action,
 * so the two never drift apart on what "the filtered set" means.
 */
function buildInvoiceQuery(params: InvoiceQueryParams, storeId: string, scope: LocationScope) {
  const search = String(params.search || "").trim();
  const status =
    params.status && params.status !== "ALL" && params.status in InvoiceStatus
      ? (params.status as InvoiceStatus)
      : undefined;
  const sortBy = isInvoiceSortField(params.sortBy) ? params.sortBy : "invoiceDate";
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc";
  const selectedIds = params.selectedIds?.filter(Boolean) ?? [];
  const dateFrom = parseDateRangeBoundary(params.dateFrom, false);
  const dateTo = parseDateRangeBoundary(params.dateTo, true);

  const where = {
    storeId,
    ...locationWhere(scope),
    ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? { invoiceDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy = { [sortBy]: sortOrder } as const;

  return { where, orderBy };
}

export async function getInvoices(params: GetInvoicesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));

  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const { where, orderBy } = buildInvoiceQuery(params, storeId, scope);

  const [totalCount, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        convertedFromKacha: { select: { id: true, slipNumber: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    invoices: invoices.map(mapInvoice),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

export type ExportInvoicesParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  format?: "csv" | "xlsx" | "pdf";
};

export type ExportInvoicesResult = {
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
};

/** Invoice export columns that hang off a store feature (lib/sheet-features.ts). */
const INVOICE_EXPORT_GATED_COLUMNS: Record<string, SheetFeature> = {
  Location: "locations",
  "E-way Bill No.": "ewayBill",
  IRN: "eInvoice",
};

/** Exports the same filtered/sorted set the Invoices list is currently showing. */
export async function exportInvoicesToExcel(
  params: ExportInvoicesParams = {},
): Promise<ExportInvoicesResult> {
  try {
    const storeId = await requireStoreScope();
    const wf = await getWeightFormat(storeId);
    await assertPlanActiveForExport(storeId);
    const scope = await getLocationScope();
    const { where, orderBy } = buildInvoiceQuery(params, storeId, scope);

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy,
      include: {
        items: { include: { components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } } } },
        customer: { select: { id: true, name: true, phone: true } },
        convertedFromKacha: { select: { id: true, slipNumber: true } },
        location: { select: { name: true } },
        oldGoldExchange: { select: { totalAmount: true } },
      },
    });

    if (!invoices.length) {
      return { success: false, message: "No invoices found to export." };
    }

    const money = (value: number) => Math.round(value * 100) / 100;

    // Columns of a feature the store has switched off (or a master it has
    // none of) are left out — the invoices' saved values aren't touched.
    const rows = omitHiddenKeys(invoices.map(mapInvoice).map((invoice, index) => {
      const raw = invoices[index];
      const sumItems = (field: "cgstAmount" | "sgstAmount" | "igstAmount") =>
        money(raw.items.reduce((sum, item) => sum + Number(item[field] ?? 0), 0));
      // Every rate charged on the bill — lines, and each row of a multi-part piece.
      const rates = [
        ...new Set(
          raw.items
            .flatMap((item) => [item.gstRatePercent, ...item.components.map((c) => c.gstRatePercent)])
            .filter((rate): rate is NonNullable<typeof rate> => rate != null)
            .map((rate) => Number(rate))
            .concat(raw.items.length ? [] : invoice.gstRatePercent != null ? [invoice.gstRatePercent] : []),
        ),
      ].sort((a, b) => a - b);

      return {
        "Sr. No.": index + 1,
        "Invoice #": invoice.invoiceNumber,
        Date: formatShortDate(invoice.invoiceDate),
        Party: invoice.customer?.name || "",
        Status: invoiceStatusLabel(invoice.status),
        Location: raw.location?.name ?? "",
        Subtotal: invoice.subtotal,
        "Making Charges": invoice.makingCharges,
        "Stone Charges": invoice.stoneCharges,
        Discount: invoice.discount,
        "Offer / Voucher Code": invoice.promotionCode ?? "",
        "Offer / Voucher Discount": invoice.promotionDiscount,
        "GST Rate(s) %": rates.join(", "),
        CGST: sumItems("cgstAmount"),
        SGST: sumItems("sgstAmount"),
        IGST: sumItems("igstAmount"),
        Tax: invoice.taxAmount,
        "Round Off": invoice.roundOffAmount,
        Total: invoice.totalAmount,
        "Old Gold Exchange Value": raw.oldGoldExchange ? Number(raw.oldGoldExchange.totalAmount) : "",
        Paid: invoice.paidAmount,
        Balance: invoice.balanceAmount,
        "E-way Bill No.": invoice.ewayBillNumber ?? "",
        IRN: invoice.irnNumber ?? "",
        // A piece of several metals/stones — its rows, per line.
        [METALS_AND_STONES_COLUMN]: raw.items
          .filter((item) => item.components.length)
          .map((item) => `${item.itemName}: ${describePieceComponentsText(item.components, wf)}`)
          .join(" | "),
      };
    }), INVOICE_EXPORT_GATED_COLUMNS, await getSheetFeatures(storeId));

    // The PDF is a printed summary — a page can't hold every column.
    const PDF_COLUMNS = ["Sr. No.", "Invoice #", "Date", "Party", "Status", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance"] as const;
    const pdfRows = () =>
      rows.map((row) => Object.fromEntries(PDF_COLUMNS.map((column) => [column, row[column]])));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "invoices")
        : params.format === "pdf"
          ? buildPdfExportBase64(pdfRows(), "Invoices", "invoices")
          : buildExcelExport(rows, "Invoices", "invoices");

    return { success: true, message: "Invoices exported successfully.", fileName, fileBase64 };
  } catch (error) {
    logger.error("exportInvoicesToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export invoices.") };
  }
}

export async function getInvoiceById(id: string) {
  const storeId = await getStoreIdForRead();

  const invoice = await prisma.invoice.findFirst({
    where: { id, storeId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          panNumber: true,
          registrationId: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
      createdBy: { select: { name: true, email: true } },
      cancelledBy: { select: { name: true, email: true } },
      items: {
        include: {
          components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } },
        },
      },
      ledgerEntries: { orderBy: { entryDate: "desc" } },
      convertedFromKacha: { select: { id: true, slipNumber: true } },
      replaces: { select: { id: true, invoiceNumber: true } },
      replacedBy: { select: { id: true, invoiceNumber: true } },
      location: { select: { name: true } },
    },
  });

  if (!invoice) return null;
  const mapped = mapInvoice(invoice);

  // Generated fresh every load, same as the stock QR (no stored column) —
  // just scans straight to this invoice's own detail page. Folded in here
  // (rather than left as inline page code) so every caller of
  // getInvoiceById gets it for free, including a client-fetched detail
  // panel that has no server-only env var access of its own.
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(`${baseUrl}/billing/${mapped.id}`);

  return { ...mapped, qrDataUrl };
}

export type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoiceById>>>;

export type CustomerSaleInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  balanceAmount: number;
};

export type CustomerReturnableInvoices = {
  /** Any non-cancelled sale invoice at all — gates whether Refund/Replace
   * show up on the customer's ledger at all, regardless of whether one
   * currently qualifies for either specific action below. */
  hasAnyInvoice: boolean;
  /** Eligible for Return Items (ReturnItemsDialog) — same rule as the
   * invoice detail page's own isReturnable && returnEligibility.eligible. */
  refundable: CustomerSaleInvoiceOption[];
  /** Eligible for Return & Exchange (CancelInvoiceDialog) — same rule as
   * the invoice detail page's own isCancellable. */
  replaceable: CustomerSaleInvoiceOption[];
};

/**
 * Feeds the customer ledger's Refund/Replace invoice pickers — same
 * eligibility rules the invoice detail page already uses to decide whether
 * to show its own "Return Items" / "Return & Exchange" actions, just
 * evaluated across every one of this customer's invoices at once instead
 * of the one currently open.
 */
export async function getCustomerReturnableInvoices(
  customerId: string,
): Promise<CustomerReturnableInvoices> {
  const storeId = await getStoreIdForRead();

  const [invoices, settings] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId, storeId, status: { not: InvoiceStatus.CANCELLED } },
      orderBy: { invoiceDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        balanceAmount: true,
        status: true,
      },
    }),
    getBusinessSettings(),
  ]);

  const toOption = (invoice: (typeof invoices)[number]): CustomerSaleInvoiceOption => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatShortDate(invoice.invoiceDate),
    totalAmount: Number(invoice.totalAmount),
    balanceAmount: Number(invoice.balanceAmount),
  });

  const refundable =
    settings.returnWindowEnabled && settings.returnWindowDays > 0
      ? invoices
          .filter(
            (invoice) =>
              (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIAL) &&
              getReturnEligibility(invoice.invoiceDate, settings.returnWindowDays).eligible,
          )
          .map(toOption)
      : [];

  const replaceable = invoices
    .filter(
      (invoice) => invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.PARTIAL,
    )
    .map(toOption);

  return { hasAnyInvoice: invoices.length > 0, refundable, replaceable };
}

/** Lightweight customer list for the invoice form's customer picker. */
export async function getInvoiceFormCustomers() {
  const storeId = await requireStoreScope();

  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    // `state` rides along so the form can tell an inter-state sale from an
    // intra-state one (computeGst's isInterState) without a second round trip.
    select: { id: true, name: true, phone: true, customerCode: true, state: true },
  });

  return customers;
}

/** In-stock items available to attach to an invoice line item. */
/**
 * `includeInvoiceId` is for the edit page: a line already linked to a
 * stock row that this same invoice sold out to zero (flipped SOLD) would
 * otherwise be invisible here — IN_STOCK-only — even though editing will
 * restore it first. Included rows get their quantity boosted by exactly
 * what this invoice's own items already claim of them, so the picker
 * shows "available to re-select" as if that restoration had already
 * happened, matching what updateInvoice's full-edit path actually does.
 */
export async function getInvoiceFormStockItems(includeInvoiceId?: string) {
  const storeId = await requireStoreScope();

  const stockItems = await prisma.inventoryStock.findMany({
    // Stock has no Active/Inactive concept of its own (that belongs to
    // Product) — availability here is purely quantity-driven: a piece with
    // nothing left to sell shouldn't appear in the picker regardless of
    // what its status field says.
    where: { storeId, status: InventoryStockStatus.IN_STOCK, quantity: { gt: 0 } },
    orderBy: { stockCode: "asc" },
    include: {
      product: {
        select: {
          name: true,
          hsnCode: true,
          productCode: true,
          // The real per-Metal Purity / per-Stone-Type configured Selling
          // Price this piece's product is actually linked to — the new
          // source of truth for the Rate auto-fill below, replacing the
          // legacy global-PurityType MetalSellingRate lookup. See
          // resolveStockSellingRate (lib/purity.ts).
          storeMetalPurityId: true,
          stoneOriginOptionId: true,
          stoneOriginOption: { select: { sellingPrice: true } },
          // Category/Type/Style, Purity, GST Rate, Making Charge — see
          // lib/inventory/stock-option-details.ts.
          ...stockOptionProductDetailsSelect,
        },
      },
      metalType: { select: { id: true, name: true } },
      components: true,
    },
  });

  const mapped = stockItems.map((stock) => ({
    id: stock.id,
    stockCode: stock.stockCode,
    productName: stock.product.name,
    productCode: stock.product.productCode,
    hsnCode: stock.product.hsnCode,
    metalType: stock.metalType
      ? { id: stock.metalType.id, name: stock.metalType.name }
      : null,
    purity: stock.purity,
    purityLabel: stock.purityLabel,
    grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
    netWeight: stock.netWeight ? Number(stock.netWeight) : null,
    stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
    caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
    stoneRate: stock.stoneRate ? Number(stock.stoneRate) : null,
    stoneMetalTypeName: stock.stoneMetalTypeName ?? null,
    stoneTypeNames: stock.stoneTypeNames ?? null,
    saleRate: stock.saleRate ? Number(stock.saleRate) : null,
    // See resolveStockSellingRate's own doc comment — exactly one of these
    // two is ever non-null for a given product (mutually exclusive by
    // StoreMetal.isGemstone).
    storeMetalPurityRate:
      stock.product.storeMetalPurity?.sellingPrice != null
        ? Number(stock.product.storeMetalPurity.sellingPrice)
        : null,
    stoneOriginRate:
      stock.product.stoneOriginOption?.sellingPrice != null
        ? Number(stock.product.stoneOriginOption.sellingPrice)
        : null,
    // Recorded at stock-creation time (Add Stock's own Making Charge
    // field) but never carried into the Sale form until now — a piece's
    // line item always started at 0/FIXED regardless of what was set
    // when the stock was added, silently discarding it.
    makingCharge: stock.makingCharge ? Number(stock.makingCharge) : null,
    makingChargeType: stock.makingChargeType,
    quantity: stock.quantity,
    ...toStockOptionProductDetails(stock.product),
    // A piece made of several metals/stones — its own rows, else its
    // Product's (lib/inventory/stock-piece-rows.ts) — plus a single stone's
    // pieces / clarity / certificate / catalog rate.
    ...stockPieceOption(stock),
  }));

  if (!includeInvoiceId) return mapped;

  const currentItems = await prisma.invoiceItem.findMany({
    where: { invoiceId: includeInvoiceId, inventoryStockId: { not: null } },
    select: { inventoryStockId: true, quantity: true },
  });
  const claimedByThisInvoice = new Map<string, number>();
  for (const item of currentItems) {
    if (!item.inventoryStockId) continue;
    claimedByThisInvoice.set(
      item.inventoryStockId,
      (claimedByThisInvoice.get(item.inventoryStockId) ?? 0) + Math.max(1, item.quantity || 1),
    );
  }
  if (claimedByThisInvoice.size === 0) return mapped;

  const byId = new Map(mapped.map((stock) => [stock.id, stock]));
  for (const [stockId, claimed] of claimedByThisInvoice) {
    const existing = byId.get(stockId);
    if (existing) {
      existing.quantity += claimed;
      continue;
    }
    // Not in the IN_STOCK list at all (fully SOLD) — fetch it directly.
    const stock = await prisma.inventoryStock.findFirst({
      where: { id: stockId, storeId },
      include: {
        product: {
          select: {
            name: true,
            hsnCode: true,
            productCode: true,
            storeMetalPurityId: true,
            stoneOriginOptionId: true,
            stoneOriginOption: { select: { sellingPrice: true } },
            ...stockOptionProductDetailsSelect,
          },
        },
        metalType: { select: { id: true, name: true } },
        components: true,
      },
    });
    if (!stock) continue;
    mapped.push({
      id: stock.id,
      stockCode: stock.stockCode,
      productName: stock.product.name,
      productCode: stock.product.productCode,
      hsnCode: stock.product.hsnCode,
      metalType: stock.metalType ? { id: stock.metalType.id, name: stock.metalType.name } : null,
      purity: stock.purity,
      purityLabel: stock.purityLabel,
      grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
      netWeight: stock.netWeight ? Number(stock.netWeight) : null,
      stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
      caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
      stoneRate: stock.stoneRate ? Number(stock.stoneRate) : null,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? null,
      stoneTypeNames: stock.stoneTypeNames ?? null,
      saleRate: stock.saleRate ? Number(stock.saleRate) : null,
      storeMetalPurityRate:
        stock.product.storeMetalPurity?.sellingPrice != null
          ? Number(stock.product.storeMetalPurity.sellingPrice)
          : null,
      stoneOriginRate:
        stock.product.stoneOriginOption?.sellingPrice != null
          ? Number(stock.product.stoneOriginOption.sellingPrice)
          : null,
      makingCharge: stock.makingCharge ? Number(stock.makingCharge) : null,
      makingChargeType: stock.makingChargeType,
      quantity: stock.quantity + claimed,
      ...toStockOptionProductDetails(stock.product),
      ...stockPieceOption(stock),
    });
  }

  return mapped;
}

/**
 * Create an invoice with its line items in one transaction. Any line item
 * linked to an InventoryStock row gets marked SOLD and a SALE transaction
 * is logged against it. If the invoice isn't fully paid up front, a DEBIT
 * ledger entry is recorded against the customer for the outstanding amount.
 * Whatever IS paid up front (via paymentsJson's 1-2 method rows) gets its
 * own CREDIT ledger entry per row, same shape recordInvoicePayment writes.
 */
export async function createInvoice(
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    const customerId = String(formData.get("customerId") || "");
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!customerId) {
      return { success: false, message: "Please select a party" };
    }

    let items: InvoiceLineItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Selling price is what an invoice actually charges for — a line with
    // no rate at all is not a valid sale, and the client-side check on the
    // form is only a convenience; this is the real guarantee. Checked
    // before any other parsing so a $0 line never reaches stock/ledger
    // writes below.
    const invalidRateItem = items.find(
      (item) => !(item.multiPart && item.components?.length) && !(toNumber(item.rate) > 0),
    );
    if (invalidRateItem) {
      return {
        success: false,
        message: `Enter a selling price for "${invalidRateItem.itemName || "an item"}" before creating the invoice.`,
      };
    }

    // A caller may name the store explicitly — the QR scan-to-sell path does,
    // because it resolves the shop from the scanned piece rather than from
    // whichever store the phone happened to have active. `resolveActingStoreId`
    // honours it only for a store the user is genuinely a member of, so this
    // is no weaker than the store switcher; with nothing named it falls back
    // to the active store exactly as before. Resolved here, up front, rather
    // than further down where it used to live — lockLinkedStockFields (and
    // every total below that reads weight/purity off `items`) needs it
    // first.
    const storeId = await resolveActingStoreId(
      String(formData.get("storeId") || "") || null,
    );

    // Captured directly off the parsed items, before any manual line gets
    // its own stock minted (that happens inside the transaction below, and
    // those lines carry the typed values, so there's nothing to lock).
    const explicitStockIds = new Set(
      items.filter((item) => item.inventoryStockId).map((item) => item.inventoryStockId as string),
    );

    // Must happen before every total below is computed from `items` — an
    // Invoice's own subtotal/GST is priced off Net/Carat Weight (see
    // lineQuantity), which this can change, so pricing has to see the
    // locked, trustworthy value rather than whatever the client submitted
    // for a field the UI no longer lets it edit.
    items = await lockLinkedStockFields(storeId, items, explicitStockIds);
    const pieceLines = await resolvePieceLines(storeId, items);
    if ("error" in pieceLines) return { success: false, message: pieceLines.error };
    items = pieceLines;
    const fineOf = await getFineWeightResolver(storeId);

    // Offer / gift voucher (see resolveInvoicePromotion).
    const promotion = await resolveInvoicePromotion(storeId, customerId, items, String(formData.get("promotionCode") || ""));
    if (promotion && "error" in promotion) return { success: false, message: promotion.error };

    // A new line item becomes a real Product on save — it needs everything
    // Add Product would ask for, or it lands outside every category report.
    const manualLineError = await validateManualSaleLines(storeId, items);
    if (manualLineError) return { success: false, message: manualLineError };

    const manualDiscount = toNumber(formData.get("discount"));

    // paymentsJson (1-2 method rows, or none for a fully-on-credit sale) is
    // what invoice-form.tsx's "Paid Now" section sends. A caller that
    // doesn't send it at all (quick-sale-actions.ts's scan-to-sell flow,
    // which only collects a flat figure with no method breakdown) falls
    // back to the legacy plain `paidAmount` field exactly as before — no
    // method-tagged LedgerEntry gets created for that path, unchanged.
    const paymentsRaw = formData.get("paymentsJson");
    const payments = paymentsRaw !== null ? parseOptionalPayments(String(paymentsRaw)) : [];
    if (payments === null) {
      return {
        success: false,
        message: "Add 1-2 valid payment methods with an amount, or leave Paid Now blank for a fully-on-credit sale.",
      };
    }
    // Store credit the customer already had (a Credit Note, an
    // overpayment) applied toward this invoice instead of new cash —
    // invoice-form.tsx's "Apply Credit" flow. Never trust the client's own
    // number: re-fetch the customer's real current available credit fresh
    // right here and reject if it's grown stale (spent by a concurrent
    // invoice, or simply wrong) rather than silently clamping it, since
    // that would quietly under-charge or over-charge relative to what
    // staff actually saw on screen.
    const creditApplied = toNumber(formData.get("creditApplied"));
    if (creditApplied > 0) {
      const availableCredit = await getCustomerAvailableCredit(customerId);
      if (creditApplied > availableCredit) {
        return {
          success: false,
          message: `This customer's available credit has changed (₹${availableCredit.toFixed(2)} left) — refresh and try again.`,
        };
      }
    }

    // Old Gold Exchange — old gold the customer hands in against this sale
    // (lib/old-gold/exchange.ts). Every value is recomputed server-side from
    // weight, purity, rate and deduction; the form's figures are a preview.
    let oldGoldInput: OldGoldLineInput[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("oldGoldJson") || "[]"));
      oldGoldInput = Array.isArray(parsed) ? parsed : [];
    } catch {
      return { success: false, message: "Invalid customer exchange lines" };
    }
    const oldGold = await resolveOldGoldLines(storeId, oldGoldInput);
    if ("error" in oldGold) return { success: false, message: oldGold.error };
    const oldGoldExcessMode =
      formData.get("oldGoldExcessMode") === OldGoldExcessMode.PAID_OUT
        ? OldGoldExcessMode.PAID_OUT
        : OldGoldExcessMode.STORE_CREDIT;
    const oldGoldPayoutMethodRaw = String(formData.get("oldGoldPayoutMethod") || "");
    const oldGoldPayoutMethod = (Object.values(PaymentMethod) as string[]).includes(oldGoldPayoutMethodRaw)
      ? (oldGoldPayoutMethodRaw as PaymentMethod)
      : null;
    const oldGoldPayoutReference = String(formData.get("oldGoldPayoutReference") || "").trim() || null;

    let paidAmount =
      (paymentsRaw !== null
        ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
        : toNumber(formData.get("paidAmount"))) + creditApplied;
    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;
    const replacesId = String(formData.get("replacesId") || "").trim() || null;
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    const deliveryState = String(formData.get("deliveryState") || "").trim() || null;
    const deliveryStateCode = String(formData.get("deliveryStateCode") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + lineMetalValue(item),
      0,
    );
    // Hallmarking charge folds into the invoice's Making Charges total — the
    // printed format shows it as a sub-line under Making Charges, not a
    // separate money bucket.
    const makingCharges = items.reduce(
      (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
      0,
    );
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    // Per-line scheme/discount folds into the invoice's single `discount`
    // total alongside whatever was typed at invoice level, so every existing
    // reader of Invoice.discount (reports, the detail page, the
    // subtotal+making+stone-discount+tax invariant) still adds up without
    // needing to know per-line discounts exist.
    const discount =
      manualDiscount + items.reduce((sum, item) => sum + toNumber(item.schemeDiscount), 0);
    // Recomputed from each line's own sgst/cgst/igst rather than trusted
    // from a single form field — the per-line breakdown is the source of
    // truth the printed invoice shows, so the saved total must match it
    // exactly. sgst+cgst (intra-state) and igst (inter-state) are never
    // both nonzero on the same line — see computeGst() in lib/gst.ts — so
    // summing all three here is safe either way.
    const taxAmount = items.reduce(
      (sum, item) =>
        sum + toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount),
      0,
    );
    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Standard Indian-billing convention: the saved Total is rounded to the
    // nearest rupee, with the (small, signed) adjustment recorded on its own
    // line rather than silently folded into another figure — unless the
    // merchant typed their own Round Off directly (invoice-form.tsx always
    // sends this field, whether auto-calculated or overridden), in which
    // case that value wins verbatim, same "typed once, used as-is" rule as
    // Making Charge/Discount. A caller that never sends the field at all
    // (e.g. the scan-to-sell quick-sale flow) still gets the automatic
    // behavior, since `null` here falls through to it.
    const roundOffOverrideRaw = formData.get("roundOffAmount");
    const roundOffOverride =
      roundOffOverrideRaw !== null && roundOffOverrideRaw !== "" ? toNumber(roundOffOverrideRaw) : null;
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal, roundOffOverride);

    // Old gold goes against the bill first (after any store credit); cash
    // only covers what's left, and any old-gold value beyond the bill is
    // excess — kept as store credit or paid out, as chosen.
    const oldGoldSplit = splitOldGoldValue(oldGold.total, totalAmount - creditApplied);
    if (oldGoldSplit.excess > 0 && oldGoldExcessMode === OldGoldExcessMode.PAID_OUT && !oldGoldPayoutMethod) {
      return { success: false, message: "Choose how the exchange balance is paid out to the customer." };
    }
    paidAmount = round2(paidAmount + oldGoldSplit.applied);
    if (oldGoldSplit.applied > 0 && paidAmount > totalAmount + 0.01) {
      return {
        success: false,
        message: `Payments exceed what's left to pay after the customer exchange (₹${Math.max(0, totalAmount - creditApplied - oldGoldSplit.applied).toFixed(2)}).`,
      };
    }
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment. A missing/invalid id (e.g. a Composition-scheme document,
    // which never selects a rate) just leaves the snapshot null instead of
    // failing the save.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it. Checked against `storeId`
    // rather than the active store, because a caller may name a different one
    // above — being a member of that store is not the same as being allowed
    // to bill in it.
    let actor;
    try {
      actor = await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);
    } catch {
      return {
        success: false,
        message: "You do not have permission to create invoices in this store.",
      };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a party" };
    }

    // A Composition-scheme store is legally barred from charging any GST at
    // all — see GstScheme's doc comment and computeGst() in lib/gst.ts,
    // which the form is expected to have already zeroed these against.
    // Enforced again here because a server action is reachable independent
    // of whatever the form's own UI disabled.
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true },
    });
    if (
      businessSettings?.gstScheme === "COMPOSITION" &&
      items.some(
        (item) =>
          toNumber(item.sgstAmount) !== 0 ||
          toNumber(item.cgstAmount) !== 0 ||
          toNumber(item.igstAmount) !== 0,
      )
    ) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    // See resolveWritableLocationId's own doc comment — without this, a
    // location-restricted Staff user submitting no location at all (the
    // picker always offers "None") saved the invoice with locationId: null,
    // which then never matches their own location-scoped list afterward.
    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    // A replacement invoice may only target a cancelled invoice in this
    // store that hasn't already been replaced — replacesId's @unique
    // constraint would reject a second one anyway, but this surfaces a
    // real message instead of a raw DB constraint error.
    if (replacesId) {
      const replaced = await prisma.invoice.findFirst({
        where: { id: replacesId, storeId },
        select: { status: true, replacedBy: { select: { id: true } } },
      });
      if (!replaced || replaced.status !== InvoiceStatus.CANCELLED) {
        return { success: false, message: "The invoice being replaced must be a cancelled invoice" };
      }
      if (replaced.replacedBy) {
        return { success: false, message: "That cancelled invoice has already been replaced" };
      }
    }

    // Every referenced stock item must belong to this store — otherwise a
    // crafted itemsJson could link a line item to another store's stock,
    // leaking its details (and, via the SOLD-status update below, its
    // invoice/customer info) into this invoice.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((id): id is string => !!id)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true, stockCode: true, quantity: true, status: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));

    // A linked stock id that doesn't resolve used to quietly turn its line
    // into an unlinked manual line — i.e. a sale with no stock behind it.
    // Every sold line must now be backed by real stock, so it's an error.
    if (requestedStockIds.some((stockId) => !validStockIds.has(stockId))) {
      return {
        success: false,
        message: "A linked stock item could not be found — refresh and pick it again.",
      };
    }

    // Only pieces actually on hand can be sold — not ones reserved, out with
    // an artisan, damaged, or archived (same rule the scan-to-sell flow
    // applies in quick-sale-actions.ts).
    const unavailableStock = validStock.find((stock) => stock.status !== InventoryStockStatus.IN_STOCK);
    if (unavailableStock) {
      return {
        success: false,
        message: `Stock ${unavailableStock.stockCode} is not available to sell (${String(unavailableStock.status).replace(/_/g, " ").toLowerCase()}).`,
      };
    }

    // A stock row can hold many pieces (qty 100 of a stud, say). Selling
    // some of them must not be allowed to exceed what is on hand, and two
    // line items can point at the same row, so the check sums per row
    // rather than looking at each line in isolation.
    const requestedQtyByStock = new Map<string, number>();
    for (const item of items) {
      if (!item.inventoryStockId || !validStockIds.has(item.inventoryStockId)) continue;
      requestedQtyByStock.set(
        item.inventoryStockId,
        (requestedQtyByStock.get(item.inventoryStockId) ?? 0) + Math.max(1, item.quantity || 1),
      );
    }

    for (const stock of validStock) {
      const wanted = requestedQtyByStock.get(stock.id) ?? 0;
      if (wanted > stock.quantity) {
        return {
          success: false,
          message: `Only ${stock.quantity} left of stock ${stock.stockCode}, but ${wanted} were billed.`,
        };
      }
    }

    const invoiceNumber = await generateInvoiceNumber(storeId);

    // Resolved once, up front, for every DISTINCT rate any line actually
    // uses — see resolvePerLineGstRateSnapshots' own doc comment. Must
    // happen before the transaction below since a nested Prisma `create`
    // array has to be plain objects, not promises.
    const perLineGstRateSnapshots = await resolvePerLineGstRateSnapshots(storeId, items);

    // Default interactive-transaction timeout is 5s — a multi-line invoice
    // does several sequential awaits per item (stock update, ledger entry,
    // inventory transaction) inside this one callback, which reliably blows
    // past 5s and throws P2028 ("Transaction not found") on a real (non-local)
    // DB connection. Same fix as createPurchase's identical transaction.
    //
    // Retried whole on a product/stock code collision — see
    // withManualStockCodeRetry.
    const invoice = await withManualStockCodeRetry(() => prisma.$transaction(async (tx) => {
      // Product → Add Stock for every "Create New Line Item" line, so it is
      // sold below through the same guarded decrement as a picked stock
      // line — see createStockForManualSaleLine. Built fresh per attempt
      // (never mutating `items`) so a retried transaction mints new rows.
      const soldItems: InvoiceLineItemInput[] = [];
      for (const item of items) {
        if (item.inventoryStockId) {
          soldItems.push(item);
          continue;
        }
        const newStockId = await createStockForManualSaleLine(tx, {
          storeId,
          line: item,
          actor,
          locationId: resolvedLocationId,
          referenceType: "Invoice",
          ...lineWeights(item, fineOf),
          piece: item.piece,
        });
        soldItems.push({ ...item, inventoryStockId: newStockId });
      }

      const created = await tx.invoice.create({
        data: {
          storeId,
          invoiceNumber,
          customerId,
          promotionId: promotion?.promotionId ?? undefined,
          promotionCode: promotion?.code ?? undefined,
          promotionDiscount: promotion?.total ?? 0,
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : new Date(),
          dueDate: dueDateRaw ? new Date(dueDateRaw) : undefined,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          totalAmount,
          roundOffAmount,
          paidAmount,
          balanceAmount,
          notes,
          locationId: resolvedLocationId ?? undefined,
          gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
          gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
          deliveryState,
          deliveryStateCode,
          // Recorded at the moment of sale, name included, so the invoice
          // still says who raised it after that person leaves the shop.
          createdById: actor.id ?? null,
          createdByName: actor.name ?? actor.email ?? null,
          replacesId: replacesId ?? undefined,
          items: {
            create: soldItems.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              purityLabel: item.purityLabel ?? undefined,
              quantity: item.quantity || 1,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              ...storedLineWeights(item, fineOf),
              components: item.piece ? { create: pieceComponentCreates(item.piece.components) } : undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: toChargeType(item.makingChargeType),
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              stonePieces: item.stonePieces ?? null,
              stoneClarity: item.stoneClarity ?? null,
              stoneCertificateNumber: item.stoneCertificateNumber ?? null,
              dmoWeight: item.dmoWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              hmCharge: item.hmCharge ?? 0,
              schemeDiscount: item.schemeDiscount ?? 0,
              sgstAmount: item.sgstAmount ?? 0,
              cgstAmount: item.cgstAmount ?? 0,
              igstAmount: item.igstAmount ?? 0,
              // This LINE's own resolved snapshot, distinct from the
              // invoice-level gstRateSnapshot above — see InvoiceItem's
              // gstRateId doc comment. `undefined` (not `null`) to match
              // this function's existing optional-relation convention.
              gstRateId: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateId ?? undefined
                : undefined,
              gstRateName: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateName ?? undefined
                : undefined,
              gstRatePercent: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRatePercent ?? undefined
                : undefined,
              hsnCode: item.hsnCode ?? undefined,
              lineTotal: lineTotal(item),
              inventoryStockId: item.inventoryStockId ?? undefined,
            })),
          },
        },
      });

      for (const item of soldItems) {
        if (!item.inventoryStockId) continue;

        // Decrement rather than flipping the whole row to SOLD: a row of
        // 100 pieces that sells 2 still has 98 on hand. Marking it SOLD
        // outright made the remainder disappear from stock entirely.
        const soldQty = Math.max(1, item.quantity || 1);

        // The `quantity: { gte: soldQty }` guard — not the earlier
        // requestedQtyByStock pre-check above — is what actually prevents
        // overselling: two concurrent invoices for the same row can both
        // pass that pre-check (it reads quantity before either has
        // decremented anything) and then both land here. The database
        // evaluates this WHERE clause against the row's real, current
        // quantity, so only one of two racing decrements past the last
        // unit can ever match; the other gets count: 0. A stale JS-side
        // `quantity` read beforehand (the previous version of this code)
        // can never provide that guarantee.
        // saleAmount is deliberately left untouched here — it's the Stock
        // form's own editable pricing estimate (Purchase/Sale Amount
        // auto-calc), not a realized-proceeds ledger, and overwriting it
        // with just this sale's line total corrupted it for a multi-
        // quantity row's still-unsold remainder. The invoice's own line
        // items are the authoritative record of what actually sold for.
        const { count } = await tx.inventoryStock.updateMany({
          where: {
            id: item.inventoryStockId,
            storeId,
            status: InventoryStockStatus.IN_STOCK,
            quantity: { gte: soldQty },
          },
          data: {
            quantity: { decrement: soldQty },
          },
        });

        if (count === 0) {
          // Thrown, not returned — this must roll back the whole
          // transaction (including every other line item's decrement
          // already applied above), not create a partial invoice.
          throw new OversellError(
            `Not enough stock left for ${item.itemName || "an item"} — it may have just been sold in another sale. Refresh and try again.`,
          );
        }

        // Only the last piece leaving turns the row SOLD — read the
        // post-decrement quantity back rather than computing it from the
        // pre-decrement value, since that value is exactly what the guard
        // above proved cannot be trusted under concurrency.
        const updatedStock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (updatedStock.quantity <= 0 && updatedStock.status !== InventoryStockStatus.SOLD) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.SOLD },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            quantity: soldQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: created.id,
          },
        });
      }

      // The DEBIT is the invoice's full totalAmount, not balanceAmount — a
      // sale is owed in full the moment it's made; whatever's paid right now
      // (the loop below) is a separate CREDIT against that, exactly like a
      // later top-up payment via recordInvoicePayment. Debiting only
      // balanceAmount (totalAmount minus what's being paid right now) while
      // *also* crediting that same paid-right-now amount double-counts it —
      // netted out of the debit, then subtracted again as a credit — making
      // the ledger balance too negative by exactly the paid-at-creation
      // amount on every invoice that collects any payment up front. A
      // fully-paid-at-creation invoice (balanceAmount === 0) still needs
      // this DEBIT to offset its own CREDIT rows, hence gating on
      // totalAmount, not balanceAmount.
      if (totalAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.SALE,
            customerId,
            invoiceId: created.id,
            amount: totalAmount,
            description: `Invoice ${invoiceNumber} balance due`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }

      // One CREDIT entry per payment-method row actually collected at the
      // moment of sale — same shape recordInvoicePayment writes for a later
      // top-up payment, so the two are indistinguishable in the ledger
      // besides their timestamp.
      for (const [index, payment] of payments.entries()) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId,
            invoiceId: created.id,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: resolvedLocationId ?? undefined,
            description: index === 0 ? `Payment received for ${invoiceNumber}` : undefined,
          },
        });
      }

      // The customer's own existing store credit, drawn down against this
      // invoice — same CREDIT shape as a payment-method row above, just
      // sourced from their existing balance rather than new cash, and
      // tagged distinctly so it never counts as real cash on the Payment In
      // report (getPaymentsIn filters strictly on PAYMENT_IN).
      if (creditApplied > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.CREDIT_APPLIED,
            customerId,
            invoiceId: created.id,
            amount: creditApplied,
            description: `Store credit applied to ${invoiceNumber}`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }

      // A single-use voucher is spent on this invoice — conditional on it
      // still being unused, so two bills can't redeem the same code at once.
      if (promotion?.voucherId) {
        const spent = await tx.promotionVoucher.updateMany({
          where: { id: promotion.voucherId, storeId, usedAt: null },
          data: { usedAt: new Date(), invoiceId: created.id },
        });
        if (spent.count !== 1) throw new PromotionVoucherUsedError();
      }

      // Customer → Business half of an Old Gold Exchange: the OG purchase,
      // its old-gold stock and the customer's ledger entries.
      if (oldGold.lines.length) {
        await recordOldGoldExchange(tx, {
          storeId,
          customerId,
          customerName: customer.name,
          invoiceId: created.id,
          invoiceNumber,
          lines: oldGold.lines,
          total: oldGold.total,
          applied: oldGoldSplit.applied,
          excess: oldGoldSplit.excess,
          excessMode: oldGoldExcessMode,
          payout: oldGoldPayoutMethod
            ? { method: oldGoldPayoutMethod, reference: oldGoldPayoutReference }
            : null,
          locationId: resolvedLocationId,
          actor,
        });
      }

      return created;
    }, { timeout: 15000 }));

    revalidatePath("/billing");

    return {
      success: true,
      message: `Invoice ${invoiceNumber} created`,
      invoiceId: invoice.id,
    };
  } catch (error) {
    if (error instanceof OversellError) {
      return { success: false, message: error.message };
    }
    if (error instanceof PromotionVoucherUsedError) {
      return { success: false, message: error.message };
    }
    logger.error("createInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to create invoice") };
  }
}

/**
 * Record a payment against an invoice's outstanding balance. Reduces
 * balanceAmount, bumps paidAmount, updates status, and logs a CREDIT
 * ledger entry (money coming in reduces what the customer owes).
 */
export async function recordInvoicePayment(
  invoiceId: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to record payments." };
    }
    const paymentsRaw = String(formData.get("paymentsJson") || "[]");
    const notes = String(formData.get("notes") || "").trim() || null;

    // Optional, not required (parseOptionalPayments, not parsePayments) —
    // applying store credit (creditApplied below) can cover the entire
    // balance on its own now, leaving zero real payment-method rows, which
    // used to be impossible before that existed.
    const payments = parseOptionalPayments(paymentsRaw);
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" };
    }

    const storeId = await requireStoreScope();

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, storeId } });
    if (!invoice) return { success: false, message: "Invoice not found" };

    // The customer's own existing store credit applied here instead of new
    // cash — same shape/validation as createInvoice's own creditApplied
    // handling (invoice-form.tsx's "Apply Credit"), re-fetched fresh rather
    // than trusted from the client for the same reason.
    const creditApplied = toNumber(formData.get("creditApplied"));
    if (creditApplied > 0) {
      const availableCredit = await getCustomerAvailableCredit(invoice.customerId);
      if (creditApplied > availableCredit) {
        return {
          success: false,
          message: `This customer's available credit has changed (₹${availableCredit.toFixed(2)} left) — refresh and try again.`,
        };
      }
    }

    const amount =
      payments.reduce((sum, payment) => sum + Number(payment.amount), 0) + creditApplied;
    if (amount <= 0) {
      return { success: false, message: "Enter a valid payment amount" };
    }

    // Reject rather than silently clamp — without this, an amount typed
    // larger than what's actually owed pushed paidAmount past totalAmount
    // with balanceAmount floored at 0, permanently hiding the overage (no
    // record of it, no way to see or refund it) instead of surfacing it.
    const currentBalance = Number(invoice.balanceAmount);
    if (amount > currentBalance) {
      return {
        success: false,
        message: `Amount exceeds the outstanding balance of ₹${currentBalance.toLocaleString("en-IN")}`,
      };
    }

    const newPaid = Number(invoice.paidAmount) + amount;
    const newBalance = Math.max(0, Number(invoice.totalAmount) - newPaid);
    const status: InvoiceStatus =
      newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, balanceAmount: newBalance, status },
      }),
      ...payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId: invoice.customerId,
            invoiceId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: invoice.locationId ?? undefined,
            description:
              notes ??
              (index === 0 ? `Payment received for ${invoice.invoiceNumber}` : undefined),
          },
        }),
      ),
      ...(creditApplied > 0
        ? [
            prisma.ledgerEntry.create({
              data: {
                storeId,
                type: LedgerEntryType.CREDIT,
                sourceType: LedgerSourceType.CREDIT_APPLIED,
                customerId: invoice.customerId,
                invoiceId,
                amount: creditApplied,
                description: notes ?? `Store credit applied to ${invoice.invoiceNumber}`,
                locationId: invoice.locationId ?? undefined,
              },
            }),
          ]
        : []),
    ]);

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    logger.error("recordInvoicePayment error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to record payment") };
  }
}

/**
 * Edit an invoice's non-financial fields only — invoice date, due date,
 * location, and notes. Line items, amounts, and payments are never
 * touched here on purpose: once stock has been decremented and ledger
 * entries posted, changing those needs the same reversal logic Cancel
 * already does, not a quiet in-place edit. A real correction goes through
 * cancelInvoice + a replacement invoice instead.
 */
/**
 * Two edit paths in one action, branched on whether `itemsJson` is present
 * in `formData`:
 *
 * - Absent → basic fields only (invoice date, due date, location, notes).
 *   Used by EditInvoiceDialog, available on any non-CANCELLED invoice
 *   (this is the only edit a PAID invoice ever gets).
 * - Present → full line-item edit (price/quantity/rate/making/stone/
 *   everything), used by the /billing/[id]/edit page. Only available on
 *   DRAFT/PARTIAL — same restriction cancelInvoice already has, same
 *   reason: a PAID invoice means money was actually collected, and
 *   silently changing its total needs a real refund decision. Reverses
 *   every old line's stock effect and reapplies the new lines' the same
 *   guarded way createInvoice/cancelInvoice already do, then reconciles
 *   the ledger with one offsetting entry sized to the actual balance
 *   delta — existing payment entries are never touched or rewritten.
 */
/**
 * Sets (or clears) only an invoice's due date — nothing else. A dedicated
 * action rather than routing this through updateInvoice's own metadata
 * branch, which submits every field (notes/location/e-way bill) at once
 * from its own dialog's form; a bare "just the due date" submission there
 * would read every other field as absent and blank them out. This backs
 * the "no due date set on a still-owed invoice" prompt (see
 * InvoiceDetailContent) — the Calendar already surfaces any
 * Invoice.dueDate on its own (getCalendarEvents), so setting it here is
 * the whole feature; no separate reminder entity needed.
 */
export async function setInvoiceDueDate(
  id: string,
  dueDateRaw: string,
): Promise<InvoiceFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit invoices." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!invoice) return { success: false, message: "Invoice not found" };

    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    if (dueDateRaw && Number.isNaN(dueDate?.getTime())) {
      return { success: false, message: "Invalid due date" };
    }

    await prisma.invoice.update({ where: { id }, data: { dueDate } });

    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);
    revalidatePath("/calendar");

    return { success: true, message: "Due date set" };
  } catch (error) {
    logger.error("setInvoiceDueDate error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to set due date") };
  }
}

export async function updateInvoice(
  id: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit invoices." };
    }

    const storeId = await requireStoreScope();
    const fineOf = await getFineWeightResolver(storeId);
    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return {
        success: false,
        message: "Cancelled invoices can't be edited — create a replacement instead.",
      };
    }

    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;
    // Only present on the full line-item edit form (EditInvoiceDialog's
    // metadata-only form has no Delivery Location section) — untouched by
    // the `!hasItems` branch below for exactly that reason.
    const deliveryState = String(formData.get("deliveryState") || "").trim() || null;
    const deliveryStateCode = String(formData.get("deliveryStateCode") || "").trim() || null;

    // E-way Bill — record-keeping only, no government API call. See the
    // schema's own doc comment on Invoice.ewayBillNumber.
    const ewayBillNumber = String(formData.get("ewayBillNumber") || "").trim() || null;
    const ewayBillDateRaw = String(formData.get("ewayBillDate") || "");
    const transporterName = String(formData.get("transporterName") || "").trim() || null;
    const vehicleNumber = String(formData.get("vehicleNumber") || "").trim() || null;
    const transportModeRaw = String(formData.get("transportMode") || "").trim();
    const transportMode = (
      Object.values(TransportMode) as string[]
    ).includes(transportModeRaw)
      ? (transportModeRaw as TransportMode)
      : null;
    const distanceKmRaw = String(formData.get("distanceKm") || "").trim();
    const distanceKm = distanceKmRaw ? Math.trunc(Number(distanceKmRaw)) || null : null;

    // E-Invoice (IRN) — same record-keeping-only convention as E-way Bill
    // above. See the schema's own doc comment on Invoice.irnNumber.
    const irnNumber = String(formData.get("irnNumber") || "").trim() || null;
    const ackNumber = String(formData.get("ackNumber") || "").trim() || null;
    const ackDateRaw = String(formData.get("ackDate") || "");

    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    const hasItems = formData.has("itemsJson");

    if (!hasItems) {
      await prisma.invoice.update({
        where: { id },
        data: {
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : invoice.invoiceDate,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
          notes,
          locationId: resolvedLocationId ?? null,
          ewayBillNumber,
          ewayBillDate: ewayBillDateRaw ? new Date(ewayBillDateRaw) : null,
          transporterName,
          vehicleNumber,
          transportMode,
          distanceKm,
          irnNumber,
          ackNumber,
          ackDate: ackDateRaw ? new Date(ackDateRaw) : null,
        },
      });

      revalidatePath("/billing");
      revalidatePath(`/billing/${id}`);

      return { success: true, message: "Invoice updated" };
    }

    // --- Full line-item edit ---

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can have their line items edited.",
      };
    }

    let items: InvoiceLineItemInput[] = [];
    try {
      items = JSON.parse(String(formData.get("itemsJson") || "[]"));
    } catch {
      return { success: false, message: "Invalid line items" };
    }
    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Same guarantee as createInvoice — a line with no rate at all is not a
    // valid sale, whether the invoice is being created or edited.
    const invalidRateItem = items.find(
      (item) => !(item.multiPart && item.components?.length) && !(toNumber(item.rate) > 0),
    );
    if (invalidRateItem) {
      return {
        success: false,
        message: `Enter a selling price for "${invalidRateItem.itemName || "an item"}" before saving.`,
      };
    }

    // Same lock-before-totals requirement as createInvoice — `storeId` is
    // already resolved above (before items are even parsed here), so this
    // just needs to run before the subtotal/tax computation below, which is
    // priced off weight/purity read from `items`. See lockLinkedStockFields'
    // own doc comment.
    const explicitStockIds = new Set(
      items.filter((item) => item.inventoryStockId).map((item) => item.inventoryStockId as string),
    );
    items = await lockLinkedStockFields(storeId, items, explicitStockIds);
    const pieceLines = await resolvePieceLines(storeId, items);
    if ("error" in pieceLines) return { success: false, message: pieceLines.error };
    items = pieceLines;

    // Same complete-product requirement as createInvoice.
    const manualLineError = await validateManualSaleLines(storeId, items);
    if (manualLineError) return { success: false, message: manualLineError };

    // Same Composition-scheme guard as createInvoice — a store that can't
    // charge GST at creation can't gain it back by editing line items either.
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true },
    });
    if (
      businessSettings?.gstScheme === "COMPOSITION" &&
      items.some(
        (item) =>
          toNumber(item.sgstAmount) !== 0 ||
          toNumber(item.cgstAmount) !== 0 ||
          toNumber(item.igstAmount) !== 0,
      )
    ) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    const manualDiscount = toNumber(formData.get("discount"));
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — same reasoning as createInvoice.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const subtotal = items.reduce(
      (sum, item) => sum + lineMetalValue(item),
      0,
    );
    const makingCharges = items.reduce(
      (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
      0,
    );
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const discount =
      manualDiscount + items.reduce((sum, item) => sum + toNumber(item.schemeDiscount), 0);
    // sgst+cgst (intra-state) and igst (inter-state) — see createInvoice's
    // identical computation for why summing all three is always safe.
    const taxAmount = items.reduce(
      (sum, item) =>
        sum + toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount),
      0,
    );
    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Same rounding convention as createInvoice, including the manual
    // override — see its own comment for why `null` means "let the field's
    // absence fall through to the automatic behavior."
    const roundOffOverrideRaw = formData.get("roundOffAmount");
    const roundOffOverride =
      roundOffOverrideRaw !== null && roundOffOverrideRaw !== "" ? toNumber(roundOffOverrideRaw) : null;
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal, roundOffOverride);

    const paidAmount = Number(invoice.paidAmount);
    if (totalAmount < paidAmount) {
      return {
        success: false,
        message: `New total (₹${totalAmount.toFixed(2)}) can't be less than the ₹${paidAmount.toFixed(2)} already paid — record a refund or adjust payments first.`,
      };
    }

    // Customer Exchange added while editing — only when the invoice doesn't
    // have one yet (a recorded exchange's goods may already be melted or
    // issued, so it is never rewritten here). Applied against what's still
    // unpaid; any excess is store credit or paid out, as on New Invoice.
    let editOldGoldInput: OldGoldLineInput[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("oldGoldJson") || "[]"));
      editOldGoldInput = Array.isArray(parsed) ? parsed : [];
    } catch {
      return { success: false, message: "Invalid customer exchange lines" };
    }
    const existingExchange = editOldGoldInput.length
      ? await prisma.purchase.findFirst({ where: { storeId, exchangeInvoiceId: id }, select: { id: true } })
      : null;
    if (existingExchange) {
      return { success: false, message: "This invoice already has a Customer Exchange — it can't be changed here." };
    }
    const editOldGold = await resolveOldGoldLines(storeId, editOldGoldInput);
    if ("error" in editOldGold) return { success: false, message: editOldGold.error };
    const editExcessMode =
      formData.get("oldGoldExcessMode") === OldGoldExcessMode.PAID_OUT ? OldGoldExcessMode.PAID_OUT : OldGoldExcessMode.STORE_CREDIT;
    const editPayoutRaw = String(formData.get("oldGoldPayoutMethod") || "");
    const editPayoutMethod = (Object.values(PaymentMethod) as string[]).includes(editPayoutRaw)
      ? (editPayoutRaw as PaymentMethod)
      : null;
    const editOldGoldSplit = splitOldGoldValue(editOldGold.total, totalAmount - paidAmount);
    if (editOldGoldSplit.excess > 0 && editExcessMode === OldGoldExcessMode.PAID_OUT && !editPayoutMethod) {
      return { success: false, message: "Choose how the exchange balance is paid out to the customer." };
    }
    const paidWithExchange = round2(paidAmount + editOldGoldSplit.applied);
    // The revision's own ledger entry must leave the exchange out — its
    // OLD_GOLD_EXCHANGE credit (recorded below) covers that part.
    const balanceBeforeExchange = Math.max(0, totalAmount - paidAmount);
    const newBalanceAmount = Math.max(0, totalAmount - paidWithExchange);

    let newStatus: InvoiceStatus = InvoiceStatus.PAID;
    if (newBalanceAmount > 0 && paidWithExchange > 0) newStatus = InvoiceStatus.PARTIAL;
    else if (newBalanceAmount > 0 && paidWithExchange === 0) newStatus = InvoiceStatus.DRAFT;

    // Same store-ownership/oversell validation createInvoice already does,
    // against the new items — old items' own stock hasn't been restored
    // yet at this point, so a row a new line also targets is checked
    // against its current (pre-restore) quantity plus whatever this same
    // invoice already holds there; the transaction below restores old
    // quantities before applying new ones, so the real guard is the
    // `gte`-guarded decrement inside it, same as createInvoice.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((sid): sid is string => !!sid)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true, stockCode: true, quantity: true, status: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));

    // Same "every sold line is backed by real stock" rule as createInvoice.
    if (requestedStockIds.some((stockId) => !validStockIds.has(stockId))) {
      return {
        success: false,
        message: "A linked stock item could not be found — refresh and pick it again.",
      };
    }

    // A row this invoice itself sold out reads SOLD right now but gets
    // restored to IN_STOCK first inside the transaction below, so only rows
    // new to this invoice are held to the on-hand rule here.
    const heldByThisInvoice = new Set(
      invoice.items.map((item) => item.inventoryStockId).filter((sid): sid is string => !!sid),
    );
    const unavailableStock = validStock.find(
      (stock) => !heldByThisInvoice.has(stock.id) && stock.status !== InventoryStockStatus.IN_STOCK,
    );
    if (unavailableStock) {
      return {
        success: false,
        message: `Stock ${unavailableStock.stockCode} is not available to sell (${String(unavailableStock.status).replace(/_/g, " ").toLowerCase()}).`,
      };
    }

    // Resolved once, up front, for every DISTINCT rate any line actually
    // uses — see resolvePerLineGstRateSnapshots' own doc comment. Must
    // happen before the transaction below since a nested Prisma `create`
    // array has to be plain objects, not promises.
    const perLineGstRateSnapshots = await resolvePerLineGstRateSnapshots(storeId, items);

    // Same P2028 risk as createInvoice's transaction — two per-item loops
    // (restore old lines' stock, then apply the new lines') easily exceed
    // the default 5s interactive-transaction timeout on a multi-line edit.
    await withManualStockCodeRetry(() => prisma.$transaction(async (tx) => {
      // 0. Product → Add Stock for any newly added "Create New Line Item"
      // line — same as createInvoice (see createStockForManualSaleLine).
      const soldItems: InvoiceLineItemInput[] = [];
      for (const item of items) {
        if (item.inventoryStockId) {
          soldItems.push(item);
          continue;
        }
        const newStockId = await createStockForManualSaleLine(tx, {
          storeId,
          line: item,
          actor,
          locationId: resolvedLocationId,
          referenceType: "Invoice",
          ...lineWeights(item, fineOf),
          piece: item.piece,
        });
        soldItems.push({ ...item, inventoryStockId: newStockId });
      }

      // 1. Restore every old line's stock first — same as cancelInvoice.
      for (const item of invoice.items) {
        if (!item.inventoryStockId) continue;

        const restoreQty = Math.max(1, item.quantity || 1);

        await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { quantity: { increment: restoreQty } },
        });

        const restoredStock = await tx.inventoryStock.findUnique({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (
          restoredStock &&
          restoredStock.quantity > 0 &&
          restoredStock.status === InventoryStockStatus.SOLD
        ) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.IN_STOCK },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE_RETURN,
            quantity: restoreQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: "Stock restored — invoice edited",
          },
        });
      }

      // 2. Replace the item rows with the new set.
      await tx.invoice.update({
        where: { id },
        data: {
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          totalAmount,
          roundOffAmount,
          balanceAmount: newBalanceAmount,
          ...(editOldGoldSplit.applied > 0 ? { paidAmount: paidWithExchange } : {}),
          status: newStatus,
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : invoice.invoiceDate,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
          notes,
          locationId: resolvedLocationId ?? null,
          gstRateId: gstRateSnapshot?.gstRateId ?? null,
          gstRateName: gstRateSnapshot?.gstRateName ?? null,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? null,
          deliveryState,
          deliveryStateCode,
          items: {
            deleteMany: {},
            create: soldItems.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              purityLabel: item.purityLabel ?? undefined,
              quantity: item.quantity || 1,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              ...storedLineWeights(item, fineOf),
              components: item.piece ? { create: pieceComponentCreates(item.piece.components) } : undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: toChargeType(item.makingChargeType),
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              stonePieces: item.stonePieces ?? null,
              stoneClarity: item.stoneClarity ?? null,
              stoneCertificateNumber: item.stoneCertificateNumber ?? null,
              dmoWeight: item.dmoWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              hmCharge: item.hmCharge ?? 0,
              schemeDiscount: item.schemeDiscount ?? 0,
              sgstAmount: item.sgstAmount ?? 0,
              cgstAmount: item.cgstAmount ?? 0,
              igstAmount: item.igstAmount ?? 0,
              // This LINE's own resolved snapshot, distinct from the
              // invoice-level gstRateSnapshot above — see InvoiceItem's
              // gstRateId doc comment. `null` (not `undefined`) to match
              // this function's existing optional-relation convention.
              gstRateId: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateId ?? null
                : null,
              gstRateName: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateName ?? null
                : null,
              gstRatePercent: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRatePercent ?? null
                : null,
              hsnCode: item.hsnCode ?? undefined,
              lineTotal: lineTotal(item),
              inventoryStockId: item.inventoryStockId ?? undefined,
            })),
          },
        },
      });

      // 3. Apply the new lines' stock — thrown OversellError here rolls
      // back the restoration above too, leaving the invoice untouched.
      for (const item of soldItems) {
        if (!item.inventoryStockId) continue;

        const soldQty = Math.max(1, item.quantity || 1);

        // saleAmount is deliberately left untouched here — it's the Stock
        // form's own editable pricing estimate (Purchase/Sale Amount
        // auto-calc), not a realized-proceeds ledger, and overwriting it
        // with just this sale's line total corrupted it for a multi-
        // quantity row's still-unsold remainder. The invoice's own line
        // items are the authoritative record of what actually sold for.
        const { count } = await tx.inventoryStock.updateMany({
          where: {
            id: item.inventoryStockId,
            storeId,
            status: InventoryStockStatus.IN_STOCK,
            quantity: { gte: soldQty },
          },
          data: {
            quantity: { decrement: soldQty },
          },
        });

        if (count === 0) {
          throw new OversellError(
            `Not enough stock left for ${item.itemName || "an item"} — it may have just been sold in another sale. Refresh and try again.`,
          );
        }

        const updatedStock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (updatedStock.quantity <= 0 && updatedStock.status !== InventoryStockStatus.SOLD) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.SOLD },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            quantity: soldQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
          },
        });
      }

      // 4. One offsetting ledger entry sized to the actual change — never
      // a rewrite of what's already posted. Payments already recorded
      // keep their own CREDIT entries exactly as they are.
      const delta = balanceBeforeExchange - Number(invoice.balanceAmount);
      if (delta !== 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: delta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: Math.abs(delta),
            description: `Invoice ${invoice.invoiceNumber} revised — balance ${delta > 0 ? "increased" : "decreased"}`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }

      // 5. The exchange added on this edit — same records as on New Invoice.
      if (editOldGold.lines.length) {
        const customer = await tx.customer.findFirst({
          where: { id: invoice.customerId, storeId },
          select: { name: true },
        });
        await recordOldGoldExchange(tx, {
          storeId,
          customerId: invoice.customerId,
          customerName: customer?.name ?? "Customer",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          lines: editOldGold.lines,
          total: editOldGold.total,
          applied: editOldGoldSplit.applied,
          excess: editOldGoldSplit.excess,
          excessMode: editExcessMode,
          payout: editPayoutMethod
            ? { method: editPayoutMethod, reference: String(formData.get("oldGoldPayoutReference") || "").trim() || null }
            : null,
          locationId: resolvedLocationId,
          actor,
        });
      }
    }, { timeout: 15000 }));

    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);

    return { success: true, message: "Invoice updated", invoiceId: id };
  } catch (error) {
    if (error instanceof OversellError) {
      return { success: false, message: error.message };
    }
    logger.error("updateInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update invoice") };
  }
}

/**
 * Inline Rate/Weight edit for a single line, from the invoice detail
 * page's own item table — a lighter-weight sibling of updateInvoice's
 * full line-item edit, for the common case of just correcting a rate or
 * weight without reopening the whole Edit Items form.
 *
 * Deliberately narrower than the full edit: rate/weight are the only
 * things that can change here, so making/HM/stone charges and this
 * line's schemeDiscount carry over untouched, and — since neither the
 * piece count nor which stock row this line points at ever changes —
 * there's no stock to restore/reapply, unlike updateInvoice's full path.
 *
 * GST is still recomputed, not just left alone: every line on one
 * invoice shares the same GST% (set once, at creation — see
 * invoice-form.tsx's single `gstRate` state), so that % is derived from
 * this line's own pre-edit tax/taxable-value ratio and reapplied to the
 * new taxable value, the same intra-/inter-state split (SGST+CGST vs
 * IGST) as before. That keeps this action independent of business
 * settings/customer state lookups — it only ever needs numbers already
 * sitting on the line being edited.
 *
 * A stone's pcs / clarity / certificate (a single-stone line's
 * stonePieces/stoneClarity/stoneCertificateNumber, or each stone row of a
 * multi-part line) can be corrected here too — validated by
 * parseStoneDetails, same as the save actions. They don't price anything,
 * so totals, GST and the ledger don't move for them; only this invoice's
 * record changes, never the stock piece's.
 */
export async function updateInvoiceLineItem(
  invoiceId: string,
  itemId: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit invoices." };
    }

    const storeId = await requireStoreScope();
    const fineOf = await getFineWeightResolver(storeId);
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: { items: { include: { components: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can have their line items edited.",
      };
    }

    const item = invoice.items.find((existing) => existing.id === itemId);
    if (!item) return { success: false, message: "Line item not found on this invoice" };
    // A piece of several metals/stones: its rows' rates (and a stone's
    // value) change instead — weights stay as recorded.
    if (item.components.length) {
      return updatePieceLineItem({ storeId, invoice, item, formData });
    }

    const rate = toNumber(formData.get("rate"));
    const weight = toNumber(formData.get("weight"));
    if (!(rate > 0)) {
      return { success: false, message: "Enter a selling price greater than 0." };
    }
    if (!(weight > 0)) {
      return { success: false, message: "Enter a weight greater than 0." };
    }

    // The stone's pcs / clarity / certificate — only when the form sent
    // them (stoneDetails=1) and the line has a stone; otherwise untouched.
    let stoneDetails: { stonePieces: number | null; stoneClarity: string | null; stoneCertificateNumber: string | null } | null =
      null;
    if (formData.get("stoneDetails") === "1" && item.stoneMetalTypeName?.trim()) {
      const parsed = parseStoneDetails(
        {
          pieces: String(formData.get("stonePieces") ?? "").trim(),
          clarity: formData.get("stoneClarity"),
          certificateNumber: formData.get("stoneCertificateNumber"),
        },
        `"${item.itemName || "this line"}"`,
      );
      if ("error" in parsed) return { success: false, message: parsed.error };
      stoneDetails = {
        stonePieces: parsed.pieces,
        stoneClarity: parsed.clarity,
        stoneCertificateNumber: parsed.certificateNumber,
      };
    }

    const isDiamond = item.purity === PurityType.DIAMOND;
    const round = (value: number) => Math.round(value * 100) / 100;

    const oldQuantity = isDiamond ? toNumber(item.caratWeight) : toNumber(item.netWeight);

    // Only the stone's details changed: nothing is re-priced (re-deriving
    // GST from the line's ratio can move a paisa and post a "revised" entry).
    if (stoneDetails && Math.abs(rate - toNumber(item.rate)) < 0.005 && Math.abs(weight - oldQuantity) < 0.000005) {
      await prisma.invoiceItem.update({ where: { id: itemId }, data: stoneDetails });
      revalidatePath("/billing");
      revalidatePath(`/billing/${invoiceId}`);
      return { success: true, message: "Line item updated" };
    }
    const oldTaxable =
      toNumber(item.rate) * oldQuantity +
      toNumber(item.makingCharge) +
      toNumber(item.hmCharge) +
      toNumber(item.stoneCharge) -
      toNumber(item.schemeDiscount);
    const oldTax = toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount);
    const isInterState = toNumber(item.igstAmount) > 0;
    const ratePercent = oldTaxable > 0 ? (oldTax / oldTaxable) * 100 : 0;

    const newTaxable =
      rate * weight +
      toNumber(item.makingCharge) +
      toNumber(item.hmCharge) +
      toNumber(item.stoneCharge) -
      toNumber(item.schemeDiscount);
    const newTax = (newTaxable * ratePercent) / 100;
    const newSgst = isInterState ? 0 : round(newTax / 2);
    const newCgst = isInterState ? 0 : round(newTax / 2);
    const newIgst = isInterState ? round(newTax) : 0;
    const newLineTotal = newTaxable + newSgst + newCgst + newIgst;

    // Only this line's metal value and tax moved — making/HM/stone charges
    // and every other line are untouched, so the invoice-level totals shift
    // by exactly that line's own delta rather than needing a full re-sum
    // across every item.
    const oldLineMetalValue = toNumber(item.rate) * oldQuantity;
    const newLineMetalValue = rate * weight;
    const subtotal = Number(invoice.subtotal) - oldLineMetalValue + newLineMetalValue;
    const taxAmount = Number(invoice.taxAmount) - oldTax + (newSgst + newCgst + newIgst);
    const rawTotal =
      subtotal + Number(invoice.makingCharges) + Number(invoice.stoneCharges) - Number(invoice.discount) + taxAmount;
    // Same rounding convention as createInvoice/updateInvoice — a single
    // line's edit can shift the Total across a rupee boundary, so the
    // round-off is re-derived here too rather than left stale.
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);

    const paidAmount = Number(invoice.paidAmount);
    if (totalAmount < paidAmount) {
      return {
        success: false,
        message: `New total (₹${totalAmount.toFixed(2)}) can't be less than the ₹${paidAmount.toFixed(2)} already paid — record a refund or adjust payments first.`,
      };
    }
    const newBalanceAmount = Math.max(0, totalAmount - paidAmount);

    let newStatus: InvoiceStatus = InvoiceStatus.PAID;
    if (newBalanceAmount > 0 && paidAmount > 0) newStatus = InvoiceStatus.PARTIAL;
    else if (newBalanceAmount > 0 && paidAmount === 0) newStatus = InvoiceStatus.DRAFT;

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.update({
        where: { id: itemId },
        data: {
          rate,
          netWeight: isDiamond ? undefined : weight,
          fineWeight: isDiamond ? undefined : fineOf({ ...item, netWeight: weight }) ?? undefined,
          caratWeight: isDiamond ? weight : undefined,
          sgstAmount: newSgst,
          cgstAmount: newCgst,
          igstAmount: newIgst,
          lineTotal: newLineTotal,
          ...(stoneDetails ?? {}),
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal,
          taxAmount,
          totalAmount,
          roundOffAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus,
        },
      });

      // Same offsetting-entry convention as updateInvoice's full edit —
      // one CREDIT/DEBIT ledger entry sized to the actual balance change,
      // payments already recorded stay exactly as they are.
      const delta = newBalanceAmount - Number(invoice.balanceAmount);
      if (delta !== 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: delta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: Math.abs(delta),
            description: `Invoice ${invoice.invoiceNumber} revised — balance ${delta > 0 ? "increased" : "decreased"}`,
            locationId: invoice.locationId ?? undefined,
          },
        });
      }
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);

    return { success: true, message: "Line item updated" };
  } catch (error) {
    logger.error("updateInvoiceLineItem error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update line item") };
  }
}

/**
 * Quick edit of a multi-part line (updateInvoiceLineItem): new rate per
 * metal/stone row (and optionally a stone's value), weights unchanged. Each
 * row is re-valued and re-taxed at its own GST rate, making/HM at the line's
 * rate, and the invoice's totals shift by exactly this line's delta — same
 * convention as the single-rate path above.
 */
async function updatePieceLineItem({
  storeId,
  invoice,
  item,
  formData,
}: {
  storeId: string;
  invoice: Prisma.InvoiceGetPayload<{ include: { items: { include: { components: true } } } }>;
  item: Prisma.InvoiceItemGetPayload<{ include: { components: true } }>;
  formData: FormData;
}): Promise<InvoiceFormState> {
  let edits: {
    id: string;
    rate?: number | null;
    amount?: number | null;
    // A stone row's pcs / clarity / certificate — replaced only when the
    // edit carries `details` (parseStoneDetails); else kept as stored.
    details?: { pieces?: unknown; clarity?: unknown; certificateNumber?: unknown } | null;
  }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("componentsJson") || "[]"));
    edits = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { success: false, message: "Invalid rates" };
  }
  const editById = new Map(edits.map((edit) => [edit.id, edit]));
  const round = (value: number) => Math.round(value * 100) / 100;
  const quantity = toNumber(item.quantity, 1) || 1;
  const isInterState = toNumber(item.igstAmount) > 0;

  let metalValue = 0;
  let stoneValue = 0;
  let sgst = 0;
  let cgst = 0;
  let igst = 0;
  const addTax = (taxable: number, percent: number) => {
    const tax = round((taxable * percent) / 100);
    if (isInterState) igst += tax;
    else {
      const half = round(tax / 2);
      sgst += half;
      cgst += round(tax - half);
    }
  };

  type StoneDetails = { pieces: number | null; clarity: string | null; certificateNumber: string | null };
  const updates: { id: string; rate: number | null; amount: number; details?: StoneDetails }[] = [];
  let stoneIndex = 0;
  for (const row of item.components) {
    const edit = editById.get(row.id);
    const rate = edit?.rate != null ? toNumber(edit.rate) : toNumber(row.rate);
    if (rate < 0) return { success: false, message: "Rates can't be negative." };
    let amount: number;
    let details: StoneDetails | undefined;
    if (row.kind === "STONE") {
      stoneIndex++;
      if (edit?.details && typeof edit.details === "object") {
        const parsed = parseStoneDetails(
          edit.details,
          `${row.stoneMetalTypeName || `stone ${stoneIndex}`} of "${item.itemName || "this line"}"`,
        );
        if ("error" in parsed) return { success: false, message: parsed.error };
        details = parsed;
      }
      const typed = edit?.amount != null ? toNumber(edit.amount) : null;
      amount = round(typed != null && typed >= 0 ? typed : toNumber(row.caratWeight) * rate);
      stoneValue += amount * quantity;
    } else {
      amount = round(toNumber(row.netWeight) * rate);
      metalValue += amount * quantity;
    }
    addTax(amount * quantity, toNumber(row.gstRatePercent));
    updates.push({ id: row.id, rate: rate || null, amount, details });
  }
  if (!(metalValue + stoneValue > 0)) return { success: false, message: "Enter the rates for this piece's metals and stones." };

  // Only stone details changed (every row's rate and value as stored):
  // save them without re-pricing, which could move a paisa of GST rounding
  // and post a "revised" ledger entry for an edit that changed no amount.
  const repriced = item.components.some((row, index) => {
    const update = updates[index];
    return Math.abs(toNumber(update.rate) - toNumber(row.rate)) >= 0.005 || Math.abs(update.amount - toNumber(row.amount)) >= 0.005;
  });
  if (!repriced) {
    const detailUpdates = updates.filter((update) => update.details);
    if (detailUpdates.length) {
      await prisma.$transaction(
        detailUpdates.map((update) =>
          prisma.pieceComponent.updateMany({ where: { id: update.id, invoiceItemId: item.id }, data: update.details! }),
        ),
      );
    }
    revalidatePath("/billing");
    revalidatePath(`/billing/${invoice.id}`);
    return { success: true, message: "Line item updated" };
  }

  const making = toNumber(item.makingCharge) + toNumber(item.hmCharge) - toNumber(item.schemeDiscount);
  addTax(making, toNumber(item.gstRatePercent));
  metalValue = round(metalValue);
  stoneValue = round(stoneValue);
  const newSgst = round(sgst);
  const newCgst = round(cgst);
  const newIgst = round(igst);
  const newLineTotal = round(metalValue + stoneValue + making + newSgst + newCgst + newIgst);

  const oldMetalValue = round(
    item.components.filter((row) => row.kind === "METAL").reduce((sum, row) => sum + toNumber(row.amount), 0) * quantity,
  );
  const oldStoneValue = toNumber(item.stoneCharge);
  const oldTax = toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount);

  const subtotal = Number(invoice.subtotal) - oldMetalValue + metalValue;
  const stoneCharges = Number(invoice.stoneCharges) - oldStoneValue + stoneValue;
  const taxAmount = Number(invoice.taxAmount) - oldTax + (newSgst + newCgst + newIgst);
  const { roundOffAmount, totalAmount } = computeRoundOff(
    subtotal + Number(invoice.makingCharges) + stoneCharges - Number(invoice.discount) + taxAmount,
  );
  const paidAmount = Number(invoice.paidAmount);
  if (totalAmount < paidAmount) {
    return {
      success: false,
      message: `New total (₹${totalAmount.toFixed(2)}) can't be less than the ₹${paidAmount.toFixed(2)} already paid — record a refund or adjust payments first.`,
    };
  }
  const newBalanceAmount = Math.max(0, totalAmount - paidAmount);
  let newStatus: InvoiceStatus = InvoiceStatus.PAID;
  if (newBalanceAmount > 0 && paidAmount > 0) newStatus = InvoiceStatus.PARTIAL;
  else if (newBalanceAmount > 0 && paidAmount === 0) newStatus = InvoiceStatus.DRAFT;

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.pieceComponent.updateMany({
        where: { id: update.id, invoiceItemId: item.id },
        data: { rate: update.rate, amount: update.amount, ...(update.details ?? {}) },
      });
    }
    await tx.invoiceItem.update({
      where: { id: item.id },
      data: { stoneCharge: stoneValue, sgstAmount: newSgst, cgstAmount: newCgst, igstAmount: newIgst, lineTotal: newLineTotal },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { subtotal, stoneCharges, taxAmount, totalAmount, roundOffAmount, balanceAmount: newBalanceAmount, status: newStatus },
    });
    const delta = newBalanceAmount - Number(invoice.balanceAmount);
    if (delta !== 0) {
      await tx.ledgerEntry.create({
        data: {
          storeId,
          type: delta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          amount: Math.abs(delta),
          description: `Invoice ${invoice.invoiceNumber} revised — balance ${delta > 0 ? "increased" : "decreased"}`,
          locationId: invoice.locationId ?? undefined,
        },
      });
    }
  });

  revalidatePath("/billing");
  revalidatePath(`/billing/${invoice.id}`);
  return { success: true, message: "Line item updated" };
}

/**
 * Cancel a DRAFT or PARTIAL invoice — restores every stock-linked line's
 * quantity (flipping SOLD back to IN_STOCK where the row had hit zero),
 * and writes off the invoice's current outstanding balance with one
 * offsetting CREDIT ledger entry. Payments already recorded keep their
 * own CREDIT entries untouched — cancelling forgives what's still owed,
 * it doesn't refund money already received. A fully PAID invoice can't be
 * cancelled here on purpose: that needs a real refund decision, not a
 * status flip.
 */
export async function cancelInvoice(
  id: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to cancel invoices." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can be cancelled.",
      };
    }

    const cancellationReason = String(formData.get("cancellationReason") || "").trim() || null;
    const balanceAmount = Number(invoice.balanceAmount);

    // Same P2028 risk as createInvoice/updateInvoice — a per-item restore
    // loop can exceed the default 5s interactive-transaction timeout on a
    // multi-line invoice.
    await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        if (!item.inventoryStockId) continue;

        const restoreQty = Math.max(1, item.quantity || 1);

        // No `gte` guard needed for an increment — there's no way to
        // "over-restore" past what this invoice itself decremented.
        await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { quantity: { increment: restoreQty } },
        });

        // Same principle as createInvoice's stock decrement: trust the
        // post-write read, never a pre-write snapshot, when deciding
        // whether to flip status.
        const updatedStock = await tx.inventoryStock.findUnique({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (
          updatedStock &&
          updatedStock.quantity > 0 &&
          updatedStock.status === InventoryStockStatus.SOLD
        ) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.IN_STOCK },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE_RETURN,
            quantity: restoreQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: "Stock restored — invoice cancelled",
          },
        });
      }

      // Only the still-outstanding portion needs writing off — any
      // payments already recorded posted their own CREDIT entries and
      // stay exactly as they are; this doesn't touch them.
      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: balanceAmount,
            description: `Invoice ${invoice.invoiceNumber} cancelled — balance written off`,
            locationId: invoice.locationId ?? undefined,
          },
        });
      }

      // A voucher spent on this bill is usable again.
      await tx.promotionVoucher.updateMany({
        where: { storeId, invoiceId: invoice.id },
        data: { usedAt: null, invoiceId: null },
      });
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          // The offsetting ledger entry above is what explains why this
          // hit zero — totalAmount/paidAmount stay untouched as the
          // historical record of what was billed and actually received.
          balanceAmount: 0,
          cancelledAt: new Date(),
          cancelledById: actor.id ?? null,
          cancelledByName: actor.name ?? actor.email ?? null,
          cancellationReason,
        },
      });
    }, { timeout: 15000 });

    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);

    return { success: true, message: `Invoice ${invoice.invoiceNumber} cancelled` };
  } catch (error) {
    logger.error("cancelInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to cancel invoice") };
  }
}

/** Only DRAFT invoices with no recorded payments/ledger entries can be deleted. */
export async function deleteInvoice(id: string): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_DELETE);
    } catch {
      return { success: false, message: "You do not have permission to delete invoices." };
    }
    const storeId = await requireStoreScope();

    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: {
        ledgerEntries: { select: { id: true }, take: 1 },
        items: true,
      },
    });

    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT || invoice.ledgerEntries.length > 0) {
      return {
        success: false,
        message: "Only draft invoices with no payments can be deleted",
      };
    }

    // createInvoice decrements InventoryStock for every linked line item
    // regardless of status, including DRAFT — deleting the invoice without
    // restoring that quantity would silently leave stock counts short.
    // Same restore-and-flip-status logic cancelInvoice already uses, just
    // inside a hard delete instead of a status change.
    await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        if (!item.inventoryStockId) continue;

        const restoreQty = Math.max(1, item.quantity || 1);

        await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { quantity: { increment: restoreQty } },
        });

        const updatedStock = await tx.inventoryStock.findUnique({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (
          updatedStock &&
          updatedStock.quantity > 0 &&
          updatedStock.status === InventoryStockStatus.SOLD
        ) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.IN_STOCK },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE_RETURN,
            quantity: restoreQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: "Stock restored — draft invoice deleted",
          },
        });
      }

      // A voucher spent on this bill is usable again.
      await tx.promotionVoucher.updateMany({
        where: { storeId, invoiceId: id },
        data: { usedAt: null, invoiceId: null },
      });
      await tx.invoice.delete({ where: { id } });
    }, { timeout: 15000 });

    revalidatePath("/billing");
    revalidatePath("/inventory/stock");

    return { success: true, message: "Invoice deleted" };
  } catch (error) {
    logger.error("deleteInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete invoice") };
  }
}

/** Email a formatted copy of this invoice to the customer on file. */
export async function emailInvoiceAction(invoiceId: string): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_VIEW);
    } catch {
      return { success: false, message: "You do not have permission to email invoices." };
    }
    const storeId = await requireStoreScope();

    const [invoice, storeName, settings] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id: invoiceId, storeId },
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              phone: true,
            },
          },
          items: { include: { components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } } } },
        },
      }),
      resolveStoreName(storeId),
      getBusinessSettings(),
    ]);

    if (!invoice) return { success: false, message: "Invoice not found" };

    if (!invoice.customer?.email) {
      return { success: false, message: "This party has no email on file" };
    }

    const { subject, html } = invoiceEmail({
      weightFormat: await getWeightFormat(storeId),
      storeName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      status: invoice.status,
      gstScheme: settings.gstScheme,
      business: {
        name: settings.businessName,
        address: settings.address || null,
        city: settings.city || null,
        state: settings.state || null,
        pincode: settings.pincode || null,
        phone: settings.phone || null,
        gstNumber: settings.gstNumber || null,
        logoUrl: settings.logoUrl || null,
      },
      customer: {
        name: invoice.customer.name,
        addressLine1: invoice.customer.addressLine1,
        addressLine2: invoice.customer.addressLine2,
        city: invoice.customer.city,
        state: invoice.customer.state,
        phone: invoice.customer.phone,
      },
      items: invoice.items.map((item) => ({
        itemName: item.itemName,
        purity: item.purityLabel ?? item.purity,
        quantity: item.quantity,
        netWeight: item.netWeight ? Number(item.netWeight) : null,
        rate: item.rate ? Number(item.rate) : null,
        makingCharge: Number(item.makingCharge),
        stoneCharge: Number(item.stoneCharge),
        schemeDiscount: Number(item.schemeDiscount),
        sgstAmount: Number(item.sgstAmount),
        cgstAmount: Number(item.cgstAmount),
        igstAmount: Number(item.igstAmount),
        lineTotal: Number(item.lineTotal),
        components: item.components,
      })),
      subtotal: Number(invoice.subtotal),
      makingCharges: Number(invoice.makingCharges),
      stoneCharges: Number(invoice.stoneCharges),
      discount: Number(invoice.discount),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      roundOffAmount: Number(invoice.roundOffAmount ?? 0),
      paidAmount: Number(invoice.paidAmount),
      balanceAmount: Number(invoice.balanceAmount),
      amountInWords: amountInWords(Number(invoice.totalAmount)),
      notes: invoice.notes || null,
      terms: settings.invoiceTerms || null,
    });

    const result = await sendMail({ to: invoice.customer.email, subject, html });

    return { success: result.sent, message: result.message };
  } catch (error) {
    logger.error("emailInvoiceAction error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to email invoice") };
  }
}
