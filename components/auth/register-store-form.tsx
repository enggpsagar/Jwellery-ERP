"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

import {
  registerStoreAction,
  type RegisterStoreState,
} from "@/lib/actions/store-registration-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: RegisterStoreState = { success: false, message: "" }

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="text-sm text-destructive">{errors[0]}</p>
}

export function RegisterStoreForm() {
  const [state, formAction, pending] = useActionState(
    registerStoreAction,
    initialState,
  )

  // Success is a different screen, not a toast: the next step is "go and sign
  // in", and a message that disappears after three seconds would take the
  // instructions with it.
  if (state.success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <CheckCircle2 className="size-10 text-[var(--chart-3)]" />

          <div>
            <h2 className="text-xl font-semibold">You&apos;re all set</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.message}
            </p>
          </div>

          {state.signInWith ? (
            <div className="w-full rounded-lg border bg-muted/40 p-4 text-left text-sm">
              <p className="text-muted-foreground">Sign in with</p>
              <p className="mt-1 font-medium break-words">
                {state.signInWith.email}
              </p>
              {state.signInWith.phone ? (
                <p className="text-muted-foreground">
                  or mobile {state.signInWith.phone}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            asChild
            size="lg"
            className="w-full bg-[var(--chart-2)] text-white hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          >
            <Link href="/login">
              Go to sign in
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>

          <p className="text-xs text-muted-foreground">
            We&apos;ve emailed your store details too.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <form action={formAction} className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="storeName">Store name <RequiredMark /></Label>
            <Input
              id="storeName"
              name="storeName"
              placeholder="Alankar Jewellers"
              required
              autoFocus
            />
            <FieldError errors={state.errors?.storeName} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ownerName">Your name <RequiredMark /></Label>
            <Input
              id="ownerName"
              name="ownerName"
              placeholder="Full name"
              required
            />
            <FieldError errors={state.errors?.ownerName} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email <RequiredMark /></Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
            <FieldError errors={state.errors?.email} />
            <p className="text-xs text-muted-foreground">
              You&apos;ll sign in with this.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile number <RequiredMark /></Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="9876543210"
              required
            />
            <FieldError errors={state.errors?.phone} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="state">State <RequiredMark /></Label>
              <Input id="state" name="state" placeholder="Maharashtra" required />
              <FieldError errors={state.errors?.state} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City or area <RequiredMark /></Label>
              <Input id="city" name="city" placeholder="Nagpur" required />
              <FieldError errors={state.errors?.city} />
            </div>
          </div>

          {/* Said up front because the code is permanent — this is the only
              moment the answers can still affect it. */}
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Your store code is built from these — a shop called Himalaya in
            Nagpur, Maharashtra becomes{" "}
            <span className="font-mono font-medium text-foreground">
              MH-NAG-HIM
            </span>
            . It cannot be changed later.
          </p>

          {!state.success && state.message ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="bg-[var(--chart-2)] text-white hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          >
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {pending ? "Setting up your shop..." : "Create my store"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No card required. Your trial starts immediately.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
