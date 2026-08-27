import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"

import { adapter } from "@/lib/auth/prisma-adapter"
import { verifyOtpLogin, verifyEmailOtpLogin } from "@/lib/auth/otp-auth"
import { prisma } from "@/lib/prisma"
import { sendDisabledAccountEmailSafely } from "@/lib/invite-email"
import { UserRole } from "@prisma/client"

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")

  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const SUPER_ADMIN_PHONES = (process.env.SUPER_ADMIN_PHONES ?? "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean)

/**
 * How stale a session's cached role/store/permissions may get before the
 * JWT callback re-reads them. Bounds how long a moved or deactivated user
 * keeps their old store context, without a database round-trip on every
 * session read.
 */
const SESSION_REVALIDATE_MS = 60_000

export const authOptions: NextAuthOptions = {
  adapter,

  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Admins/staff are pre-created by invite with just an email; their first
      // Google sign-in must link to that row instead of erroring out.
      allowDangerousEmailAccountLinking: true,
    }),

    CredentialsProvider({
      id: "credentials",
      name: "OTP",

      // Either phone or email is supplied per sign-in attempt — never both —
      // so authorize() branches on whichever one is present.
      credentials: {
        phone: { label: "Phone", type: "text" },
        email: { label: "Email", type: "text" },
        otp: { label: "OTP", type: "text" },
      },

      async authorize(credentials) {
        if (!credentials?.otp) {
          throw new Error("OTP is required.")
        }

        if (credentials.phone) {
          return verifyOtpLogin(credentials.phone, credentials.otp)
        }

        if (credentials.email) {
          return verifyEmailOtpLogin(credentials.email, credentials.otp)
        }

        throw new Error("Phone number or email is required.")
      },
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  callbacks: {
    async signIn({ user }) {
      const dbUser = user as unknown as {
        storeId: string | null
        isActive: boolean | null
        role: UserRole | null
        name: string | null
        email: string | null
      }

      // Only the Prisma-adapter (Google) path reaches this callback with a
      // full DB user row — dbUser.isActive is undefined for the Credentials
      // (OTP) provider, which already rejects a disabled account itself in
      // lib/auth/otp-auth.ts's assertCanSignIn before signIn() ever runs.
      if (dbUser.isActive === false) {
        await sendDisabledAccountEmailSafely({
          email: dbUser.email,
          name: dbUser.name || "there",
          role: dbUser.role ?? UserRole.STAFF,
          storeId: dbUser.storeId,
        })
        return false
      }

      if (dbUser.storeId) {
        const store = await prisma.store.findUnique({
          where: { id: dbUser.storeId },
          select: { isActive: true },
        })

        if (store && !store.isActive) {
          return false
        }
      }

      return true
    },

    async jwt({ token, user }) {
      if (user) {
        const dbUser = user as unknown as {
          id: string
          role: UserRole
          storeId: string | null
          karigarId: string | null
          phone: string | null
          permissions: string[] | null
        }

        let role = dbUser.role
        let storeId = dbUser.storeId

        const email = user.email?.toLowerCase()
        const isSuperAdminEmail = !!email && SUPER_ADMIN_EMAILS.includes(email)
        const isSuperAdminPhone =
          !!dbUser.phone && SUPER_ADMIN_PHONES.includes(dbUser.phone)

        if (
          (isSuperAdminEmail || isSuperAdminPhone) &&
          (role !== UserRole.SUPER_ADMIN || storeId !== null)
        ) {
          role = UserRole.SUPER_ADMIN
          storeId = null
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { role: UserRole.SUPER_ADMIN, storeId: null },
          })
        }

        // Location grants aren't a plain column on User (unlike permissions),
        // so the adapter's default user object never carries them — a
        // one-off lookup here, same as the store isActive check above,
        // matches how permissions/role/store all only re-derive at sign-in.
        const locationGrants = await prisma.userLocationAccess.findMany({
          where: { userId: dbUser.id },
          select: { locationId: true },
        })

        token.id = dbUser.id
        token.role = role
        token.storeId = storeId
        token.karigarId = dbUser.karigarId
        token.phone = dbUser.phone
        token.permissions = dbUser.permissions ?? []
        token.locationIds = locationGrants.map((grant) => grant.locationId)
        token.disabled = false
        token.checkedAt = Date.now()

        return token
      }

      // No `user` means an existing session, where every field above was
      // frozen at sign-in. That is a problem once a person moves store: they
      // are deactivated in store A and added to store B, but their live
      // token still says store A, so they keep reading store A's data until
      // it expires. Role changes, permission changes and plain deactivation
      // have the same lag.
      //
      // Re-read on a timer rather than every call: this runs on each session
      // read, so an unthrottled query would add a round-trip to every page.
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0

      if (Date.now() - checkedAt < SESSION_REVALIDATE_MS) {
        return token
      }

      const fresh = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: {
          role: true,
          storeId: true,
          karigarId: true,
          isActive: true,
          permissions: true,
          locationAccess: { select: { locationId: true } },
        },
      })

      token.checkedAt = Date.now()

      if (!fresh || !fresh.isActive) {
        // Deleted or deactivated. Flagged rather than mutated into something
        // half-valid, so middleware can bounce them to /login instead of a
        // page failing deep in a query with no store scope.
        token.disabled = true
        return token
      }

      token.disabled = false
      token.role = fresh.role
      token.storeId = fresh.storeId
      token.karigarId = fresh.karigarId
      token.permissions = fresh.permissions ?? []
      token.locationIds = fresh.locationAccess.map((grant) => grant.locationId)

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.storeId = token.storeId ?? null
        session.user.karigarId = token.karigarId ?? null
        session.user.phone = token.phone ?? null
        session.user.permissions = token.permissions ?? []
        session.user.locationIds = token.locationIds ?? []
      }
      return session
    },
  },
}
