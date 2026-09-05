"use client"


import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"

import {
  createKarigar,
  type KarigarFormState
} from "@/lib/actions/karigar-actions"
import type { StoreLocationRow } from "@/lib/actions/store-location-actions"
import type { StateOption } from "@/lib/actions/location-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { useToast } from "@/components/providers/toast-provider"

import { KarigarForm } from "./karigar-form"



const initialState: KarigarFormState = {

  success:false,

  message:"",

}

type Props = {
  locations?: StoreLocationRow[]
  states?: StateOption[]
  metals?: StoreMetalRow[]
}

export function KarigarCreateForm({ locations = [], states = [], metals = [] }: Props){

  const router = useRouter()
  const toast = useToast()

  const [
    state,
    formAction,
    pending

  ] = useActionState(
    createKarigar,
    initialState
  )

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Karigar added successfully")
      router.push("/karigars")
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (

    <form
      onSubmit={(event) => {
        // Deliberately not `action={formAction}` directly on the form:
        // React resets a form's uncontrolled fields once an action-bound
        // submission settles, regardless of whether the action's own
        // returned state says success or failure — so a plain validation
        // error wiped every other field the user had already typed.
        // Calling the same dispatcher by hand from a prevented submit
        // sidesteps that auto-reset while keeping identical pending/error-
        // state behavior.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >


      {
        state.message && (

          <div
            className={
              state.success
              ? "text-green-600"
              : "text-red-600"
            }
          >

            {state.message}

          </div>

        )
      }



      <KarigarForm
        pending={pending}
        errors={state.errors}
        locations={locations}
        states={states}
        metals={metals}
      />


    </form>

  )

}