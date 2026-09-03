import Link from "next/link"
import { Gem, LogIn } from "lucide-react"

import { APP_NAME } from "@/lib/constants/app"
import { Button } from "@/components/ui/button"

/**
 * Header/footer chrome for the public marketing pages that sit alongside
 * the landing page (app/contact, app/faq) — same look as app/page.tsx's own
 * inline header/footer, factored out here so /contact and /faq don't each
 * carry their own copy. The landing page itself is left with its existing
 * inline markup rather than refactored onto this, to keep this change's
 * footprint small on a file that changes often.
 */
export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-b-transparent bg-background/85 backdrop-blur-md [border-image:linear-gradient(90deg,transparent,color-mix(in_oklab,var(--chart-2)_38%,transparent),transparent)_1]">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] text-white">
            <Gem className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold">{APP_NAME}</p>
          </div>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/faq">FAQ</Link>
          </Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/contact">Contact Us</Link>
          </Button>

          <Button
            asChild
            className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          >
            <Link href="/login">
              <LogIn className="mr-1.5 size-4" />
              Login
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}

export function PublicSiteFooter() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Gem className="size-4 text-[var(--chart-2)]" />
          <span>{APP_NAME}</span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/faq" className="hover:text-foreground">
            FAQ
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact Us
          </Link>
          <Link href="/register" className="hover:text-foreground">
            Register
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Login
          </Link>
          <span>
            &copy; {new Date().getFullYear()} {APP_NAME}
          </span>
        </div>
      </div>
    </footer>
  )
}
