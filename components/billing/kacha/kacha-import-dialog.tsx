"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Download } from "lucide-react"
import { Loader } from "@/components/ui/loader"

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
import { ImportErrorList } from "@/components/shared/import-error-list"

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
      try {
        const template = await getKachaImportTemplate()
        downloadBase64File(template.fileBase64, template.fileName)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to download template")
      }
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
        <Button variant="import">
          <Upload className="mr-1 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Estimates</DialogTitle>
          <DialogDescription>
            One row per line item. Rows sharing a <strong>Slip Ref</strong>{" "}
            become a single slip. The party and each line&apos;s{" "}
            <strong>Purchased From</strong> must already exist. Each Estimate
            is posted to the party&apos;s ledger like the New Estimate form.
            An Estimates Excel export or a delete-all backup imports as-is.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <Button
            type="button"
            variant="secondary"
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

          <ImportErrorList errors={errors} />

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
