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
  panNumber?: string;
  registrationId?: string;
  createdByName?: string | null;
  totalOrders?: number;
  totalPurchaseValue?: string;
  pendingAmount?: string;
  lastPurchaseDate?: string;
  lastPaymentDate?: string;
  notes?: string;
  createdAt?: string;
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
  panNumber?: string;
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
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getCustomerWhere(storeId: string, search?: string, archived = false) {
  const query = String(search || "").trim();

  return {
    storeId,
    isArchived: archived,
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
    },
    orderBy: { invoiceDate: "desc" as const },
  },
  ledgerEntries: {
    select: { id: true, amount: true, entryDate: true },
    orderBy: { entryDate: "desc" as const },
  },
};

export function mapCustomer(customer: any): CustomerRecord {
  const totalOrders = customer.invoices.length;

  const totalPurchaseValueNumber = customer.invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0),
    0,
  );

  const pendingAmountNumber = customer.invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.balanceAmount || 0),
    0,
  );

  const lastPurchaseDate =
    customer.invoices.length > 0
      ? formatDate(customer.invoices[0].invoiceDate)
      : "-";

  const lastPaymentDate =
    customer.ledgerEntries.length > 0
      ? formatDate(customer.ledgerEntries[0].entryDate)
      : "-";

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
    currentBalance: Number(customer.openingBalance ?? 0),
    balanceType: "Receivable",
    goldBalance: 0,
    silverBalance: 0,
    creditLimit: "",
    paymentTerms: "",
    gstNumber: customer.gstin ?? "",
    panNumber: customer.panNumber ?? "",
    registrationId: customer.registrationId ?? "",
    createdByName: customer.createdByName ?? null,
    totalOrders,
    totalPurchaseValue: formatCurrency(totalPurchaseValueNumber),
    pendingAmount: formatCurrency(pendingAmountNumber),
    lastPurchaseDate,
    lastPaymentDate,
    notes: customer.notes ?? "",
    createdAt: customer.createdAt.toISOString(),
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

  const where = getCustomerWhere(storeId, params.search, params.archived);
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
    include: CUSTOMER_LIST_INCLUDE,
  });

  if (!customer) return null;
  return mapCustomer(customer);
}

function validateCustomerInput(input: CustomerInput) {
  const errors: Record<string, string[]> = {};
  if (!input.name?.trim()) errors.name = ["Customer name is required"];
  if (!input.phone?.trim()) errors.phone = ["Phone number is required"];
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

    const existing = await prisma.customer.findFirst({
      where: { phone, storeId: ctx.storeId },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A customer with this phone number already exists"] },
      };
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
        panNumber: input.panNumber?.trim() || null,
        registrationId: input.registrationId?.trim() || null,
        notes: input.notes?.trim() || null,
        openingBalance: input.openingBalance ?? 0,
        createdById: ctx.actorId,
        createdByName: ctx.actorName,
      },
      select: { id: true, name: true, phone: true, customerCode: true },
    });

    return { success: true, message: "Customer added successfully", customer };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A customer with this phone number already exists"] },
      };
    }
    console.error("createCustomerCore error:", error);
    return { success: false, message: "Failed to add customer" };
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

    const existing = await prisma.customer.findFirst({
      where: { phone, storeId, NOT: { id } },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A customer with this phone number already exists"] },
      };
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
        panNumber: input.panNumber?.trim() || null,
        registrationId: input.registrationId?.trim() || null,
        notes: input.notes?.trim() || null,
        openingBalance: input.openingBalance ?? 0,
      },
    });

    if (count === 0) {
      return { success: false, message: "Customer not found" };
    }

    return { success: true, message: "Customer updated successfully" };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "Phone number already exists",
        errors: { phone: ["A customer with this phone number already exists"] },
      };
    }
    console.error("updateCustomerCore error:", error);
    return { success: false, message: "Failed to update customer" };
  }
}
