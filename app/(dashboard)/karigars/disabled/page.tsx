import { getKarigars } from "@/lib/actions/karigar-actions"
import { DisabledKarigarsClient } from "@/components/karigars/disabled-karigars-client"

type DisabledKarigarsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
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

  const { karigars, pagination } = await getKarigars({
    page,
    pageSize,
    search,
    active: false,
  })

  return <DisabledKarigarsClient karigars={karigars} pagination={pagination} />
}
