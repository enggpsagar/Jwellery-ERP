"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Download } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import {
  getProductImportTemplate,
  importProductsFromExcel,
} from "@/lib/actions/inventory/product-actions"
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
 * Bulk-adds products from one spreadsheet — mirrors StockImportDialog's
 * pattern exactly. Row-level problems come back as a list and nothing is
 * created until the file is clean.
 */
export function ProductImportDialog({ styleFieldEnabled = true }: { styleFieldEnabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [pending, startTransition] = useTransition()
  const [downloading, startDownload] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()

  const handleTemplate = () => {
    startDownload(async () => {
      const template = await getProductImportTemplate()
      downloadBase64File(template.fileBase64, template.fileName)
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await importProductsFromExcel(formData)

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
          <DialogTitle>Bulk import products</DialogTitle>
          <DialogDescription>
            One row per product. <strong>Product Name</strong>,{" "}
            <strong>Category</strong>
            {styleFieldEnabled ? ", " : " and "}
            <strong>Metal Type</strong>
            {styleFieldEnabled ? (
              <>
                {" "}and <strong>Style</strong>
              </>
            ) : null}{" "}
            are required — Category and Metal Type
            names must match what's already set up under Settings &gt;
            Taxonomy. Product codes are generated automatically, same as the
            "Add Product" form. Fill in <strong>Stock Quantity</strong> on a
            row to also create an opening stock entry for that product.{" "}
            <strong>Finish</strong> (Unfinished / Finished) is optional and
            defaults to Unfinished; that opening stock takes the same Finish.
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
            <Label htmlFor="product-import-file" required>Spreadsheet</Label>
            <Input
              id="product-import-file"
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
