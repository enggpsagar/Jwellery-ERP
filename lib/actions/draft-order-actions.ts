// lib/actions/draft-order-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { PurityType, LedgerEntryType, LedgerSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getCurrentUser } from "@/lib/auth/auth";
import { getLocationScope, isLocationAllowed } from "@/lib/location-scope";
import { getFinenessMap, toFineWeight } from "@/lib/purity";
import { buildExcelExport, buildCsvExportBase64, buildPdfExportBase64 } from "@/lib/excel-export";
import {
  assertKarigarAssignedMetal,
  generateJobNumber,
} from "@/lib/actions/inventory-stock-actions";

/**
 * A phone/counter order captured before the physical piece exists — see
 * the DraftOrder/DraftOrderItem model comments in schema.prisma for the
 * full lifecycle (DRAFT -> SENT_TO_KARIGAR -> RECEIVED, or DRAFT ->
 * CANCELLED). This file owns the order itself; the "send to Karigar" step
 * writes a KarigarJob (mirroring issueMaterialToKarigar's own validations),
 * and the "mark fulfilled" step is wired into receiveItemsFromKarigar
 * (lib/actions/inventory-stock-actions.ts) instead of duplicated here,
 * since that's where a KarigarReceiptItem is actually created.
 */

export type DraftOrderItemInput = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  quantity: number;
  estimatedWeight?: number | null;
  estimatedRate?: number | null;
  designNotes?: string | null;
};

export type DraftOrderFormState = {
  success: boolean;
  message: string;
  orderId?: string;
};

const initialState: DraftOrderFormState = { success: false, message: "" };

/** DO-${year}-0001, incrementing per store per year — same convention as
 * generateJobNumber/generateQuotationNumber elsewhere in this codebase. */
async function generateOrderNumber(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.draftOrder.count({
    where: { storeId, orderNumber: { startsWith: `DO-${year}-` } },
  });

  return `DO-${year}-${String(count + 1).padStart(4, "0")}`;
}

export type DraftOrderRow = {
  id: string;
  orderNumber: string;
  orderDate: string;
  expectedDate: string | null;
  status: string;
  customer: { id: string; name: string; phone: string | null } | null;
  itemCount: number;
  karigarJob: { id: string; jobNumber: string | null; karigarId: string } | null;
};

function mapDraftOrder(order: {
  id: string;
  orderNumber: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: string;
  customer: { id: string; name: string; phone: string | null } | null;
  karigarJob: { id: string; jobNumber: string | null; karigarId: string } | null;
  items?: unknown[];
  _count?: { items: number };
}): DraftOrderRow {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate.toISOString(),
    expectedDate: order.expectedDate?.toISOString() ?? null,
    status: order.status,
    customer: order.customer,
    itemCount: order._count?.items ?? order.items?.length ?? 0,
    karigarJob: order.karigarJob,
  };
}

export type DraftOrderSortBy = "orderDate" | "orderNumber";
export type SortOrder = "asc" | "desc";

export type GetDraftOrdersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: DraftOrderSortBy;
  sortOrder?: SortOrder;
  /** One of DraftOrder's own status strings (DRAFT/SENT_TO_KARIGAR/RECEIVED/CANCELLED). */
  status?: string;
};

export type DraftOrdersListResponse = {
  orders: DraftOrderRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function getDraftOrdersWhere(storeId: string, search?: string, status?: string) {
  const query = String(search || "").trim();

  return {
    storeId,
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { orderNumber: { contains: query, mode: "insensitive" as const } },
            { customer: { name: { contains: query, mode: "insensitive" as const } } },
            { customer: { phone: { contains: query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

function getDraftOrdersOrderBy(sortBy: DraftOrderSortBy = "orderDate", sortOrder: SortOrder = "desc") {
  if (sortBy === "orderNumber") return { orderNumber: sortOrder };
  return { orderDate: sortOrder };
}

const DRAFT_ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  karigarJob: { select: { id: true, jobNumber: true, karigarId: true } },
  _count: { select: { items: true } },
} as const;

export async function getDraftOrders(
  params: GetDraftOrdersParams = {},
): Promise<DraftOrdersListResponse> {
  const storeId = await requireStoreScope();

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy: DraftOrderSortBy = params.sortBy || "orderDate";
  const sortOrder: SortOrder = params.sortOrder || "desc";

  const where = getDraftOrdersWhere(storeId, params.search, params.status);
  const orderBy = getDraftOrdersOrderBy(sortBy, sortOrder);

  const [totalCount, orders] = await Promise.all([
    prisma.draftOrder.count({ where }),
    prisma.draftOrder.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: DRAFT_ORDER_INCLUDE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    orders: orders.map(mapDraftOrder),
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

type ExportDraftOrdersParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  status?: string;
  format?: "csv" | "xlsx" | "pdf";
};

export async function exportDraftOrdersToExcel(params: ExportDraftOrdersParams = {}): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    const storeId = await requireStoreScope();

    const where = params.selectedIds?.length
      ? { id: { in: params.selectedIds }, storeId }
      : getDraftOrdersWhere(
          storeId,
          params.search,
          params.status,
        );

    const orderBy = getDraftOrdersOrderBy(
      (params.sortBy as DraftOrderSortBy) || "orderDate",
      params.sortOrder || "desc",
    );

    const orders = await prisma.draftOrder.findMany({
      where,
      orderBy,
      include: DRAFT_ORDER_INCLUDE,
    });

    if (!orders.length) {
      return { success: false, message: "No draft orders found to export" };
    }

    const rows = orders.map((order, index) => ({
      "Sr. No.": index + 1,
      "Order #": order.orderNumber,
      Date: order.orderDate.toISOString().slice(0, 10),
      Customer: order.customer?.name ?? "",
      Phone: order.customer?.phone ?? "",
      Items: order._count.items,
      Status: order.status,
      "Artisan Job": order.karigarJob?.jobNumber ?? "",
    }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "draft-orders")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Draft Orders", "draft-orders")
          : buildExcelExport(rows, "Draft Orders", "draft-orders");

    return { success: true, message: "Draft orders exported successfully", fileName, fileBase64 };
  } catch (error) {
    console.error("exportDraftOrdersToExcel error:", error);
    return { success: false, message: "Failed to export draft orders" };
  }
}

/** Only a DRAFT (never sent) or already-CANCELLED order can be deleted — one
 *  that's been SENT_TO_KARIGAR or RECEIVED has a real linked KarigarJob (and,
 *  once received, real Product/InventoryStock), and deleting the order would
 *  orphan that history rather than cleanly undo it. Cancel it first via
 *  cancelDraftOrder if it's still DRAFT-eligible, then delete. */
export async function deleteDraftOrder(orderId: string): Promise<DraftOrderFormState> {
  try {
    const storeId = await requireStoreScope();

    const order = await prisma.draftOrder.findFirst({
      where: { id: orderId, storeId },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!order) return { success: false, message: "Order not found" };

    if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
      return {
        success: false,
        message: "Only a Draft or Cancelled order can be deleted — this one has already been sent to an artisan",
      };
    }

    await prisma.draftOrder.delete({ where: { id: orderId } });

    revalidatePath("/orders");

    return { success: true, message: `Draft Order ${order.orderNumber} deleted` };
  } catch (error) {
    console.error("deleteDraftOrder error:", error);
    return { success: false, message: "Failed to delete order" };
  }
}

export type BulkDeleteDraftOrdersResult = {
  deletedCount: number;
  failures: { id: string; message: string }[];
};

/** Runs every selected id through the same guarded deleteDraftOrder() a
 *  single-row delete uses, so a batch selection can't bypass the
 *  DRAFT/CANCELLED-only guard just because several rows were ticked at once. */
export async function bulkDeleteDraftOrders(ids: string[]): Promise<BulkDeleteDraftOrdersResult> {
  const failures: BulkDeleteDraftOrdersResult["failures"] = [];
  let deletedCount = 0;

  for (const id of ids) {
    const result = await deleteDraftOrder(id);
    if (result.success) {
      deletedCount++;
    } else {
      failures.push({ id, message: result.message });
    }
  }

  return { deletedCount, failures };
}

export type DraftOrderItemRow = {
  id: string;
  itemName: string;
  metalTypeId: string | null;
  metalName: string | null;
  purity: PurityType | null;
  quantity: number;
  estimatedWeight: number | null;
  estimatedRate: number | null;
  designNotes: string | null;
  fulfilled: boolean;
  product: { id: string; productCode: string; name: string } | null;
  inventoryStock: { id: string; stockCode: string; status: string } | null;
};

export type DraftOrderDetail = DraftOrderRow & {
  notes: string | null;
  locationId: string | null;
  items: DraftOrderItemRow[];
};

export async function getDraftOrderById(id: string): Promise<DraftOrderDetail | null> {
  const storeId = await requireStoreScope();

  const order = await prisma.draftOrder.findFirst({
    where: { id, storeId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      karigarJob: { select: { id: true, jobNumber: true, karigarId: true } },
      items: {
        include: {
          metalType: { select: { name: true } },
          karigarReceiptItem: {
            include: {
              product: { select: { id: true, productCode: true, name: true } },
              inventoryStock: { select: { id: true, stockCode: true, status: true } },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  return {
    ...mapDraftOrder(order),
    notes: order.notes,
    locationId: order.locationId,
    items: order.items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      metalName: item.metalType?.name ?? null,
      purity: item.purity,
      quantity: item.quantity,
      estimatedWeight: item.estimatedWeight ? Number(item.estimatedWeight) : null,
      estimatedRate: item.estimatedRate ? Number(item.estimatedRate) : null,
      designNotes: item.designNotes,
      fulfilled: item.karigarReceiptItemId != null,
      product: item.karigarReceiptItem?.product ?? null,
      inventoryStock: item.karigarReceiptItem?.inventoryStock ?? null,
    })),
  };
}

export async function createDraftOrder(
  prevState: DraftOrderFormState = initialState,
  formData: FormData,
): Promise<DraftOrderFormState> {
  try {
    const storeId = await requireStoreScope();
    const currentUser = await getCurrentUser();

    const customerId = String(formData.get("customerId") || "").trim();
    if (!customerId) {
      return { success: false, message: "Please select a customer" };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a valid customer" };
    }

    const itemsRaw = String(formData.get("itemsJson") || "[]");
    let items: DraftOrderItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one item" };
    }
    if (items.some((item) => !item.itemName?.trim())) {
      return { success: false, message: "Every item needs a name" };
    }

    const expectedDateRaw = String(formData.get("expectedDate") || "");
    const locationId = String(formData.get("locationId") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;

    if (locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: locationId, storeId },
        select: { id: true },
      });
      if (!location) {
        return { success: false, message: "Selected location is invalid" };
      }
      const scope = await getLocationScope();
      if (!isLocationAllowed(scope, locationId)) {
        return { success: false, message: "You don't have access to file orders against this location" };
      }
    }

    const orderNumber = await generateOrderNumber(storeId);

    const order = await prisma.draftOrder.create({
      data: {
        storeId,
        orderNumber,
        customerId,
        expectedDate: expectedDateRaw ? new Date(expectedDateRaw) : undefined,
        locationId: locationId ?? undefined,
        notes,
        status: "DRAFT",
        createdById: currentUser?.id,
        createdByName: currentUser?.name ?? undefined,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName.trim(),
            metalTypeId: item.metalTypeId || undefined,
            purity: item.purity || undefined,
            quantity: item.quantity || 1,
            estimatedWeight: item.estimatedWeight ?? undefined,
            estimatedRate: item.estimatedRate ?? undefined,
            designNotes: item.designNotes?.trim() || undefined,
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath("/orders");

    return { success: true, message: `Draft Order ${orderNumber} created`, orderId: order.id };
  } catch (error) {
    console.error("createDraftOrder error:", error);
    return { success: false, message: "Failed to create draft order" };
  }
}

export async function cancelDraftOrder(orderId: string): Promise<DraftOrderFormState> {
  try {
    const storeId = await requireStoreScope();

    const order = await prisma.draftOrder.findFirst({
      where: { id: orderId, storeId },
      select: { id: true, status: true },
    });
    if (!order) return { success: false, message: "Order not found" };
    if (order.status !== "DRAFT") {
      return { success: false, message: "Only a draft (not yet sent to an artisan) order can be cancelled" };
    }

    await prisma.draftOrder.update({
      where: { id: orderId },
      data: { status: "CANCELLED" },
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);

    return { success: true, message: "Order cancelled" };
  } catch (error) {
    console.error("cancelDraftOrder error:", error);
    return { success: false, message: "Failed to cancel order" };
  }
}

/**
 * Metadata-only edit — Order Date, Expected Date, Notes. Never the
 * customer or items: those are what the order's items/artisan-job flow is
 * actually built around, so changing them needs the real create/send flow,
 * not a quiet in-place edit (same reasoning as EditInvoiceDialog/
 * EditPurchaseDialog elsewhere in this app). Only allowed while still
 * DRAFT — once sent to an artisan or received, the order is a record of
 * what actually happened.
 */
export async function updateDraftOrder(
  orderId: string,
  prevState: DraftOrderFormState = initialState,
  formData: FormData,
): Promise<DraftOrderFormState> {
  try {
    const storeId = await requireStoreScope();

    const order = await prisma.draftOrder.findFirst({
      where: { id: orderId, storeId },
      select: { id: true, status: true },
    });
    if (!order) return { success: false, message: "Order not found" };
    if (order.status !== "DRAFT") {
      return { success: false, message: "Only a draft (not yet sent to an artisan) order can be edited" };
    }

    const orderDateRaw = String(formData.get("orderDate") || "");
    if (!orderDateRaw) return { success: false, message: "Order Date is required" };

    const expectedDateRaw = String(formData.get("expectedDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    await prisma.draftOrder.update({
      where: { id: orderId },
      data: {
        orderDate: new Date(orderDateRaw),
        expectedDate: expectedDateRaw ? new Date(expectedDateRaw) : null,
        notes,
      },
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);

    return { success: true, message: "Order updated" };
  } catch (error) {
    console.error("updateDraftOrder error:", error);
    return { success: false, message: "Failed to update order" };
  }
}

/**
 * Sends a Draft Order's items to an artisan for manufacturing: creates a
 * KarigarJob (same validations as issueMaterialToKarigar — karigar exists,
 * metal/karigar assignment, location access) sized to the sum of the
 * order's estimated weights, stamps the order with the resulting job id,
 * and flips it to SENT_TO_KARIGAR. Every item on the order must share one
 * metal/purity, since a single raw-metal issue can't cleanly split across
 * mixed metals — the same one-metal-per-job constraint
 * issueMaterialToKarigar already has.
 */
export async function sendDraftOrderToKarigar(
  orderId: string,
  prevState: DraftOrderFormState = initialState,
  formData: FormData,
): Promise<DraftOrderFormState> {
  try {
    const storeId = await requireStoreScope();
    const currentUser = await getCurrentUser();

    const order = await prisma.draftOrder.findFirst({
      where: { id: orderId, storeId },
      include: { items: true },
    });
    if (!order) return { success: false, message: "Order not found" };
    if (order.status !== "DRAFT") {
      return { success: false, message: "This order has already been sent to an artisan" };
    }
    if (!order.items.length) {
      return { success: false, message: "This order has no items" };
    }

    const karigarId = String(formData.get("karigarId") || "").trim();
    const locationId = String(formData.get("locationId") || "").trim() || order.locationId || null;
    const expectedDateRaw = String(formData.get("expectedDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!karigarId) return { success: false, message: "Select an artisan" };

    const karigar = await prisma.karigar.findFirst({
      where: { id: karigarId, storeId },
      select: { id: true },
    });
    if (!karigar) return { success: false, message: "Artisan not found" };

    const metalTypeIds = new Set(order.items.map((item) => item.metalTypeId).filter(Boolean));
    const purities = new Set(order.items.map((item) => item.purity).filter(Boolean));
    if (metalTypeIds.size > 1 || purities.size > 1) {
      return {
        success: false,
        message:
          "This order's items use different metals/purities — split into separate orders per metal before sending to an artisan.",
      };
    }

    const metalTypeId = order.items[0].metalTypeId;
    if (!metalTypeId) {
      return { success: false, message: "Set a metal type on the order's items first" };
    }

    if (locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: locationId, storeId },
        select: { id: true },
      });
      if (!location) {
        return { success: false, message: "Selected location is invalid" };
      }
      const scope = await getLocationScope();
      if (!isLocationAllowed(scope, locationId)) {
        return { success: false, message: "You don't have access to issue material against this location" };
      }
    }

    const storeMetal = await prisma.storeMetal.findFirst({
      where: { id: metalTypeId, storeId },
    });
    if (!storeMetal) return { success: false, message: "Select a valid metal type" };

    const assignmentError = await assertKarigarAssignedMetal(karigarId, storeMetal.id);
    if (assignmentError) return { success: false, message: assignmentError };

    const issueWeight = order.items.reduce(
      (sum, item) => sum + (item.estimatedWeight ? Number(item.estimatedWeight) : 0),
      0,
    );
    if (issueWeight <= 0) {
      return { success: false, message: "Enter an estimated weight on at least one item" };
    }

    const isPreciousMetal = storeMetal.hasPurity;
    let issuePurity: PurityType | null = null;
    let issueFineWeight: number | null = null;

    if (isPreciousMetal) {
      issuePurity = order.items[0].purity;
      if (!issuePurity) {
        return { success: false, message: "Select a purity on the order's items first" };
      }
      const fineness = await getFinenessMap(storeId);
      issueFineWeight = toFineWeight(issueWeight, issuePurity, fineness);
    }

    const itemSummary = order.items
      .map(
        (item) =>
          `${item.itemName} x${item.quantity}${item.estimatedWeight ? ` (~${Number(item.estimatedWeight)}g)` : ""}`,
      )
      .join(", ");
    const jobNotes = `Draft Order ${order.orderNumber}: ${itemSummary}${notes ? ` — ${notes}` : ""}`;

    const jobNumber = await generateJobNumber(storeId);

    await prisma.$transaction(async (tx) => {
      const job = await tx.karigarJob.create({
        data: {
          storeId,
          karigarId,
          jobNumber,
          metalTypeId: storeMetal.id,
          issuePurity: issuePurity ?? undefined,
          issueWeight,
          issueFineWeight: issueFineWeight ?? undefined,
          expectedDate: expectedDateRaw ? new Date(expectedDateRaw) : (order.expectedDate ?? undefined),
          status: "issued",
          notes: jobNotes,
          locationId: locationId ?? undefined,
        },
        select: { id: true },
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
            : `${issueWeight}g issued — Job ${jobNumber}`,
          createdByUserId: currentUser?.id,
          locationId: locationId ?? undefined,
        },
      });

      await tx.draftOrder.update({
        where: { id: orderId },
        data: { karigarJobId: job.id, status: "SENT_TO_KARIGAR" },
      });
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/karigars");
    revalidatePath(`/karigars/${karigarId}`);

    return { success: true, message: `Sent to artisan — Job ${jobNumber}` };
  } catch (error) {
    console.error("sendDraftOrderToKarigar error:", error);
    return { success: false, message: "Failed to send order to artisan" };
  }
}

/** Powers the "Matches Draft Order Item" picker on the Receive Items page —
 * only items not yet matched to a KarigarReceiptItem, so an already-received
 * item can't be double-matched. Empty (not an error) when this job has no
 * linked Draft Order at all. */
export async function getUnfulfilledDraftOrderItemsForJob(jobId: string) {
  const storeId = await requireStoreScope();

  const order = await prisma.draftOrder.findFirst({
    where: { karigarJobId: jobId, storeId },
    include: { items: true },
  });
  if (!order) return [];

  return order.items
    .filter((item) => item.karigarReceiptItemId == null)
    .map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      estimatedWeight: item.estimatedWeight ? Number(item.estimatedWeight) : null,
    }));
}
