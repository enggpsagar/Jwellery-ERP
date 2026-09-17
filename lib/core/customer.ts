// lib/core/customer.ts
//
// Business logic for Customers, decoupled from how a caller reaches it.
// `lib/actions/customer-actions.ts` (a "use server" FormData/useActionState
// layer for the web UI), the REST API under app/api/v1/customers, and the
// MCP tool handlers all call the same functions here — so validation and
// the store-scoped uniqueness check can never drift between entry points.
//
// Deliberately NOT a "use server" file: none of this is ever called
// directly from a Client Component, only from other server-side code, so it
// stays free to export plain sync helpers (Next.js requires every export of
// a "use server" file to be an async function).

import { prisma } from "@/lib/prisma";
import type { PartyGstType } from "@prisma/client";
import { isValidAadhaarNumber, normalizeAadhaarNumber, AADHAAR_INVALID_MESSAGE } from "@/lib/aadhaar";
import { isValidPanNumber, normalizePanNumber, PAN_INVALID_MESSAGE } from "@/lib/pan";
import { formatShortDate } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseDateRangeBoundary } from "@/lib/date-range";

export type CustomerRecord = {
  id: string;
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  customerType?: string;
  openingBalance: number;
  currentBalance?: number;
  balanceType?: string;
  goldBalance?: number;
  silverBalance?: number;
  creditLimit?: string;
  paymentTerms?: string;
  gstNumber?: string;
  /** This customer's own GST registration status — independent of the
   *  store's own gstScheme. See gstinRequired() in lib/gst.ts. */
  gstType?: PartyGstType;
  panNumber?: string;
  aadhaarNumber?: string;
  registrationId?: string;
  createdByName?: string | null;
  totalOrders?: number;
  totalPurchaseValue?: string;
  pendingAmount?: string;
  lastPurchaseDate?: string;
  lastPaymentDate?: string;
  notes?: string;
  createdAt?: string;
  /** Whether this Party is also tracked as a supplier — see
   *  Customer.isSupplier's doc comment in schema.prisma. Only actionable
   *  (an explicit "Also Supplier" toggle) while
   *  BusinessSettings.supplierModuleEnabled is on; the flag itself can
   *  still be true from earlier Purchase/Payment-Out use even while off. */
  isSupplier?: boolean;
  /** Parallel to customerCode, carried over for a Party that started life
   *  as a standalone Vendor row before the merge, or assigned since. */
  vendorCode?: string | null;
  /** This same Party's own supplier-side ledger balance — tracked
   *  independently from currentBalance above (customer/receivable side),
   *  not netted against it. Only meaningful once isSupplier is true;
   *  undefined for a pure customer. Positive = the store owes them
   *  (Payable); negative = they owe the store (Advance) — see
   *  supplierBalanceType. */
  supplierBalance?: number;
  supplierBalanceType?: "Advance" | "Payable";
};

export type CustomerFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    customerCode: string | null;
  };
};

export type CustomerSortBy = "name" | "createdAt" | "openingBalance";
export type SortOrder = "asc" | "desc";

export type GetCustomersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: CustomerSortBy;
  sortOrder?: SortOrder;
  /** Defaults to the active list — set true to list archived customers instead. */
  archived?: boolean;
  dateFrom?: string;
  dateTo?: string;
  /** Set true to list only Parties tagged isSupplier — the Suppliers page's
   *  own list, backed by this same Customer table/query. */
  supplierOnly?: boolean;
};

export type CustomersListResponse = {
  customers: CustomerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

/** The fields a caller supplies to create or update a customer — the same
 * shape whether it came from parsed FormData, a JSON body, or an MCP tool's
 * structured arguments. */
export type CustomerInput = {
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  gstType?: PartyGstType;
  panNumber?: string;
  aadhaarNumber?: string;
  registrationId?: string;
  notes?: string;
  openingBalance?: number;
};

/** Who's asking and on behalf of which store — resolved differently by each
 * caller (a session cookie for the web UI, an ApiKey row for REST/MCP), but
 * every core function accepts it the same way so it never needs to know
 * which. */
export type CustomerActorContext = {
  storeId: string;
  actorId: string | null;
  actorName: string | null;
};

function formatCurrency(value: number) {
  return `₹ ${value.toLocaleString("en-IN")}`;
}

function formatDate(date?: Date | null) {
  return formatShortDate(date);
}

export function getCustomerWhere(
  storeId: string,
  search?: string,
  archived = false,
  dateFrom?: string,
  dateTo?: string,
  supplierOnly = false,
) {
  const query = String(search || "").trim();
  const from = parseDateRangeBoundary(dateFrom, false);
  const to = parseDateRangeBoundary(dateTo, true);

  return {
    storeId,
    isArchived: archived,
    ...(supplierOnly ? { isSupplier: true } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
            { state: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export function getCustomerOrderBy(
  sortBy: CustomerSortBy = "createdAt",
  sortOrder: SortOrder = "desc",
) {
  if (sortBy === "name") return { name: sortOrder };
  if (sortBy === "openingBalance") return { openingBalance: sortOrder };
  return { createdAt: sortOrder };
}

export const CUSTOMER_LIST_INCLUDE = {
  invoices: {
    select: {
      id: true,
      totalAmount: true,
      balanceAmount: true,
      invoiceDate: true,
      status: true,
    },
    orderBy: { invoiceDate: "desc" as const },
  },
  // Outstanding amount has to include Kacha slips, not just Invoices — a
  // Kacha (Estimate) slip's own unpaid balanceAmount is real money owed
  // (kacha-invoice-actions.ts posts a real ledger DEBIT for it), and the
  // FIFO payment allocator (payments-actions.ts) already applies a general
  // Payment In against outstanding Kacha slips too. Selected but not
  // counted in totalOrders/totalPurchaseValue below — those stay
  // Invoice-only, matching what "an order" has always meant here.
  kachaInvoices: {
    select: { id: true, balanceAmount: true, status: true },
  },
  ledgerEntries: {
    select: { id: true, amount: true, type: true, entryDate: true },
    orderBy: { entryDate: "desc" as const },
  },
  // This same Party's own supplier-side ledger activity (LedgerEntry rows
  // where vendorId, not customerId, points at this row) — folded into
  // currentBalance below (see mapCustomer's combinedBalance) now that a
  // Party's customer-side and supplier-side activity live on one row
  // instead of two linked ones.
  ledgerEntriesAsVendor: {
    select: { amount: true, type: true },
  },
};

export const CUSTOMER_DETAIL_INCLUDE = {
  ...CUSTOMER_LIST_INCLUDE,
};

export function mapCustomer(customer: any): CustomerRecord {
  const totalOrders = customer.invoices.length;

  const totalPurchaseValueNumber = customer.invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0),
    0,
  );

  // Outstanding = unpaid Invoices + unpaid Kacha slips + opening balance —
  // matches getCustomerLedgerSummary's own currentBalance exactly (that
  // function was the only one of the three independent "how much does this
  // customer owe" implementations in this app that got this right). Every
  // other display of "pending"/"outstanding"/"current balance" for a
  // customer reads from this same number now, via mapCustomer, so the
  // Parties list, a customer's detail page, and the Payment In picker can
  // no longer disagree with the Ledger tab.
  const invoiceBalance = customer.invoices.reduce(
    (sum: number, invoice: any) =>
      invoice.status === "CANCELLED" ? sum : sum + Number(invoice.balanceAmount || 0),
    0,
  );
  const kachaBalance = (customer.kachaInvoices ?? []).reduce(
    (sum: number, kacha: any) =>
      kacha.status === "CANCELLED" ? sum : sum + Number(kacha.balanceAmount || 0),
    0,
  );
  const pendingAmountNumber = invoiceBalance + kachaBalance + Number(customer.openingBalance ?? 0);

  const lastPurchaseDate =
    customer.invoices.length > 0
      ? formatDate(customer.invoices[0].invoiceDate)
      : "-";

  const lastPaymentDate =
    customer.ledgerEntries.length > 0
      ? formatDate(customer.ledgerEntries[0].entryDate)
      : "-";

  // Same formula as getCustomerLedgerSummary (customer-ledger-actions.ts):
  // opening balance plus every DEBIT (sales) minus every CREDIT (payments/
  // refunds/write-offs) since. This used to just copy openingBalance
  // straight through here — correct only for a customer with zero activity
  // since creation, silently wrong (and rendered as the list's "Balance"
  // column) for every other one.
  const ledgerBalanceDelta = customer.ledgerEntries.reduce(
    (sum: number, entry: any) =>
      sum + (entry.type === "DEBIT" ? Number(entry.amount ?? 0) : -Number(entry.amount ?? 0)),
    0,
  );

  const ownBalance = Number(customer.openingBalance ?? 0) + ledgerBalanceDelta;

  // This same Party's own supplier-side ledger activity (LedgerEntry rows
  // where vendorId, not customerId, is this row — Purchases bought from
  // them, Payments Out made to them) is tracked as its OWN independent
  // balance (supplierBalance below), not netted into the customer-side
  // figure above — the Supplier module's own spec calls for the two to be
  // "maintained separately"/"tracked independently," since a store owner
  // reasoning about what it owes a supplier doesn't want that number
  // silently offset by an unrelated sale to the same party. Purchase-side
  // CREDIT (an amount owed TO them) increases what's owed; a Payment Out
  // DEBIT reduces it — the opposite polarity from customer-side DEBIT/
  // CREDIT above. openingBalance is a single shared field, already spent
  // above on the customer-side figure, so it isn't counted a second time
  // here — a party's opening balance predates this merge and was always a
  // receivable-direction number in practice (see the merge migration's own
  // notes on this).
  const supplierLedgerBalance = (customer.ledgerEntriesAsVendor ?? []).reduce(
    (sum: number, entry: any) =>
      sum + (entry.type === "CREDIT" ? Number(entry.amount ?? 0) : -Number(entry.amount ?? 0)),
    0,
  );

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? "",
    altPhone: customer.alternatePhone ?? "",
    email: customer.email ?? "",
    address: customer.addressLine1 ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    pincode: customer.pincode ?? "",
    customerType: "",
    openingBalance: Number(customer.openingBalance ?? 0),
    // Ledger-derived (opening balance + DEBIT total - CREDIT total) rather
    // than pendingAmountNumber above — this is the account's actual running
    // balance from its full transaction history, the same figure
    // getCustomerLedgerSummary computes, and it stays correct even where a
    // cached document balanceAmount might not (e.g. it already reflects a
    // Credit Note's return via that return's own ledger CREDIT, with no
    // dependency on also having fixed every document-balance write path).
    // pendingAmountNumber (unpaid Invoices/Kacha + opening) remains the
    // right figure for "which specific documents are still open," used by
    // the Payment In picker's allocator — a different question that happens
    // to usually match this one in a fully consistent ledger.
    currentBalance: ownBalance,
    // Was hardcoded to "Receivable" for every customer regardless of sign —
    // a customer who has prepaid (currentBalance < 0) is owed money BY the
    // store, not the other way around.
    balanceType: ownBalance < 0 ? "Advance" : "Receivable",
    goldBalance: 0,
    silverBalance: 0,
    creditLimit: "",
    paymentTerms: "",
    gstNumber: customer.gstin ?? "",
    gstType: customer.gstType ?? "UNREGISTERED",
    panNumber: customer.panNumber ?? "",
    aadhaarNumber: customer.aadhaarNumber ?? "",
    registrationId: customer.registrationId ?? "",
    createdByName: customer.createdByName ?? null,
    totalOrders,
    totalPurchaseValue: formatCurrency(totalPurchaseValueNumber),
    pendingAmount: formatCurrency(pendingAmountNumber),
    lastPurchaseDate,
    lastPaymentDate,
    notes: customer.notes ?? "",
    createdAt: customer.createdAt.toISOString(),
    isSupplier: customer.isSupplier ?? false,
    vendorCode: customer.vendorCode ?? null,
    supplierBalance: supplierLedgerBalance,
    supplierBalanceType: supplierLedgerBalance < 0 ? "Advance" : "Payable",
  };
}

export async function getCustomersCore(
  params: GetCustomersParams,
  storeId: string,
): Promise<CustomersListResponse> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy: CustomerSortBy = params.sortBy || "createdAt";
  const sortOrder: SortOrder = params.sortOrder || "desc";

  const where = getCustomerWhere(
    storeId,
    params.search,
    params.archived,
    params.dateFrom,
    params.dateTo,
    params.supplierOnly,
  );
  const orderBy = getCustomerOrderBy(sortBy, sortOrder);

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: CUSTOMER_LIST_INCLUDE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    customers: customers.map(mapCustomer),
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

export async function getCustomerByIdCore(
  id: string,
  storeId: string,
): Promise<CustomerRecord | null> {
  const customer = await prisma.customer.findFirst({
    where: { id, storeId },
    include: CUSTOMER_DETAIL_INCLUDE,
  });

  if (!customer) return null;
  return mapCustomer(customer);
}

export function validateCustomerInput(input: CustomerInput) {
  const errors: Record<string, string[]> = {};
  if (!input.name?.trim()) errors.name = ["Party name is required"];
  if (input.aadhaarNumber?.trim() && !isValidAadhaarNumber(input.aadhaarNumber)) {
    errors.aadhaarNumber = [AADHAAR_INVALID_MESSAGE];
  }
  if (input.panNumber?.trim() && !isValidPanNumber(input.panNumber)) {
    errors.panNumber = [PAN_INVALID_MESSAGE];
  }
  return errors;
}

export async function createCustomerCore(
  input: CustomerInput,
  ctx: CustomerActorContext,
): Promise<CustomerFormState> {
  try {
    const name = input.name.trim();
    const phone = input.phone.trim();

    const errors = validateCustomerInput(input);
    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    // Phone is optional now — an empty value is stored as null below, and
    // Postgres never treats two nulls as colliding under the unique index,
    // so this check (and the constraint itself) only ever matters once a
    // phone number is actually entered.
    if (phone) {
      const existing = await prisma.customer.findFirst({
        where: { phone, storeId: ctx.storeId },
        select: { id: true },
      });

      if (existing) {
        return {
          success: false,
          message: "Phone number already exists",
          errors: { phone: ["A party with this phone number already exists"] },
        };
      }
    }

    const customer = await prisma.customer.create({
      data: {
        storeId: ctx.storeId,
        name,
        phone: phone || null,
        alternatePhone: input.altPhone?.trim() || null,
        email: input.email?.trim() || null,
        addressLine1: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        pincode: input.pincode?.trim() || null,
        gstin: input.gstNumber?.trim() || null,
        gstType: input.gstType ?? "UNREGISTERED",
        panNumber: input.panNumber?.trim() ? normalizePanNumber(input.panNumber) : null,
        aadhaarNumber: input.aadhaarNumber?.trim()
          ? normalizeAadhaarNumber(input.aadhaarNumber)
          : null,
        registrationId: input.registrationId?.trim() || null,
        notes: input.notes?.trim() || null,
        openingBalance: input.openingBalance ?? 0,
        createdById: ctx.actorId,
        createdByName: ctx.actorName,
      },
      select: { id: true, name: true, phone: true, customerCode: true },
    });

    return { success: true, message: "Party added successfully", customer };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A party with this phone number already exists"] },
      };
    }
    logger.error("createCustomerCore error", error);
    return { success: false, message: "Failed to add party" };
  }
}

export async function updateCustomerCore(
  id: string,
  input: CustomerInput,
  storeId: string,
): Promise<CustomerFormState> {
  try {
    const name = input.name.trim();
    const phone = input.phone.trim();

    const errors = validateCustomerInput(input);
    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    if (phone) {
      const existing = await prisma.customer.findFirst({
        where: { phone, storeId, NOT: { id } },
        select: { id: true },
      });

      if (existing) {
        return {
          success: false,
          message: "Phone number already exists",
          errors: { phone: ["A party with this phone number already exists"] },
        };
      }
    }

    const { count } = await prisma.customer.updateMany({
      where: { id, storeId },
      data: {
        name,
        phone: phone || null,
        alternatePhone: input.altPhone?.trim() || null,
        email: input.email?.trim() || null,
        addressLine1: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        pincode: input.pincode?.trim() || null,
        gstin: input.gstNumber?.trim() || null,
        gstType: input.gstType ?? "UNREGISTERED",
        panNumber: input.panNumber?.trim() ? normalizePanNumber(input.panNumber) : null,
        aadhaarNumber: input.aadhaarNumber?.trim()
          ? normalizeAadhaarNumber(input.aadhaarNumber)
          : null,
        registrationId: input.registrationId?.trim() || null,
        notes: input.notes?.trim() || null,
        openingBalance: input.openingBalance ?? 0,
      },
    });

    if (count === 0) {
      return { success: false, message: "Party not found" };
    }

    return { success: true, message: "Party updated successfully" };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A party with this phone number already exists"] },
      };
    }
    logger.error("updateCustomerCore error", error);
    return { success: false, message: "Failed to update party" };
  }
}

/**
 * The "Also Supplier" action on a Party's detail page — an explicit,
 * user-triggered mark/unmark, distinct from the automatic flip
 * createPurchase/recordPaymentOut already do the first time a Party is
 * actually used as one. Caller (lib/actions/customer-actions.ts) is
 * responsible for checking BusinessSettings.supplierModuleEnabled first;
 * this core function doesn't know about Settings at all, same separation
 * as every other core function in this file.
 */
export async function setCustomerSupplierStatusCore(
  id: string,
  storeId: string,
  isSupplier: boolean,
): Promise<CustomerFormState> {
  const { count } = await prisma.customer.updateMany({
    where: { id, storeId },
    data: { isSupplier },
  });

  if (count === 0) {
    return { success: false, message: "Party not found" };
  }

  return {
    success: true,
    message: isSupplier ? "Marked as a supplier" : "Removed supplier status",
  };
}
