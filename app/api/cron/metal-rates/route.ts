// app/api/cron/metal-rates/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

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


    const response = await fetch(
      "https://www.goldapi.io/api/XAU/INR",
      {
        headers: {
          "x-access-token": process.env.GOLD_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );


    const data = await response.json();


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


    /**
     * GoldAPI returns 24K price per ounce
     * Convert ounce to gram
     */
    const gold24kPerGram =
      Number(data.price) / 31.1035;


    const gold22kPerGram =
      gold24kPerGram * (22 / 24);


    /**
     * Temporary silver value
     * Replace with silver API later
     */
    const silverPerGram = 120;


    const savedRate = await prisma.metalRate.create({
      data: {
        gold22k: Number(
          gold22kPerGram.toFixed(2)
        ),

        gold24k: Number(
          gold24kPerGram.toFixed(2)
        ),

        silver: Number(
          silverPerGram.toFixed(2)
        ),

        unit: "GRAM",
      },
    });


    return NextResponse.json({
      success: true,
      message: "Metal rates updated",
      data: savedRate,
    });


  } catch (error) {

    console.error(
      "Metal rate cron error:",
      error
    );


    return NextResponse.json(
      {
        success: false,
        error: "Failed to update metal rates",
      },
      {
        status: 500,
      }
    );
  }
}