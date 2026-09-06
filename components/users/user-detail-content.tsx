import { Hammer, Mail, ShieldCheck } from "lucide-react"

import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { StatusBadge } from "@/components/users/status-badge"
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

/**
 * The body of a user's detail view — account/role, location & module
 * access, and (when this user maps to one) the linked karigar profile.
 * Shared between the list's inline detail pane and, if a standalone view
 * is ever added, that page too.
 */
export function UserDetailContent({
  user,
  karigars,
  locations,
}: {
  user: User
  karigars: KarigarOption[]
  locations: LocationOption[]
}) {
  const karigar = user.karigarId ? karigars.find((k) => k.id === user.karigarId) : null

  const accessLocationNames = user.locationAccess?.length
    ? user.locationAccess
        .map((la) => locations.find((l) => l.id === la.locationId)?.name ?? la.locationId)
        .join(", ")
    : "All locations"

  return (
    <div className="space-y-6">
      <DetailSection
        title="Account"
        description="Contact details and role."
        icon={Mail}
        tint="var(--chart-1)"
      >
        <DetailGrid>
          <DetailField label="Name" value={user.name ? toTitleCase(user.name) : "-"} />
          <DetailField label="Email" value={user.email} />
          <DetailField label="Phone" value={user.phone} />
          <DetailField label="Role" value={ROLE_LABELS[user.role]} />
          <DetailField label="Status" value={<StatusBadge status={user.status} />} />
          <DetailField label="Account" value={user.isActive ? "Active" : "Deactivated"} />
          <DetailField
            label="Added"
            value={new Date(user.createdAt).toLocaleDateString("en-IN")}
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection
        title="Access"
        description="Which locations and permissions this user has."
        icon={ShieldCheck}
        tint="var(--chart-3)"
      >
        <DetailGrid>
          <DetailField label="Locations" span value={accessLocationNames} />
          <DetailField
            label="Permissions"
            span
            value={user.permissions?.length ? user.permissions.join(", ") : "Role default"}
          />
        </DetailGrid>
      </DetailSection>

      {karigar ? (
        <DetailSection
          title="Linked Artisan"
          description="This user account is tied to an artisan profile."
          icon={Hammer}
          tint="var(--chart-2)"
        >
          <DetailGrid>
            <DetailField label="Artisan Name" value={toTitleCase(karigar.name)} />
            <DetailField label="Mobile" value={karigar.mobile} />
            <DetailField label="Email" value={karigar.email} />
          </DetailGrid>
        </DetailSection>
      ) : null}
    </div>
  )
}
