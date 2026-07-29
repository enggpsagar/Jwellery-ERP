"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

import { DeleteKarigarButton } from "@/components/karigars/delete-karigar-button"

type KarigarRowActionsProps = {
  karigarId: string
  karigarName: string
}

export function KarigarRowActions({
  karigarId,
  karigarName,
}: KarigarRowActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/karigars/${karigarId}`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
        title="View karigar"
      >
        <Eye className="h-4 w-4" />
      </Link>

      <Link
        href={`/karigars/${karigarId}/edit`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
        title="Edit karigar"
      >
        <Pencil className="h-4 w-4" />
      </Link>

      <DeleteKarigarButton karigarId={karigarId} karigarName={karigarName} />
    </div>
  )
}
