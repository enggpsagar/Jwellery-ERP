import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    key: process.env.GOLD_API_KEY
      ? "API KEY EXISTS"
      : "MISSING",
  })
}