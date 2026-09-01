"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Download, Loader2 } from "lucide-react"

import {
  getKachaImportTemplate,
  importKachaInvoicesFromExcel,
} from "@/lib/actions/kacha-invoice-actions"
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
 * Bulk-create Kacha slips from a spreadsheet. Row-level problems come back
 * as a list and nothing is created until the file is clean, so the panel
 * below the picker is the main working surface — not an afterthought.
 */
export function KachaImportDialog() {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [pending, startTransition] = useTransition()
  const [downloading, startDownload] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()

  const handleTemplate = () => {
    startDownload(async () => {
      const template = await getKachaImportTemplate()
      downloadBase64File(template.fileBase64, template.fileName)
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await importKachaInvoicesFromExcel(formData)

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
        <Button variant="outline">
          <Upload className="mr-1 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Kacha slips</DialogTitle>
          <DialogDescription>
            One row per line item. Rows sharing a <strong>Slip Ref</strong>{" "}
            become a single slip. Customers are matched on phone number, then
            name — they must already exist.
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
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Download template
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="kacha-import-file" required>Spreadsheet</Label>
            <Input
              id="kacha-import-file"
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
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
