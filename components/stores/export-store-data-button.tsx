"use client"

import { useState } from "react"
import { Download } from "lucide-react"

import { exportStoreData } from "@/lib/actions/store-export-actions"
import { downloadBase64File } from "@/lib/download-file"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"

export function ExportStoreDataButton({
  storeId,
}: {
  storeId: string
}) {
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await exportStoreData(storeId)
      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message)
        return
      }
      downloadBase64File(result.fileBase64, result.fileName, "application/json")
      toast.success(result.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
      onClick={handleExport}
      disabled={exporting}
      aria-label="Export store data"
      title="Export data"
    >
      {exporting ? <Loader className="size-4" /> : <Download className="size-4" />}
    </Button>
  )
}
