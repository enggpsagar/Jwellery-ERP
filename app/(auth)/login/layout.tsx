import type { Metadata } from "next"

// The page itself is "use client" (it needs useState/useEffect for the OTP
// flow), and a Client Component cannot export `metadata`. A layout can still
// be a Server Component even when the page it wraps is client-side, so the
// title lives here instead.
export const metadata: Metadata = {
  title: "Log In",
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
