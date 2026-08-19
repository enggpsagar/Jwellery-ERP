// app/api/cron/metal-rates/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    // Protect cron endpoint
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    if (!process.env.GOLD_API_KEY) {
      return NextResponse.json(
        {
          error: "GOLD_API_KEY missing",
        },
        {
          status: 500,
        }
      );
    }

    console.log("Cron started:", new Date().toISOString());

    const response = await fetch("https://www.goldapi.io/api/XAU/INR", {
      headers: {
        "x-access-token": process.env.GOLD_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    console.log("Gold API Status:", response.status);
    console.log("Gold API Response:", data);

    if (!response.ok) {
      console.error("Gold API Error:", data);

      return NextResponse.json(
        {
          error: "Gold API failed",
          details: data,
        },
        {
          status: response.status,
        }
      );
    }

    // GoldAPI returns price per ounce
    const gold24kPerGram = Number(data.price) / 31.1035;
    const gold22kPerGram = gold24kPerGram * (22 / 24);
    const gold18kPerGram = gold24kPerGram * (18 / 24);

    // Temporary silver value
    const silverPerGram = 120;

    const payload = {
      gold24k: Number(gold24kPerGram.toFixed(2)),
      gold22k: Number(gold22kPerGram.toFixed(2)),
      gold18k: Number(gold18kPerGram.toFixed(2)),
      silver: Number(silverPerGram.toFixed(2)),
      unit: "GRAM",
    };

    console.log("Saving Metal Rate:", payload);

    // Gold/silver rates are a shared market price, but MetalRate is scoped
    // per store — broadcast this fetch to every active store's own row.
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const savedRates = await prisma.$transaction(
      stores.map((store) =>
        prisma.metalRate.create({
          data: { ...payload, storeId: store.id },
        })
      )
    );

    console.log("Saved Successfully:", savedRates);

    return NextResponse.json({
      success: true,
      message: "Metal rates updated successfully",
      data: savedRates,
    });
  } catch (error: any) {
    console.error("Metal rate cron error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
        stack:
          process.env.NODE_ENV !== "production"
            ? error?.stack
            : undefined,
      },
      {
        status: 500,
      }
    );
  }
}