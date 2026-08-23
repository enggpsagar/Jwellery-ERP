"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

export function PrintAllQrButton() {
  return (
    <Button type="button" className="gap-2" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print All
    </Button>
  )
}
