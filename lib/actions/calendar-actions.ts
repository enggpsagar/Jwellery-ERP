// lib/actions/calendar-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { InvoiceStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEffectiveStoreId, requireStoreScope } from "@/lib/store-context";
import { getCurrentUser, hasPermission, requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getLocationScope, locationWhere, resolveWritableLocationId } from "@/lib/location-scope";

export type CalendarEventType =
  | "INVOICE_DUE"
  | "QUOTATION_EXPIRY"
  | "KARIGAR_RETURN"
  | "PLAN_RENEWAL"
  | "REMINDER";

export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  /** ISO date string — the day this event falls on. */
  date: string;
  title: string;
  description: string;
  href: string | null;
  /** Past its date and still unresolved (unpaid, not yet returned, not marked done). */
  isOverdue: boolean;
  /** Only meaningful for REMINDER — every other type has no "done" concept. */
  isDone?: boolean;
  /** Only REMINDER events can be edited/deleted from the calendar itself. */
  isReminder: boolean;
};

export type ReminderFormState = {
  success: boolean;
  message: string;
};

const initialState: ReminderFormState = { success: false, message: "" };

/**
 * Every date-based "something to act on" the app already tracks, merged
 * into one feed for the Calendar View — Invoice.dueDate, Quotation.validUntil,
 * KarigarJob.expectedDate, Store.planExpiresAt, plus free-form Reminder rows
 * for everything else. Each source is gated by the SAME permission +
 * location-scope pattern getNotifications() already established (see that
 * file's own doc comment) — this is a superset of it, not a separate rule.
 *
 * `month` is 1-12. Returns every event whose relevant date falls within
 * that calendar month (local server time), regardless of which day.
 */
export async function getCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const storeId = await getEffectiveStoreId();
  if (!storeId) return [];

  const rangeStart = new Date(year, month - 1, 1);
  const rangeEnd = new Date(year, month, 1);
  const now = new Date();

  const [canViewBilling, canViewQuotations, canViewKarigars, currentUser, scope] = await Promise.all([
    hasPermission(PERMISSIONS.BILLING_VIEW),
    hasPermission(PERMISSIONS.QUOTATION_VIEW),
    hasPermission(PERMISSIONS.KARIGAR_VIEW),
    getCurrentUser(),
    getLocationScope(),
  ]);

  // Plan/subscription info is billing information for the store — same
  // "owner only" gate as getOwnStorePlan() in store-plan-actions.ts.
  const isOwner = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_ADMIN;

  const events: CalendarEvent[] = [];

  if (canViewBilling) {
    const dueInvoices = await prisma.invoice.findMany({
      where: {
        storeId,
        dueDate: { gte: rangeStart, lt: rangeEnd },
        balanceAmount: { gt: 0 },
        status: { not: InvoiceStatus.CANCELLED },
        ...locationWhere(scope),
      },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        balanceAmount: true,
        customer: { select: { name: true } },
      },
    });

    for (const invoice of dueInvoices) {
      events.push({
        id: `invoice-${invoice.id}`,
        type: "INVOICE_DUE",
        date: invoice.dueDate!.toISOString(),
        title: `${invoice.invoiceNumber} due`,
        description: `${invoice.customer?.name ?? "Walk-in customer"} — ₹${Number(invoice.balanceAmount).toLocaleString("en-IN")} outstanding`,
        href: `/billing/${invoice.id}`,
        isOverdue: invoice.dueDate! < now,
        isReminder: false,
      });
    }
  }

  if (canViewQuotations) {
    const expiringQuotations = await prisma.quotation.findMany({
      where: {
        storeId,
        validUntil: { gte: rangeStart, lt: rangeEnd },
        convertedToId: null,
        ...locationWhere(scope),
      },
      select: {
        id: true,
        quotationNumber: true,
        validUntil: true,
        customer: { select: { name: true } },
      },
    });

    for (const quotation of expiringQuotations) {
      events.push({
        id: `quotation-${quotation.id}`,
        type: "QUOTATION_EXPIRY",
        date: quotation.validUntil!.toISOString(),
        title: `${quotation.quotationNumber} expires`,
        description: quotation.customer?.name ?? "Walk-in customer",
        href: `/quotations/${quotation.id}`,
        isOverdue: quotation.validUntil! < now,
        isReminder: false,
      });
    }
  }

  if (canViewKarigars) {
    const expectedJobs = await prisma.karigarJob.findMany({
      where: {
        storeId,
        expectedDate: { gte: rangeStart, lt: rangeEnd },
        receivedDate: null,
        ...locationWhere(scope),
      },
      select: {
        id: true,
        jobNumber: true,
        expectedDate: true,
        karigar: { select: { name: true } },
      },
    });

    for (const job of expectedJobs) {
      events.push({
        id: `karigar-job-${job.id}`,
        type: "KARIGAR_RETURN",
        date: job.expectedDate!.toISOString(),
        title: job.jobNumber ? `Job ${job.jobNumber} expected back` : "Karigar item expected back",
        description: job.karigar.name,
        href: `/karigars`,
        isOverdue: job.expectedDate! < now,
        isReminder: false,
      });
    }
  }

  if (isOwner) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { planExpiresAt: true, plan: { select: { name: true } } },
    });

    if (store?.planExpiresAt && store.planExpiresAt >= rangeStart && store.planExpiresAt < rangeEnd) {
      events.push({
        id: `plan-renewal-${storeId}`,
        type: "PLAN_RENEWAL",
        date: store.planExpiresAt.toISOString(),
        title: `${store.plan?.name ?? "Plan"} renewal due`,
        description: "Subscription renewal",
        href: "/my-plan",
        isOverdue: store.planExpiresAt < now,
        isReminder: false,
      });
    }
  }

  const reminders = await prisma.reminder.findMany({
    where: {
      storeId,
      dueDate: { gte: rangeStart, lt: rangeEnd },
      ...locationWhere(scope),
    },
  });

  for (const reminder of reminders) {
    events.push({
      id: `reminder-${reminder.id}`,
      type: "REMINDER",
      date: reminder.dueDate.toISOString(),
      title: reminder.title,
      description: reminder.notes ?? "",
      href: null,
      isOverdue: !reminder.isDone && reminder.dueDate < now,
      isDone: reminder.isDone,
      isReminder: true,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createReminder(
  prevState: ReminderFormState = initialState,
  formData: FormData,
): Promise<ReminderFormState> {
  try {
    const actor = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    const storeId = await requireStoreScope();

    const title = String(formData.get("title") || "").trim();
    if (!title) return { success: false, message: "Title is required" };

    const dueDateRaw = String(formData.get("dueDate") || "");
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      return { success: false, message: "Enter a valid date" };
    }

    const notes = String(formData.get("notes") || "").trim() || null;

    const scope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(
      storeId,
      String(formData.get("locationId") || "") || null,
      scope,
    );
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }

    await prisma.reminder.create({
      data: {
        storeId,
        title,
        notes,
        dueDate,
        locationId: locationResolution.locationId ?? undefined,
        createdById: actor.id ?? null,
        createdByName: actor.name ?? actor.email ?? null,
      },
    });

    revalidatePath("/calendar");
    return { success: true, message: "Reminder added" };
  } catch (error) {
    console.error("createReminder error:", error);
    return { success: false, message: "Failed to add reminder" };
  }
}

export async function toggleReminderDone(id: string, isDone: boolean): Promise<ReminderFormState> {
  try {
    await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    const storeId = await requireStoreScope();

    await prisma.reminder.updateMany({
      where: { id, storeId },
      data: { isDone },
    });

    revalidatePath("/calendar");
    return { success: true, message: "" };
  } catch (error) {
    console.error("toggleReminderDone error:", error);
    return { success: false, message: "Failed to update reminder" };
  }
}

export async function deleteReminder(id: string): Promise<ReminderFormState> {
  try {
    await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    const storeId = await requireStoreScope();

    await prisma.reminder.deleteMany({ where: { id, storeId } });

    revalidatePath("/calendar");
    return { success: true, message: "Reminder deleted" };
  } catch (error) {
    console.error("deleteReminder error:", error);
    return { success: false, message: "Failed to delete reminder" };
  }
}
