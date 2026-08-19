"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole } from "@prisma/client"

import {
  createUserAction,
  updateUserAction,
} from "@/app/(dashboard)/users/actions"

import { ROLE_LABELS } from "@/lib/roles"

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
