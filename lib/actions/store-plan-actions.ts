"use server";

import { revalidatePath } from "next/cache";
import { StorePlanAction, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { derivePlanStatus } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/plan-status";

export type { PlanStatus };
import { requireRole } from "@/lib/auth/auth";

export type StorePlanOverview = {
  storeId: string;
  name: string;
  code: string;
  registeredAt: Date;
  isActive: boolean;

  planName: string | null;
  planStartedAt: Date | null;
  planExpiresAt: Date | null;
  daysRemaining: number | null;
  status: PlanStatus;

  /** Most recent RENEWED row — null if never renewed. */
  lastRenewedAt: Date | null;
  /** What a renewal at today's terms would run to. */
  nextRenewalDue: Date | null;

  reminderSentAt: Date | null;
  reminderEmailEnabled: boolean;
  reminderWhatsappEnabled: boolean;

  periodsCount: number;
  totalBilled: number;
};

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * The at-a-glance summary behind the hover card.
 *
 * Assembled in one pass over the history rather than with several queries per
 * store: the stores list renders this for every row, and a per-row round trip
 * would multiply with the page size.
 */
export async function getStorePlanOverview(
  storeId: string,
): Promise<StorePlanOverview | null> {
  await requireRole(UserRole.SUPER_ADMIN);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      isActive: true,
      planId: true,
      planStartedAt: true,
      planExpiresAt: true,
      planReminderSentAt: true,
      reminderEmailEnabled: true,
      reminderWhatsappEnabled: true,
      plan: { select: { name: true } },
      planHistory: {
        orderBy: { startedAt: "desc" },
        select: { action: true, startedAt: true, price: true },
      },
    },
  });

  if (!store) return null;

  const renewals = store.planHistory.filter(
    (row) => row.action === StorePlanAction.RENEWED,
  );

  return {
    storeId: store.id,
    name: store.name,
    code: store.code,
    registeredAt: store.createdAt,
    isActive: store.isActive,

    planName: store.plan?.name ?? null,
    planStartedAt: store.planStartedAt,
    planExpiresAt: store.planExpiresAt,
    daysRemaining: store.planExpiresAt
      ? daysBetween(new Date(), store.planExpiresAt)
      : null,
    status: derivePlanStatus(store),

    lastRenewedAt: renewals[0]?.startedAt ?? null,
    // The current period's end is when the next renewal falls due — there is
    // no scheduled future renewal to read, because renewing is a manual act.
    nextRenewalDue: store.planExpiresAt,

    reminderSentAt: store.planReminderSentAt,
    reminderEmailEnabled: store.reminderEmailEnabled,
    reminderWhatsappEnabled: store.reminderWhatsappEnabled,

    periodsCount: store.planHistory.length,
    totalBilled: store.planHistory.reduce(
      (sum, row) => sum + Number(row.price),
      0,
    ),
  };
}

/** Overviews for many stores at once, for the list's hover cards. */
export async function getStorePlanOverviews(
  storeIds: string[],
): Promise<Record<string, StorePlanOverview>> {
  await requireRole(UserRole.SUPER_ADMIN);

  if (storeIds.length === 0) return {};

  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      isActive: true,
      planId: true,
      planStartedAt: true,
      planExpiresAt: true,
      planReminderSentAt: true,
      reminderEmailEnabled: true,
      reminderWhatsappEnabled: true,
      plan: { select: { name: true } },
      planHistory: {
        orderBy: { startedAt: "desc" },
        select: { action: true, startedAt: true, price: true },
      },
    },
  });

  const result: Record<string, StorePlanOverview> = {};

  for (const store of stores) {
    const renewals = store.planHistory.filter(
      (row) => row.action === StorePlanAction.RENEWED,
    );

    result[store.id] = {
      storeId: store.id,
      name: store.name,
      code: store.code,
      registeredAt: store.createdAt,
      isActive: store.isActive,
      planName: store.plan?.name ?? null,
      planStartedAt: store.planStartedAt,
      planExpiresAt: store.planExpiresAt,
      daysRemaining: store.planExpiresAt
        ? daysBetween(new Date(), store.planExpiresAt)
        : null,
      status: derivePlanStatus(store),
      lastRenewedAt: renewals[0]?.startedAt ?? null,
      nextRenewalDue: store.planExpiresAt,
      reminderSentAt: store.planReminderSentAt,
      reminderEmailEnabled: store.reminderEmailEnabled,
      reminderWhatsappEnabled: store.reminderWhatsappEnabled,
      periodsCount: store.planHistory.length,
      totalBilled: store.planHistory.reduce(
        (sum, row) => sum + Number(row.price),
        0,
      ),
    };
  }

  return result;
}

export type PlanHistoryRow = {
  id: string;
  planName: string;
  price: number;
  durationDays: number;
  startedAt: Date;
  expiresAt: Date;
  action: StorePlanAction;
  actorName: string | null;
  note: string | null;
  /** True for the period the store is on now. */
  isCurrent: boolean;
};

/** The full subscription ledger for one store, newest first. */
export async function getStorePlanHistory(
  storeId: string,
): Promise<PlanHistoryRow[]> {
  await requireRole(UserRole.SUPER_ADMIN);

  const [rows, store] = await Promise.all([
    prisma.storePlanHistory.findMany({
      where: { storeId },
      orderBy: { startedAt: "desc" },
    }),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { planStartedAt: true },
    }),
  ]);

  return rows.map((row, index) => ({
    id: row.id,
    planName: row.planName,
    price: Number(row.price),
    durationDays: row.durationDays,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    action: row.action,
    actorName: row.actorName,
    note: row.note,
    // The newest row matching the store's current period start. Compared by
    // timestamp rather than assuming index 0, so a back-dated correction
    // doesn't mislabel which period is live.
    isCurrent:
      index === 0 &&
      store?.planStartedAt?.getTime() === row.startedAt.getTime(),
  }));
}

/** Which channels this store's owner accepts renewal reminders on. */
export async function setStoreReminderChannels(
  storeId: string,
  channels: { email: boolean; whatsapp: boolean },
): Promise<{ success: boolean; message: string }> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    await prisma.store.update({
      where: { id: storeId },
      data: {
        reminderEmailEnabled: channels.email,
        reminderWhatsappEnabled: channels.whatsapp,
      },
    });

    revalidatePath(`/stores/${storeId}`);
    revalidatePath("/stores");

    return { success: true, message: "Reminder settings updated." };
  } catch (error) {
    console.error("setStoreReminderChannels error:", error);
    return { success: false, message: "Failed to update reminder settings." };
  }
}
