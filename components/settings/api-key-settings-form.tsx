"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { Ban, Plus } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import {
  createApiKey,
  revokeApiKey,
  type ApiKeyFormState,
  type ApiKeySummary,
} from "@/lib/actions/api-key-actions"
import { PERMISSIONS } from "@/lib/permissions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RevealOnceSecretDialog } from "@/components/shared/reveal-once-secret-dialog"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: ApiKeyFormState = { success: false, message: "" }

const ALL_PERMISSIONS = Object.values(PERMISSIONS)

/** "customer.create" -> "Customer · Create" — readable without a hand-kept
 * label per permission, which would drift the moment a new one is added. */
function permissionLabel(permission: string) {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ")
}

function formatDate(value: string | null) {
  if (!value) return "Never"
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ApiKeySettingsForm({
  keys,
  canEdit,
}: {
  keys: ApiKeySummary[]
  canEdit: boolean
}) {
  const toast = useToast()

  const [state, formAction, pending] = useActionState(createApiKey, initialState)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [revealOpen, setRevealOpen] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    if (state.success && state.rawKey) {
      setRevealOpen(true)
      setSelectedPermissions([])
    } else if (!state.success && state.message && !state.errors) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const togglePermission = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission],
    )
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    const result = await revokeApiKey(id)
    setRevokingId(null)

    if (result.success) toast.success(result.message)
    else toast.error(result.message)
  }

  const grouped = useMemo(() => {
    const byModule = new Map<string, string[]>()
    for (const permission of ALL_PERMISSIONS) {
      const [module] = permission.split(".")
      byModule.set(module, [...(byModule.get(module) ?? []), permission])
    }
    return Array.from(byModule.entries())
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit} className="space-y-4">
            {!canEdit && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                Only Admins can create or revoke API keys.
              </p>
            )}

            <form
              onSubmit={(event) => {
                // Deliberately not `action={formAction}` directly on the form:
                // React resets a form's uncontrolled fields once an action-bound
                // submission settles, regardless of whether the action's own
                // returned state says success or failure — so a plain validation
                // error wiped every other field the user had already typed.
                // Calling the same dispatcher by hand from a prevented submit
                // sidesteps that auto-reset while keeping identical pending/error-
                // state behavior.
                event.preventDefault()
                formAction(new FormData(event.currentTarget))
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label htmlFor="name">Name <RequiredMark /></Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g. Claude MCP integration"
                  required
                />
                {state.errors?.name && (
                  <p className="text-sm text-destructive">{state.errors.name[0]}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>
                  Permissions <RequiredMark />{" "}
                  <span className="font-normal text-muted-foreground">
                    — nothing is selected by default; grant only what this key
                    actually needs
                  </span>
                </Label>
                {state.errors?.permissions && (
                  <p className="text-sm text-destructive">
                    {state.errors.permissions[0]}
                  </p>
                )}

                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.map(([module, permissions]) => (
                    <div key={module} className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {module}
                      </p>
                      {permissions.map((permission) => (
                        <label
                          key={permission}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="permissions"
                            value={permission}
                            checked={selectedPermissions.includes(permission)}
                            onChange={() => togglePermission(permission)}
                          />
                          {permissionLabel(permission)}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <Loader className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Plus className="mr-1.5 h-4 w-4" />
                  )}
                  {pending ? "Creating..." : "Create key"}
                </Button>
              </div>
            </form>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Key</th>
                  <th className="px-4 py-3 text-left font-medium">Permissions</th>
                  <th className="px-4 py-3 text-left font-medium">Last used</th>
                  <th className="px-4 py-3 text-left font-medium">Created by</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium" />
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      No API keys yet.
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
                    <tr key={key.id} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3 font-medium">{key.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{key.prefix}••••</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {key.permissions.map((permission) => (
                            <span
                              key={permission}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs"
                            >
                              {permissionLabel(permission)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {key.createdByName ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {key.isRevoked ? (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && !key.isRevoked && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={revokingId === key.id}
                            onClick={() => handleRevoke(key.id)}
                          >
                            {revokingId === key.id ? (
                              <Loader className="mr-1 h-3.5 w-3.5" />
                            ) : (
                              <Ban className="mr-1 h-3.5 w-3.5" />
                            )}
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <RevealOnceSecretDialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        title="API key created"
        secret={state.rawKey ?? ""}
      />
    </div>
  )
}
