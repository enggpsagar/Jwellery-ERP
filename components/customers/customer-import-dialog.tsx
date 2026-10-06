"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Download } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import {
  getCustomerImportTemplate,
  importCustomersFromExcel,
} from "@/lib/actions/customer-actions"
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
 * Bulk-adds parties from one spreadsheet — mirrors StockImportDialog's
 * pattern exactly. Row-level problems come back as a list and nothing is
 * created until the file is clean.
 */
export function CustomerImportDialog() {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [pending, startTransition] = useTransition()
  const [downloading, startDownload] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()

  const handleTemplate = () => {
    startDownload(async () => {
      const template = await getCustomerImportTemplate()
      downloadBase64File(template.fileBase64, template.fileName)
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await importCustomersFromExcel(formData)

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
        <Button type="button" variant="import">
          <Upload className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk import parties</DialogTitle>
          <DialogDescription>
            One row per party, checked like the Add Party form.{" "}
            <strong>Party Name</strong> is required, and <strong>GST Number</strong>{" "}
            too for a Regular or Composition Scheme party. The template&apos;s
            Instructions sheet explains every column; an exported Parties file
            imports back as-is.
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
            <Label htmlFor="customer-import-file" required>Spreadsheet</Label>
            <Input
              id="customer-import-file"
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
