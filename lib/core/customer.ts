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
import type { GstScheme, PartyGstType } from "@prisma/client";
import {
  gstinRequired,
  isValidGstin,
  normalizeGstin,
  GSTIN_INVALID_MESSAGE,
  GSTIN_REQUIRED_MESSAGE,
} from "@/lib/gst";
import { isValidAadhaarNumber, normalizeAadhaarNumber, AADHAAR_INVALID_MESSAGE } from "@/lib/aadhaar";
import { isValidPanNumber, normalizePanNumber, PAN_INVALID_MESSAGE } from "@/lib/pan";
import { formatShortDate } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseDateRangeBoundary } from "@/lib/date-range";
import {
  partyBalanceDirection,
  partyLedgerDelta,
  partyNetBalance,
  type PartyBalanceDirection,
} from "@/lib/party-balance";

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
  /** Signed: positive = the party owed the store at the start (Receivable),
   *  negative = the store owed them (Payable). */
  openingBalance: number;
  /** The party's ONE net balance — see lib/party-balance.ts. Positive =
   *  Receivable, negative = Payable. Same number as netBalance; kept under
   *  this name because REST/MCP callers already read it. */
  currentBalance?: number;
  netBalance: number;
  balanceType: PartyBalanceDirection;
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
  /** The same two figures as plain numbers (for the Party export). */
  totalPurchaseValueAmount?: number;
  pendingAmountValue?: number;
  lastPurchaseDate?: string;
  lastPaymentDate?: string;
  notes?: string;
  createdAt?: string;
  /** Kept on the record (schema unchanged) but no longer drives any UI —
   *  every party is one Party with one ledger since 2026-10-13. */
  isSupplier?: boolean;
  /** Parallel to customerCode, carried over for a Party that started life
   *  as a standalone Vendor row before the merge, or assigned since. */
  vendorCode?: string | null;
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
  /** Signed — positive Receivable, negative Payable (see
   *  signedOpeningBalance in lib/party-balance.ts). */
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
  /** The store's own GST scheme, when the caller has it — enables the
   *  "GSTIN required for a registered party" rule (see gstinRequired). The
   *  web form's actions pass it; the REST API / MCP callers don't yet. */
  gstScheme?: GstScheme;
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
) {
  const query = String(search || "").trim();
  const from = parseDateRangeBoundary(dateFrom, false);
  const to = parseDateRangeBoundary(dateTo, true);

  return {
    storeId,
    isArchived: archived,
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
  // The same Party's purchase-side ledger rows (vendorId = this party) —
  // part of its one net balance (mapCustomer). Rows that also carry a
  // customerId are already counted through `ledgerEntries` above, so they
  // are skipped here (none are written today; this keeps it that way).
  ledgerEntriesAsVendor: {
    where: { customerId: null },
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

  // Unpaid Invoices + unpaid Kacha slips + opening balance: which specific
  // sale documents are still open. Not a balance shown anywhere — the one
  // party figure is netBalance below; this only stays on the record (and
  // the export's read-only columns used to carry it) for callers that ask
  // "what's still unpaid on bills", e.g. a payment allocator.
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

  // The party's ONE net balance (lib/party-balance.ts): opening balance
  // plus every DEBIT minus every CREDIT on both its sale-side (customerId)
  // and purchase-side (vendorId) ledger rows. Positive = Receivable,
  // negative = Payable. Replaces the old separate "Outstanding" and
  // "Payable" figures (user decision 2026-10-13).
  const netBalance = partyNetBalance(customer.openingBalance, [
    ...(customer.ledgerEntries ?? []),
    ...(customer.ledgerEntriesAsVendor ?? []),
  ]);

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
    currentBalance: netBalance,
    netBalance,
    balanceType: partyBalanceDirection(netBalance),
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
    totalPurchaseValueAmount: totalPurchaseValueNumber,
    pendingAmountValue: pendingAmountNumber,
    lastPurchaseDate,
    lastPaymentDate,
    notes: customer.notes ?? "",
    createdAt: customer.createdAt.toISOString(),
    isSupplier: customer.isSupplier ?? false,
    vendorCode: customer.vendorCode ?? null,
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * The Party rules shared by the Add/Edit form actions, the Party import and
 * the REST/MCP callers. `gstScheme` (the store's own) is optional: given, a
 * Regular/Composition party must have a GSTIN, as the form requires.
 */
export function validateCustomerInput(
  input: CustomerInput,
  options: { gstScheme?: GstScheme } = {},
) {
  const errors: Record<string, string[]> = {};
  if (!input.name?.trim()) errors.name = ["Party name is required"];
  if (input.aadhaarNumber?.trim() && !isValidAadhaarNumber(input.aadhaarNumber)) {
    errors.aadhaarNumber = [AADHAAR_INVALID_MESSAGE];
  }
  if (input.panNumber?.trim() && !isValidPanNumber(input.panNumber)) {
    errors.panNumber = [PAN_INVALID_MESSAGE];
  }
  const gstNumber = input.gstNumber?.trim() ?? "";
  if (gstNumber && !isValidGstin(gstNumber)) {
    errors.gstNumber = [GSTIN_INVALID_MESSAGE];
  } else if (
    !gstNumber &&
    options.gstScheme &&
    gstinRequired(options.gstScheme, input.gstType ?? "UNREGISTERED")
  ) {
    errors.gstNumber = [GSTIN_REQUIRED_MESSAGE];
  }
  if (input.email?.trim() && !EMAIL_REGEX.test(input.email.trim())) {
    errors.email = ["Enter a valid email address"];
  }
  if (input.pincode?.trim() && !PINCODE_REGEX.test(input.pincode.trim())) {
    errors.pincode = ["Pincode must be 6 digits"];
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

    const errors = validateCustomerInput(input, { gstScheme: ctx.gstScheme });
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
        gstin: input.gstNumber?.trim() ? normalizeGstin(input.gstNumber) : null,
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
  gstScheme?: GstScheme,
): Promise<CustomerFormState> {
  try {
    const name = input.name.trim();
    const phone = input.phone.trim();

    const errors = validateCustomerInput(input, { gstScheme });

    // GSTIN / email / pincode checks are new (2026-10-06): a party saved
    // before them may hold a value they reject. Only judge what this edit
    // changes, so an old record can still be edited for something else.
    if (errors.gstNumber || errors.email || errors.pincode) {
      const stored = await prisma.customer.findFirst({
        where: { id, storeId },
        select: { gstin: true, gstType: true, email: true, pincode: true },
      });
      const same = (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();
      if (stored) {
        if (same(stored.gstin, input.gstNumber) && stored.gstType === (input.gstType ?? stored.gstType)) {
          delete errors.gstNumber;
        }
        if (same(stored.email, input.email)) delete errors.email;
        if (same(stored.pincode, input.pincode)) delete errors.pincode;
      }
    }

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
        gstin: input.gstNumber?.trim() ? normalizeGstin(input.gstNumber) : null,
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
 * Net balance (lib/party-balance.ts) for many parties at once — two
 * grouped sums over the ledger instead of loading every entry. Used by the
 * dashboard totals, the payment pickers and the dues report. `partyIds`
 * limits it to those parties; omitted = every party in the store
 * (archived included — an archived party can still owe or be owed).
 */
export async function getPartyNetBalances(
  storeId: string,
  partyIds?: string[],
): Promise<Map<string, number>> {
  const idFilter = partyIds ? { in: partyIds } : { not: null };
  const [parties, saleSide, purchaseSide] = await Promise.all([
    prisma.customer.findMany({
      where: { storeId, ...(partyIds ? { id: { in: partyIds } } : {}) },
      select: { id: true, openingBalance: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["customerId", "type"],
      where: { storeId, customerId: idFilter },
      _sum: { amount: true },
    }),
    // Same rule as CUSTOMER_LIST_INCLUDE.ledgerEntriesAsVendor: a row with a
    // customerId is already counted on the sale side.
    prisma.ledgerEntry.groupBy({
      by: ["vendorId", "type"],
      where: { storeId, customerId: null, vendorId: idFilter },
      _sum: { amount: true },
    }),
  ]);

  const deltas = new Map<string, number>();
  const add = (id: string | null, type: string, amount: unknown) => {
    if (!id) return;
    deltas.set(id, (deltas.get(id) ?? 0) + partyLedgerDelta({ type, amount }));
  };
  for (const row of saleSide) add(row.customerId, row.type, row._sum.amount);
  for (const row of purchaseSide) add(row.vendorId, row.type, row._sum.amount);

  return new Map(
    parties.map((party) => [
      party.id,
      partyNetBalance(party.openingBalance, [{ type: "DEBIT", amount: deltas.get(party.id) ?? 0 }]),
    ]),
  );
}
