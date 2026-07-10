"use server";

import { prisma } from "@/lib/prisma";
import { subDays, format } from "date-fns";

export interface DashboardMetalRate {
  id: string;
  gold24k: number;
  gold22k: number;
  silver: number;
  createdAt: Date;
}

export interface ChartData {
  date: string;
  gold24k: number;
  gold22k: number;
  silver: number;
}

/**
 * Returns the latest metal rate along with
 * yesterday's rate to calculate percentage changes.
 */
export async function getLatestMetalRates() {
  const latestRates = await prisma.metalRate.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 2,
  });

  const latest = latestRates[0] ?? null;
  const previous = latestRates[1] ?? null;

  return {
    latest,
    previous,
  };
}

/**
 * Returns one record per day for the last 10 days.
 * If multiple records exist on the same day,
 * the latest record of that day is used.
 */
export async function getLast10DaysRates(): Promise<ChartData[]> {
  const rates = await prisma.metalRate.findMany({
    where: {
      createdAt: {
        gte: subDays(new Date(), 10),
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const grouped = new Map<string, DashboardMetalRate>();

  for (const rate of rates) {
    const key = format(rate.createdAt, "yyyy-MM-dd");

    grouped.set(key, {
      id: rate.id,
      gold24k: Number(rate.gold24k),
      gold22k: Number(rate.gold22k),
      silver: Number(rate.silver),
      createdAt: rate.createdAt,
    });
  }

  return Array.from(grouped.values()).map((rate) => ({
    date: format(rate.createdAt, "dd MMM"),
    gold24k: Number(rate.gold24k),
    gold22k: Number(rate.gold22k),
    silver: Number(rate.silver),
  }));
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (!previous) return 0;

  return Number(
    (((current - previous) / previous) * 100).toFixed(2)
  );
}

/**
 * Dashboard summary
 */
export async function getDashboardMetalSummary() {
  const { latest, previous } = await getLatestMetalRates();

  if (!latest) {
    return null;
  }

  return {
    latest,

    changes: {
      gold24k: previous
        ? calculatePercentageChange(
            Number(latest.gold24k),
            Number(previous.gold24k)
          )
        : 0,

      gold22k: previous
        ? calculatePercentageChange(
            Number(latest.gold22k),
            Number(previous.gold22k)
          )
        : 0,

      silver: previous
        ? calculatePercentageChange(
            Number(latest.silver),
            Number(previous.silver)
          )
        : 0,
    },
  };
}