"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

import {
  registerStoreAction,
  type RegisterStoreState,
} from "@/lib/actions/store-registration-actions"
import {
  getCitiesByStateId,
  type CityOption,
  type StateOption,
} from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: RegisterStoreState = { success: false, message: "" }

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="text-sm text-destructive">{errors[0]}</p>
}

type RegisterStoreFormProps = {
  states: StateOption[]
}

export function RegisterStoreForm({ states }: RegisterStoreFormProps) {
  const [state, formAction, pending] = useActionState(
    registerStoreAction,
    initialState,
  )

  const [selectedStateId, setSelectedStateId] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [cities, setCities] = useState<CityOption[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const selectedStateName =
    states.find((item) => item.id === selectedStateId)?.name ?? ""

  // Cities depend on the chosen state, so they're fetched fresh whenever it
  // changes — mirrors the same State→City cascade used on the Add Vendor form.
  useEffect(() => {
    let cancelled = false

    async function loadCities() {
      if (!selectedStateId) {
        setCities([])
        return
      }

      try {
        setLoadingCities(true)
        const data = await getCitiesByStateId(selectedStateId)
        if (!cancelled) setCities(data || [])
      } catch (error) {
        console.error("Failed to load cities:", error)
        if (!cancelled) setCities([])
      } finally {
        if (!cancelled) setLoadingCities(false)
      }
    }

    loadCities()
    return () => {
      cancelled = true
    }
  }, [selectedStateId])

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
              {/* Selected/keyed by id (to drive the city fetch below), but the
                  form field itself must submit the state's name — Store.state
                  is a plain text column, same convention as City. */}
              <input type="hidden" name="state" value={selectedStateName} />
              <Select
                value={selectedStateId}
                onValueChange={(value) => {
                  setSelectedStateId(value)
                  setSelectedCity("")
                }}
              >
                <SelectTrigger id="state" className="w-full">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={state.errors?.state} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City or area <RequiredMark /></Label>
              <input type="hidden" name="city" value={selectedCity} />
              <Select
                value={selectedCity}
                onValueChange={setSelectedCity}
                disabled={!selectedStateId || loadingCities}
              >
                <SelectTrigger id="city" className="w-full">
                  <SelectValue
                    placeholder={
                      loadingCities
                        ? "Loading cities..."
                        : selectedStateId
                          ? "Select city"
                          : "Select a state first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.name}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
