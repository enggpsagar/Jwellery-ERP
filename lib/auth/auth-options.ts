import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"

import { adapter } from "@/lib/auth/prisma-adapter"
import { verifyOtpLogin, verifyEmailOtpLogin } from "@/lib/auth/otp-auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const SUPER_ADMIN_PHONES = (process.env.SUPER_ADMIN_PHONES ?? "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean)

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
      const dbUser = user as unknown as { storeId: string | null }

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

        token.id = dbUser.id
        token.role = role
        token.storeId = storeId
        token.karigarId = dbUser.karigarId
        token.phone = dbUser.phone
        token.permissions = dbUser.permissions ?? []
      }
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
      }
      return session
    },
  },
}
