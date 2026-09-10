import { Check, Hammer, Mail, ShieldCheck, X } from "lucide-react"

import {
  DetailField,
  DetailGrid,
  DetailSection,
} from "@/components/shared/detail-section"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/users/status-badge"
import { ROLE_LABELS, ROLE_BADGE_CLASSES, MODULE_DEFINITIONS } from "@/lib/roles"
import { toTitleCase, formatShortDate, cn } from "@/lib/utils"

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

  return (
    <div className="space-y-6">
      <DetailSection
        title="Account"
        description="Contact details and role."
        icon={Mail}
        tint="var(--chart-1)"
      >
        <DetailGrid>
          <DetailField label="Email" value={user.email} />
          <DetailField label="Phone" value={user.phone} />
          <DetailField
            label="Role"
            value={
              <Badge className={ROLE_BADGE_CLASSES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
            }
          />
          <DetailField label="Status" value={<StatusBadge status={user.status} />} />
          <DetailField
            label="Added"
            value={formatShortDate(user.createdAt)}
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
          <DetailField
            label="Locations"
            span
            value={<LocationAccessChecklist locationAccess={user.locationAccess} locations={locations} />}
          />
          <DetailField
            label="Permissions"
            span
            value={
              user.role === "STAFF" ? (
                <ModuleAccessChecklist permissions={user.permissions} />
              ) : (
                "Full access (role-based)"
              )
            }
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

/** Read-only counterpart to the checkbox grid on the Add/Edit User form's
 * own "Module Access" section — a module reads as granted the same way
 * hasModuleAccess() decides it (an empty permissions array means "not
 * customized," i.e. every module is granted). */
function ModuleAccessChecklist({ permissions }: { permissions?: string[] | null }) {
  const isFullAccess = !permissions?.length

  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2 md:grid-cols-3">
      {MODULE_DEFINITIONS.map((module) => {
        const granted =
          isFullAccess || module.permissions.every((permission) => permissions!.includes(permission))

        return (
          <div key={module.key} className="flex items-center gap-2 text-sm">
            {granted ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(!granted && "text-muted-foreground")}>{module.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Read-only counterpart to the Add/Edit User form's own "Location Access"
 * checkbox grid — a location reads as granted the same way the form (and
 * BranchScopeService) treat an empty locationAccess list: every location. */
function LocationAccessChecklist({
  locationAccess,
  locations,
}: {
  locationAccess?: { locationId: string }[] | null
  locations: LocationOption[]
}) {
  if (locations.length === 0) {
    return <p className="text-sm text-muted-foreground">No locations configured yet.</p>
  }

  const isAllLocations = !locationAccess?.length
  const grantedIds = new Set(locationAccess?.map((la) => la.locationId))

  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2 md:grid-cols-3">
      {locations.map((location) => {
        const granted = isAllLocations || grantedIds.has(location.id)

        return (
          <div key={location.id} className="flex items-center gap-2 text-sm">
            {granted ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(!granted && "text-muted-foreground")}>{location.name}</span>
          </div>
        )
      })}
    </div>
  )
}
