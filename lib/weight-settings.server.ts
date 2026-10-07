// Server-side read of a store's Settings > Weights (lib/weight-calc.ts).
// A store that has never opened Settings has no BusinessSettings row: it
// gets the defaults, which reproduce the behaviour before these settings.
import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { weightSettingsTag } from "@/lib/cache-tags";
import { normalizeWeightSettings, type WeightSettings } from "@/lib/weight-calc";

export const weightSettingsSelect = {
  netDeductStoneWeight: true,
  netDeductDmoWeight: true,
  fineWeightBasis: true,
  addWastageToFineWeight: true,
  weightDecimalsGram: true,
  weightDecimalsCarat: true,
} as const;

/** Uncached — for write paths, which must use the current settings. */
export async function loadWeightSettings(storeId: string): Promise<WeightSettings> {
  const row = await prisma.businessSettings.findUnique({ where: { storeId }, select: weightSettingsSelect });
  return normalizeWeightSettings(row);
}

/**
 * Cached per store for the dashboard layout (it renders on every page);
 * saveWeightSettings calls updateTag(weightSettingsTag(storeId)).
 */
export function getCachedWeightSettings(storeId: string): Promise<WeightSettings> {
  return unstable_cache(() => loadWeightSettings(storeId), ["weight-settings", storeId], {
    tags: [weightSettingsTag(storeId)],
    revalidate: 300,
  })();
}
