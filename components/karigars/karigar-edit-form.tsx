"use client"

import { useActionState } from "react"

import {
  updateKarigar,
  type Karigar,
  type KarigarFormState,
} from "@/lib/actions/karigar-actions"
import type { StoreLocationRow } from "@/lib/actions/store-location-actions"

import { KarigarForm } from "./karigar-form"

const initialState: KarigarFormState = {
  success: false,
  message: "",
}

type Props = {
  karigar: Karigar
  locations?: StoreLocationRow[]
}

export function KarigarEditForm({ karigar, locations = [] }: Props) {
  const updateKarigarWithId = updateKarigar.bind(null, karigar.id)

  const [state, formAction, pending] = useActionState(
    updateKarigarWithId,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <div className={state.success ? "text-green-600" : "text-red-600"}>
          {state.message}
        </div>
      )}

      <KarigarForm
        pending={pending}
        karigar={karigar}
        errors={state.errors}
        locations={locations}
      />
    </form>
  )
}
