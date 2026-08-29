import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { Gem } from "lucide-react"

import { authOptions } from "@/lib/auth/auth-options"
import { APP_NAME } from "@/lib/constants/app"
import { prisma } from "@/lib/prisma"
import { RegisterStoreForm } from "@/components/auth/register-store-form"

export const dynamic = "force-dynamic"

export default async function RegisterStorePage() {
  const session = await getServerSession(authOptions)

  // Already signed in — registering a second shop from here would strand them
  // with two accounts on one email, which the unique constraint forbids.
  if (session?.user) {
    redirect("/dashboard")
  }

  // Named on the page so the trial length is a promise the user can read
  // before filling anything in, and stays true if the plan is edited.
  const trialPlan = await prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: [{ price: "asc" }, { sortOrder: "asc" }],
    select: { name: true, durationDays: true },
  })

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] text-white">
              <Gem className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold">{APP_NAME}</p>
              <p className="text-[11px] text-muted-foreground">Jewellery ERP</p>
            </div>
          </Link>

          <p className="text-sm text-muted-foreground">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--chart-2)] underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Set up your shop in a minute
          </h1>

          <p className="mt-4 text-muted-foreground">
            Four details and your store is live, with{" "}
            {trialPlan ? (
              <strong className="text-foreground">
                {trialPlan.durationDays} days free
              </strong>
            ) : (
              <strong className="text-foreground">a free trial</strong>
            )}{" "}
            to try everything.
          </p>

          <ul className="mt-8 flex flex-col gap-4 text-sm">
            {[
              {
                title: "No password to invent",
                body: "Sign in with Google, or a one-time code sent to your email or mobile.",
              },
              {
                title: "Ready to use immediately",
                body: "Your shop starts with metals, categories and a counter already set up, so you can add a product and bill it straight away.",
              },
              {
                title: "You own the vocabulary",
                body: "Rename the metals and categories to match what you actually deal in — nothing is fixed to one trade.",
              },
            ].map((point) => (
              <li key={point.title} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--chart-2)]" />
                <span>
                  <span className="font-medium">{point.title}</span>
                  <span className="block text-muted-foreground">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <RegisterStoreForm />
      </div>
    </main>
  )
}
