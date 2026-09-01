"use server";

import { revalidatePath } from "next/cache";
import { StorePlanAction, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { derivePlanStatus } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/plan-status";
import { requireRole } from "@/lib/auth/auth";
import { requireStoreScope } from "@/lib/store-context";
import { resolveStoreName } from "@/lib/invite-email";
import { sendMail } from "@/lib/mailer";
import { renewalContactRequestEmail } from "@/lib/email-templates";
import { getSuperAdminEmails } from "@/lib/super-admin";
import { APP_NAME } from "@/lib/constants/app";

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
 * The store owner's own view of their plan and payments.
 *
 * Same figures the Super Admin sees for this shop, minus anything about other
 * shops: a shop should be able to check what it is paying for and when it
 * renews without asking the platform. Scoped through `requireStoreScope`, so
 * it can only ever return the store the caller is actually working in.
 */
export async function getOwnStorePlan(): Promise<{
  overview: StorePlanOverview;
  history: PlanHistoryRow[];
} | null> {
  // The owner, not every member of staff — this is billing information.
  await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

  const storeId = await requireStoreScope();

  const [overview, history] = await Promise.all([
    loadStorePlanOverview(storeId),
    loadStorePlanHistory(storeId),
  ]);

  if (!overview) return null;

  return { overview, history };
}

/**
 * The at-a-glance summary behind the hover card.
 *
 * Assembled in one pass over the history rather than with several queries per
 * store: the stores list renders this for every row, and a per-row round trip
 * would multiply with the page size.
 *
 * Carries no authorization of its own — it is not exported, and every caller
 * above decides who may see which store first.
 */
async function loadStorePlanOverview(
  storeId: string,
): Promise<StorePlanOverview | null> {
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

/** One store's summary, for the Super Admin. */
export async function getStorePlanOverview(
  storeId: string,
): Promise<StorePlanOverview | null> {
  await requireRole(UserRole.SUPER_ADMIN);
  return loadStorePlanOverview(storeId);
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

/** The ledger rows themselves; callers above authorise access to the store. */
async function loadStorePlanHistory(
  storeId: string,
): Promise<PlanHistoryRow[]> {
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

/** The full subscription ledger for one store, newest first. */
export async function getStorePlanHistory(
  storeId: string,
): Promise<PlanHistoryRow[]> {
  await requireRole(UserRole.SUPER_ADMIN);
  return loadStorePlanHistory(storeId);
}

/**
 * Sends the "Contact us about renewal" popup's message to the Super
 * Admin(s), same SUPER_ADMIN_EMAILS recipient list as a new store
 * registration notice.
 *
 * Same store-owner gate as `getOwnStorePlan` — this is the action behind
 * that page's own contact button, not a general-purpose contact form.
 */
export async function sendRenewalContactRequestAction(
  message: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    const storeId = await requireStoreScope();

    const trimmed = message.trim();
    if (!trimmed) {
      return { success: false, message: "Please enter a message before sending." };
    }

    const recipients = getSuperAdminEmails();
    if (recipients.length === 0) {
      console.warn(
        "Renewal contact request submitted but SUPER_ADMIN_EMAILS is empty — no notification sent.",
      );
      return {
        success: false,
        message: "Renewal contact isn't set up yet. Please try another way to reach us.",
      };
    }

    const [storeName, store] = await Promise.all([
      resolveStoreName(storeId),
      prisma.store.findUnique({ where: { id: storeId }, select: { code: true } }),
    ]);

    const mail = renewalContactRequestEmail({
      storeName,
      storeCode: store?.code ?? "",
      senderName: user.name || "Store owner",
      senderEmail: user.email ?? null,
      message: trimmed,
      appName: APP_NAME,
    });

    const results = await Promise.all(
      recipients.map((to) =>
        sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text }),
      ),
    );

    if (!results.some((result) => result.sent)) {
      return {
        success: false,
        message: "Could not send your message right now. Please try again shortly.",
      };
    }

    return {
      success: true,
      message: "Your message has been sent. We'll get back to you shortly.",
    };
  } catch (error) {
    console.error("sendRenewalContactRequestAction error:", error);
    return { success: false, message: "Failed to send your message. Please try again." };
  }
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
