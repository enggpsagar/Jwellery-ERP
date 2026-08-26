import { UserRole } from "@prisma/client"
import { CheckCircle2, Lock, ShieldCheck } from "lucide-react"

import { getCurrentUser } from "@/lib/auth/auth"
import { getEffectivePermissions, MODULE_DEFINITIONS, ROLE_LABELS } from "@/lib/roles"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const ADMIN_SECTIONS: { label: string; roles: UserRole[] }[] = [
  { label: "User Management", roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
  { label: "Store Settings", roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
  { label: "Platform / Stores Console", roles: [UserRole.SUPER_ADMIN] },
]

/**
 * Shows the signed-in user exactly what they can see/do — the same
 * module list an Admin toggles per Staff user (MODULE_DEFINITIONS), plus
 * the role-gated admin surfaces, so access is never a mystery after login.
 */
export async function AccessPermissionsCard() {
  const user = await getCurrentUser()
  if (!user) return null

  const role = user.role as UserRole
  const effectivePermissions = getEffectivePermissions({
    role,
    permissions: user.permissions,
  })

  const isCustomStaff = role === UserRole.STAFF && user.permissions && user.permissions.length > 0

  const grantedModules = MODULE_DEFINITIONS.filter((module) =>
    module.permissions.every((permission) => effectivePermissions.includes(permission)),
  )
  const lockedModules = MODULE_DEFINITIONS.filter(
    (module) => !module.permissions.every((permission) => effectivePermissions.includes(permission)),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          My Access & Permissions
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Role:</span>
          <Badge>{ROLE_LABELS[role]}</Badge>
          {isCustomStaff && (
            <span className="text-xs text-muted-foreground">(custom module access set by your Admin)</span>
          )}
        </div>

        {role === UserRole.KARIGAR ? (
          <p className="text-sm text-muted-foreground">
            As a Karigar, you only see the jobs assigned to you — not the wider store workspace.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium">Workspace Sections</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULE_DEFINITIONS.map((module) => {
                const granted = grantedModules.some((m) => m.key === module.key)
                return (
                  <div
                    key={module.key}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      granted
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-input text-muted-foreground",
                    )}
                  >
                    {granted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0" />
                    )}
                    {module.label}
                  </div>
                )
              })}
            </div>
            {lockedModules.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sections marked locked aren&apos;t enabled for your account — ask your Admin if you need access.
              </p>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Administrative Access</p>
          <div className="flex flex-wrap gap-2">
            {ADMIN_SECTIONS.map((section) => {
              const granted = section.roles.includes(role)
              return (
                <Badge
                  key={section.label}
                  variant={granted ? "default" : "outline"}
                  className={cn(!granted && "text-muted-foreground")}
                >
                  {granted ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Lock className="mr-1 h-3 w-3" />
                  )}
                  {section.label}
                </Badge>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
