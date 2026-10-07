// Server-side read of a store's Settings > Weights (lib/weight-calc.ts).
// A store that has never opened Settings has no BusinessSettings row: it
// gets the defaults, which reproduce the behaviour before these settings.
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { weightSettingsTag } from "@/lib/cache-tags";
import { getEffectiveStoreId } from "@/lib/store-context";
import { normalizeWeightSettings, weightFormatter, type WeightFormat, type WeightSettings } from "@/lib/weight-calc";

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

/**
 * Display formatter for a store's weights (lib/weight-calc.ts
 * weightFormatter) — read once per request from the cached settings. Server
 * pages, routes and exports use this; client components useWeightFormat().
 */
export const getWeightFormat = cache(async (storeId: string | null | undefined): Promise<WeightFormat> => {
  const settings = storeId ? await getCachedWeightSettings(storeId) : normalizeWeightSettings(null);
  return weightFormatter(settings);
});

/** getWeightFormat for the store the request is acting on (defaults when none). */
export async function getActiveWeightFormat(): Promise<WeightFormat> {
  return getWeightFormat(await getEffectiveStoreId());
}
