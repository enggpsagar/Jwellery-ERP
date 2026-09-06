"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole } from "@prisma/client"
import { Camera } from "lucide-react"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
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
  locationAccess?: { locationId: string }[] | null
  aadhaarNumber?: string | null
  panNumber?: string | null
  image?: string | null
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

type UserFormDialogProps = {
  mode: "create" | "edit"
  user?: UserFormDialogUser
  children?: React.ReactNode
  karigars?: KarigarOption[]
  locations?: LocationOption[]
  allowSuperAdmin?: boolean
  /**
   * Render the form on its own, without the Dialog shell. Editing a user is
   * a full page now; the same body is reused rather than duplicated so the
   * karigar contact sync, module toggles and location grants can't drift
   * between the two surfaces.
   */
  asPage?: boolean
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
  locations = [],
  allowSuperAdmin = false,
  asPage = false,
}: UserFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [role, setRole] = useState<UserRole>(user?.role ?? UserRole.STAFF)
  const [karigarId, setKarigarId] = useState(user?.karigarId ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [imageUrl, setImageUrl] = useState(user?.image ?? "")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2MB")
      return
    }

    const uploadData = new FormData()
    uploadData.append("file", file)

    setUploadingPhoto(true)
    try {
      const res = await fetch("/api/users/photo", { method: "POST", body: uploadData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || "Upload failed")

      setImageUrl(data.url)
      toast.success("Photo uploaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  // Picking a karigar syncs their login to whatever contact info is already
  // on file for them, so the two can't silently drift apart — the whole
  // point of them doubling as a login identifier.
  function handleKarigarSelect(id: string) {
    setKarigarId(id)
    const karigar = karigars.find((k) => k.id === id)
    if (karigar?.mobile) setPhone(karigar.mobile)
    if (karigar?.email) setEmail(karigar.email)
  }

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

  // Unlike modules, no-selection here means "unrestricted" (see every
  // location) — so this starts empty, not pre-filled with every location.
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(
    () => new Set((user?.locationAccess ?? []).map((grant) => grant.locationId)),
  )

  const toggleLocation = (id: string, checked: boolean) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
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
      formData.set("locationIds", JSON.stringify([...selectedLocations]))
    } else {
      formData.set("permissions", "[]")
      formData.set("locationIds", "[]")
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

        if (asPage) {
          router.push("/users")
        } else {
          setOpen(false)
        }

        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong",
        )
      }
    })
  }

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="image" value={imageUrl} />

      <div className="flex flex-col items-center gap-3">
        <Avatar className="h-24 w-24 border-4 shadow-sm">
          <AvatarImage src={imageUrl || ""} />
          <AvatarFallback className="text-2xl">
            {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
          </AvatarFallback>
        </Avatar>

        <input
          ref={photoInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadingPhoto}
          onClick={() => photoInputRef.current?.click()}
        >
          {uploadingPhoto ? (
            <Loader className="mr-2 h-4 w-4" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          {uploadingPhoto ? "Uploading..." : "Upload Photo"}
        </Button>
      </div>

      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label required>Name</Label>
          <Input name="name" defaultValue={user?.name ?? ""} required />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label required>Phone</Label>
          <Input
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label required>Role</Label>
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

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>PAN Number</Label>
          <Input
            name="panNumber"
            defaultValue={user?.panNumber ?? ""}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Aadhaar Number</Label>
          <Input
            name="aadhaarNumber"
            defaultValue={user?.aadhaarNumber ?? ""}
            placeholder="Optional — 12 digits"
          />
        </div>

        {role === UserRole.STAFF && (
          <div className="space-y-2 md:col-span-2">
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

        {role === UserRole.STAFF && (
          <div className="space-y-2 md:col-span-2">
            <Label>Location Access</Label>
            {locations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No locations configured yet — this user will see all data.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  {locations.map((location) => (
                    <label
                      key={location.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedLocations.has(location.id)}
                        onChange={(event) => toggleLocation(location.id, event.target.checked)}
                      />
                      {location.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave everything unchecked for unrestricted access to
                  every location. Checking any location restricts this
                  user to only those.
                </p>
              </>
            )}
          </div>
        )}

        {role === UserRole.KARIGAR && (
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40 md:col-span-2">
            <Label>Linked Karigar</Label>
            <Select value={karigarId} onValueChange={handleKarigarSelect}>
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
              Selecting a karigar fills in Email/Phone from their contact
              record, so their login always matches it. This karigar will
              only see their own jobs after logging in.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 md:col-span-2">
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
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => (asPage ? router.push("/users") : setOpen(false))}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  )

  if (asPage) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 sm:p-8">
        {formBody}
      </div>
    )
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

        {formBody}
      </DialogContent>
    </Dialog>
  )
}
