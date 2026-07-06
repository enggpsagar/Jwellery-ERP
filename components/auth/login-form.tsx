"use client"

import { signIn } from "next-auth/react"

export function LoginForm() {
  return (
    <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-muted-foreground">
          Continue with Google to access the dashboard.
        </p>
      </div>

      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Continue with Google
      </button>
    </div>
  )
}