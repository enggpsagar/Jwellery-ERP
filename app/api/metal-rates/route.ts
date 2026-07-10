import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const current = await prisma.metalRate.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!current) {
      return NextResponse.json(
        {
          error: "No metal rates found",
        },
        {
          status: 404,
        },
      );
    }

    const previous = await prisma.metalRate.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      skip: 1,
    });

    return NextResponse.json({
      current: {
        gold24k: Number(current.gold24k),
        gold22k: Number(current.gold22k),
        gold18k: Number(current.gold18k),
        silver: Number(current.silver),
      },

      previous: previous
        ? {
            gold24k: Number(previous.gold24k),
            gold22k: Number(previous.gold22k),
            gold18k: Number(previous.gold18k),
            silver: Number(previous.silver),
          }
        : null,
    });
  } catch (error) {
    console.error("Metal rate API error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch metal rates",
      },
      {
        status: 500,
      },
    );
  }
}