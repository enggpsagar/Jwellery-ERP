// File: lib/auth-options.ts

import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import {
  OtpPurpose,
  UserRole,
  UserStatus,
} from "@prisma/client"

import { adapter } from "@/lib/auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { hashOTP } from "@/lib/auth/otp"

export const authOptions: NextAuthOptions = {
  adapter,

  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    CredentialsProvider({
      id: "credentials",
      name: "Mobile OTP",

      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
      },

      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) {
          throw new Error("Phone and OTP are required.")
        }

        const otp = await prisma.otpCode.findFirst({
          where: {
            phone: credentials.phone,
            purpose: OtpPurpose.LOGIN,
            consumedAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
        })

        if (!otp) throw new Error("OTP not found.")
        if (otp.expiresAt < new Date()) throw new Error("OTP expired.")

        if (otp.codeHash !== hashOTP(credentials.otp)) {
          throw new Error("Invalid OTP.")
        }

        await prisma.otpCode.update({
          where: { id: otp.id },
          data: { consumedAt: new Date() },
        })

        let user = await prisma.user.findUnique({
          where: { phone: credentials.phone },
        })

        if (!user) {
          user = await prisma.user.create({
            data: {
              phone: credentials.phone,
              status: UserStatus.ACTIVE,
              role: UserRole.STAFF,
              isActive: true,
            },
          })
        }

        if (!user.isActive) {
          throw new Error("Your account has been disabled.")
        }

        return user
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.phone = (user as any).phone
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        ;(session.user as any).phone = token.phone
      }
      return session
    },

    async signIn({ user }) {
      return !!user
    },
  },
}