// lib/actions/store-export-actions.ts
"use server";

import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";

export type StoreExportResult = {
  success: boolean;
  message: string;
  fileBase64?: string;
  fileName?: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Every business-data table scoped to a store, read in full. Deliberately
 * excludes Account/Session/OtpCode (pure auth internals with nothing a
 * store owner would recognize as their own data) and the secret half of
 * ApiKey/InviteToken (keyHash/tokenHash) — same "never export a credential
 * that can be replayed" boundary those two already draw around themselves
 * in their own doc comments. StoreCollaborationAccess/StoreAccessRequest
 * are also left out — they describe a Super Admin's platform-level access
 * to this store, not anything the store itself produced.
 *
 * Modeled directly on forceDeleteStore's own manual model list (same file
 * area, lib/actions/store-actions.ts) — that function is the
 * already-audited source of truth for "every table a Store row owns", kept
 * current because a missing entry there throws a loud FK error on delete.
 * A table with no direct storeId column is read through its owning
 * relation instead (e.g. invoiceItems via invoice.storeId), matching how
 * forceDeleteStore itself reaches those same tables.
 */
export async function exportStoreData(storeId: string): Promise<StoreExportResult> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return { success: false, message: "Store not found" };
    }

    const [
      users,
      apiKeys,
      inviteTokens,
      employees,
      storeLocations,
      storeMetals,
      storeMetalOrigins,
      storeCategories,
      storeCategoryTypes,
      businessSettings,
      metalRates,
      metalSellingRates,
      purityFinenesses,
      caratConversionRates,
      gstRates,
      customers,
      vendors,
      karigars,
      karigarMetals,
      products,
      inventoryStocks,
      inventoryTransactions,
      invoices,
      invoiceItems,
      purchases,
      purchaseItems,
      quotations,
      quotationItems,
      kachaInvoices,
      kachaInvoiceItems,
      creditNotes,
      creditNoteItems,
      karigarJobs,
      karigarReceiptItems,
      draftOrders,
      draftOrderItems,
      ledgerEntries,
      reminders,
      scanSessions,
      scanSessionItems,
      supportTickets,
      supportTicketMessages,
      storePlanHistory,
    ] = await Promise.all([
      prisma.user.findMany({ where: { storeId } }),
      prisma.apiKey.findMany({ where: { storeId }, omit: { keyHash: true } }),
      prisma.inviteToken.findMany({ where: { storeId }, omit: { tokenHash: true } }),
      prisma.employee.findMany({ where: { user: { storeId } } }),
      prisma.storeLocation.findMany({ where: { storeId } }),
      prisma.storeMetal.findMany({ where: { storeId } }),
      prisma.storeMetalOrigin.findMany({ where: { storeId } }),
      prisma.storeCategory.findMany({ where: { storeId } }),
      prisma.storeCategoryType.findMany({ where: { storeId } }),
      prisma.businessSettings.findMany({ where: { storeId } }),
      prisma.metalRate.findMany({ where: { storeId } }),
      prisma.metalSellingRate.findMany({ where: { storeId } }),
      prisma.purityFineness.findMany({ where: { storeId } }),
      prisma.caratConversionRate.findMany({ where: { storeId } }),
      prisma.gstRate.findMany({ where: { storeId } }),
      prisma.customer.findMany({ where: { storeId } }),
      prisma.vendor.findMany({ where: { storeId } }),
      prisma.karigar.findMany({ where: { storeId } }),
      prisma.karigarMetal.findMany({ where: { karigar: { storeId } } }),
      prisma.product.findMany({ where: { storeId } }),
      prisma.inventoryStock.findMany({ where: { storeId } }),
      prisma.inventoryTransaction.findMany({ where: { inventoryStock: { storeId } } }),
      prisma.invoice.findMany({ where: { storeId } }),
      prisma.invoiceItem.findMany({ where: { invoice: { storeId } } }),
      prisma.purchase.findMany({ where: { storeId } }),
      prisma.purchaseItem.findMany({ where: { purchase: { storeId } } }),
      prisma.quotation.findMany({ where: { storeId } }),
      prisma.quotationItem.findMany({ where: { quotation: { storeId } } }),
      prisma.kachaInvoice.findMany({ where: { storeId } }),
      prisma.kachaInvoiceItem.findMany({ where: { kachaInvoice: { storeId } } }),
      prisma.creditNote.findMany({ where: { storeId } }),
      prisma.creditNoteItem.findMany({ where: { creditNote: { storeId } } }),
      prisma.karigarJob.findMany({ where: { storeId } }),
      prisma.karigarReceiptItem.findMany({ where: { karigarJob: { storeId } } }),
      prisma.draftOrder.findMany({ where: { storeId } }),
      prisma.draftOrderItem.findMany({ where: { draftOrder: { storeId } } }),
      prisma.ledgerEntry.findMany({ where: { storeId } }),
      prisma.reminder.findMany({ where: { storeId } }),
      prisma.scanSession.findMany({ where: { storeId } }),
      prisma.scanSessionItem.findMany({ where: { session: { storeId } } }),
      prisma.supportTicket.findMany({ where: { storeId } }),
      prisma.supportTicketMessage.findMany({ where: { ticket: { storeId } } }),
      prisma.storePlanHistory.findMany({ where: { storeId } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      store,
      users,
      apiKeys,
      inviteTokens,
      employees,
      storeLocations,
      storeMetals,
      storeMetalOrigins,
      storeCategories,
      storeCategoryTypes,
      businessSettings,
      metalRates,
      metalSellingRates,
      purityFinenesses,
      caratConversionRates,
      gstRates,
      customers,
      vendors,
      karigars,
      karigarMetals,
      products,
      inventoryStocks,
      inventoryTransactions,
      invoices,
      invoiceItems,
      purchases,
      purchaseItems,
      quotations,
      quotationItems,
      kachaInvoices,
      kachaInvoiceItems,
      creditNotes,
      creditNoteItems,
      karigarJobs,
      karigarReceiptItems,
      draftOrders,
      draftOrderItems,
      ledgerEntries,
      reminders,
      scanSessions,
      scanSessionItems,
      supportTickets,
      supportTicketMessages,
      storePlanHistory,
    };

    const json = JSON.stringify(
      payload,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );

    const now = new Date();
    const fileName = `${store.code}-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate(),
    )}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;

    return {
      success: true,
      message: `Exported all data for "${store.name}"`,
      fileBase64: Buffer.from(json, "utf-8").toString("base64"),
      fileName,
    };
  } catch (error) {
    logger.error("exportStoreData error", error);
    return { success: false, message: "Failed to export store data" };
  }
}
