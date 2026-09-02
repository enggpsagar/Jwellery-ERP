"use client"

import { useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Karigar } from "@/lib/actions/karigar-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { KarigarsPagination } from "@/components/karigars/karigars-pagination"
import { DisabledKarigarRestoreButton } from "@/components/karigars/disabled-karigar-restore-button"

type DisabledKarigarsClientProps = {
  karigars: Karigar[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export function DisabledKarigarsClient({
  karigars,
  pagination,
}: DisabledKarigarsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

  function updateSearch(value: string) {
    setSearch(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set("search", value.trim())
    else params.delete("search")
    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Disabled Karigars"
        description="Karigars removed from the active list. Their job and ledger history is kept — enabling one makes it available in Karigars again."
        backHref="/karigars"
        backLabel="Back to Karigars"
      />

      <div className="max-w-sm">
        <Input
          placeholder="Search disabled karigars..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {karigars.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No disabled karigars.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Karigar Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Mobile</th>
                  <th className="px-4 py-3 font-medium">Specialization</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {karigars.map((karigar) => (
                  <tr key={karigar.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {karigar.name}
                    </td>
                    <td className="px-4 py-3 text-foreground">{karigar.code || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{karigar.mobile || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{karigar.specialization || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <DisabledKarigarRestoreButton
                        karigarId={karigar.id}
                        karigarName={karigar.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <KarigarsPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          totalPages={pagination.totalPages}
        />
      </div>
    </main>
  )
}
