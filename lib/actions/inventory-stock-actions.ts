// lib/actions/inventory-stock-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { InventoryStockStatus, InventoryTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
  const transactions = await prisma.inventoryTransaction.findMany({
    where: { inventoryStockId },
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
    const stock = await prisma.inventoryStock.findUnique({
      where: { id: inventoryStockId },
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
    const stock = await prisma.inventoryStock.findUnique({
      where: { id: inventoryStockId },
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
    await prisma.$transaction([
      prisma.inventoryStock.update({
        where: { id: inventoryStockId },
        data: { status: InventoryStockStatus.DAMAGED },
      }),
      prisma.inventoryTransaction.create({
        data: {
          inventoryStockId,
          transactionType: InventoryTransactionType.DAMAGE,
          notes: notes ?? null,
        },
      }),
    ]);

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${inventoryStockId}`);

    return { success: true, message: "Stock marked as damaged" };
  } catch (error) {
    console.error("markStockDamaged error:", error);
    return { success: false, message: "Failed to update stock" };
  }
}

/**
 * Issue a stock item out to a karigar for work: creates the KarigarJob,
 * logs a KARIGAR_ISSUE transaction, and flips the stock status.
 */
export async function issueStockToKarigar(
  prevState: StockActionState = initialState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const inventoryStockId = String(formData.get("inventoryStockId") || "");
    const karigarId = String(formData.get("karigarId") || "");

    if (!inventoryStockId || !karigarId) {
      return { success: false, message: "Stock item and karigar are required" };
    }

    const stock = await prisma.inventoryStock.findUnique({
      where: { id: inventoryStockId },
    });

    if (!stock) return { success: false, message: "Stock item not found" };

    if (stock.status !== InventoryStockStatus.IN_STOCK) {
      return {
        success: false,
        message: `Cannot issue stock with status ${stock.status}`,
      };
    }

    const issueWeight = toDecimalOrNull(formData.get("issueWeight")) ?? stock.netWeight;
    const labourCharge = toDecimalOrNull(formData.get("labourCharge")) ?? 0;
    const expectedDateRaw = String(formData.get("expectedDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    await prisma.$transaction([
      prisma.karigarJob.create({
        data: {
          karigarId,
          inventoryStockId,
          metalType: stock.metalType,
          issueWeight: issueWeight ?? undefined,
          labourCharge,
          expectedDate: expectedDateRaw ? new Date(expectedDateRaw) : undefined,
          status: "issued",
          notes,
        },
      }),
      prisma.inventoryStock.update({
        where: { id: inventoryStockId },
        data: { status: InventoryStockStatus.ISSUED_TO_KARIGAR },
      }),
      prisma.inventoryTransaction.create({
        data: {
          inventoryStockId,
          transactionType: InventoryTransactionType.KARIGAR_ISSUE,
          netWeight: issueWeight ?? undefined,
          referenceType: "Karigar",
          referenceId: karigarId,
          notes,
        },
      }),
    ]);

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${inventoryStockId}`);
    revalidatePath("/karigars");

    return { success: true, message: "Stock issued to karigar" };
  } catch (error) {
    console.error("issueStockToKarigar error:", error);
    return { success: false, message: "Failed to issue stock to karigar" };
  }
}

/**
 * Receive a stock item back from a karigar: closes the KarigarJob, logs a
 * KARIGAR_RECEIPT transaction, and returns the stock to IN_STOCK.
 */
export async function receiveStockFromKarigar(
  prevState: StockActionState = initialState,
  formData: FormData,
): Promise<StockActionState> {
  try {
    const karigarJobId = String(formData.get("karigarJobId") || "");

    if (!karigarJobId) {
      return { success: false, message: "Karigar job is required" };
    }

    const job = await prisma.karigarJob.findUnique({
      where: { id: karigarJobId },
    });

    if (!job) return { success: false, message: "Karigar job not found" };
    if (!job.inventoryStockId) {
      return { success: false, message: "This job has no linked stock item" };
    }

    const receiveWeight = toDecimalOrNull(formData.get("receiveWeight"));
    const notes = String(formData.get("notes") || "").trim() || null;

    await prisma.$transaction([
      prisma.karigarJob.update({
        where: { id: karigarJobId },
        data: {
          receiveWeight: receiveWeight ?? undefined,
          receivedDate: new Date(),
          status: "completed",
          notes: notes ?? job.notes,
        },
      }),
      prisma.inventoryStock.update({
        where: { id: job.inventoryStockId },
        data: { status: InventoryStockStatus.IN_STOCK },
      }),
      prisma.inventoryTransaction.create({
        data: {
          inventoryStockId: job.inventoryStockId,
          transactionType: InventoryTransactionType.KARIGAR_RECEIPT,
          netWeight: receiveWeight ?? undefined,
          referenceType: "Karigar",
          referenceId: job.karigarId,
          notes,
        },
      }),
    ]);

    revalidatePath("/inventory/stock");
    revalidatePath(`/inventory/stock/${job.inventoryStockId}`);
    revalidatePath("/karigars");

    return { success: true, message: "Stock received back from karigar" };
  } catch (error) {
    console.error("receiveStockFromKarigar error:", error);
    return { success: false, message: "Failed to receive stock from karigar" };
  }
}
