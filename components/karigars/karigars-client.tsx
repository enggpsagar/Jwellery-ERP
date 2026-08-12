// FILE PATH: components/karigars/karigars-client.tsx
"use client"

import * as React from "react"
import Link from "next/link"

import { KarigarTable } from "@/components/karigars/karigar-table"
import { KarigarsToolbar } from "@/components/karigars/karigars-toolbar"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import type { Karigar } from "@/lib/actions/karigar-actions"

type PaginationInfo = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type KarigarsClientProps = {
  karigars: Karigar[]
  pagination: PaginationInfo
}

export function KarigarsClient({ karigars, pagination }: KarigarsClientProps) {
  const [selectedKarigarIds, setSelectedKarigarIds] = React.useState<string[]>([])

  React.useEffect(() => {
    setSelectedKarigarIds([])
  }, [karigars])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Karigars"
        description="Manage jewellery artisans and their job records."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/karigars/new">
            <Button>Add Karigar</Button>
          </Link>
        }
      />

      <KarigarsToolbar selectedKarigarIds={selectedKarigarIds} />

      <KarigarTable
        karigars={karigars}
        pagination={pagination}
        selectedKarigarIds={selectedKarigarIds}
        onSelectionChange={setSelectedKarigarIds}
      />
    </main>
  )
}