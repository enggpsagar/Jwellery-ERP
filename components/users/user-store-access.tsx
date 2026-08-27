"use client"

import * as React from "react"
import { Loader2, Store as StoreIcon, Trash2 } from "lucide-react"
import { UserRole } from "@prisma/client"

import {
  removeUserStoreAccess,
  saveUserStoreAccess,
  type MembershipRow,
} from "@/lib/actions/user-membership-actions"
import { MODULE_DEFINITIONS, ROLE_LABELS, type ModuleKey } from "@/lib/roles"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.KARIGAR,
]

type UserStoreAccessProps = {
  userId: string
  rows: MembershipRow[]
}

/**
 * Which stores a person works in, and as what.
 *
 * Only rendered for a Super Admin — the server action enforces the same rule.
 * A store's own Admin manages people through the main form; letting them tick
 * other stores would let one shop write itself into another shop's data.
 *
 * Each store saves on its own rather than through one submit: these are
 * independent grants, and a failure on one should not roll back the others or
 * leave the operator guessing which took effect.
 */
export function UserStoreAccess({ userId, rows }: UserStoreAccessProps) {
  const toast = useToast()
  const [state, setState] = React.useState(rows)
  const [busyStoreId, setBusyStoreId] = React.useState<string | null>(null)

  const patch = (storeId: string, next: Partial<MembershipRow>) =>
    setState((prev) =>
      prev.map((row) => (row.storeId === storeId ? { ...row, ...next } : row)),
    )

  const save = async (row: MembershipRow) => {
    setBusyStoreId(row.storeId)

    const result = await saveUserStoreAccess({
      userId,
      storeId: row.storeId,
      role: row.role,
      isActive: row.isActive,
      moduleKeys: row.moduleKeys,
    })

    setBusyStoreId(null)

    if (result.success) {
      patch(row.storeId, { granted: true })
      toast.success(`${row.storeName}: ${result.message}`)
    } else {
      toast.error(result.message)
    }
  }

  const remove = async (row: MembershipRow) => {
    setBusyStoreId(row.storeId)
    const result = await removeUserStoreAccess(userId, row.storeId)
    setBusyStoreId(null)

    if (result.success) {
      patch(row.storeId, { granted: false, isActive: false, moduleKeys: [] })
      toast.success(`${row.storeName}: ${result.message}`)
    } else {
      toast.error(result.message)
    }
  }

  const grantedCount = state.filter((row) => row.granted && row.isActive).length

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <StoreIcon className="h-4 w-4 text-[var(--chart-2)]" />
          Store access
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {grantedCount === 0
            ? "This user cannot reach any store yet."
            : `Active in ${grantedCount} store${grantedCount === 1 ? "" : "s"}. They pick between them with the store switcher.`}
        </p>
      </CardHeader>

      <CardContent className="divide-y p-0">
        {state.map((row) => {
          const busy = busyStoreId === row.storeId

          return (
            <div key={row.storeId} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    disabled={busy}
                    onChange={(event) =>
                      patch(row.storeId, { isActive: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate font-medium">{row.storeName}</span>
                  <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    {row.storeCode}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <Select
                    value={row.role}
                    disabled={busy}
                    onValueChange={(value) =>
                      patch(row.storeId, { role: value as UserRole })
                    }
                  >
                    <SelectTrigger className="h-9 w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button size="sm" disabled={busy} onClick={() => save(row)}>
                    {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>

                  {row.granted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(row)}
                      aria-label={`Remove access to ${row.storeName}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Modules only apply to Staff — every other role's access comes
                  from its fixed bundle, so offering toggles would imply a
                  choice that isn't stored. */}
              {row.role === UserRole.STAFF && row.isActive && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 pl-7">
                  {MODULE_DEFINITIONS.map((module) => (
                    <label
                      key={module.key}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={row.moduleKeys.includes(module.key)}
                        disabled={busy}
                        onChange={(event) =>
                          patch(row.storeId, {
                            moduleKeys: event.target.checked
                              ? [...row.moduleKeys, module.key]
                              : row.moduleKeys.filter(
                                  (key: ModuleKey) => key !== module.key,
                                ),
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-input"
                      />
                      {module.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
