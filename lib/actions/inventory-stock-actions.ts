// lib/actions/inventory-stock-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InventoryStockStatus,
  InventoryTransactionType,
  InventoryFinish,
  LedgerEntryType,
  LedgerSourceType,
  PaymentMethod,
  PurityType,
  ChargeType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getFinenessMap, toFineWeight } from "@/lib/purity";

/**
 * This file covers STOCK MOVEMENTS (reserve, damage, karigar issue/receipt,
 * transaction history) — status/lifecycle actions on top of an existing
 * InventoryStock row.
 *
 * It is deliberately separate from lib/actions/inventory/stock-actions.ts,
 * which owns the CRUD (create / edit / delete) of InventoryStock records.
 */

export type StockActionState = {
  success: boolean;
  message: string;
};

const initialState: StockActionState = { success: false, message: "" };

export type PaymentEntryInput = {
  method: string;
  amount: number;
  reference?: string | null;
  bankName?: string | null;
  attachmentUrl?: string | null;
};

function parsePayments(raw: string): PaymentEntryInput[] | null {
  let payments: PaymentEntryInput[];
  try {
    payments = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 2) {
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

// Client-supplied JSON, not FormData — validate against the enum rather
// than trusting the toggle state; anything else falls back to FIXED, same
// default as the schema column.
function parseChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

function toDecimalOrNull(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  if (!parsed) return null;
  const num = Number(parsed);
  return Number.isNaN(num) ? null : num;
}

/**
 * Full movement history for a single stock item, most recent first.
 */
export async function getStockTransactions(inventoryStockId: string) {
  const storeId = await requireStoreScope();

  const transactions = await prisma.inventoryTransaction.findMany({
    where: { inventoryStockId, inventoryStock: { storeId } },
    orderBy: { createdAt: "desc" },
  });

  return transactions;
}

async function recordTransaction(
  inventoryStockId: string,
  transactionType: InventoryTransactionType,
  data: {
    quantity?: number;
    grossWeight?: number | null;
    netWeight?: number | null;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
  } = {},
) {
  await prisma.inventoryTransaction.create({
    data: {
      inventoryStockId,
      transactionType,
      quantity: data.quantity ?? 1,
      grossWeight: data.grossWeight ?? undefined,
      netWeight: data.netWeight ?? undefined,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      notes: data.notes ?? null,
    },
  });
}

/**
 * Mark a stock item RESERVED (e.g. held for a customer) and log the move.
 */
export async function reserveStock(
  inventoryStockId: string,
  notes?: string,
): Promise<StockActionState> {
  try {
    const storeId = await requireStoreScope();

    const stock = await prisma.inventoryStock.findFirst({
      where: { id: inventoryStockId, storeId },
    });

    if (!stock) return { success: false, message: "Stock item not found" };

    if (stock.status !== InventoryStockStatus.IN_STOCK) {
      return {
        success: false,
        message: `Cannot reserve stock with status ${stock.status}`,
      };
    }

    await prisma.$transaction([
      prisma.inventoryStock.update({
        where: { id: inventoryStockId },
        data: { status: InventoryStockStatus.RESERVED },
      }),
      prisma.inventoryTransaction.create({
        data: {
          inventoryStockId,
          transactionType: InventoryTransactionType.RESERVE,
          notes: notes ?? null,
        },
      }),
    ]);

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${inventoryStockId}`);

    return { success: true, message: "Stock reserved" };
  } catch (error) {
    console.error("reserveStock error:", error);
    return { success: false, message: "Failed to reserve stock" };
  }
}

/**
 * Release a RESERVED stock item back to IN_STOCK.
 */
export async function unreserveStock(
  inventoryStockId: string,
  notes?: string,
): Promise<StockActionState> {
  try {
    const storeId = await requireStoreScope();

    const stock = await prisma.inventoryStock.findFirst({
      where: { id: inventoryStockId, storeId },
    });

    if (!stock) return { success: false, message: "Stock item not found" };

    if (stock.status !== InventoryStockStatus.RESERVED) {
      return {
        success: false,
        message: `Stock is not currently reserved (status: ${stock.status})`,
      };
    }

    await prisma.$transaction([
      prisma.inventoryStock.update({
        where: { id: inventoryStockId },
        data: { status: InventoryStockStatus.IN_STOCK },
      }),
      prisma.inventoryTransaction.create({
        data: {
          inventoryStockId,
          transactionType: InventoryTransactionType.UNRESERVE,
          notes: notes ?? null,
        },
      }),
    ]);

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${inventoryStockId}`);

    return { success: true, message: "Stock unreserved" };
  } catch (error) {
    console.error("unreserveStock error:", error);
    return { success: false, message: "Failed to unreserve stock" };
  }
}

/**
 * Mark a stock item DAMAGED. Terminal-ish state; kept separate from delete
 * so damaged pieces stay auditable instead of disappearing.
 */
export async function markStockDamaged(
  inventoryStockId: string,
  notes?: string,
): Promise<StockActionState> {
  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.inventoryStock.updateMany({
      where: { id: inventoryStockId, storeId },
      data: { status: InventoryStockStatus.DAMAGED },
    });

    if (count === 0) return { success: false, message: "Stock item not found" };

    await prisma.inventoryTransaction.create({
      data: {
        inventoryStockId,
        transactionType: InventoryTransactionType.DAMAGE,
        notes: notes ?? null,
      },
    });

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${inventoryStockId}`);

    return { success: true, message: "Stock marked as damaged" };
  } catch (error) {
    console.error("markStockDamaged error:", error);
    return { success: false, message: "Failed to update stock" };
  }
}

export type KarigarReceiptItemInput = {
  itemName: string;
  productId?: string | null;
  metalTypeId: string;
  purity: PurityType;
  quantity: number;
  grossWeight?: number | null;
  lessWeight?: number | null;
  netWeight?: number | null;
  stoneWeight?: number | null;
  dmoWeight?: number | null;
  wastagePercent?: number | null;
  tagNumber?: string | null;
  purchaseRate?: number | null;
  saleRate?: number | null;
  makingCharge?: number | null;
  makingChargeType?: ChargeType | string | null;
  stoneCharge?: number | null;
  otherCharge?: number | null;
  purchaseAmount?: number | null;
  saleAmount?: number | null;
  vendorName?: string | null;
  purchaseDate?: string | null;
  manufactureDate?: string | null;
  location?: string | null;
  remarks?: string | null;
};

/** JOB-${year}-0001, incrementing per store per year — matches the numbering
 * convention already used elsewhere in this codebase (e.g. invoice numbers). */
async function generateJobNumber(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.karigarJob.count({
    where: { storeId, jobNumber: { startsWith: `JOB-${year}-` } },
  });

  return `JOB-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Issue raw material (bullion or otherwise, not an existing stock item) out
 * to a karigar: creates a new KarigarJob tracking the issued weight, and
 * logs a DEBIT ledger entry (material currently out with the karigar).
 *
 * Metals with hasPurity=true (the seeded Gold/Silver rows, or any custom
 * metal an admin explicitly marks as having purity): fine-metal-equivalent
 * is computed via toFineWeight and requires a valid issuePurity, exactly as
 * before this function was generalized from a hardcoded GOLD/SILVER check
 * to a real per-store StoreMetal lookup. hasPurity=false metals (Diamond,
 * loose stones, misc non-metal materials): purity/fineness has no meaning —
 * a carat is a unit of mass, not a fineness percentage — so issueFineWeight
 * is left null (never defaulted to 100% via a fineness value, which would
 * silently be wrong) and the raw weight is recorded on the ledger entry's
 * metalWeight field instead of metalWeightFine, so it never pollutes the
 * karigar ledger's fine-gold running balance.
 */
export async function issueMaterialToKarigar(
  karigarId: string,
  prevState: StockActionState = initialState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const storeId = await requireStoreScope();

    const karigar = await prisma.karigar.findFirst({
      where: { id: karigarId, storeId },
      select: { id: true },
    });

    if (!karigar) return { success: false, message: "Karigar not found" };

    const metalTypeId = String(formData.get("metalTypeId") || "").trim();
    const issuePurityRaw = String(formData.get("issuePurity") || "");
    const issueWeight = toDecimalOrNull(formData.get("issueWeight"));
    const expectedDateRaw = String(formData.get("expectedDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!metalTypeId) {
      return { success: false, message: "Select a valid metal type" };
    }

    const storeMetal = await prisma.storeMetal.findFirst({
      where: { id: metalTypeId, storeId },
    });

    if (!storeMetal) {
      return { success: false, message: "Select a valid metal type" };
    }

    const isPreciousMetal = storeMetal.hasPurity;

    if (!issueWeight || issueWeight <= 0) {
      return { success: false, message: "Enter a valid issue weight" };
    }

    let issuePurity: PurityType | null = null;
    let issueFineWeight: number | null = null;

    if (isPreciousMetal) {
      issuePurity = issuePurityRaw as PurityType;
      if (!Object.values(PurityType).includes(issuePurity)) {
        return { success: false, message: "Select a valid purity" };
      }

      const fineness = await getFinenessMap(storeId);
      issueFineWeight = toFineWeight(issueWeight, issuePurity, fineness);
    }

    const jobNumber = await generateJobNumber(storeId);

    await prisma.$transaction(async (tx) => {
      await tx.karigarJob.create({
        data: {
          storeId,
          karigarId,
          jobNumber,
          metalTypeId: storeMetal.id,
          issuePurity: issuePurity ?? undefined,
          issueWeight,
          issueFineWeight: issueFineWeight ?? undefined,
          expectedDate: expectedDateRaw ? new Date(expectedDateRaw) : undefined,
          status: "issued",
          notes,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.DEBIT,
          sourceType: LedgerSourceType.KARIGAR_ISSUE,
          karigarId,
          metalTypeId: storeMetal.id,
          metalWeight: isPreciousMetal ? undefined : issueWeight,
          metalWeightFine: isPreciousMetal ? (issueFineWeight ?? undefined) : undefined,
          amount: 0,
          description: isPreciousMetal
            ? `${issueWeight}g ${issuePurity} issued (${(issueFineWeight ?? 0).toFixed(3)}g fine) — Job ${jobNumber}`
            : `${issueWeight}g ${notes ? notes : storeMetal.name} issued — Job ${jobNumber}`,
        },
      });
    });

    revalidatePath("/karigars");
    revalidatePath(`/karigars/${karigarId}`);

    return { success: true, message: `Material issued — Job ${jobNumber}` };
  } catch (error) {
    console.error("issueMaterialToKarigar error:", error);
    return { success: false, message: "Failed to issue material to karigar" };
  }
}

/**
 * Receive one or more finished items back from a karigar against an open
 * job. Each item is a brand-new fresh product, so it becomes new sellable
 * IN_STOCK inventory carrying the same field set as the Add Stock form
 * (tag number, weights, pricing, purchase details) — not just the weight
 * fields the karigar fine-gold ledger calc needs. Sums the items' weight
 * (raw and fine-gold-equivalent) onto the job, closes it, and logs a
 * CREDIT ledger entry for the gold returned plus a separate DEBIT entry
 * for any labour charge owed.
 */
export async function receiveItemsFromKarigar(
  jobId: string,
  prevState: StockActionState = initialState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const storeId = await requireStoreScope();

    const job = await prisma.karigarJob.findFirst({
      where: { id: jobId, storeId },
    });

    if (!job) return { success: false, message: "Karigar job not found" };
    if (job.status === "received") {
      return { success: false, message: "This job has already been received" };
    }

    const itemsRaw = String(formData.get("itemsJson") || "[]");
    let items: KarigarReceiptItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one returned item" };
    }

    const storeMetals = await prisma.storeMetal.findMany({ where: { storeId } });
    const metalById = new Map(storeMetals.map((metal) => [metal.id, metal]));

    const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds as string[] }, storeId },
          select: { id: true },
        })
      : [];
    const productIdSet = new Set(products.map((p) => p.id));

    for (const item of items) {
      if (!item.productId || !productIdSet.has(item.productId)) {
        return {
          success: false,
          message: "Each returned item must have a valid product selected",
        };
      }
      if (!item.metalTypeId || !metalById.has(item.metalTypeId)) {
        return { success: false, message: "Each returned item needs a valid metal type" };
      }
      if (!Object.values(PurityType).includes(item.purity)) {
        return { success: false, message: "Each returned item needs a valid purity" };
      }
    }

    const labourCharge = toDecimalOrNull(formData.get("labourCharge")) ?? 0;

    const fineness = await getFinenessMap(storeId);
    const year = new Date().getFullYear();
    const baseStockCount = await prisma.inventoryStock.count({
      where: { storeId, stockCode: { startsWith: `STK-${year}-` } },
    });

    let receiveWeight = 0;
    let receiveFineWeight = 0;
    let plainFineWeightTotal = 0;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const netWeight = item.netWeight ?? 0;
        // Pure embedded-metal calc — stored as-is on KarigarReceiptItem.fineWeight,
        // unaffected by wastage%.
        const fineWeight = toFineWeight(netWeight, item.purity, fineness);
        // Wastage is a % on top of the item's own embedded fine weight (standard
        // jewellery-trade convention: e.g. 10g fine metal with 8% wastage means
        // 10.8g of fine metal was actually consumed/lost in making it). This
        // "accounted" figure — not the plain fineWeight — is what gets summed
        // into the job's receiveFineWeight and the CREDIT ledger entry, so the
        // job's closing balance reconciles against issueFineWeight.
        const accountedFineWeight =
          fineWeight + (fineWeight * (item.wastagePercent ?? 0)) / 100;

        receiveWeight += netWeight;
        receiveFineWeight += accountedFineWeight;
        plainFineWeightTotal += fineWeight;

        const stockCode = `STK-${year}-${String(baseStockCount + i + 1).padStart(4, "0")}`;

        const stock = await tx.inventoryStock.create({
          data: {
            storeId,
            productId: item.productId!,
            stockCode,
            tagNumber: item.tagNumber || undefined,
            metalTypeId: item.metalTypeId,
            purity: item.purity,
            quantity: item.quantity || 1,
            status: InventoryStockStatus.IN_STOCK,
            finish: InventoryFinish.PAKKA,
            grossWeight: item.grossWeight ?? undefined,
            lessWeight: item.lessWeight ?? undefined,
            netWeight: item.netWeight ?? undefined,
            stoneWeight: item.stoneWeight ?? undefined,
            dmoWeight: item.dmoWeight ?? undefined,
            wastagePercent: item.wastagePercent ?? undefined,
            purchaseRate: item.purchaseRate ?? undefined,
            saleRate: item.saleRate ?? undefined,
            makingCharge: item.makingCharge ?? undefined,
            makingChargeType: parseChargeType(item.makingChargeType),
            stoneCharge: item.stoneCharge ?? undefined,
            otherCharge: item.otherCharge ?? undefined,
            purchaseAmount: item.purchaseAmount ?? undefined,
            saleAmount: item.saleAmount ?? undefined,
            vendorName: item.vendorName || undefined,
            purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : undefined,
            manufactureDate: item.manufactureDate ? new Date(item.manufactureDate) : undefined,
            location: item.location || undefined,
            remarks: item.remarks || undefined,
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: stock.id,
            transactionType: InventoryTransactionType.KARIGAR_RECEIPT,
            netWeight: item.netWeight ?? undefined,
            referenceType: "KarigarJob",
            referenceId: jobId,
          },
        });

        await tx.karigarReceiptItem.create({
          data: {
            karigarJobId: jobId,
            itemName: item.itemName || "Item",
            productId: item.productId,
            metalTypeId: item.metalTypeId,
            purity: item.purity,
            quantity: item.quantity || 1,
            grossWeight: item.grossWeight ?? undefined,
            netWeight: item.netWeight ?? undefined,
            stoneWeight: item.stoneWeight ?? undefined,
            dmoWeight: item.dmoWeight ?? undefined,
            wastagePercent: item.wastagePercent ?? undefined,
            fineWeight,
            inventoryStockId: stock.id,
          },
        });
      }

      await tx.karigarJob.update({
        where: { id: jobId },
        data: {
          receiveWeight,
          receiveFineWeight,
          receivedDate: new Date(),
          status: "received",
          labourCharge,
        },
      });

      const wastageFineWeight = receiveFineWeight - plainFineWeightTotal;

      await tx.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.KARIGAR_RECEIPT,
          karigarId: job.karigarId,
          metalTypeId: job.metalTypeId,
          metalWeightFine: receiveFineWeight,
          amount: 0,
          description: `Received ${items.length} item(s) — ${receiveFineWeight.toFixed(3)}g fine (incl. ${wastageFineWeight.toFixed(3)}g wastage) — Job ${job.jobNumber ?? jobId}`,
        },
      });

      // Kept as its own row (not merged into the gold-movement entry above)
      // so the ledger's fine-gold balance and cash balance columns are each
      // driven by clean, single-purpose entries.
      if (labourCharge > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.KARIGAR_RECEIPT,
            karigarId: job.karigarId,
            amount: labourCharge,
            description: `Labour charge for Job ${job.jobNumber ?? jobId}`,
          },
        });
      }
    });

    revalidatePath("/karigars");
    revalidatePath(`/karigars/${job.karigarId}`);
    revalidatePath("/inventory/stock");

    return { success: true, message: "Items received from karigar" };
  } catch (error) {
    console.error("receiveItemsFromKarigar error:", error);
    return { success: false, message: "Failed to receive items from karigar" };
  }
}

/**
 * Record a cash payment made to a karigar (e.g. labour dues settled),
 * independent of any specific job receipt — logs a CREDIT ledger entry,
 * reducing what the shop owes them.
 */
export async function recordKarigarPayment(
  karigarId: string,
  prevState: StockActionState = initialState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const paymentsRaw = String(formData.get("paymentsJson") || "[]");
    const notes = String(formData.get("notes") || "").trim() || null;

    const payments = parsePayments(paymentsRaw);
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" };
    }

    const storeId = await requireStoreScope();

    const karigar = await prisma.karigar.findFirst({
      where: { id: karigarId, storeId },
      select: { id: true, name: true },
    });

    if (!karigar) return { success: false, message: "Karigar not found" };

    await prisma.$transaction(
      payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.MANUAL,
            karigarId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            description: notes ?? (index === 0 ? `Payment made to ${karigar.name}` : undefined),
          },
        }),
      ),
    );

    revalidatePath(`/karigars/${karigarId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    console.error("recordKarigarPayment error:", error);
    return { success: false, message: "Failed to record payment" };
  }
}
