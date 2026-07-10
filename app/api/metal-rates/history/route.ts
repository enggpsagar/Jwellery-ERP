import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get latest 10 records
    const latestRates = await prisma.metalRate.findMany({
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
        silver: Number(rate.silver),
        unit: rate.unit,
      }))
    );
  } catch (error) {
    console.error("History API Error:", error);

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