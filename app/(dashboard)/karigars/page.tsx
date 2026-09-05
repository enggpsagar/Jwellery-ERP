// FILE PATH: app/(dashboard)/karigars/page.tsx
// REPLACES the existing file at this path
import type { Metadata } from "next"

import { getKarigars } from "@/lib/actions/karigar-actions"
import { KarigarsClient } from "@/components/karigars/karigars-client"
import type { PurityFamily } from "@/lib/business-units"

export const metadata: Metadata = {
  title: "Karigars",
}

const VALID_METAL_FAMILIES: PurityFamily[] = [
  "GOLD",
  "SILVER",
  "PLATINUM",
  "DIAMOND",
  "STONE",
  "OTHER",
]

type KarigarsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "code" | "createdAt"
    sortOrder?: "asc" | "desc"
    type?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function KarigarsPage({ searchParams }: KarigarsPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"
  const metalFamily = VALID_METAL_FAMILIES.includes(params.type as PurityFamily)
    ? (params.type as PurityFamily)
    : undefined

  const { karigars, pagination } = await getKarigars({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalFamily,
  })

  return <KarigarsClient karigars={karigars} pagination={pagination} />
}