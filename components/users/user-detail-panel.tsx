"use client"

import { Users } from "lucide-react"

import { UserDetailContent } from "@/components/users/user-detail-content"
import { UserRowActions } from "@/components/users/user-row-actions"
import { ROLE_LABELS } from "@/lib/roles"
import { toTitleCase } from "@/lib/utils"

import type { UserRole, UserStatus } from "@prisma/client"

type User = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: UserRole
  status: UserStatus
  isActive: boolean
  createdAt: Date
  karigarId?: string | null
  permissions?: string[] | null
  locationAccess?: { locationId: string }[] | null
}

type KarigarOption = {
  id: string
  name: string
  mobile: string | null
  email: string | null
}

type LocationOption = {
  id: string
  name: string
}

type UserDetailPanelProps = {
  user: User | null
  karigars: KarigarOption[]
  locations: LocationOption[]
}

/**
 * The right-hand pane of the Users master-detail layout. Unlike Customers/
 * Vendors/Karigars, no extra fetch is needed — the list query already
 * carries everything this view shows, so the parent just hands over the
 * already-loaded row for whichever user is active.
 */
export function UserDetailPanel({ user, karigars, locations }: UserDetailPanelProps) {
  if (!user) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Users className="h-8 w-8" />
        <p className="text-sm">Select a user to view their details.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{user.name ? toTitleCase(user.name) : "Unnamed user"}</h2>
          <p className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</p>
        </div>
        <UserRowActions user={user} />
      </div>

      <UserDetailContent user={user} karigars={karigars} locations={locations} />
    </div>
  )
}
