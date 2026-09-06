"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

export function SessionProvider({
  session,
  children,
}: {
  // Server-fetched session (RootLayout), so the client starts already
  // authenticated instead of a brief "loading" pass — without this, every
  // page load/refresh showed a visible flash as useSession()-gated header
  // buttons (New Invoice, Add Purchase, ...) popped in a moment after the
  // page painted, once the client-side session fetch resolved.
  session: Session | null;
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </NextAuthSessionProvider>
  );
}