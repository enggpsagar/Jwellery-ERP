"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole } from "@prisma/client"

import {
  createUserAction,
  updateUserAction,
} from "@/app/(dashboard)/users/actions"

import { ROLE_LABELS, MODULE_DEFINITIONS, type ModuleKey } from "@/lib/roles"

import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type UserFormDialogUser = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  role: UserRole
  isActive: boolean
  karigarId?: string | null
  permissions?: string[] | null
}

type KarigarOption = {
  id: string
  name: string
}

type UserFormDialogProps = {
  mode: "create" | "edit"
  user?: UserFormDialogUser
  children?: React.ReactNode
  karigars?: KarigarOption[]
  allowSuperAdmin?: boolean
}

const ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.KARIGAR,
]

export function UserFormDialog({
  mode,
  user,
  children,
  karigars = [],
  allowSuperAdmin = false,
}: UserFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [role, setRole] = useState<UserRole>(user?.role ?? UserRole.STAFF)
  const [karigarId, setKarigarId] = useState(user?.karigarId ?? "")

  // A module is "on" if every one of its permissions is present on the user.
  // A brand-new Staff user defaults to every module enabled (matches the
  // full-access behavior before per-user module toggles existed).
  const [selectedModules, setSelectedModules] = useState<Set<ModuleKey>>(() => {
    const existing = user?.permissions
    if (!existing || existing.length === 0) {
      return new Set(MODULE_DEFINITIONS.map((module) => module.key))
    }

    return new Set(
      MODULE_DEFINITIONS.filter((module) =>
        module.permissions.every((permission) => existing.includes(permission)),
      ).map((module) => module.key),
    )
  })

  const toggleModule = (key: ModuleKey, checked: boolean) => {
    setSelectedModules((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const router = useRouter()
  const toast = useToast()

  const roleOptions = allowSuperAdmin
    ? [UserRole.SUPER_ADMIN, ...ASSIGNABLE_ROLES]
    : ASSIGNABLE_ROLES

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    if (mode === "edit" && user) {
      formData.set("id", user.id)
    }

    if (role === UserRole.KARIGAR) {
      formData.set("karigarId", karigarId)
    } else {
      formData.set("karigarId", "")
    }

    if (role === UserRole.STAFF) {
      const permissions = MODULE_DEFINITIONS.filter((module) =>
        selectedModules.has(module.key),
      ).flatMap((module) => module.permissions)
      formData.set("permissions", JSON.stringify(permissions))
    } else {
      formData.set("permissions", "[]")
    }

    startTransition(async () => {
      try {
        const result =
          mode === "create"
            ? await createUserAction(formData)
            : await updateUserAction(formData)

        if (!result.success) {
          toast.error(result.message)
          return
        }

        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong",
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant={mode === "create" ? "default" : "outline"} size={mode === "create" ? "default" : "sm"}>
            {mode === "create" ? "Add User" : "Edit"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add User" : "Edit User"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" defaultValue={user?.name ?? ""} required />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              name="email"
              type="email"
              defaultValue={user?.email ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <Input name="phone" defaultValue={user?.phone ?? ""} />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <input type="hidden" name="role" value={role} />
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>
                    {ROLE_LABELS[roleOption]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === UserRole.STAFF && (
            <div className="space-y-2">
              <Label>Module Access</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {MODULE_DEFINITIONS.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedModules.has(module.key)}
                      onChange={(event) => toggleModule(module.key, event.target.checked)}
                    />
                    {module.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose which sections this user can access. Unchecked sections
                are hidden and blocked entirely.
              </p>
            </div>
          )}

          {role === UserRole.KARIGAR && (
            <div className="space-y-2">
              <Label>Linked Karigar</Label>
              <Select value={karigarId} onValueChange={setKarigarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select karigar" />
                </SelectTrigger>
                <SelectContent>
                  {karigars.map((karigar) => (
                    <SelectItem key={karigar.id} value={karigar.id}>
                      {karigar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This karigar will only see their own jobs after logging in.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              value="true"
              defaultChecked={user?.isActive ?? true}
              className="h-4 w-4"
            />
            <Label htmlFor="isActive">Active</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
