import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEffectiveStoreId } from "@/lib/store-context";

export async function GET() {
  try {
    // /api is outside middleware's matcher, so this route must check the
    // session itself — it used to return the latest rates of any store.
    const storeId = await getEffectiveStoreId();
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get latest 10 records
    const latestRates = await prisma.metalRate.findMany({
      where: { storeId },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    // Show oldest → newest in chart
    const rates = latestRates.reverse();

    return NextResponse.json(
      rates.map((rate) => ({
        id: rate.id,
        date: rate.createdAt,
        gold24k: Number(rate.gold24k),
        gold22k: Number(rate.gold22k),
        gold18k: Number(rate.gold18k),
        silver: rate.silver != null ? Number(rate.silver) : null,
        unit: rate.unit,
      }))
    );
  } catch (error) {
    logger.error("History API Error", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch metal rate history",
      },
      {
        status: 500,
      }
    );
  }
}