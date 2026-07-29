"use client"


import { useActionState } from "react"

import {
  createKarigar,
  type KarigarFormState
} from "@/lib/actions/karigar-actions"

import { KarigarForm } from "./karigar-form"



const initialState: KarigarFormState = {

  success:false,

  message:"",

}



export function KarigarCreateForm(){


  const [
    state,
    formAction,
    pending

  ] = useActionState(
    createKarigar,
    initialState
  )



  return (

    <form
      action={formAction}
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
      />


    </form>

  )

}