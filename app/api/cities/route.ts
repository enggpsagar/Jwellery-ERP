import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const stateId = request.nextUrl.searchParams.get("stateId")

    if (!stateId) {
      return NextResponse.json([])
    }

    const cities = await prisma.city.findMany({
      where: { stateId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        stateId: true,
      },
    })

    return NextResponse.json(cities)
  } catch (error) {
    console.error("GET /api/cities error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch cities",
      },
      { status: 500 }
    )
  }
}