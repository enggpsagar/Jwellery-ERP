import { NextResponse } from "next/server"

import { getProducts } from "@/lib/actions/inventory/product-actions"

export async function GET() {
  try {
    const { products } = await getProducts({ pageSize: Number.MAX_SAFE_INTEGER })
    return NextResponse.json({ products })
  } catch (error) {
    console.error("GET /api/inventory/products error:", error)
    return NextResponse.json(
      { message: "Failed to load products" },
      { status: 500 }
    )
  }
}