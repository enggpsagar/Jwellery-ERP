"use client"

import * as React from "react"
import { useState } from "react"
import { Pencil } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { EditProductForm } from "@/components/inventory/products/edit-product-form"

type EditProductDialogProps = {
  product: {
    id: string
    productCode: string
    name: string
    category: string
    ornamentType: string | null
    metalType: string
    defaultPurity: string | null
    defaultMakingCharge: string | null
    defaultStoneCharge: string | null
    designCode: string | null
    hsnCode: string | null
    description: string | null
    notes: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
  }
  children?: React.ReactNode
}

export function EditProductDialog({ product, children }: EditProductDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            title="Edit product"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>

        <EditProductForm product={product} />
      </DialogContent>
    </Dialog>
  )
}
