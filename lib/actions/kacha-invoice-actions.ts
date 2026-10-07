// lib/actions/kacha-invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
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
  UserRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFineWeightResolver, type FineWeightResolver, storedLineWeights } from "@/lib/fine-weight";
import {
  getPieceResolver,
  resolveLineStoneDetails,
  pieceComponentCreates,
  serializeStoredComponents,
  type ResolvedPiece,
} from "@/lib/piece-components.server";
import { lockedStockPieceRows } from "@/lib/inventory/stock-piece-rows";
import type { PieceComponentPayload } from "@/lib/piece-components";
import { computeRoundOff } from "@/lib/round-off";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { getCurrentUser, requireAuth, requireRole } from "@/lib/auth/auth";
import { recordOldGoldExchange, resolveOldGoldLines, type OldGoldLineInput } from "@/lib/old-gold/exchange";
import { round2, splitOldGoldValue } from "@/lib/old-gold/value";
import { METALS_AND_STONES_COLUMN, describePieceComponentsText } from "@/lib/piece-components-text";
import { getWeightFormat } from "@/lib/weight-settings.server";
import { sendMail } from "@/lib/mailer";
import { kachaSlipEmail, dataBackupEmail } from "@/lib/email-templates";
import { formatShortDate } from "@/lib/utils";
import { resolveStoreName } from "@/lib/invite-email";
import { APP_NAME } from "@/lib/constants/app";
import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions";
import { OversellError } from "@/lib/inventory/oversell-error";
import { markSourcePartiesAsSuppliers, resolveLineSourceParties } from "@/lib/inventory/line-source-party";
import { resolveGstRateSnapshot } from "@/lib/actions/gst-rate-actions";
import { conversionGst, toConversionGstItem } from "@/lib/conversion-gst";
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildMultiSheetExcelExport,
  buildImportTemplateWithDropdowns,
  parseExcelWorkbook,
} from "@/lib/excel-export";
import { assertPlanActiveForExport } from "@/lib/store-context";
import {
  KACHA_PAYMENT_METHOD_LABELS,
  KACHA_SHEET_COLUMNS,
  KACHA_SHEET_NOTES,
  kachaSheetColumns,
  kachaSheetHeaders,
  KACHA_STATUS_LABELS,
  kachaSheetInstructions,
  parsePaymentMethodCell,
} from "@/lib/billing/kacha-sheet";
import {
  KACHA_BACKUP_ITEMS_SHEET,
  KACHA_BACKUP_SLIPS_SHEET,
  KACHA_SHEET_INCLUDE,
  kachaBackupSheets,
  kachaSheetRows,
} from "@/lib/billing/kacha-sheet-rows";
import { formatSheetDate, parseSheetDate } from "@/lib/inventory/stock-sheet";
import { dropdownsFor, hiddenSheetHeaders, stripHiddenSheetColumns } from "@/lib/sheet-features";
import { getSheetFeatures } from "@/lib/sheet-features.server";
import {
  PURITY_LABELS,
  isHallmarkablePurity,
  matchLegacyPurityType,
  resolveLegacyPurityLabel,
} from "@/lib/purity";
import { classifyPurityFamily } from "@/lib/business-units";
import { logger } from "@/lib/logger";
import { IMPORT_SUGGESTION_MARK, namesAsCandidates, suggestFrom } from "@/lib/import-suggest";
import { parseDateRangeBoundary } from "@/lib/date-range";

export type KachaInvoiceLineItemInput = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  purityLabel?: string | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  stoneWeight?: number | null;
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
  // Wastage / touch % (Settings > Weights): absent = the purity's default, null = none.
  wastagePercent?: number | null;
  // Hallmarking charge, folded into the slip's Making Charges total — same
  // convention as InvoiceLineItemInput.hmCharge's own doc comment.
  hmCharge?: number;
  inventoryStockId?: string | null;
  // "Purchased From" — required on a line with no linked stock, see
  // lib/inventory/line-source-party.ts.
  vendorId?: string | null;
  // A piece made of several metals/stones — its rows (lib/piece-components.ts).
  multiPart?: boolean | null;
  components?: PieceComponentPayload[] | null;
  // Server-only: the resolved rows (resolvePieceLines), never from the client.
  piece?: ResolvedPiece;
};

export type KachaInvoiceFormState = {
  success: boolean;
  message: string;
  kachaInvoiceId?: string;
  invoiceId?: string;
};

const initialState: KachaInvoiceFormState = { success: false, message: "" };

// Duplicated from invoice-actions.ts/purchase-actions.ts (same per-file
// convention as the generateXNumber helpers) rather than a shared import.
export type PaymentEntryInput = {
  method: string;
  amount: number;
  reference?: string | null;
  bankName?: string | null;
  attachmentUrl?: string | null;
};

/**
 * Validates the 0-2 "Paid Now" payment-method rows kacha-invoice-form.tsx
 * sends. Zero rows is valid here (a fresh slip may be fully on credit) —
 * unlike recordKachaInvoicePayment's own plain `amount` field, which only
 * ever collects against a balance already known to be positive.
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
function lineMetalValue(item: KachaInvoiceLineItemInput) {
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
 * come from its own stored rows; only rates come from the client. Adapted
 * from invoice-actions.ts's resolvePieceLines (duplicated per action file,
 * same convention as lineQuantity). A Kacha slip carries no GST, so no row
 * snapshots a GST rate — convertKachaToPakka taxes them at the rate picked
 * there.
 */
async function resolvePieceLines(
  storeId: string,
  items: KachaInvoiceLineItemInput[],
): Promise<{ error: string } | KachaInvoiceLineItemInput[]> {
  const resolved = await resolvePieceRows(storeId, items);
  if ("error" in resolved) return resolved;
  const out: KachaInvoiceLineItemInput[] = [];
  for (const item of resolved) {
    const next = resolveLineStoneDetails(item, Boolean(item.piece));
    if ("error" in next) return next;
    out.push(next);
  }
  return out;
}

async function resolvePieceRows(
  storeId: string,
  items: KachaInvoiceLineItemInput[],
): Promise<{ error: string } | KachaInvoiceLineItemInput[]> {
  const isPiece = (item: KachaInvoiceLineItemInput) => Boolean(item.multiPart && item.components?.length);
  if (!items.some(isPiece)) return items.map((item) => ({ ...item, piece: undefined }));

  const resolvePiece = await getPieceResolver(storeId, { valuation: "net" });
  const linkedIds = items.filter((item) => isPiece(item) && item.inventoryStockId).map((item) => item.inventoryStockId as string);
  // A linked piece's rows: its own, else its multi-metal/multi-stone
  // Product's (lib/inventory/stock-piece-rows.ts) — physical facts locked.
  const storedByStock = await lockedStockPieceRows(storeId, linkedIds);

  const out: KachaInvoiceLineItemInput[] = [];
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
          // Kept (not shown on the slip) so converting to a Pakka invoice
          // taxes each row at the stock piece's own rate.
          gstRateId: row.gstRateId,
        };
      });
    }
    // A hand-typed row keeps its "GST if billed" rate (hidden on the slip),
    // so conversion taxes each row at its own rate.
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
      dmoWeight: null,
    });
  }
  return out;
}

function lineTotal(item: KachaInvoiceLineItemInput) {
  const metalValue = lineMetalValue(item);
  return (
    metalValue + toNumber(item.makingCharge) + toNumber(item.hmCharge) + toNumber(item.stoneCharge)
  );
}

type KachaTotals = {
  subtotal: number;
  makingCharges: number;
  stoneCharges: number;
  discount: number;
  roundOffAmount: number;
  totalAmount: number;
};

/** A slip's totals from its (resolved) lines — shared by the form and the
 * Excel import so both land on the same figures. */
function computeKachaTotals(items: KachaInvoiceLineItemInput[], discount: number): KachaTotals {
  const subtotal = items.reduce((sum, item) => sum + lineMetalValue(item), 0);
  // Hallmarking charge folds into the slip's Making Charges total — same
  // convention as invoice-actions.ts's own makingCharges.
  const makingCharges = items.reduce(
    (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
    0,
  );
  const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
  const rawTotal = subtotal + makingCharges + stoneCharges - discount;
  // Indian-billing convention: the persisted Total is always a whole
  // rupee, with the (small, signed) adjustment recorded separately rather
  // than silently absorbed — see lib/round-off.ts.
  const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);
  return { subtotal, makingCharges, stoneCharges, discount, roundOffAmount, totalAmount };
}

function kachaPaymentStatus(totalAmount: number, paidAmount: number) {
  const balanceAmount = Math.max(0, totalAmount - paidAmount);
  let status: InvoiceStatus = InvoiceStatus.PAID;
  if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
  else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;
  return { balanceAmount, status };
}

type WriteKachaSlipInput = {
  storeId: string;
  slipNumber: string;
  customerId: string;
  invoiceDate: Date;
  totals: KachaTotals;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
  notes: string | null;
  locationId: string | null;
  items: KachaInvoiceLineItemInput[];
  /** Stock rows (already checked to be this store's) the lines may sell. */
  validStockIds: ReadonlySet<string>;
  /** "Purchased From" party names by id, from resolveLineSourceParties. */
  sourcePartyNames: Map<string, string>;
  fineOf: FineWeightResolver;
  payments: PaymentEntryInput[];
  /** False only when restoring a slip whose ledger rows are still on the
   * ledger (delete-all removes slips, not their ledger entries). */
  postLedger?: boolean;
  convertedToId?: string | null;
};

/**
 * Writes one slip and every side effect it has — the slip and its lines,
 * "Purchased From" parties flagged as suppliers, linked stock sold, and the
 * party's ledger (SALE debit for the total + one PAYMENT_IN credit per
 * payment). The single write path for both the New Estimate form
 * (createKachaInvoice) and the Excel import, so an imported slip moves the
 * party balance exactly like a typed one. Runs inside the caller's
 * transaction; the caller validates everything first.
 */
async function writeKachaSlip(tx: Prisma.TransactionClient, input: WriteKachaSlipInput) {
  const {
    storeId,
    slipNumber,
    customerId,
    totals,
    items,
    validStockIds,
    sourcePartyNames,
    fineOf,
    payments,
  } = input;
  const locationId = input.locationId ?? undefined;
  const isManualLine = (item: KachaInvoiceLineItemInput) =>
    !item.inventoryStockId || !validStockIds.has(item.inventoryStockId);

  const created = await tx.kachaInvoice.create({
    data: {
      storeId,
      slipNumber,
      customerId,
      invoiceDate: input.invoiceDate,
      status: input.status,
      subtotal: totals.subtotal,
      makingCharges: totals.makingCharges,
      stoneCharges: totals.stoneCharges,
      discount: totals.discount,
      roundOffAmount: totals.roundOffAmount,
      totalAmount: totals.totalAmount,
      paidAmount: input.paidAmount,
      balanceAmount: input.balanceAmount,
      notes: input.notes,
      locationId,
      convertedToId: input.convertedToId ?? undefined,
      items: {
        create: items.map((item) => ({
          itemName: item.itemName,
          metalTypeId: item.metalTypeId ?? undefined,
          purity: item.purity ?? undefined,
          purityLabel: item.purityLabel ?? undefined,
          quantity: item.quantity || 1,
          grossWeight: item.grossWeight ?? undefined,
          netWeight: item.netWeight ?? undefined,
          ...storedLineWeights(item, fineOf),
          components: item.piece ? { create: pieceComponentCreates(item.piece.components) } : undefined,
          stoneWeight: item.stoneWeight ?? undefined,
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
          hmCharge: item.hmCharge ?? 0,
          lineTotal: lineTotal(item),
          inventoryStockId: isManualLine(item) ? undefined : (item.inventoryStockId as string),
          vendorId: isManualLine(item) ? item.vendorId ?? undefined : undefined,
          vendorName: isManualLine(item) && item.vendorId ? sourcePartyNames.get(item.vendorId) : undefined,
        })),
      },
    },
  });

  await markSourcePartiesAsSuppliers(tx, storeId, sourcePartyNames.keys());

  for (const item of items) {
    if (isManualLine(item)) continue;
    const stockId = item.inventoryStockId as string;

    // Decrement rather than flipping the whole row to SOLD: a row of
    // 100 pieces that sells 2 still has 98 on hand. Marking it SOLD
    // outright made the remainder vanish from stock.
    const soldQty = Math.max(1, item.quantity || 1);

    // The `quantity: { gte: soldQty }` guard is what actually prevents
    // overselling under concurrency — see invoice-actions.ts's
    // createInvoice for the full reasoning (identical here). A stale
    // JS-side `quantity` read beforehand can never provide that
    // guarantee, since two concurrent slips can both read the same
    // starting value before either decrements.
    // saleAmount is deliberately left untouched — see the identical
    // comment in invoice-actions.ts's createInvoice.
    const { count } = await tx.inventoryStock.updateMany({
      where: { id: stockId, storeId, quantity: { gte: soldQty } },
      data: { quantity: { decrement: soldQty } },
    });

    if (count === 0) {
      throw new OversellError(
        `Not enough stock left for ${item.itemName || "an item"} — it may have just been sold in another sale. Refresh and try again.`,
      );
    }

    // Only the last piece leaving turns the row SOLD — read the
    // post-decrement quantity back rather than computing it from the
    // pre-decrement value, which the guard above proved cannot be
    // trusted under concurrency.
    const updatedStock = await tx.inventoryStock.findUniqueOrThrow({
      where: { id: stockId },
      select: { quantity: true, status: true },
    });
    if (updatedStock.quantity <= 0 && updatedStock.status !== InventoryStockStatus.SOLD) {
      await tx.inventoryStock.update({
        where: { id: stockId },
        data: { status: InventoryStockStatus.SOLD },
      });
    }

    await tx.inventoryTransaction.create({
      data: {
        inventoryStockId: stockId,
        transactionType: InventoryTransactionType.SALE,
        quantity: soldQty,
        netWeight: item.netWeight ?? undefined,
        referenceType: "KachaInvoice",
        referenceId: created.id,
      },
    });
  }

  if (input.postLedger === false) return created;

  // DEBIT is the full totalAmount, not balanceAmount — same fix and same
  // reasoning as invoice-actions.ts's createInvoice: debiting only the
  // net-of-upfront-payment balanceAmount while *also* crediting that same
  // upfront payment (the loop below) double-counts it, making the ledger
  // balance too negative by the paid-at-creation amount. Gated on
  // totalAmount so a fully-paid-at-creation estimate still gets this
  // DEBIT to offset its own CREDIT rows.
  if (totals.totalAmount > 0) {
    await tx.ledgerEntry.create({
      data: {
        storeId,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.SALE,
        customerId,
        amount: totals.totalAmount,
        description: kachaSaleLedgerDescription(slipNumber),
        locationId,
      },
    });
  }

  // One CREDIT entry per payment-method row actually collected at the
  // moment of sale. LedgerEntry has no kachaInvoiceId column (only
  // invoiceId/purchaseId) — same limitation the balance-due entry above
  // already lives with, and recordKachaInvoicePayment's own CREDIT entry
  // does too — so these rows are identified by customerId + description
  // only, same as every other Kacha ledger entry today.
  for (const [index, payment] of payments.entries()) {
    await tx.ledgerEntry.create({
      data: {
        storeId,
        type: LedgerEntryType.CREDIT,
        sourceType: LedgerSourceType.PAYMENT_IN,
        customerId,
        amount: payment.amount,
        paymentMethod: payment.method as PaymentMethod,
        paymentReference: payment.reference ?? undefined,
        bankName: payment.bankName ?? undefined,
        attachmentUrl: payment.attachmentUrl ?? undefined,
        locationId,
        description: index === 0 ? `Payment received for ${slipNumber}` : undefined,
      },
    });
  }

  return created;
}

/** The SALE debit's description — the only link from a ledger row back to
 * its slip (LedgerEntry has no kachaInvoiceId). */
function kachaSaleLedgerDescription(slipNumber: string) {
  return `Estimate ${slipNumber} balance due`;
}

/**
 * A disabled input on kacha-invoice-form.tsx is a UI courtesy, not
 * enforcement — a direct/tampered request can still submit anything for a
 * field the UI locks once a real InventoryStock row is picked. This
 * overwrites every physical field (item name, metal/purity, weights,
 * embedded stone) with that stock row's own saved values before they ever
 * reach the DB, for every line that explicitly picked one.
 * Deliberately no HSN Code here — unlike InvoiceItem, KachaInvoiceItem has
 * no hsnCode column at all (the Kacha form never wires one up). Unlike
 * Purchase's lockLinkedProductFields, no placeholder-substitution carve-out
 * is needed either — inventoryStockId is nullable and a manual line
 * legitimately has none, so an item with no id at all simply passes
 * through untouched. Mirrors purchase-actions.ts's own
 * lockLinkedProductFields, adapted for InventoryStock instead of Product.
 */
async function lockLinkedStockFields(
  storeId: string,
  items: KachaInvoiceLineItemInput[],
  explicitStockIds: ReadonlySet<string>,
): Promise<KachaInvoiceLineItemInput[]> {
  if (explicitStockIds.size === 0) return items;

  const stockRows = await prisma.inventoryStock.findMany({
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
      product: { select: { name: true } },
    },
  });
  const stockById = new Map(stockRows.map((stock) => [stock.id, stock]));

  return items.map((item) => {
    const stock = item.inventoryStockId ? stockById.get(item.inventoryStockId) : undefined;
    if (!stock) return item;

    return {
      ...item,
      itemName: stock.product.name,
      metalTypeId: stock.metalTypeId,
      purity: stock.purity,
      purityLabel: stock.purityLabel,
      grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
      netWeight: stock.netWeight ? Number(stock.netWeight) : null,
      caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
      stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
      stoneMetalTypeName: stock.stoneMetalTypeName,
      stoneTypeNames: stock.stoneTypeNames,
    };
  });
}

async function generateSlipNumber(storeId: string) {
  return (await slipNumberAllocator(storeId))();
}

/**
 * Hands out this year's next slip numbers, one per call. Counts on from the
 * highest number already used rather than from a COUNT of slips — a count
 * repeats a number still in use once any slip has been deleted (or a deleted
 * slip restored under its own number), and the second create then fails on
 * @@unique([storeId, slipNumber]). `reserved` = numbers about to be written
 * by the same caller (an import keeping original numbers), skipped too.
 */
async function slipNumberAllocator(storeId: string, reserved: ReadonlySet<string> = new Set()) {
  const prefix = `KACHA-${new Date().getFullYear()}-`;
  const existing = await prisma.kachaInvoice.findMany({
    where: { storeId, slipNumber: { startsWith: prefix } },
    select: { slipNumber: true },
  });
  const taken = new Set([...existing.map((row) => row.slipNumber), ...reserved]);
  let next =
    Math.max(
      0,
      ...[...taken]
        .filter((number) => number.startsWith(prefix))
        .map((number) => Number(number.slice(prefix.length)))
        .filter((value) => Number.isInteger(value)),
    ) + 1;

  return () => {
    let number = `${prefix}${String(next).padStart(4, "0")}`;
    while (taken.has(number)) number = `${prefix}${String(++next).padStart(4, "0")}`;
    next += 1;
    taken.add(number);
    return number;
  };
}

function mapKachaInvoice(kachaInvoice: any) {
  return {
    id: kachaInvoice.id,
    slipNumber: kachaInvoice.slipNumber,
    invoiceDate: kachaInvoice.invoiceDate.toISOString(),
    status: kachaInvoice.status as InvoiceStatus,
    subtotal: Number(kachaInvoice.subtotal),
    makingCharges: Number(kachaInvoice.makingCharges),
    stoneCharges: Number(kachaInvoice.stoneCharges),
    discount: Number(kachaInvoice.discount),
    roundOffAmount: Number(kachaInvoice.roundOffAmount),
    totalAmount: Number(kachaInvoice.totalAmount),
    paidAmount: Number(kachaInvoice.paidAmount),
    balanceAmount: Number(kachaInvoice.balanceAmount),
    notes: kachaInvoice.notes,
    convertedToId: kachaInvoice.convertedToId,
    convertedTo: kachaInvoice.convertedTo
      ? {
          id: kachaInvoice.convertedTo.id,
          invoiceNumber: kachaInvoice.convertedTo.invoiceNumber,
        }
      : null,
    customer: kachaInvoice.customer
      ? {
          id: kachaInvoice.customer.id,
          name: kachaInvoice.customer.name,
          phone: kachaInvoice.customer.phone,
          gstin: kachaInvoice.customer.gstin,
        }
      : null,
    items: (kachaInvoice.items ?? []).map((item: any) => ({
      id: item.id,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
      purityLabel: item.purityLabel,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      stoneWeight: item.stoneWeight ? Number(item.stoneWeight) : null,
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
      hmCharge: Number(item.hmCharge ?? 0),
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
      vendorName: item.vendorName ?? null,
      // A piece of several metals/stones — see PieceBreakdown.
      components: item.components ? serializeStoredComponents(item.components) : [],
    })),
  };
}

export type KachaInvoiceSortField = "invoiceDate" | "slipNumber" | "totalAmount";

const KACHA_INVOICE_SORT_FIELDS: KachaInvoiceSortField[] = [
  "invoiceDate",
  "slipNumber",
  "totalAmount",
];

function isKachaInvoiceSortField(value: unknown): value is KachaInvoiceSortField {
  return KACHA_INVOICE_SORT_FIELDS.includes(value as KachaInvoiceSortField);
}

export type GetKachaInvoicesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: KachaInvoiceSortField | string;
  sortOrder?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
};

type KachaInvoiceQueryParams = {
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: KachaInvoiceSortField | string;
  sortOrder?: "asc" | "desc" | string;
  selectedIds?: string[];
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Shared where/orderBy builder for the Kacha slip list and the export
 * action, so the two never drift apart on what "the filtered set" means.
 */
function buildKachaInvoiceQuery(
  params: KachaInvoiceQueryParams,
  storeId: string,
  scope: LocationScope,
) {
  const search = String(params.search || "").trim();
  const status =
    params.status && params.status !== "ALL" && params.status in InvoiceStatus
      ? (params.status as InvoiceStatus)
      : undefined;
  const sortBy = isKachaInvoiceSortField(params.sortBy) ? params.sortBy : "invoiceDate";
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
            { slipNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy = { [sortBy]: sortOrder } as const;

  return { where, orderBy };
}

export async function getKachaInvoices(params: GetKachaInvoicesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));

  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const { where, orderBy } = buildKachaInvoiceQuery(params, storeId, scope);

  const [totalCount, kachaInvoices] = await Promise.all([
    prisma.kachaInvoice.count({ where }),
    prisma.kachaInvoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true, gstin: true } },
        convertedTo: { select: { id: true, invoiceNumber: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    kachaInvoices: kachaInvoices.map(mapKachaInvoice),
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

export type ExportKachaInvoicesParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
  format?: "csv" | "xlsx" | "pdf";
};

export type ExportKachaInvoicesResult = {
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
};

/** Exports the same filtered/sorted set the Kacha Slips list is currently showing. */
export async function exportKachaInvoicesToExcel(
  params: ExportKachaInvoicesParams = {},
): Promise<ExportKachaInvoicesResult> {
  try {
    const storeId = await requireStoreScope();
    const wf = await getWeightFormat(storeId);
    await assertPlanActiveForExport(storeId);
    const scope = await getLocationScope();
    const { where, orderBy } = buildKachaInvoiceQuery(params, storeId, scope);

    const kachaInvoices = await prisma.kachaInvoice.findMany({
      where,
      orderBy,
      include: KACHA_SHEET_INCLUDE,
    });

    if (!kachaInvoices.length) {
      return { success: false, message: "No Estimates found to export." };
    }

    // PDF: one readable row per slip. CSV/Excel: the import template's own
    // columns, one row per line item, so the file can be imported back.
    const pdfRows = () =>
      kachaInvoices.map((kachaInvoice, index) => ({
        "Sr. No.": index + 1,
        "Slip #": kachaInvoice.slipNumber,
        Date: formatShortDate(kachaInvoice.invoiceDate.toISOString()),
        Party: kachaInvoice.customer?.name || "",
        Status: KACHA_STATUS_LABELS[kachaInvoice.status] ?? kachaInvoice.status,
        Subtotal: Number(kachaInvoice.subtotal),
        "Making Charges": Number(kachaInvoice.makingCharges),
        "Stone Charges": Number(kachaInvoice.stoneCharges),
        Discount: Number(kachaInvoice.discount),
        Total: Number(kachaInvoice.totalAmount),
        Paid: Number(kachaInvoice.paidAmount),
        Balance: Number(kachaInvoice.balanceAmount),
        "Converted To Invoice #": kachaInvoice.convertedTo?.invoiceNumber || "",
        // A piece of several metals/stones — its rows, per line.
        [METALS_AND_STONES_COLUMN]: kachaInvoice.items
          .filter((item) => item.components.length)
          .map((item) => `${item.itemName}: ${describePieceComponentsText(item.components, wf)}`)
          .join(" | "),
      }));
    // This store's columns only (lib/sheet-features.ts).
    const features = await getSheetFeatures(storeId);
    const headers = kachaSheetHeaders(features);
    const rows = kachaSheetRows(kachaInvoices, headers);

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "estimates")
        : params.format === "pdf"
          ? buildPdfExportBase64(pdfRows(), "Estimates", "estimates")
          : buildImportTemplateWithDropdowns({
              sheetName: "Estimates",
              rows,
              columns: headers,
              dropdowns: dropdownsFor(await loadKachaSheetDropdowns(storeId), headers),
              instructions: { notes: KACHA_SHEET_NOTES, rows: kachaSheetInstructions(features) },
              filePrefix: "estimates",
            });

    return {
      success: true,
      message: "Estimates exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    logger.error("exportKachaInvoicesToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export Estimates.") };
  }
}

export async function getKachaInvoiceById(id: string) {
  const storeId = await getStoreIdForRead();

  const kachaInvoice = await prisma.kachaInvoice.findFirst({
    where: { id, storeId },
    include: {
      customer: { select: { id: true, name: true, phone: true, gstin: true } },
      items: {
        include: {
          components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } },
        },
      },
      convertedTo: { select: { id: true, invoiceNumber: true } },
    },
  });

  if (!kachaInvoice) return null;
  return mapKachaInvoice(kachaInvoice);
}

export type KachaInvoice = NonNullable<Awaited<ReturnType<typeof getKachaInvoiceById>>>;

/** Same customer/stock pools as the Pakka invoice form — no need to duplicate the queries. */
export const getKachaInvoiceFormCustomers = getInvoiceFormCustomers;
export const getKachaInvoiceFormStockItems = getInvoiceFormStockItems;

/**
 * Create a Kacha slip with its line items in one transaction. Same
 * stock/ledger side-effects as createInvoice, minus any tax handling —
 * a Kacha slip is a real sale, just without GST paperwork yet.
 */
export async function createKachaInvoice(
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const customerId = String(formData.get("customerId") || "");
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!customerId) {
      return { success: false, message: "Please select a party" };
    }

    let items: KachaInvoiceLineItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Don't trust client-submitted charge type — coerce anything unexpected
    // (missing, malformed, or a value outside the enum) down to FIXED.
    items = items.map((item) => ({
      ...item,
      makingChargeType: toChargeType(item.makingChargeType),
    }));

    // Moved ahead of every total below — see lockLinkedStockFields' call
    // just below for why storeId has to be available before subtotal is
    // computed from `items`, not only from its later use (customer lookup,
    // location resolution, etc).
    const storeId = await requireStoreScope();
    const fineOf = await getFineWeightResolver(storeId);

    // Captured directly off the freshly-parsed items — a Kacha line's
    // inventoryStockId is nullable and a manual line legitimately has none,
    // so no placeholder-substitution carve-out is needed the way Purchase's
    // explicitProductIds requires.
    const explicitStockIds = new Set(
      items.filter((item) => item.inventoryStockId).map((item) => item.inventoryStockId as string),
    );

    // Must happen before every total below is computed from `items` — a
    // Kacha slip's own subtotal is priced off Net/Carat Weight (see
    // lineQuantity), which this can change, so pricing has to see the
    // locked, trustworthy value rather than whatever the client submitted
    // for a field the UI no longer lets it edit.
    items = await lockLinkedStockFields(storeId, items, explicitStockIds);
    const pieceLines = await resolvePieceLines(storeId, items);
    if ("error" in pieceLines) return { success: false, message: pieceLines.error };
    items = pieceLines;

    const discount = toNumber(formData.get("discount"));

    // paymentsJson (1-2 method rows, or none for a fully-on-credit slip) is
    // what kacha-invoice-form.tsx's "Paid Now" section sends. See
    // createInvoice's identical fallback in invoice-actions.ts for why a
    // missing paymentsJson field still works off the legacy plain
    // `paidAmount` (no current caller relies on that here, but kept for
    // the same robustness/consistency across all three creation actions).
    const paymentsRaw = formData.get("paymentsJson");
    const payments = paymentsRaw !== null ? parseOptionalPayments(String(paymentsRaw)) : [];
    if (payments === null) {
      return {
        success: false,
        message: "Add 1-2 valid payment methods with an amount, or leave Paid Now blank for a fully-on-credit slip.",
      };
    }
    // Customer Exchange — what the customer sells the shop against this slip
    // (lib/old-gold/exchange.ts), parsed and recomputed server-side exactly
    // as createInvoice does; the form's figures are only a preview.
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
      paymentsRaw !== null
        ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
        : toNumber(formData.get("paidAmount"));
    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;

    const totals = computeKachaTotals(items, discount);
    const { totalAmount } = totals;

    // The exchange goes against the slip first (Kacha has no store-credit
    // apply); cash only covers what's left, and any value beyond the slip is
    // excess — kept as store credit or paid out, as chosen. Same order as
    // createInvoice.
    const oldGoldSplit = splitOldGoldValue(oldGold.total, totalAmount);
    if (oldGoldSplit.excess > 0 && oldGoldExcessMode === OldGoldExcessMode.PAID_OUT && !oldGoldPayoutMethod) {
      return { success: false, message: "Choose how the exchange balance is paid out to the customer." };
    }
    paidAmount = round2(paidAmount + oldGoldSplit.applied);
    if (oldGoldSplit.applied > 0 && paidAmount > totalAmount + 0.01) {
      return {
        success: false,
        message: `Payments exceed what's left to pay after the customer exchange (₹${Math.max(0, totalAmount - oldGoldSplit.applied).toFixed(2)}).`,
      };
    }
    const { balanceAmount, status } = kachaPaymentStatus(totalAmount, paidAmount);

    // storeId was already resolved above (ahead of the subtotal/totals
    // calculation, so lockLinkedStockFields could run before them) — not
    // re-resolved here.

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a party" };
    }
    // Only the exchange's records carry who created them.
    const actor = oldGold.lines.length ? await getCurrentUser() : null;

    // See resolveWritableLocationId's own doc comment — without this, a
    // location-restricted Staff user submitting no location at all saved
    // the slip with locationId: null, which then never matches their own
    // location-scoped list afterward.
    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    // Every referenced stock item must belong to this store — otherwise a
    // crafted itemsJson could link a line item to another store's stock,
    // leaking its details (and, via the SOLD-status update below, its
    // invoice/customer info) into this slip.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((id): id is string => !!id)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true, stockCode: true, quantity: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));
    const isManualLine = (item: KachaInvoiceLineItemInput) =>
      !item.inventoryStockId || !validStockIds.has(item.inventoryStockId);

    const sourceParties = await resolveLineSourceParties(storeId, items.filter(isManualLine));
    if ("error" in sourceParties) return { success: false, message: sourceParties.error };

    // A stock row can hold many pieces. Selling some must not exceed what is
    // on hand, and two line items can point at the same row, so the check
    // sums per row rather than per line.
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

    const slipNumber = await generateSlipNumber(storeId);

    // Default interactive-transaction timeout is 5s — the per-item stock
    // decrement loop below can exceed that on a multi-line slip over a real
    // (non-local) DB connection and throw P2028 ("Transaction not found").
    // Same fix as createInvoice/createPurchase's identical transactions.
    const kachaInvoice = await prisma.$transaction(async (tx) => {
      const created = await writeKachaSlip(tx, {
        storeId,
        slipNumber,
        customerId,
        invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : new Date(),
        totals,
        paidAmount,
        balanceAmount,
        status,
        notes,
        locationId: resolvedLocationId,
        items,
        validStockIds,
        sourcePartyNames: sourceParties.names,
        fineOf,
        payments,
      });

      // Customer → Business half of a Customer Exchange: the EX purchase,
      // its stock and the customer's OLD_GOLD_EXCHANGE credit (keyed by the
      // purchase, not the slip) — alongside the SALE debit / PAYMENT_IN
      // credits above, same as on an invoice.
      if (oldGold.lines.length) {
        await recordOldGoldExchange(tx, {
          storeId,
          customerId,
          customerName: customer.name,
          kachaInvoiceId: created.id,
          invoiceNumber: slipNumber,
          lines: oldGold.lines,
          total: oldGold.total,
          applied: oldGoldSplit.applied,
          excess: oldGoldSplit.excess,
          excessMode: oldGoldExcessMode,
          payout: oldGoldPayoutMethod
            ? { method: oldGoldPayoutMethod, reference: oldGoldPayoutReference }
            : null,
          locationId: resolvedLocationId,
          actor: {
            id: actor?.id ?? null,
            name: actor?.name ?? null,
            email: actor?.email ?? null,
            role: (actor?.role as UserRole | undefined) ?? null,
          },
        });
      }

      return created;
    }, { timeout: 15000 });

    revalidatePath("/billing/kacha");

    return {
      success: true,
      message: `Estimate ${slipNumber} created`,
      kachaInvoiceId: kachaInvoice.id,
    };
  } catch (error) {
    if (error instanceof OversellError) {
      return { success: false, message: error.message };
    }
    logger.error("createKachaInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to create Estimate") };
  }
}

/**
 * Record a payment against a Kacha slip's outstanding balance. Mirrors
 * recordInvoicePayment.
 */
export async function recordKachaInvoicePayment(
  kachaInvoiceId: string,
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const amount = toNumber(formData.get("amount"));
    const notes = String(formData.get("notes") || "").trim() || null;

    if (amount <= 0) {
      return { success: false, message: "Enter a valid payment amount" };
    }

    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({
      where: { id: kachaInvoiceId, storeId },
    });
    if (!kachaInvoice) return { success: false, message: "Estimate not found" };

    // Reject rather than silently clamp — see recordInvoicePayment's own
    // comment on this exact check.
    const currentBalance = Number(kachaInvoice.balanceAmount);
    if (amount > currentBalance) {
      return {
        success: false,
        message: `Amount exceeds the outstanding balance of ₹${currentBalance.toLocaleString("en-IN")}`,
      };
    }

    const newPaid = Number(kachaInvoice.paidAmount) + amount;
    const newBalance = Math.max(0, Number(kachaInvoice.totalAmount) - newPaid);
    const status: InvoiceStatus =
      newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    await prisma.$transaction([
      prisma.kachaInvoice.updateMany({
        where: { id: kachaInvoiceId, storeId },
        data: { paidAmount: newPaid, balanceAmount: newBalance, status },
      }),
      prisma.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.PAYMENT_IN,
          customerId: kachaInvoice.customerId,
          amount,
          description: notes ?? `Payment received for ${kachaInvoice.slipNumber}`,
          locationId: kachaInvoice.locationId ?? undefined,
        },
      }),
    ]);

    revalidatePath("/billing/kacha");
    revalidatePath(`/billing/kacha/${kachaInvoiceId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    logger.error("recordKachaInvoicePayment error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to record payment") };
  }
}

/**
 * Convert a Kacha slip into a formal Pakka (GST) invoice. Copies the
 * customer/items/weights/charges across, applies tax fields supplied on
 * this form, and links the two records both ways. Does not re-trigger
 * stock SOLD transitions or a second sale-debit ledger entry — the stock
 * was already sold and the ledger already reflects the amount owed at
 * Kacha creation; this is a paperwork upgrade, not a second sale.
 */
export async function convertKachaToPakka(
  kachaInvoiceId: string,
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({
      where: { id: kachaInvoiceId, storeId },
      include: {
        items: { include: { components: { orderBy: { sortOrder: "asc" } } } },
        customer: { select: { state: true } },
      },
    });

    if (!kachaInvoice) {
      return { success: false, message: "Estimate not found" };
    }

    if (kachaInvoice.convertedToId) {
      return { success: false, message: "This Estimate has already been converted" };
    }

    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || kachaInvoice.notes;
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const invoiceSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { invoicePrefix: true, invoiceStartingNo: true, gstScheme: true, state: true },
    });

    // Recomputed per line via the same computeGst() every other invoice
    // creation path uses (createInvoice/updateInvoiceLineItem) — this used
    // to trust a single flat `taxAmount` the client computed as
    // `taxableAmount * gstRate / 100` with no SGST/CGST/IGST split at all
    // and no Composition check, so InvoiceItem.sgstAmount/cgstAmount/
    // igstAmount stayed 0 on every converted invoice (the printed tax
    // table showed ₹0 despite a nonzero Total) and a Composition-scheme
    // store — legally barred from charging any GST — could still convert a
    // slip and pick a real GST rate for it. computeGst() itself zeroes the
    // breakdown unconditionally for COMPOSITION regardless of rate picked,
    // so deriving taxAmount from it here closes both gaps at once.
    const gstRatePercent = gstRateSnapshot?.gstRatePercent ? Number(gstRateSnapshot.gstRatePercent) : 0;
    const gstScheme = invoiceSettings?.gstScheme ?? "REGULAR_B2C";
    const storeState = invoiceSettings?.state ?? null;
    const customerState = kachaInvoice.customer?.state ?? null;

    // Per line, the same base as a direct invoice (metal × quantity +
    // making + HM + stone; a multi-part piece row by row at each row's own
    // rate) — shared with the convert screen's preview (lib/conversion-gst.ts)
    // so the preview is exactly what's saved.
    const conversion = conversionGst(
      kachaInvoice.items.map(toConversionGstItem),
      gstRatePercent,
      gstScheme,
      storeState,
      customerState,
    );
    const itemGst = conversion.perItem;
    const taxAmount = conversion.taxAmount;

    const subtotal = Number(kachaInvoice.subtotal);
    const makingCharges = Number(kachaInvoice.makingCharges);
    const stoneCharges = Number(kachaInvoice.stoneCharges);
    const discount = Number(kachaInvoice.discount);
    const paidAmount = Number(kachaInvoice.paidAmount);

    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Same Indian-billing round-off convention as createKachaInvoice, applied
    // here to the new Invoice being created (not the source KachaInvoice,
    // which keeps its own already-persisted roundOffAmount untouched).
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const invoicePrefix = invoiceSettings?.invoicePrefix?.trim() || "INV";
    const invoiceStartingNo = invoiceSettings?.invoiceStartingNo ?? 1;
    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: { storeId, invoiceNumber: { startsWith: `${invoicePrefix}-${year}-` } },
    });
    const invoiceNumber = `${invoicePrefix}-${year}-${String(count + invoiceStartingNo).padStart(4, "0")}`;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          storeId,
          invoiceNumber,
          customerId: kachaInvoice.customerId,
          invoiceDate: kachaInvoice.invoiceDate,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : undefined,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          roundOffAmount,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes,
          // Carries the slip's own location forward — otherwise the
          // converted invoice reverts to locationId: null even though the
          // slip it came from had one, the same visibility gap this
          // session fixed on plain invoice/slip creation.
          locationId: kachaInvoice.locationId ?? undefined,
          gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
          gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
          items: {
            create: kachaInvoice.items.map((item, index) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              purityLabel: item.purityLabel ?? undefined,
              quantity: item.quantity,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              fineWeight: item.fineWeight ?? undefined,
              wastagePercent: item.wastagePercent ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: item.makingChargeType,
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              stonePieces: item.stonePieces ?? null,
              stoneClarity: item.stoneClarity ?? null,
              stoneCertificateNumber: item.stoneCertificateNumber ?? null,
              dmoWeight: item.dmoWeight ?? undefined,
              hmCharge: item.hmCharge,
              lineTotal: item.lineTotal,
              inventoryStockId: item.inventoryStockId ?? undefined,
              sgstAmount: itemGst[index].sgst,
              cgstAmount: itemGst[index].cgst,
              igstAmount: itemGst[index].igst,
              // The slip's own metal/stone rows, copied as stored.
              components: item.components.length
                ? {
                    create: item.components.map((row) => ({
                      kind: row.kind,
                      sortOrder: row.sortOrder,
                      metalTypeId: row.metalTypeId,
                      purity: row.purity,
                      purityLabel: row.purityLabel,
                      grossWeight: row.grossWeight,
                      netWeight: row.netWeight,
                      fineWeight: row.fineWeight,
                      wastagePercent: row.wastagePercent,
                      stoneMetalTypeName: row.stoneMetalTypeName,
                      stoneTypeNames: row.stoneTypeNames,
                      caratWeight: row.caratWeight,
                      stoneWeight: row.stoneWeight,
                      pieces: row.pieces,
                      clarity: row.clarity,
                      certificateNumber: row.certificateNumber,
                      rate: row.rate,
                      amount: row.amount,
                      gstRateId: row.gstRateId,
                      gstRateName: row.gstRateName,
                      gstRatePercent: row.gstRatePercent,
                    })),
                  }
                : undefined,
              gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
              gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
              gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
            })),
          },
        },
      });

      // Zero the source slip's own balanceAmount (and mark it PAID) once its
      // debt has moved onto the new Invoice — every outstanding-balance
      // aggregate in this app (Dashboard's Outstanding Receivables, the
      // general Payment In FIFO allocator, mapCustomer's pendingAmount, ...)
      // sums KachaInvoice.balanceAmount alongside Invoice.balanceAmount with
      // no convertedToId filter, so leaving this nonzero after conversion
      // double-counted the same debt under both rows.
      await tx.kachaInvoice.updateMany({
        where: { id: kachaInvoiceId, storeId },
        data: { convertedToId: created.id, balanceAmount: 0, status: InvoiceStatus.PAID },
      });

      // A Customer Exchange recorded on the slip now also belongs to the Tax
      // Invoice, so its detail page and prints show it. Nothing is posted:
      // the exchange's OLD_GOLD_EXCHANGE credit was written when the slip was
      // created, and its applied value is already in the slip's paidAmount
      // carried over above.
      await tx.purchase.updateMany({
        where: { storeId, exchangeKachaInvoiceId: kachaInvoiceId, isOldGoldExchange: true },
        data: { exchangeInvoiceId: created.id },
      });

      return created;
    });

    revalidatePath("/billing");
    revalidatePath("/billing/kacha");
    revalidatePath(`/billing/kacha/${kachaInvoiceId}`);
    revalidatePath(`/billing/${invoice.id}`);

    return {
      success: true,
      message: `Converted to Tax Invoice ${invoiceNumber}`,
      invoiceId: invoice.id,
    };
  } catch (error) {
    logger.error("convertKachaToPakka error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to convert to Tax Invoice") };
  }
}

/** Only DRAFT Kacha slips with no recorded payments and not yet converted can be deleted. */
export async function deleteKachaInvoice(id: string): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({ where: { id, storeId } });

    if (!kachaInvoice) return { success: false, message: "Estimate not found" };

    if (kachaInvoice.convertedToId) {
      return { success: false, message: "Cannot delete an Estimate that has been converted" };
    }

    if (kachaInvoice.status !== InvoiceStatus.DRAFT || Number(kachaInvoice.paidAmount) > 0) {
      return {
        success: false,
        message: "Only draft Estimates with no payments can be deleted",
      };
    }

    const { count } = await prisma.kachaInvoice.deleteMany({ where: { id, storeId } });
    if (count === 0) return { success: false, message: "Estimate not found" };

    revalidatePath("/billing/kacha");

    return { success: true, message: "Estimate deleted" };
  } catch (error) {
    logger.error("deleteKachaInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete Estimate") };
  }
}

/** The template/export dropdown lists, from this store's own masters. */
async function loadKachaSheetDropdowns(storeId: string): Promise<Record<string, string[]>> {
  const [metals, purities, parties, locations, settings] = await Promise.all([
    prisma.storeMetal.findMany({
      where: { storeId, isActive: true },
      select: { name: true, isGemstone: true },
      orderBy: { name: "asc" },
    }),
    prisma.storeMetalPurity.findMany({
      where: { storeId, isActive: true },
      select: { label: true },
      orderBy: [{ storeMetalId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.customer.findMany({
      where: { storeId, isArchived: false, isActive: true },
      select: { name: true, isSupplier: true },
      orderBy: { name: "asc" },
    }),
    prisma.storeLocation.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.businessSettings.findUnique({ where: { storeId }, select: { supplierModuleEnabled: true } }),
  ]);
  const methods = Object.values(KACHA_PAYMENT_METHOD_LABELS);

  return {
    "Party Name": parties.map((party) => party.name),
    // Same list as the form's Purchased From picker (getSupplierOptions).
    "Purchased From": parties
      .filter((party) => !settings?.supplierModuleEnabled || party.isSupplier)
      .map((party) => party.name),
    Location: locations.map((location) => location.name),
    Metal: metals.map((metal) => metal.name),
    Purity: purities.map((purity) => purity.label),
    "Making Charge Type": ["Fixed", "Percentage"],
    Stone: metals.filter((metal) => metal.isGemstone).map((metal) => metal.name),
    "Payment Method": methods,
    "Payment Method 2": methods,
  };
}

export type KachaImportResult = {
  success: boolean;
  message: string;
  createdCount?: number;
  /** Row-level problems. Populated only when nothing was created. */
  errors?: string[];
};

/**
 * The import template: the shared columns, an example row that imports as-is
 * (the store's own first party, metal and purity — never a made-up party),
 * an Instructions sheet and the store's dropdowns.
 */
export async function getKachaImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  const storeId = await requireStoreScope();
  const features = await getSheetFeatures(storeId);
  const headers = kachaSheetHeaders(features);
  const [dropdowns, metal] = await Promise.all([
    loadKachaSheetDropdowns(storeId),
    prisma.storeMetal.findFirst({
      where: { storeId, isActive: true, hasPurity: true },
      orderBy: { name: "asc" },
      select: { name: true, purities: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } } },
    }),
  ]);

  const example: Record<string, unknown> = Object.fromEntries(
    kachaSheetColumns(features).map((column) => [column.header, column.example]),
  );
  example.Date = formatSheetDate(new Date());
  example["Party Name"] = dropdowns["Party Name"][0] ?? "";
  example["Purchased From"] = dropdowns["Purchased From"][0] ?? dropdowns["Party Name"][0] ?? "";
  example.Metal = metal?.name ?? "";
  example.Purity = metal?.purities.find((purity) => /22/.test(purity.label))?.label ?? metal?.purities[0]?.label ?? "";

  return buildImportTemplateWithDropdowns({
    sheetName: "Estimates Import",
    rows: [example],
    columns: headers,
    dropdowns: dropdownsFor(dropdowns, headers),
    instructions: { notes: KACHA_SHEET_NOTES, rows: kachaSheetInstructions(features) },
    filePrefix: "estimate-import-template",
  });
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

/**
 * A backup's line-item sheet is the shared Estimate sheet itself (since
 * 2026-10-06) and is read as-is. Older backups split the slip and its items
 * across two sheets under other column names ("Slip #", "Party", "Item",
 * "Paid"); this flattens those into the template's one-row-per-line shape so
 * every format shares one validation and creation path.
 */
function flattenBackupWorkbook(
  slips: Record<string, unknown>[],
  items: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (items.length && "Item Name" in items[0]) return items;

  const slipByNumber = new Map<string, Record<string, unknown>>();
  for (const slip of slips) {
    const key = cell(slip, "Slip #");
    if (key) slipByNumber.set(key, slip);
  }

  return items.map((item) => {
    const slipNumber = cell(item, "Slip #");
    const slip = slipByNumber.get(slipNumber) ?? {};

    return {
      // Grouping key: rows of the same original slip rebuild as one slip.
      "Slip Ref": slipNumber,
      "Party Phone": cell(slip, "Party Phone"),
      "Party GSTIN": cell(slip, "Party GSTIN"),
      "Party Name": cell(slip, "Party"),
      Date: cell(slip, "Date"),
      "Item Name": cell(item, "Item"),
      Metal: cell(item, "Metal"),
      Purity: cell(item, "Purity"),
      Quantity: cell(item, "Quantity"),
      "Gross Weight": cell(item, "Gross Weight"),
      "Net Weight": cell(item, "Net Weight"),
      "DMO Weight": cell(item, "DMO Weight"),
      Rate: cell(item, "Rate"),
      "Making Charge": cell(item, "Making Charge"),
      "Making Charge Type": cell(item, "Making Charge Type"),
      // Old backups carried no HM charge — 0, not the auto-fill.
      "HM Charge": 0,
      "Stone Charge": cell(item, "Stone Charge"),
      // Slip-level totals live on the other sheet.
      Discount: cell(slip, "Discount"),
      "Paid Amount": cell(slip, "Paid"),
      Notes: cell(slip, "Notes"),
      "Converted To Invoice #": cell(slip, "Converted To Invoice"),
    };
  });
}

/** Slip numbers the app hands out — an Estimate's Slip Ref is kept as its
 * number only when it has this shape (and is free). */
const SLIP_NUMBER_RE = /^KACHA-\d{4}-\d+$/;

/**
 * Bulk-creates Estimates from an uploaded spreadsheet: the import template,
 * an Estimates Excel export, or a delete-all backup (restore).
 *
 * One row is one line item; rows sharing a **Slip Ref** are collapsed into a
 * single slip. Slip-level values (party, date, location, discount, payments,
 * notes) come from the first row of each group.
 *
 * Applies the New Estimate form's rules (party and "Purchased From" must be
 * existing parties, the store's metals and purities, a location the user may
 * bill against, payments no more than the total) and writes every slip
 * through writeKachaSlip — the form's own write path — so each one posts the
 * party's SALE debit and payment credits. All-or-nothing: the whole file is
 * checked first and then written in one transaction.
 *
 * A Slip Ref that is an app slip number (KACHA-YYYY-NNNN) not in use keeps
 * that number — restoring a backup or re-importing an export after a delete
 * gets the original numbers back. A restored slip whose sale is still on the
 * party's ledger (delete-all removes slips, not ledger entries) is not posted
 * a second time.
 */
export async function importKachaInvoicesFromExcel(
  formData: FormData,
): Promise<KachaImportResult> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STAFF]);
  } catch {
    return { success: false, message: "You do not have access to import Estimates." };
  }

  try {
    const storeId = await requireStoreScope();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "Choose a .xlsx or .csv file to import." };
    }

    const sheets = parseExcelWorkbook(await file.arrayBuffer());
    const sheetNames = Object.keys(sheets);

    // A backup produced by "Delete all" carries both sheets; anything else is
    // treated as the flat template (an export's first sheet is that too).
    const isBackup =
      sheetNames.includes(KACHA_BACKUP_SLIPS_SHEET) &&
      sheetNames.includes(KACHA_BACKUP_ITEMS_SHEET);

    // A column this store's sheets leave out (Location with no locations set
    // up) is ignored if a file still has it — never an error.
    const rows = stripHiddenSheetColumns(
      isBackup
        ? flattenBackupWorkbook(
            sheets[KACHA_BACKUP_SLIPS_SHEET] ?? [],
            sheets[KACHA_BACKUP_ITEMS_SHEET] ?? [],
          )
        : (sheets[sheetNames[0]] ?? []),
      hiddenSheetHeaders(KACHA_SHEET_COLUMNS, await getSheetFeatures(storeId)),
    );

    if (!rows.length) {
      return {
        success: false,
        message: isBackup
          ? "That backup has no line items to restore."
          : "That file has no rows to import.",
      };
    }

    // Group rows into slips. A blank Slip Ref means "this row is its own
    // slip" — otherwise every unreferenced row would merge into one.
    const groups = new Map<string, { row: Record<string, unknown>; line: number }[]>();

    rows.forEach((row, index) => {
      const ref = cell(row, "Slip Ref") || `__row_${index}`;
      const existing = groups.get(ref);
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const entry = { row, line: index + 2 };
      if (existing) existing.push(entry);
      else groups.set(ref, [entry]);
    });

    const [customers, metals, storePurities, locations, settings, fineOf, locationScope] = await Promise.all([
      prisma.customer.findMany({
        where: { storeId },
        select: { id: true, name: true, phone: true, gstin: true, isArchived: true, customerCode: true, vendorCode: true },
      }),
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true, isGemstone: true } }),
      prisma.storeMetalPurity.findMany({
        where: { storeId },
        select: { storeMetalId: true, label: true, isHallmarkable: true },
      }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true, isActive: true } }),
      prisma.businessSettings.findUnique({ where: { storeId }, select: { hallmarkChargePerPiece: true } }),
      getFineWeightResolver(storeId),
      getLocationScope(),
    ]);
    // BusinessSettings is created lazily; 45 is its column default.
    const hallmarkCharge = Number(settings?.hallmarkChargePerPiece ?? 45);

    const lower = (value: string) => value.trim().toLowerCase();
    const liveParties = customers.filter((c) => !c.isArchived);
    const byPhone = new Map(liveParties.filter((c) => c.phone).map((c) => [c.phone!.trim(), c]));
    const byGstin = new Map(liveParties.filter((c) => c.gstin).map((c) => [c.gstin!.trim().toUpperCase(), c]));
    const byName = new Map(liveParties.map((c) => [lower(c.name), c]));
    const metalByName = new Map(metals.map((m) => [lower(m.name), m]));
    const locationByName = new Map(locations.map((l) => [lower(l.name), l]));
    const puritiesByMetal = new Map<string, Map<string, (typeof storePurities)[number]>>();
    for (const purity of storePurities) {
      if (!puritiesByMetal.has(purity.storeMetalId)) puritiesByMetal.set(purity.storeMetalId, new Map());
      puritiesByMetal.get(purity.storeMetalId)!.set(lower(purity.label), purity);
    }
    // Older generic labels ("Gold 22K") and the raw enum (old backups wrote
    // GOLD_22K) stay accepted.
    const legacyPurityByText = new Map<string, PurityType>();
    for (const [value, label] of Object.entries(PURITY_LABELS) as [PurityType, string][]) {
      legacyPurityByText.set(lower(label), value);
      legacyPurityByText.set(value.toLowerCase(), value);
    }
    // A party is matched by phone, GSTIN or name, so a near-miss on any of
    // them points at the same record — shown with its code and phone to
    // tell apart two parties with similar names.
    const partyCandidates = liveParties.map((c) => ({
      name: c.name,
      ref: c.customerCode ?? c.vendorCode,
      detail: c.phone ? `phone ${c.phone}` : null,
      aliases: [c.phone, c.gstin],
    }));
    const partyHint = (...values: string[]) => {
      for (const value of values.filter(Boolean)) {
        const hint = suggestFrom(value, partyCandidates, { listUpTo: 0 });
        if (hint) return hint;
      }
      return `${IMPORT_SUGGESTION_MARK}Add the party first, then import again`;
    };
    const metalCandidates = namesAsCandidates(metals.map((m) => m.name));
    const locationCandidates = namesAsCandidates(locations.map((l) => l.name));

    const errors: string[] = [];
    type ParsedSlip = {
      ref: string;
      label: string;
      customerId: string;
      invoiceDate: Date;
      locationId: string | null;
      discount: number;
      payments: PaymentEntryInput[];
      notes: string | null;
      convertedToInvoiceNumber: string;
      items: KachaInvoiceLineItemInput[];
    };
    const parsed: ParsedSlip[] = [];

    for (const [ref, entries] of groups) {
      const head = entries[0];
      const hasRef = Boolean(cell(head.row, "Slip Ref"));
      const label = hasRef ? `Slip Ref "${ref}"` : `Row ${head.line}`;
      const slipErrors: string[] = [];

      /** A number cell: blank = null, anything else must be a number ≥ 0. */
      const amount = (row: Record<string, unknown>, column: string, where: string) => {
        const raw = cell(row, column).replace(/,/g, "");
        if (!raw) return null;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          slipErrors.push(`${where}: ${column} "${cell(row, column)}" is not a valid number.`);
          return null;
        }
        return value;
      };

      const phone = cell(head.row, "Party Phone");
      const gstin = cell(head.row, "Party GSTIN").toUpperCase();
      const name = cell(head.row, "Party Name");
      const customer =
        (phone && byPhone.get(phone)) || (gstin && byGstin.get(gstin)) || (name && byName.get(lower(name))) || null;
      if (!customer) {
        slipErrors.push(
          `${label}: no party matches ${[phone && `phone "${phone}"`, gstin && `GSTIN "${gstin}"`, `name "${name}"`].filter(Boolean).join(", ")}${partyHint(name, phone, gstin)}`,
        );
      }

      const dateRaw = cell(head.row, "Date");
      const parsedDate = parseSheetDate(dateRaw);
      if (dateRaw && !parsedDate) slipErrors.push(`${label}: "${dateRaw}" is not a valid date.`);

      // Location: by name, then the same rule as the form
      // (resolveWritableLocationId → isLocationAllowed, or the user's only
      // location when restricted and left blank).
      const locationName = cell(head.row, "Location");
      const location = locationName ? locationByName.get(lower(locationName)) : undefined;
      let locationId: string | null = null;
      if (locationName && !location) {
        slipErrors.push(
          `${label}: no location named "${locationName}"${
            suggestFrom(locationName, locationCandidates) || `${IMPORT_SUGGESTION_MARK}Add it under Settings › Locations`
          }`,
        );
      } else if (location && !isLocationAllowed(locationScope, location.id)) {
        slipErrors.push(`${label}: you don't have access to bill against location "${location.name}".`);
      } else {
        const resolution = await resolveWritableLocationId(storeId, location?.id ?? null, locationScope);
        if (resolution.ok) locationId = resolution.locationId;
        else slipErrors.push(`${label}: ${resolution.message}.`);
      }

      const items: KachaInvoiceLineItemInput[] = [];
      for (const { row, line } of entries) {
        const where = `Row ${line}`;
        const itemName = cell(row, "Item Name");
        if (!itemName) {
          slipErrors.push(`${where}: Item Name is required.`);
          continue;
        }

        // "Purchased From" — required on a line with no linked stock, as on
        // the form (lib/inventory/line-source-party.ts); every imported line
        // is such a line.
        const sourceName = cell(row, "Purchased From");
        const source = sourceName ? byName.get(lower(sourceName)) : undefined;
        if (!sourceName) slipErrors.push(`${where}: Purchased From is required — who "${itemName}" was purchased from.`);
        else if (!source) slipErrors.push(`${where}: Purchased From "${sourceName}" doesn't match a party${partyHint(sourceName)}`);

        const metalName = cell(row, "Metal");
        const metal = metalName ? metalByName.get(lower(metalName)) : undefined;
        if (metalName && !metal) {
          slipErrors.push(
            `${where}: metal "${metalName}" is not configured for this store${
              suggestFrom(metalName, metalCandidates) || `${IMPORT_SUGGESTION_MARK}Add it under Settings › Taxonomy`
            }`,
          );
        }

        // Purity: the metal's own Settings › Purity label first (sets
        // purityLabel + the matching legacy enum, as the form's Purity
        // picker does), else an older generic label / enum value.
        const purityRaw = cell(row, "Purity");
        let purity: PurityType | null = null;
        let purityLabel: string | null = null;
        let hallmarkable = false;
        if (purityRaw) {
          const storePurity = metal ? puritiesByMetal.get(metal.id)?.get(lower(purityRaw)) : undefined;
          if (storePurity) {
            purityLabel = storePurity.label;
            purity = metal ? matchLegacyPurityType(classifyPurityFamily(metal), storePurity.label) : null;
            hallmarkable = storePurity.isHallmarkable || isHallmarkablePurity(purity);
          } else {
            purity = legacyPurityByText.get(lower(purityRaw)) ?? null;
            if (!purity) {
              slipErrors.push(
                `${where}: "${purityRaw}" is not a purity${metal ? ` of ${metal.name}` : ""}${
                  (metal &&
                    suggestFrom(purityRaw, namesAsCandidates([...(puritiesByMetal.get(metal.id)?.values() ?? [])].map((p) => p.label)))) ||
                  `${IMPORT_SUGGESTION_MARK}Pick one from the Purity dropdown${metal ? "" : " (and fill in Metal)"}`
                }`,
              );
            } else {
              // A generic label still gets the metal's own label, as the
              // form backfills it (resolveLegacyPurityLabel).
              const own = metal
                ? resolveLegacyPurityLabel(purity, [...(puritiesByMetal.get(metal.id)?.values() ?? [])])
                : null;
              purityLabel = own?.label ?? null;
              hallmarkable = (own?.isHallmarkable ?? false) || isHallmarkablePurity(purity);
            }
          }
        }

        const quantityRaw = cell(row, "Quantity");
        const quantity = quantityRaw ? Number(quantityRaw) : 1;
        if (!Number.isInteger(quantity) || quantity < 1) {
          slipErrors.push(`${where}: Quantity "${quantityRaw}" must be a whole number of 1 or more.`);
        }

        const chargeTypeRaw = lower(cell(row, "Making Charge Type"));
        const makingChargeType =
          !chargeTypeRaw || chargeTypeRaw === "fixed"
            ? ChargeType.FIXED
            : chargeTypeRaw === "percentage" || chargeTypeRaw === "percent"
              ? ChargeType.PERCENTAGE
              : null;
        if (!makingChargeType) {
          slipErrors.push(`${where}: Making Charge Type "${cell(row, "Making Charge Type")}" must be Fixed or Percentage.`);
        }

        const stoneName = cell(row, "Stone");
        const stone = stoneName ? metalByName.get(lower(stoneName)) : undefined;
        if (stoneName && !stone) slipErrors.push(`${where}: stone "${stoneName}" is not configured for this store (Settings › Taxonomy).`);

        const grossWeight = amount(row, "Gross Weight", where);
        const stoneWeight = amount(row, "Stone Weight", where);
        const dmoWeight = amount(row, "DMO Weight", where);
        const netGiven = amount(row, "Net Weight", where);
        // Blank Net = Gross − Stone − DMO per Settings > Weights — the
        // form's deriveNetWeight (lib/weight-calc.ts), never below 0.
        const netWeight =
          netGiven ?? (grossWeight ? fineOf.deriveNet({ grossWeight, stoneWeight, dmoWeight }) ?? 0 : null);
        const caratWeight = amount(row, "Carat Weight", where);
        const stoneRate = amount(row, "Stone Rate", where);
        const stoneChargeGiven = amount(row, "Stone Charge", where);
        const hmGiven = amount(row, "HM Charge", where);
        const stonePiecesGiven = amount(row, "Stone Pcs", where);
        if (stonePiecesGiven != null && stonePiecesGiven !== 0 && !(Number.isInteger(stonePiecesGiven) && stonePiecesGiven >= 1)) {
          slipErrors.push(`${where}: Stone Pcs must be a whole number of 1 or more.`);
        }

        items.push({
          itemName,
          vendorId: source?.id ?? null,
          metalTypeId: metal?.id ?? null,
          purity,
          purityLabel,
          quantity: Number.isInteger(quantity) && quantity >= 1 ? quantity : 1,
          grossWeight,
          stoneWeight,
          dmoWeight,
          netWeight,
          rate: amount(row, "Rate", where),
          makingCharge: amount(row, "Making Charge", where) ?? 0,
          makingChargeType: makingChargeType ?? ChargeType.FIXED,
          // Blank = the store's hallmark charge on a hallmarkable purity,
          // as the form auto-fills it.
          hmCharge: hmGiven ?? (hallmarkable ? hallmarkCharge : 0),
          stoneMetalTypeName: stone?.name ?? null,
          stoneTypeNames: cell(row, "Stone Type") || null,
          // Kept only on a line with a stone, as the form saves them.
          stonePieces: stone && stonePiecesGiven ? stonePiecesGiven : null,
          stoneClarity: stone ? cell(row, "Stone Clarity").slice(0, 120) || null : null,
          stoneCertificateNumber: stone ? cell(row, "IGI Certificate No.").slice(0, 120) || null : null,
          caratWeight,
          stoneRate,
          // Blank = Carat Weight × Stone Rate, as the form works it out.
          stoneCharge: stoneChargeGiven ?? Number(((stoneRate ?? 0) * (caratWeight ?? 0)).toFixed(2)),
          inventoryStockId: null,
        });
      }

      // Payments: up to two, like the form's Paid Now rows.
      const payments: PaymentEntryInput[] = [];
      for (const [amountColumn, methodColumn, referenceColumn] of [
        ["Paid Amount", "Payment Method", "Payment Reference"],
        ["Paid Amount 2", "Payment Method 2", "Payment Reference 2"],
      ] as const) {
        const paid = amount(head.row, amountColumn, label);
        if (!paid) continue;
        const method = parsePaymentMethodCell(cell(head.row, methodColumn));
        if (!method) {
          slipErrors.push(`${label}: ${methodColumn} "${cell(head.row, methodColumn)}" must be Cash, UPI, Net Banking, Cheque, Card or Other.`);
          continue;
        }
        payments.push({ method, amount: paid, reference: cell(head.row, referenceColumn) || null });
      }

      const discount = amount(head.row, "Discount", label) ?? 0;

      if (!items.length && !slipErrors.length) slipErrors.push(`${label}: no line items.`);
      if (slipErrors.length || !customer) {
        errors.push(...slipErrors);
        continue;
      }

      const { totalAmount } = computeKachaTotals(items, discount);
      const paidAmount = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
      if (paidAmount > totalAmount + 0.01) {
        errors.push(`${label}: paid ₹${paidAmount} is more than the slip total ₹${totalAmount}.`);
        continue;
      }

      parsed.push({
        ref: hasRef ? ref : "",
        label,
        customerId: customer.id,
        invoiceDate: parsedDate ?? new Date(),
        locationId,
        discount,
        payments,
        notes: cell(head.row, "Notes") || null,
        convertedToInvoiceNumber: cell(head.row, "Converted To Invoice #"),
        items,
      });
    }

    if (!errors.length) {
      // The form's own server-side check of every "Purchased From" party.
      const sourceParties = await resolveLineSourceParties(storeId, parsed.flatMap((slip) => slip.items));
      if ("error" in sourceParties) errors.push(sourceParties.error);
    }

    if (errors.length) {
      return {
        success: false,
        message: `Import cancelled — ${errors.length} problem${errors.length === 1 ? "" : "s"} found. Nothing was created.`,
        errors: errors.slice(0, 50),
      };
    }

    const sourcePartyNames = new Map(
      liveParties.map((party) => [party.id, party.name] as const),
    );

    // Slip numbers: keep a Slip Ref that is a free app slip number.
    const candidateRefs = [...new Set(parsed.map((slip) => slip.ref).filter((ref) => SLIP_NUMBER_RE.test(ref)))];
    const liveNumbers = new Set(
      candidateRefs.length
        ? (
            await prisma.kachaInvoice.findMany({
              where: { storeId, slipNumber: { in: candidateRefs } },
              select: { slipNumber: true },
            })
          ).map((row) => row.slipNumber)
        : [],
    );
    const keptRefs = new Set(candidateRefs.filter((ref) => !liveNumbers.has(ref)));
    const nextSlipNumber = await slipNumberAllocator(storeId, keptRefs);

    // A kept number whose SALE debit is still on that party's ledger (the
    // slip was deleted, its ledger rows weren't) is restored without posting
    // the sale and payments a second time.
    const ledgerKept = new Set(
      keptRefs.size
        ? (
            await prisma.ledgerEntry.findMany({
              where: {
                storeId,
                sourceType: LedgerSourceType.SALE,
                description: { in: [...keptRefs].map(kachaSaleLedgerDescription) },
              },
              select: { description: true, customerId: true },
            })
          ).map((row) => `${row.customerId}::${row.description}`)
        : [],
    );

    // Converted To Invoice #: link back when the invoice still exists and no
    // other Estimate claims it (KachaInvoice.convertedToId is unique).
    const invoiceNumbers = [...new Set(parsed.map((slip) => slip.convertedToInvoiceNumber).filter(Boolean))];
    const invoices = invoiceNumbers.length
      ? await prisma.invoice.findMany({
          where: { storeId, invoiceNumber: { in: invoiceNumbers } },
          select: { id: true, invoiceNumber: true, convertedFromKacha: { select: { id: true } } },
        })
      : [];
    const freeInvoiceByNumber = new Map(
      invoices.filter((invoice) => !invoice.convertedFromKacha).map((invoice) => [invoice.invoiceNumber, invoice.id]),
    );

    const notes: string[] = [];
    let renumbered = 0;
    let withoutLedger = 0;
    let notRelinked = 0;

    const plans = parsed.map((slip) => {
      const keep = keptRefs.has(slip.ref);
      keptRefs.delete(slip.ref); // a ref is one slip; a repeat gets a new number
      const slipNumber = keep ? slip.ref : nextSlipNumber();
      if (SLIP_NUMBER_RE.test(slip.ref) && !keep) renumbered += 1;

      const postLedger = !(keep && ledgerKept.has(`${slip.customerId}::${kachaSaleLedgerDescription(slipNumber)}`));
      if (!postLedger) withoutLedger += 1;

      let convertedToId: string | null = null;
      if (slip.convertedToInvoiceNumber) {
        convertedToId = freeInvoiceByNumber.get(slip.convertedToInvoiceNumber) ?? null;
        if (convertedToId) freeInvoiceByNumber.delete(slip.convertedToInvoiceNumber);
        else notRelinked += 1;
      }

      const totals = computeKachaTotals(slip.items, slip.discount);
      const paidAmount = round2(slip.payments.reduce((sum, payment) => sum + payment.amount, 0));
      // A converted slip's balance moved to its Tax Invoice — zeroed and
      // PAID, as convertKachaToPakka leaves it.
      const { balanceAmount, status } = convertedToId
        ? { balanceAmount: 0, status: InvoiceStatus.PAID }
        : kachaPaymentStatus(totals.totalAmount, paidAmount);

      return { slip, slipNumber, postLedger, convertedToId, totals, paidAmount, balanceAmount, status };
    });

    await prisma.$transaction(
      async (tx) => {
        for (const plan of plans) {
          await writeKachaSlip(tx, {
            storeId,
            slipNumber: plan.slipNumber,
            customerId: plan.slip.customerId,
            invoiceDate: plan.slip.invoiceDate,
            totals: plan.totals,
            paidAmount: plan.paidAmount,
            balanceAmount: plan.balanceAmount,
            status: plan.status,
            notes: plan.slip.notes,
            locationId: plan.slip.locationId,
            items: plan.slip.items,
            validStockIds: new Set(),
            sourcePartyNames: new Map(
              plan.slip.items
                .filter((item) => item.vendorId)
                .map((item) => [item.vendorId as string, sourcePartyNames.get(item.vendorId as string) ?? ""]),
            ),
            fineOf,
            payments: plan.slip.payments,
            postLedger: plan.postLedger,
            convertedToId: plan.convertedToId,
          });
        }
      },
      { timeout: 15000 + plans.length * 500 },
    );

    if (renumbered) notes.push(`${renumbered} slip number${renumbered === 1 ? " was" : "s were"} already in use and got new numbers`);
    if (withoutLedger) notes.push(`${withoutLedger} restored without new ledger entries (their sale is still on the party's ledger)`);
    if (notRelinked) notes.push(`${notRelinked} not linked back to their Tax Invoice (not found, or already linked to another Estimate)`);

    revalidatePath("/billing/kacha");

    const createdCount = plans.length;
    return {
      success: true,
      createdCount,
      message: `Imported ${createdCount} Estimate${createdCount === 1 ? "" : "s"}.${notes.length ? ` ${notes.join("; ")}.` : ""}`,
    };
  } catch (error) {
    logger.error("importKachaInvoicesFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import Estimates.") };
  }
}

export type DeleteAllKachaResult = {
  success: boolean;
  message: string;
  deletedCount?: number;
  backupSentTo?: string;
};

/** Counts shown in the confirmation dialog so the click is an informed one. */
export async function getKachaDeleteAllSummary(selectedIds?: string[]): Promise<{
  total: number;
  converted: number;
  withPayments: number;
  backupEmail: string | null;
}> {
  const storeId = await getStoreIdForRead();

  // An explicit selection narrows every count; without one this describes
  // the whole store, as before.
  const scope = selectedIds?.length ? { id: { in: selectedIds } } : {};

  const [total, converted, withPayments, settings] = await Promise.all([
    prisma.kachaInvoice.count({ where: { storeId, ...scope } }),
    prisma.kachaInvoice.count({ where: { storeId, ...scope, convertedToId: { not: null } } }),
    prisma.kachaInvoice.count({ where: { storeId, ...scope, paidAmount: { gt: 0 } } }),
    prisma.businessSettings.findUnique({
      where: { storeId },
      select: { backupEmail: true },
    }),
  ]);

  return {
    total,
    converted,
    withPayments,
    backupEmail: settings?.backupEmail?.trim() || null,
  };
}

/**
 * Deletes every Kacha slip in the store — but only ever after a complete
 * backup has actually landed in the configured backup inbox.
 *
 * The ordering here is the whole feature, so it is deliberate and must not
 * be rearranged: read the records, build the workbook, send it, and treat a
 * failed send as a hard stop. `sendMail` never throws (it reports
 * `{ sent: false }` for a missing SMTP config as well as a send failure),
 * so the `sent` flag has to be checked explicitly — an unchecked call would
 * silently delete everything on a server with no SMTP configured at all.
 *
 * The delete is scoped to the exact ids that went into the backup rather
 * than to `{ storeId }`, so a slip created by someone else between the read
 * and the delete is not destroyed without a copy of it existing.
 *
 * Unlike `deleteKachaInvoice` (single-slip), this deliberately does NOT
 * spare converted or paid slips — "delete all" means all, and the emailed
 * backup is what makes that recoverable. The confirmation dialog surfaces
 * those counts via `getKachaDeleteAllSummary()` first.
 */
export async function deleteAllKachaInvoices(
  selectedIds?: string[],
): Promise<DeleteAllKachaResult> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can delete all Estimates.",
    };
  }

  try {
    const storeId = await requireStoreScope();
    const user = await requireAuth();

    const settings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { backupEmail: true },
    });

    const backupEmail = settings?.backupEmail?.trim();

    if (!backupEmail) {
      return {
        success: false,
        message:
          "No backup email is configured. Add one in Settings → Backup email before deleting all Estimates.",
      };
    }

    // Backing up and deleting the same set: when specific slips are ticked,
    // only those are captured and only those go. The backup is still built
    // from this exact list, so the guarantee that nothing is deleted without
    // a copy of it holds either way.
    const selection = selectedIds?.length ? { id: { in: selectedIds } } : {};

    const kachaInvoices = await prisma.kachaInvoice.findMany({
      where: { storeId, ...selection },
      orderBy: { invoiceDate: "desc" },
      include: KACHA_SHEET_INCLUDE,
    });

    if (!kachaInvoices.length) {
      return {
        success: false,
        message: selectedIds?.length
          ? "None of the selected slips could be found."
          : "There are no Estimates to delete.",
      };
    }

    // A per-slip summary sheet plus the line items in the import template's own
    // columns (lib/billing/kacha-sheet-rows.ts) — a backup that cannot rebuild
    // the slips it replaced is not a backup, so a restore reads that sheet.
    const { fileName, fileBase64 } = buildMultiSheetExcelExport(
      kachaBackupSheets(kachaInvoices),
      "estimates-backup",
    );

    const storeName = await resolveStoreName(storeId);

    const { subject, html, text } = dataBackupEmail({
      storeName,
      appName: APP_NAME,
      recordLabel: selectedIds?.length ? "selected Estimates" : "Estimates",
      recordCount: kachaInvoices.length,
      fileName,
      triggeredBy: user.name || user.email || "Unknown user",
    });

    const result = await sendMail({
      to: backupEmail,
      subject,
      html,
      text,
      attachments: [
        {
          filename: fileName,
          contentBase64: fileBase64,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    // Hard stop: nothing is deleted unless the backup actually went out.
    if (!result.sent) {
      return {
        success: false,
        message: `Backup email could not be sent (${result.message}). No Estimates were deleted.`,
      };
    }

    const { count } = await prisma.kachaInvoice.deleteMany({
      where: { storeId, id: { in: kachaInvoices.map((k) => k.id) } },
    });

    revalidatePath("/billing/kacha");

    return {
      success: true,
      deletedCount: count,
      backupSentTo: backupEmail,
      message: `Backup of ${kachaInvoices.length} Estimates sent to ${backupEmail}. ${count} slips deleted.`,
    };
  } catch (error) {
    logger.error("deleteAllKachaInvoices error", error);
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to delete Estimates. No slips were deleted."),
    };
  }
}

/** Email a formatted copy of this Kacha slip to the customer on file. */
export async function emailKachaInvoiceAction(
  kachaInvoiceId: string,
): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const [kachaInvoice, storeName] = await Promise.all([
      prisma.kachaInvoice.findFirst({
        where: { id: kachaInvoiceId, storeId },
        include: {
          customer: { select: { name: true, email: true } },
          items: {
            include: {
              components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } },
            },
          },
        },
      }),
      resolveStoreName(storeId),
    ]);

    if (!kachaInvoice) return { success: false, message: "Estimate not found" };

    if (!kachaInvoice.customer?.email) {
      return { success: false, message: "This party has no email on file" };
    }

    const { subject, html } = kachaSlipEmail({
      storeName,
      slipNumber: kachaInvoice.slipNumber,
      invoiceDate: kachaInvoice.invoiceDate.toISOString(),
      customerName: kachaInvoice.customer.name,
      items: kachaInvoice.items.map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        netWeight: item.netWeight ? Number(item.netWeight) : null,
        rate: item.rate ? Number(item.rate) : null,
        makingCharge: Number(item.makingCharge),
        stoneCharge: Number(item.stoneCharge),
        lineTotal: Number(item.lineTotal),
        components: item.components,
      })),
      subtotal: Number(kachaInvoice.subtotal),
      makingCharges: Number(kachaInvoice.makingCharges),
      stoneCharges: Number(kachaInvoice.stoneCharges),
      discount: Number(kachaInvoice.discount),
      totalAmount: Number(kachaInvoice.totalAmount),
      paidAmount: Number(kachaInvoice.paidAmount),
      balanceAmount: Number(kachaInvoice.balanceAmount),
    });

    const result = await sendMail({ to: kachaInvoice.customer.email, subject, html });

    return { success: result.sent, message: result.message };
  } catch (error) {
    logger.error("emailKachaInvoiceAction error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to email Estimate") };
  }
}
