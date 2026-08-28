"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermissionInStore } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope } from "@/lib/store-context";

/**
 * Scanning a phone's camera into a billing screen open on another device.
 *
 * The two devices never talk directly. The laptop opens a session, the phone
 * scans tags into it through the existing /s entry point, and the laptop
 * reads what has arrived. A row in the database is the only thing they share
 * — separate serverless requests have nothing else in common.
 *
 * The phone does not need to know the session: it is found from the signed-in
 * user, so a scan is simply "whatever this person has open right now". That
 * is what keeps the phone side to a bare camera and no app.
 */

/**
 * Long enough for a counter sale with a customer at the desk, short enough
 * that a tab abandoned this morning cannot swallow a scan this afternoon.
 */
const SESSION_TTL_MS = 60 * 60 * 1000;

export type ScanSessionState = {
  sessionId: string;
  expiresAt: Date;
};

/**
 * Open a session for the signed-in user, replacing any they already had.
 *
 * One at a time, deliberately: the phone resolves a session from the user
 * alone, so two open sessions would make "which invoice does this tag join?"
 * ambiguous, and the wrong answer puts stock on someone else's bill.
 */
export async function startScanSession(): Promise<ScanSessionState> {
  const user = await requireAuth();
  const storeId = await requireStoreScope();

  await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);

  if (!user.id) throw new Error("Unauthorized");

  await prisma.scanSession.updateMany({
    where: { userId: user.id, isActive: true },
    data: { isActive: false },
  });

  const session = await prisma.scanSession.create({
    data: {
      storeId,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });

  return { sessionId: session.id, expiresAt: session.expiresAt };
}

/** Close a session. Called when the billing screen stops listening. */
export async function stopScanSession(sessionId: string): Promise<void> {
  const user = await requireAuth();
  if (!user.id) return;

  // Scoped to the caller so one person cannot close another's session.
  await prisma.scanSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: { isActive: false },
  });
}

export type ScannedItem = {
  id: string;
  stockId: string;
  scannedAt: Date;
};

export type ScanSessionPoll = {
  active: boolean;
  items: ScannedItem[];
};

/**
 * What has been scanned since the caller last asked.
 *
 * `since` is the timestamp of the newest item the caller already holds, so
 * the same scan is never handed out twice — the billing screen would
 * otherwise add a duplicate line on every poll.
 */
export async function pollScanSession(
  sessionId: string,
  since?: string,
): Promise<ScanSessionPoll> {
  const user = await requireAuth();
  if (!user.id) return { active: false, items: [] };

  const session = await prisma.scanSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { isActive: true, expiresAt: true },
  });

  if (!session || !session.isActive || session.expiresAt <= new Date()) {
    return { active: false, items: [] };
  }

  const items = await prisma.scanSessionItem.findMany({
    where: {
      sessionId,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, stockId: true, createdAt: true },
  });

  return {
    active: true,
    items: items.map((item) => ({
      id: item.id,
      stockId: item.stockId,
      scannedAt: item.createdAt,
    })),
  };
}

export type ScanIntoSessionResult =
  | { added: true; stockCode: string; total: number }
  | { added: false; reason: "no-session" | "wrong-store" | "not-sellable" };

/**
 * Record a scanned tag against whatever session the user has open.
 *
 * Called from the /s entry point before it falls through to the single-piece
 * quick sale, so one printed tag serves both flows and nothing had to be
 * reprinted for this feature.
 */
export async function addScanToOpenSession(
  userId: string,
  stockId: string,
  stockStoreId: string,
): Promise<ScanIntoSessionResult> {
  const session = await prisma.scanSession.findFirst({
    where: { userId, isActive: true, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, storeId: true },
  });

  if (!session) return { added: false, reason: "no-session" };

  // A session belongs to one shop. A tag from another is not a mistake worth
  // guessing about — it goes to the normal single-piece flow instead.
  if (session.storeId !== stockStoreId) {
    return { added: false, reason: "wrong-store" };
  }

  const stock = await prisma.inventoryStock.findFirst({
    where: { id: stockId, storeId: stockStoreId },
    select: { stockCode: true, status: true, isActive: true, quantity: true },
  });

  if (
    !stock ||
    !stock.isActive ||
    stock.status !== InventoryStockStatus.IN_STOCK ||
    stock.quantity <= 0
  ) {
    return { added: false, reason: "not-sellable" };
  }

  // Duplicates are allowed on purpose: scanning the same tag twice is how a
  // second identical piece gets billed, and refusing it would be wrong more
  // often than right.
  await prisma.scanSessionItem.create({
    data: { sessionId: session.id, stockId },
  });

  const total = await prisma.scanSessionItem.count({
    where: { sessionId: session.id },
  });

  return { added: true, stockCode: stock.stockCode, total };
}

export type OpenSessionSummary = {
  sessionId: string;
  storeName: string;
  items: { stockCode: string; productName: string; scannedAt: Date }[];
};

/** What the phone shows after a scan: confirmation, and the running list. */
export async function getOpenSessionSummary(): Promise<OpenSessionSummary | null> {
  const user = await requireAuth();
  if (!user.id) return null;

  const session = await prisma.scanSession.findFirst({
    where: { userId: user.id, isActive: true, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      store: { select: { name: true } },
      items: { orderBy: { createdAt: "desc" }, select: { stockId: true, createdAt: true } },
    },
  });

  if (!session) return null;

  const stockIds = [...new Set(session.items.map((item) => item.stockId))];

  const stock = await prisma.inventoryStock.findMany({
    where: { id: { in: stockIds } },
    select: { id: true, stockCode: true, product: { select: { name: true } } },
  });

  const byId = new Map(stock.map((row) => [row.id, row]));

  return {
    sessionId: session.id,
    storeName: session.store.name,
    items: session.items.map((item) => ({
      stockCode: byId.get(item.stockId)?.stockCode ?? "Unknown",
      productName: byId.get(item.stockId)?.product?.name ?? "Unknown item",
      scannedAt: item.createdAt,
    })),
  };
}
