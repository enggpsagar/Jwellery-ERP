"use server";

// Settings > Weights (lib/weight-calc.ts is the calculator). Store Owner
// only — judged by the role in the ACTIVE store — and every read / write is
// scoped to that one store (requireStoreScope): changing one store's weight
// rules, or recalculating its records, never touches any other store. The
// recalculation only ever starts from an explicit, confirmed save here —
// nothing runs it on deploy or for another store.

import { revalidatePath, updateTag } from "next/cache";
import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getEffectiveAccess } from "@/lib/store-context";
import { getCurrentUser } from "@/lib/auth/auth";
import { actionErrorMessage } from "@/lib/action-error";
import { logger } from "@/lib/logger";
import { weightSettingsTag } from "@/lib/cache-tags";
import { loadWeightSettings } from "@/lib/weight-settings.server";
import { normalizeWeightSettings, sameWeightSettings, type WeightSettings } from "@/lib/weight-calc";
import {
  countRecalcScope,
  fineRulesChanged,
  netRulesChanged,
  newRecalcJob,
  readRecalcJob,
  readRecalcLog,
  runRecalcBatch,
  scopeTotal,
  type RecalcScope,
  type WeightRecalcJob,
  type WeightRecalcLogEntry,
} from "@/lib/weight-recalc.server";

async function requireStoreOwner() {
  const access = await getEffectiveAccess();
  if (!access || (access.role !== UserRole.ADMIN && access.role !== UserRole.SUPER_ADMIN)) {
    throw new Error("Only the Store Owner can change weight settings.");
  }
  return requireStoreScope();
}

async function ensureSettingsRow(storeId: string) {
  const exists = await prisma.businessSettings.findUnique({ where: { storeId }, select: { storeId: true } });
  if (exists) return;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, city: true, state: true } });
  await prisma.businessSettings.create({
    data: { storeId, businessName: store?.name?.trim() || "My Store", city: store?.city ?? null, state: store?.state ?? null },
  });
}

export type WeightSettingsPageData = {
  settings: WeightSettings;
  job: WeightRecalcJob | null;
  log: WeightRecalcLogEntry[];
};

export async function getWeightSettingsPage(): Promise<WeightSettingsPageData> {
  const storeId = await requireStoreOwner();
  const row = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { weightRecalcJob: true, weightRecalcLog: true },
  });
  return {
    settings: await loadWeightSettings(storeId),
    job: readRecalcJob(row?.weightRecalcJob ?? null),
    log: readRecalcLog(row?.weightRecalcLog ?? null),
  };
}

export type WeightSettingsPreview =
  | { ok: false; message: string }
  | {
      ok: true;
      unchanged: boolean;
      needsRecalc: boolean;
      netChanges: boolean;
      scope: RecalcScope | null;
      total: number;
    };

/** Dry run: what saving these settings would recalculate (counts only). */
export async function previewWeightSettings(input: Partial<WeightSettings>): Promise<WeightSettingsPreview> {
  try {
    const storeId = await requireStoreOwner();
    const from = await loadWeightSettings(storeId);
    const to = normalizeWeightSettings(input);
    if (sameWeightSettings(from, to)) {
      return { ok: true, unchanged: true, needsRecalc: false, netChanges: false, scope: null, total: 0 };
    }
    if (!fineRulesChanged(from, to)) {
      return { ok: true, unchanged: false, needsRecalc: false, netChanges: false, scope: null, total: 0 };
    }
    const scope = await countRecalcScope(storeId, from, to);
    return { ok: true, unchanged: false, needsRecalc: true, netChanges: netRulesChanged(from, to), scope, total: scopeTotal(scope) };
  } catch (error) {
    logger.error("previewWeightSettings error", error);
    return { ok: false, message: actionErrorMessage(error, "Couldn't work out what would change") };
  }
}

export type SaveWeightSettingsResult =
  | { ok: false; message: string }
  | { ok: true; message: string; job: WeightRecalcJob | null };

/**
 * Saves the settings. When they change how existing records' net / fine
 * weights work out, `recalculate` must be true (the confirmed dry run) and a
 * recalculation job for THIS store starts in the same transaction; the
 * client then drives it with continueWeightRecalculation.
 */
export async function saveWeightSettings(
  input: Partial<WeightSettings>,
  options: { recalculate: boolean },
): Promise<SaveWeightSettingsResult> {
  try {
    const storeId = await requireStoreOwner();
    await ensureSettingsRow(storeId);
    const from = await loadWeightSettings(storeId);
    const to = normalizeWeightSettings(input);
    const user = await getCurrentUser();
    const by = user?.name ?? user?.email ?? null;

    const current = await prisma.businessSettings.findUnique({ where: { storeId }, select: { weightRecalcJob: true } });
    if (readRecalcJob(current?.weightRecalcJob ?? null)) {
      return { ok: false, message: "A recalculation is still running — let it finish (Resume) before changing these again." };
    }
    if (sameWeightSettings(from, to)) return { ok: true, message: "Nothing changed", job: null };

    const needsRecalc = fineRulesChanged(from, to);
    if (needsRecalc && !options.recalculate) {
      return { ok: false, message: "Confirm the recalculation of existing records to save these settings." };
    }
    const job = needsRecalc
      ? newRecalcJob({ from, to, startedBy: by, totals: await countRecalcScope(storeId, from, to) })
      : null;

    await prisma.$transaction(async (tx) => {
      const row = await tx.businessSettings.findUnique({ where: { storeId }, select: { weightRecalcLog: true } });
      const data: Prisma.BusinessSettingsUpdateInput = { ...to };
      if (job) {
        data.weightRecalcJob = job as unknown as Prisma.InputJsonValue;
      } else {
        // Display-only change: logged straight away.
        const entry: WeightRecalcLogEntry = {
          id: `ws_${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          by,
          from,
          to,
          changed: null,
          note: "Settings changed — no stored weight affected.",
        };
        data.weightRecalcLog = [entry, ...readRecalcLog(row?.weightRecalcLog ?? null)].slice(0, 20) as unknown as Prisma.InputJsonValue;
      }
      await tx.businessSettings.update({ where: { storeId }, data });
    });

    updateTag(weightSettingsTag(storeId));
    revalidatePath("/settings/weights");
    return { ok: true, message: job ? "Settings saved — recalculating…" : "Weight settings saved", job };
  } catch (error) {
    logger.error("saveWeightSettings error", error);
    return { ok: false, message: actionErrorMessage(error, "Failed to save weight settings") };
  }
}

export type ContinueRecalcResult =
  | { ok: false; message: string }
  | { ok: true; done: false; job: WeightRecalcJob }
  | { ok: true; done: true; entry: WeightRecalcLogEntry };

/** One batch (≤ 500 rows, one transaction) of this store's running job. */
export async function continueWeightRecalculation(jobId: string): Promise<ContinueRecalcResult> {
  try {
    const storeId = await requireStoreOwner();
    const result = await runRecalcBatch(storeId, String(jobId));
    if (result.status === "missing") return { ok: false, message: "That recalculation is no longer running." };
    if (result.status === "running") return { ok: true, done: false, job: result.job };
    revalidatePath("/settings/weights");
    revalidatePath("/inventory/stock");
    revalidatePath("/ledger");
    return { ok: true, done: true, entry: result.entry };
  } catch (error) {
    logger.error("continueWeightRecalculation error", error);
    return { ok: false, message: actionErrorMessage(error, "Recalculation batch failed — Resume to retry") };
  }
}
