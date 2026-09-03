// FILE PATH: app/(dashboard)/karigars/page.tsx
// REPLACES the existing file at this path
import type { Metadata } from "next"

import { getKarigars } from "@/lib/actions/karigar-actions"
import { KarigarsClient } from "@/components/karigars/karigars-client"

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

  const { karigars, pagination } = await getKarigars({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
  })

  return <KarigarsClient karigars={karigars} pagination={pagination} />
}