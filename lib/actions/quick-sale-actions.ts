"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermissionInStore } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveActingStoreId } from "@/lib/store-context";
import { verifyQuickSaleToken } from "@/lib/quick-sale-token";
import { createInvoice } from "@/lib/actions/invoice-actions";

/**
 * Scan-to-sell.
 *
 * The QR on a stock label already pointed at that piece; this turns the scan
 * into a sale. Everything the invoice needs is read from the stock row, so
 * the person at the counter supplies one number — the price — and confirms.
 */

export type QuickSaleTarget = {
  stockId: string;
  stockCode: string;
  tagNumber: string | null;
  productName: string;
  productCode: string;
  metalName: string | null;
  purity: string | null;
  netWeight: number | null;
  grossWeight: number | null;
  stoneWeight: number | null;
  quantityAvailable: number;
  /** Blocks the sale with a reason, or null when it can go ahead. */
  blockedReason: string | null;
  suggestedPrice: number | null;
};

/**
 * What is behind a scanned code.
 *
 * Store-scoped like everything else: a code from another shop's label
 * resolves to nothing here rather than exposing that shop's stock.
 */
export async function getQuickSaleTarget(
  stockId: string,
  /** Store named by the scan token; falls back to the active store. */
  scopedStoreId?: string,
): Promise<QuickSaleTarget | null> {
  // Store first, permission second, and the permission is checked against
  // that store: a scan can point at a shop other than the one the browser has
  // open, and billing rights in one shop say nothing about another.
  //
  // Gated on selling rather than plain sign-in because this returns the
  // piece's weights and rates — a tag must not become a way to read stock for
  // someone who cannot sell it.
  const storeId = await resolveActingStoreId(scopedStoreId);
  await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);

  const stock = await prisma.inventoryStock.findFirst({
    where: { id: stockId, storeId },
    select: {
      id: true,
      stockCode: true,
      tagNumber: true,
      status: true,
      isActive: true,
      quantity: true,
      purity: true,
      netWeight: true,
      grossWeight: true,
      stoneWeight: true,
      saleRate: true,
      purchaseRate: true,
      makingCharge: true,
      stoneCharge: true,
      metalType: { select: { name: true } },
      product: { select: { name: true, productCode: true } },
    },
  });

  if (!stock) return null;

  const netWeight = stock.netWeight ? Number(stock.netWeight) : null;

  // A starting figure, not a decision: sale rate x net weight plus the
  // charges already on the piece. The operator overwrites it — metal rates
  // move daily and the counter knows today's better than the row does.
  const suggested =
    stock.saleRate && netWeight
      ? Number(stock.saleRate) * netWeight +
        Number(stock.makingCharge ?? 0) +
        Number(stock.stoneCharge ?? 0)
      : null;

  let blockedReason: string | null = null;

  if (!stock.isActive) {
    blockedReason = "This stock entry is inactive.";
  } else if (stock.status === InventoryStockStatus.SOLD) {
    blockedReason = "This piece has already been sold.";
  } else if (stock.status === InventoryStockStatus.ISSUED_TO_KARIGAR) {
    blockedReason = "This piece is currently out with a karigar.";
  } else if (stock.status !== InventoryStockStatus.IN_STOCK) {
    blockedReason = `This piece is marked ${String(stock.status)
      .replaceAll("_", " ")
      .toLowerCase()}.`;
  } else if (stock.quantity <= 0) {
    blockedReason = "There is nothing left of this stock entry.";
  }

  return {
    stockId: stock.id,
    stockCode: stock.stockCode,
    tagNumber: stock.tagNumber,
    productName: stock.product?.name ?? "Unnamed product",
    productCode: stock.product?.productCode ?? "",
    metalName: stock.metalType?.name ?? null,
    purity: stock.purity,
    netWeight,
    grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
    stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
    quantityAvailable: stock.quantity,
    blockedReason,
    suggestedPrice: suggested && suggested > 0 ? Math.round(suggested) : null,
  };
}

export type QuickSaleCustomer = { id: string; name: string; phone: string | null };

/**
 * Customers this sale can be billed to.
 *
 * A QR identifies the piece, never the buyer, so the customer stays a real
 * choice here exactly as it is on the full invoice form — the scan removes
 * the product entry, not the accounting.
 */
export async function getQuickSaleCustomers(
  scopedStoreId?: string,
): Promise<QuickSaleCustomer[]> {
  const storeId = await resolveActingStoreId(scopedStoreId);
  await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);

  return prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
}

export type QuickSaleState = {
  success: boolean;
  message: string;
  invoiceId?: string;
};

/**
 * Turn the scan into an invoice.
 *
 * Builds the same FormData `createInvoice` takes and hands off, rather than
 * writing the invoice here. That path already marks stock sold, decrements
 * the quantity, records the inventory transaction and posts any balance to
 * the customer's ledger — all inside one transaction. A second
 * implementation would be a second thing to keep correct.
 */
export async function completeQuickSale(
  _prevState: QuickSaleState,
  formData: FormData,
): Promise<QuickSaleState> {
  try {
    // The scan token is what says which shop this sale belongs to. Verified
    // before anything else is read, and re-bound to the session below, so a
    // token cannot be lifted from one person's URL and used by another.
    const token = String(formData.get("token") || "");
    const verified = verifyQuickSaleToken(token);

    if (!verified.valid) {
      return {
        success: false,
        message:
          verified.reason === "expired"
            ? "This sale timed out. Scan the tag again."
            : "This sale link is not valid. Scan the tag again.",
      };
    }

    const actor = await requireAuth();

    if (actor.id !== verified.payload.userId) {
      return {
        success: false,
        message: "This sale link was issued to someone else. Scan the tag again.",
      };
    }

    const stockId = String(formData.get("stockId") || "").trim();

    if (stockId && stockId !== verified.payload.stockId) {
      return { success: false, message: "This sale link is for a different item." };
    }

    // Membership in the token's store is re-checked here, not assumed from
    // the signature: access can be revoked between the scan and the confirm.
    const storeId = await resolveActingStoreId(verified.payload.storeId);

    // The same gate the full invoice form is behind, evaluated against the
    // store being sold from. Checked here because a server action is
    // reachable independently of the page it belongs to.
    try {
      await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);
    } catch {
      return {
        success: false,
        message: "You do not have permission to create invoices in this store.",
      };
    }
    const sellingPrice = Number(formData.get("sellingPrice"));
    const quantity = Math.max(1, Math.trunc(Number(formData.get("quantity")) || 1));
    const paidNow = Number(formData.get("paidAmount"));
    const customerId = String(formData.get("customerId") || "").trim();

    if (!customerId) {
      return { success: false, message: "Select a customer." };
    }

    if (!stockId) {
      return { success: false, message: "No stock item was scanned." };
    }

    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      return { success: false, message: "Enter a selling price." };
    }

    const target = await getQuickSaleTarget(stockId, storeId);

    if (!target) {
      return { success: false, message: "That code does not match anything in this store." };
    }

    if (target.blockedReason) {
      return { success: false, message: target.blockedReason };
    }

    if (quantity > target.quantityAvailable) {
      return {
        success: false,
        message: `Only ${target.quantityAvailable} left of this entry.`,
      };
    }

    // The customer must belong to this store. `createInvoice` re-checks the
    // same thing, but failing here means the caller gets "select a customer"
    // rather than a generic error after the sale has half-started.
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    });

    if (!customer) {
      return { success: false, message: "Select a customer." };
    }

    const stock = await prisma.inventoryStock.findFirst({
      where: { id: stockId, storeId },
      select: {
        metalTypeId: true,
        purity: true,
        netWeight: true,
        grossWeight: true,
        // Identity only, not pricing — the operator types one flat price for
        // the whole piece, so what stone it contains still needs to survive
        // onto the invoice line for the print/detail view even though its
        // charge stays folded into makingCharge rather than broken out.
        stoneMetalTypeName: true,
        stoneTypeNames: true,
      },
    });

    const netWeight = stock?.netWeight ? Number(stock.netWeight) : 0;

    // The operator types one figure: what the piece sold for. Splitting it
    // into a per-gram rate keeps the invoice's metal value and every
    // weight-based report meaningful, instead of booking the whole sale as
    // an unexplained flat charge.
    //
    // `rate` is stored at two decimals, so a raw price / weight would be
    // rounded on the way into the database and the printed line would no
    // longer add up to the total. The rate is therefore truncated to two
    // decimals here, and the few paise that leaves over go to the making
    // charge — which is where a jeweller would expect the difference to sit
    // anyway. Truncating rather than rounding keeps that remainder positive,
    // so the bill never shows a negative making charge.
    //
    // With no weight recorded there is nothing to divide by, so the whole
    // amount lands as the making charge. Either way the line totals exactly
    // what was typed.
    const rate =
      netWeight > 0 ? Math.floor((sellingPrice / netWeight) * 100) / 100 : 0;
    const metalValue = rate * netWeight;

    const lineItem = {
      itemName: target.productName,
      metalTypeId: stock?.metalTypeId ?? null,
      purity: stock?.purity ?? null,
      quantity,
      grossWeight: stock?.grossWeight ? Number(stock.grossWeight) : null,
      netWeight: netWeight || null,
      rate: netWeight > 0 ? rate : null,
      makingCharge: netWeight > 0 ? sellingPrice - metalValue : sellingPrice,
      makingChargeType: "FIXED",
      stoneCharge: 0,
      stoneMetalTypeName: stock?.stoneMetalTypeName ?? null,
      stoneTypeNames: stock?.stoneTypeNames ?? null,
      inventoryStockId: stockId,
    };

    const invoiceForm = new FormData();
    invoiceForm.set("storeId", storeId);
    invoiceForm.set("customerId", customerId);
    invoiceForm.set("itemsJson", JSON.stringify([lineItem]));
    invoiceForm.set("discount", "0");
    invoiceForm.set("taxAmount", "0");
    invoiceForm.set(
      "paidAmount",
      String(Number.isFinite(paidNow) && paidNow > 0 ? paidNow : 0),
    );
    invoiceForm.set("notes", `Counter sale — scanned ${target.stockCode}`);

    const result = await createInvoice(
      { success: false, message: "" },
      invoiceForm,
    );

    if (!result.success) {
      return { success: false, message: result.message };
    }

    return {
      success: true,
      message: `Invoice created for ${target.productName}.`,
      invoiceId: result.invoiceId,
    };
  } catch (error) {
    console.error("completeQuickSale error:", error);
    return { success: false, message: "Could not complete the sale." };
  }
}
