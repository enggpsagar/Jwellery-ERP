import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        ;(session.user as { id?: string }).id = token.sub
      }

      if (session.user && token.role) {
        ;(session.user as { role?: string }).role = token.role as string
      }

      return session
    },

    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "STAFF"
      }
      return token
    },
  },
} satisfies NextAuthConfig