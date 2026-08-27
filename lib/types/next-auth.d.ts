import "next-auth"
import "next-auth/jwt"
import type { UserRole, UserStatus } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      status: UserStatus
      phone?: string | null
      isActive: boolean
      storeId: string | null
      karigarId: string | null
      permissions: string[]
      locationIds: string[]
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: UserRole
    phone?: string | null
    storeId?: string | null
    karigarId?: string | null
    permissions?: string[]
    locationIds?: string[]
    /** Set when a periodic re-read finds the account deleted or deactivated;
     * middleware redirects these to /login. */
    disabled?: boolean
    /** Epoch ms of the last re-read, used to throttle it. */
    checkedAt?: number
  }
}
