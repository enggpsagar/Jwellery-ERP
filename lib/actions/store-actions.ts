// lib/actions/store-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { StorePlanAction, UserRole, UserStatus, InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/auth";
import { ACTIVE_STORE_COOKIE } from "@/lib/store-context";
import { buildExcelExport, buildCsvExportBase64, buildPdfExportBase64 } from "@/lib/excel-export";
import { classifyMetalName } from "@/lib/business-units";
import { buildUniqueStoreCode } from "@/lib/store-code";
import { sendInviteEmailSafely } from "@/lib/invite-email";

export type StoreFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

export type StoreSortBy = "name" | "code" | "createdAt";
export type SortOrder = "asc" | "desc";
export type StoreStatusFilter = "ACTIVE" | "INACTIVE";

export type GetStoresParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: StoreSortBy;
  sortOrder?: SortOrder;
  status?: StoreStatusFilter;
};

export type StoresPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type ExportStoresParams = {
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  status?: string;
  format?: "csv" | "xlsx" | "pdf";
};

const STORE_INCLUDE = {
  plan: { select: { id: true, name: true, durationDays: true } },
  _count: {
    select: { users: true, customers: true, invoices: true },
  },
} as const;

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function getStoresWhere(search?: string, status?: StoreStatusFilter) {
  const query = String(search || "").trim();

  return {
    ...(status ? { isActive: status === "ACTIVE" } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function getStoresOrderBy(sortBy: StoreSortBy = "createdAt", sortOrder: SortOrder = "desc") {
  if (sortBy === "name") return { name: sortOrder };
  if (sortBy === "code") return { code: sortOrder };
  return { createdAt: sortOrder };
}

export async function getStores(params: GetStoresParams = {}) {
  await requireRole(UserRole.SUPER_ADMIN);

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  const where = getStoresWhere(search, params.status);
  const orderBy = getStoresOrderBy(sortBy, sortOrder);

  const [totalCount, stores] = await Promise.all([
    prisma.store.count({ where }),
    prisma.store.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: STORE_INCLUDE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pagination: StoresPagination = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return { stores, pagination };
}

export async function exportStoresToExcel(params: ExportStoresParams = {}): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const status =
      params.status === "ACTIVE" || params.status === "INACTIVE"
        ? (params.status as StoreStatusFilter)
        : undefined;
    const where = getStoresWhere(params.search, status);
    const orderBy = getStoresOrderBy(
      (params.sortBy as StoreSortBy) || "createdAt",
      params.sortOrder || "desc"
    );

    const stores = await prisma.store.findMany({
      where,
      orderBy,
      include: STORE_INCLUDE,
    });

    if (!stores.length) {
      return { success: false, message: "No stores found to export." };
    }

    const rows = stores.map((store, index) => ({
      "Sr. No.": index + 1,
      "Store Name": store.name,
      Code: store.code,
      City: store.city || "",
      Phone: store.phone || "",
      Email: store.email || "",
      Status: store.isActive ? "Active" : "Inactive",
      Users: store._count.users,
      Customers: store._count.customers,
      Invoices: store._count.invoices,
      "Created At": store.createdAt.toLocaleString("en-IN"),
    }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "stores")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Stores", "stores")
          : buildExcelExport(rows, "Stores", "stores");

    return {
      success: true,
      message: "Stores exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportStoresToExcel error:", error);
    return { success: false, message: "Failed to export stores." };
  }
}

/**
 * Creates a Store and its initial Admin user in one transaction, so a
 * Super Admin can spin up a new store ready for that Admin to sign in
 * and finish setup (business details, invoice prefixes, etc).
 */
export async function createStoreWithAdmin(
  prevState: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const name = String(formData.get("name") || "").trim();
    // Derived below, not accepted from the form: the code encodes state and
    // area and is permanent, so a typed value could contradict the address
    // submitted alongside it.
    const phone = toOptionalString(formData.get("phone"));
    const email = toOptionalString(formData.get("email"));
    const adminName = String(formData.get("adminName") || "").trim();
    const adminEmail = toOptionalString(formData.get("adminEmail"));
    const adminPhone = toOptionalString(formData.get("adminPhone"));
    const planId = toOptionalString(formData.get("planId"));

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Store name is required"];

    if (!phone) errors.phone = ["Store phone number is required"];
    if (!email) errors.email = ["Store email is required"];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ["Enter a valid email address"];
    }
    if (!adminName) errors.adminName = ["Admin name is required"];
    if (!adminEmail && !adminPhone) {
      errors.adminEmail = ["Provide an admin email or phone number"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    // Resolve the chosen plan up front so a bad/inactive planId fails the
    // whole submission with a clear error, rather than silently creating a
    // store with no plan (which would then never expire — the opposite of
    // what picking a plan on this form is supposed to guarantee).
    let plan: { id: string; durationDays: number } | null = null;
    if (planId) {
      plan = await prisma.plan.findFirst({
        where: { id: planId, isActive: true },
        select: { id: true, durationDays: true },
      });
      if (!plan) {
        return {
          success: false,
          message: "Please fix the form errors",
          errors: { planId: ["Selected plan is not available"] },
        };
      }
    }

    // Email/phone are globally-unique sign-in identifiers across every
    // store — check up front so the error names exactly which field
    // collided, rather than relying on the DB's generic P2002 message.
    if (adminEmail || adminPhone) {
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            adminEmail ? { email: adminEmail } : undefined,
            adminPhone ? { phone: adminPhone } : undefined,
          ].filter((clause): clause is NonNullable<typeof clause> => !!clause),
        },
        select: { email: true, phone: true },
      });

      if (existing) {
        const field = existing.email === adminEmail ? "adminEmail" : "adminPhone";
        return {
          success: false,
          message:
            field === "adminEmail"
              ? "This email is already registered to a user at another store."
              : "This phone number is already registered to a user at another store.",
          errors: { [field]: ["Already in use by another store's user"] },
        };
      }
    }

    const code = buildUniqueStoreCode(
      {
        name,
        state: toOptionalString(formData.get("state")),
        area: toOptionalString(formData.get("city")),
      },
      (await prisma.store.findMany({ select: { code: true } })).map(
        (existing) => existing.code,
      ),
    );

    const store = await prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          name,
          code,
          address: toOptionalString(formData.get("address")),
          city: toOptionalString(formData.get("city")),
          state: toOptionalString(formData.get("state")),
          pincode: toOptionalString(formData.get("pincode")),
          phone,
          email,
          gstNumber: toOptionalString(formData.get("gstNumber")),
          ...(plan
            ? {
                planId: plan.id,
                planStartedAt: new Date(),
                planExpiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
              }
            : {}),
        },
      });

      await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          role: UserRole.ADMIN,
          status: UserStatus.INVITED,
          isActive: true,
          storeId: createdStore.id,
        },
      });

      return createdStore;
    });

    revalidatePath("/stores");

    const emailSent = await sendInviteEmailSafely({
      email: adminEmail,
      phone: adminPhone,
      name: adminName,
      role: UserRole.ADMIN,
      storeName: store.name,
    });

    return {
      success: true,
      message:
        adminEmail && emailSent
          ? `Store "${name}" created and a welcome email was sent to ${adminEmail}`
          : adminEmail
            ? `Store "${name}" created, but the welcome email could not be sent`
            : `Store "${name}" created`,
    };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "A store with that code, or a user with that email/phone, already exists",
      };
    }
    console.error("createStoreWithAdmin error:", error);
    return { success: false, message: "Failed to create store" };
  }
}

/**
 * Archiving a store marks it inactive (Store.isActive = false) and blocks
 * further sign-in for that store's own ADMIN/STAFF/KARIGAR users (enforced
 * in lib/auth/auth-options.ts's signIn callback and otp-auth.ts) — it does
 * not touch any already-issued session, which stays valid until it expires.
 */
export async function archiveStore(storeId: string): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (!store) {
      return { success: false, message: "Store not found" };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { isActive: false },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${store.name}" archived` };
  } catch (error) {
    console.error("archiveStore error:", error);
    return { success: false, message: "Failed to archive store" };
  }
}

export type BulkArchiveResult = {
  archivedCount: number;
  failures: { id: string; message: string }[];
};

/**
 * Archives each selected store through the exact same archiveStore() call
 * a single-row Archive uses — never a bare updateMany — so the SUPER_ADMIN
 * role check and not-found handling apply identically whether one row or
 * several were ticked at once.
 */
export async function bulkArchiveStores(ids: string[]): Promise<BulkArchiveResult> {
  const failures: BulkArchiveResult["failures"] = [];
  let archivedCount = 0;

  for (const id of ids) {
    const result = await archiveStore(id);
    if (result.success) {
      archivedCount++;
    } else {
      failures.push({ id, message: result.message });
    }
  }

  return { archivedCount, failures };
}

export async function restoreStore(storeId: string): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (!store) {
      return { success: false, message: "Store not found" };
    }

    await prisma.store.update({
      where: { id: storeId },
      // Clear the archive-notice stamp too, so if this store is ever
      // archived again its owner is told again rather than being silently
      // suppressed by a cooldown from months earlier.
      data: { isActive: true, archiveNotifiedAt: null },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${store.name}" restored` };
  } catch (error) {
    console.error("restoreStore error:", error);
    return { success: false, message: "Failed to restore store" };
  }
}

export type StoreRecordCounts = {
  customers: number;
  vendors: number;
  karigars: number;
  products: number;
  invoices: number;
  kachaInvoices: number;
  purchases: number;
  quotations: number;
  users: number;
  total: number;
};

/**
 * Read-only counts for the handful of entities a human recognizes on a
 * confirmation screen, used to decide whether a plain archive/delete is
 * safe or whether Force Delete (forceDeleteStore, below) is required.
 * Deliberately approximate/simple — NOT the exhaustive model list that
 * forceDeleteStore itself has to enumerate.
 */
export async function getStoreRecordCounts(storeId: string): Promise<StoreRecordCounts> {
  await requireRole(UserRole.SUPER_ADMIN);

  const [customers, vendors, karigars, products, invoices, kachaInvoices, purchases, quotations, users] =
    await Promise.all([
      prisma.customer.count({ where: { storeId } }),
      prisma.vendor.count({ where: { storeId } }),
      prisma.karigar.count({ where: { storeId } }),
      prisma.product.count({ where: { storeId } }),
      prisma.invoice.count({ where: { storeId } }),
      prisma.kachaInvoice.count({ where: { storeId } }),
      prisma.purchase.count({ where: { storeId } }),
      prisma.quotation.count({ where: { storeId } }),
      prisma.user.count({ where: { storeId } }),
    ]);

  const total =
    customers + vendors + karigars + products + invoices + kachaInvoices + purchases + quotations + users;

  return { customers, vendors, karigars, products, invoices, kachaInvoices, purchases, quotations, users, total };
}

/**
 * Permanently deletes a Store and every row anywhere in the schema that
 * belongs to it — direct storeId rows AND transitive children that only
 * belong to it via a parent (InvoiceItem, PurchaseItem, etc). Only 22 of the
 * ~29 storeId-bearing models cascade at the DB level, so a bare
 * `store.delete()` fails on any store with real data — this walks the full
 * dependency graph by hand instead of widening the schema's cascade
 * behaviour just for this one rare admin action.
 *
 * Everything runs as ONE prisma.$transaction([...]) array (not the
 * interactive callback form) so a failure anywhere rolls back the entire
 * operation — never a half-deleted store. Every operation below is scoped
 * either directly by `storeId` or through a parent relation/id list that is
 * itself derived from `storeId` — never a bare deleteMany({}).
 *
 * Two circular/self-referential FKs need clearing BEFORE their target rows
 * can be deleted, or the delete throws:
 *   - Store.defaultLocationId points at one of this store's own
 *     StoreLocation rows, so StoreLocation can't be deleted while Store
 *     still points at it.
 *   - Invoice.replacesId is a self-reference (a replacement invoice points
 *     at the cancelled one it replaced) — deleting both rows in the same
 *     storeId-scoped deleteMany is not guaranteed safe DELETE-order-wise, so
 *     the pointer is nulled first.
 *
 * User is the other special case: it is NOT deleted by storeId directly.
 * `User.storeId` is only a user's *default* membership (predates
 * UserStoreMembership) — a user can also hold live membership rows into
 * OTHER stores. Deleting such a person because their default store is being
 * destroyed would break their access to a store that isn't being deleted.
 * So the exact set of user ids to remove is resolved up front: storeId
 * matches AND no UserStoreMembership row points at a *different* store.
 * `User.karigarId` (this store's Karigar login) and any `User.invitedById`
 * pointing at one of these users are nulled before the Karigar/User rows
 * they'd otherwise block are removed.
 */
export async function forceDeleteStore(storeId: string): Promise<{ success: boolean; message: string }> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (!store) {
      return { success: false, message: "Store not found" };
    }

    // Resolve the exact User ids this store "owns" outright — see the
    // function doc comment above for why this can't just be `{ storeId }`.
    const ownedUsers = await prisma.user.findMany({
      where: {
        storeId,
        storeMemberships: { none: { storeId: { not: storeId } } },
      },
      select: { id: true },
    });
    const userIds = ownedUsers.map((u) => u.id);

    await prisma.$transaction([
      // --- Clear circular / self-referential FKs before anything they'd block ---
      prisma.store.update({ where: { id: storeId }, data: { defaultLocationId: null } }),
      prisma.invoice.updateMany({ where: { storeId }, data: { replacesId: null } }),
      prisma.user.updateMany({ where: { invitedById: { in: userIds } }, data: { invitedById: null } }),
      prisma.user.updateMany({ where: { id: { in: userIds } }, data: { karigarId: null } }),

      // --- Deepest line-item / leaf children first ---
      prisma.inventoryTransaction.deleteMany({ where: { inventoryStock: { storeId } } }),
      prisma.scanSessionItem.deleteMany({ where: { session: { storeId } } }),
      prisma.creditNoteItem.deleteMany({ where: { creditNote: { storeId } } }),
      prisma.karigarReceiptItem.deleteMany({ where: { karigarJob: { storeId } } }),
      prisma.invoiceItem.deleteMany({ where: { invoice: { storeId } } }),
      prisma.kachaInvoiceItem.deleteMany({ where: { kachaInvoice: { storeId } } }),
      prisma.purchaseItem.deleteMany({ where: { purchase: { storeId } } }),
      prisma.quotationItem.deleteMany({ where: { quotation: { storeId } } }),

      // --- Mid-level documents ---
      prisma.ledgerEntry.deleteMany({ where: { storeId } }),
      prisma.scanSession.deleteMany({ where: { storeId } }),
      prisma.karigarJob.deleteMany({ where: { storeId } }),
      prisma.inventoryStock.deleteMany({ where: { storeId } }),
      prisma.creditNote.deleteMany({ where: { storeId } }),
      prisma.kachaInvoice.deleteMany({ where: { storeId } }),
      prisma.quotation.deleteMany({ where: { storeId } }),
      prisma.invoice.deleteMany({ where: { storeId } }),
      prisma.purchase.deleteMany({ where: { storeId } }),
      prisma.reminder.deleteMany({ where: { storeId } }),
      prisma.userLocationAccess.deleteMany({ where: { location: { storeId } } }),

      // --- Parties / catalog ---
      prisma.karigar.deleteMany({ where: { storeId } }),
      prisma.customer.deleteMany({ where: { storeId } }),
      prisma.vendor.deleteMany({ where: { storeId } }),
      prisma.product.deleteMany({ where: { storeId } }),

      // --- Taxonomy (must outlive Product, which references all of these) ---
      prisma.storeCategoryType.deleteMany({ where: { storeId } }),
      prisma.storeCategory.deleteMany({ where: { storeId } }),
      prisma.storeMetalOrigin.deleteMany({ where: { storeId } }),
      prisma.storeMetal.deleteMany({ where: { storeId } }),
      prisma.storeLocation.deleteMany({ where: { storeId } }),

      // --- Store-level singletons / settings tables ---
      prisma.metalRate.deleteMany({ where: { storeId } }),
      prisma.purityFineness.deleteMany({ where: { storeId } }),
      prisma.caratConversionRate.deleteMany({ where: { storeId } }),
      prisma.businessSettings.deleteMany({ where: { storeId } }),
      prisma.apiKey.deleteMany({ where: { storeId } }),

      // --- Support tickets (platform-wide model, so scoped by storeId only,
      // plus a safety-net null on any OTHER store's ticket/message authored
      // by a user this store is about to delete) ---
      prisma.supportTicketMessage.deleteMany({ where: { ticket: { storeId } } }),
      prisma.supportTicketMessage.updateMany({ where: { authorId: { in: userIds } }, data: { authorId: null } }),
      prisma.supportTicket.updateMany({ where: { submittedById: { in: userIds } }, data: { submittedById: null } }),
      prisma.supportTicket.deleteMany({ where: { storeId } }),

      // --- Invite tokens: scoped delete for invites INTO this store, plus a
      // safety-net null for any invite (possibly for another store) accepted
      // by a user this store is about to delete ---
      prisma.inviteToken.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } }),
      prisma.inviteToken.deleteMany({ where: { storeId } }),

      // --- This store's user accounts and everything hanging off them ---
      prisma.employee.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.account.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.otpCode.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userStoreMembership.deleteMany({ where: { storeId } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),

      prisma.storePlanHistory.deleteMany({ where: { storeId } }),

      // --- Finally, the Store row itself ---
      prisma.store.delete({ where: { id: storeId } }),
    ]);

    revalidatePath("/stores");

    return { success: true, message: `Store "${store.name}" and all its data were permanently deleted` };
  } catch (error) {
    console.error("forceDeleteStore error:", error);
    return { success: false, message: "Failed to force-delete store" };
  }
}

/**
 * Assigns or renews a store's plan — the single action used both to put a
 * store on a plan for the first time and to renew/change it later; renewal
 * isn't a separate code path, just calling this again. Resets
 * planReminderSentAt so a renewed store re-enters the 7-day reminder cycle
 * instead of being silently skipped by the cron's "already reminded" guard.
 */
export async function assignPlanToStore(storeId: string, planId: string): Promise<StoreFormState> {
  try {
    const actor = await requireRole(UserRole.SUPER_ADMIN);

    const [store, plan] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, planId: true },
      }),
      prisma.plan.findFirst({
        where: { id: planId, isActive: true },
        select: { name: true, durationDays: true, price: true },
      }),
    ]);

    if (!store) {
      return { success: false, message: "Store not found" };
    }
    if (!plan) {
      return { success: false, message: "Selected plan is not available" };
    }

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000,
    );

    // Same plan again is a renewal; a different one is a change. Recorded
    // distinctly because "when did they last renew" is a different question
    // from "when did they last switch plan".
    const action =
      store.planId === planId
        ? StorePlanAction.RENEWED
        : StorePlanAction.ASSIGNED;

    await prisma.$transaction([
      prisma.store.update({
        where: { id: storeId },
        data: {
          planId,
          planStartedAt: startedAt,
          planExpiresAt: expiresAt,
          planReminderSentAt: null,
        },
      }),
      // Written in the same transaction as the store update: a ledger that
      // can disagree with the row it describes is worse than no ledger.
      prisma.storePlanHistory.create({
        data: {
          storeId,
          planId,
          // Snapshots — the plan can be renamed or repriced later and the
          // history has to keep saying what was actually sold.
          planName: plan.name,
          price: plan.price,
          durationDays: plan.durationDays,
          startedAt,
          expiresAt,
          action,
          actorId: actor.id ?? null,
          actorName: actor.name ?? null,
        },
      }),
    ]);

    revalidatePath("/stores");
    revalidatePath(`/stores/${storeId}`);

    return { success: true, message: `"${plan.name}" plan assigned to "${store.name}"` };
  } catch (error) {
    console.error("assignPlanToStore error:", error);
    return { success: false, message: "Failed to assign plan" };
  }
}

export type StoreDetail = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
};

export type PlatformGoldStoreBreakdown = {
  storeId: string;
  storeName: string;
  storeCode: string;
  goldWeight: number;
};

export type PlatformGoldSummary = {
  totalGoldWeight: number;
  byStore: PlatformGoldStoreBreakdown[];
};

/**
 * Physical gold currently IN_STOCK, summed across every store — a
 * platform-wide view only Super Admin can see, since each store's own
 * Dashboard only shows its own stock in isolation.
 */
export async function getPlatformGoldInventory(): Promise<PlatformGoldSummary> {
  await requireRole(UserRole.SUPER_ADMIN);

  const rows = await prisma.inventoryStock.findMany({
    where: { status: InventoryStockStatus.IN_STOCK },
    select: {
      netWeight: true,
      store: { select: { id: true, name: true, code: true } },
      metalType: { select: { name: true } },
    },
  });

  const byStoreMap = new Map<string, PlatformGoldStoreBreakdown>();

  for (const row of rows) {
    if (classifyMetalName(row.metalType?.name) !== "GOLD") continue;

    const weight = Number(row.netWeight ?? 0);
    const existing = byStoreMap.get(row.store.id) ?? {
      storeId: row.store.id,
      storeName: row.store.name,
      storeCode: row.store.code,
      goldWeight: 0,
    };
    existing.goldWeight += weight;
    byStoreMap.set(row.store.id, existing);
  }

  const byStore = Array.from(byStoreMap.values()).sort(
    (a, b) => b.goldWeight - a.goldWeight
  );
  const totalGoldWeight = byStore.reduce((sum, s) => sum + s.goldWeight, 0);

  return { totalGoldWeight, byStore };
}

export async function getStoreById(storeId: string): Promise<StoreDetail | null> {
  await requireRole(UserRole.SUPER_ADMIN);

  return prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
    },
  });
}

/**
 * Store code is deliberately NOT updatable here. It encodes the shop's state
 * and area and is stamped on records that outlive any edit — an identifier
 * that can change is one that stops identifying anything. The edit form
 * renders it read-only, and this ignores it even if posted.
 */
export async function updateStore(
  storeId: string,
  prevState: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const name = String(formData.get("name") || "").trim();

    const phone = toOptionalString(formData.get("phone"));
    const email = toOptionalString(formData.get("email"));

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Store name is required"];

    if (!phone) errors.phone = ["Store phone number is required"];
    if (!email) errors.email = ["Store email is required"];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ["Enter a valid email address"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: {
        name,
        address: toOptionalString(formData.get("address")),
        city: toOptionalString(formData.get("city")),
        state: toOptionalString(formData.get("state")),
        pincode: toOptionalString(formData.get("pincode")),
        phone,
        email,
        gstNumber: toOptionalString(formData.get("gstNumber")),
      },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${name}" updated` };
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, message: "A store with that code already exists" };
    }
    console.error("updateStore error:", error);
    return { success: false, message: "Failed to update store" };
  }
}

export async function setActiveStoreAction(storeId: string) {
  // Switching is no longer Super-Admin-only: a person who works across two
  // shops picks between them here too. Membership is what authorises it, so
  // the check is "may this user act on this store", not "is this user a
  // Super Admin" — otherwise the cookie could be pointed at any store.
  const user = await requireAuth();

  if (user.role !== UserRole.SUPER_ADMIN) {
    const membership = await prisma.userStoreMembership.findFirst({
      where: {
        userId: user.id,
        storeId,
        isActive: true,
        store: { isActive: true },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Error("You do not have access to that store.");
    }
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error("Store not found");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/");
}

export async function clearActiveStoreAction() {
  // Anyone may clear their own selection; it only removes a cookie, and
  // resolution falls back to their own membership.
  await requireAuth();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);

  revalidatePath("/");
}
