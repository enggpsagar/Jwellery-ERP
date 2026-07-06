import "next-auth"
import type { UserRole, UserStatus } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      status: UserStatus
      phone?: string | null
      isActive: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}