// FILE PATH: app/(dashboard)/karigars/page.tsx
// REPLACES the existing file at this path
import type { Metadata } from "next"

import { getKarigars } from "@/lib/actions/karigar-actions"
import { KarigarsClient } from "@/components/karigars/karigars-client"
import { getStoreMetals } from "@/lib/actions/taxonomy-actions"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"

export const metadata: Metadata = {
  title: "Karigars",
}

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

  const metals = await getStoreMetals()
  const validMetalTypeIds = new Set([...metals.map((m) => m.id), UNASSIGNED_METAL_TYPE])
  const metalTypeId = params.type && validMetalTypeIds.has(params.type) ? params.type : undefined

  const { karigars, pagination } = await getKarigars({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalTypeId,
  })

  return <KarigarsClient karigars={karigars} pagination={pagination} metals={metals} />
}