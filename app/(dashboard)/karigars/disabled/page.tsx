import type { Metadata } from "next"

import { getKarigars } from "@/lib/actions/karigar-actions"
import { DisabledKarigarsClient } from "@/components/karigars/disabled-karigars-client"

export const metadata: Metadata = {
  title: "Disabled Artisans",
}

type DisabledKarigarsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "code" | "createdAt"
    sortOrder?: "asc" | "desc"
  }>
}

export const dynamic = "force-dynamic"

export default async function DisabledKarigarsPage({
  searchParams,
}: DisabledKarigarsPageProps) {
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
    active: false,
  })

  return <DisabledKarigarsClient karigars={karigars} pagination={pagination} />
}
