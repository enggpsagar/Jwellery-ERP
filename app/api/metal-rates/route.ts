import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const latest = await prisma.metalRate.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    })

    if (!latest) {
      return NextResponse.json(
        { error: "No metal rates found" },
        { status: 404 }
      )
    }

    const previous = await prisma.metalRate.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      skip: 1,
    })

    return NextResponse.json({
      current: {
        gold22k: Number(latest.gold22k),
        gold24k: Number(latest.gold24k),
        silver: Number(latest.silver),
      },
      previous: previous
        ? {
            gold22k: Number(previous.gold22k),
            gold24k: Number(previous.gold24k),
            silver: Number(previous.silver),
          }
        : null,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      { error: "Failed to fetch rates" },
      { status: 500 }
    )
  }
}