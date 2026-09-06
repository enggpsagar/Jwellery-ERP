"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Download } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import {
  getStockImportTemplate,
  importInventoryStockFromExcel,
} from "@/lib/actions/inventory/stock-actions"
import { downloadBase64File } from "@/lib/download-file"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Bulk-adds stock quantity across many products from one spreadsheet — the
 * multi-row-form alternative for Stock, mirroring KachaImportDialog's own
 * pattern exactly. Row-level problems come back as a list and nothing is
 * created until the file is clean.
 */
export function StockImportDialog() {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [pending, startTransition] = useTransition()
  const [downloading, startDownload] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()

  const handleTemplate = () => {
    startDownload(async () => {
      const template = await getStockImportTemplate()
      downloadBase64File(template.fileBase64, template.fileName)
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await importInventoryStockFromExcel(formData)

      if (result.success) {
        toast.success(result.message)
        setErrors([])
        setFileName("")
        formRef.current?.reset()
        setOpen(false)
      } else {
        setErrors(result.errors ?? [])
        toast.error(result.message)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setErrors([])
          setFileName("")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk add stock</DialogTitle>
          <DialogDescription>
            One row per product. <strong>Product Code</strong> and{" "}
            <strong>Quantity</strong> are all that's required — metal,
            purity and charges come from each matched product. Location is
            optional.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTemplate}
            disabled={downloading}
          >
            {downloading ? (
              <Loader className="mr-1 h-4 w-4" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Download template
          </Button>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="stock-import-file" required>Spreadsheet</Label>
            <Input
              id="stock-import-file"
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              required
              onChange={(event) => {
                setFileName(event.target.files?.[0]?.name ?? "")
                setErrors([])
              }}
            />
          </div>

          {errors.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                Nothing was imported. Fix these and try again:
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending || !fileName}>
              {pending && <Loader className="mr-1 h-4 w-4" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
