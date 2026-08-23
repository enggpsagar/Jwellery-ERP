"use client"

import { useRouter } from "next/navigation"
import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

type StockToolbarProps = {
  selectedIds: string[]
}

export function StockToolbar({ selectedIds }: StockToolbarProps) {
  const router = useRouter()

  const handlePrintQr = () => {
    if (!selectedIds.length) return
    router.push(`/inventory/stock/print-qr?ids=${selectedIds.join(",")}`)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {selectedIds.length > 0
          ? `${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"} selected`
          : "Select stock items to print their QR codes."}
      </p>

      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={selectedIds.length === 0}
        onClick={handlePrintQr}
      >
        <Printer className="h-4 w-4" />
        Print QR ({selectedIds.length})
      </Button>
    </div>
  )
}
