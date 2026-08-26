"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2 } from "lucide-react"

import {
  quickAddProductForPurchase,
  type PurchaseFormProduct,
} from "@/lib/actions/purchase-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type TaxonomyOption = { id: string; name: string }

const PURITY_OPTIONS = [
  { value: "K24", label: "24K" },
  { value: "K22", label: "22K" },
  { value: "K18", label: "18K" },
  { value: "K14", label: "14K" },
  { value: "SILVER_925", label: "925 Silver" },
  { value: "SILVER_999", label: "999 Silver" },
]

type QuickAddProductDialogProps = {
  metals: TaxonomyOption[]
  categories: TaxonomyOption[]
  onCreated: (product: PurchaseFormProduct) => void
}

/**
 * Create a product without leaving purchase entry, then select it on the
 * line item that opened the dialog.
 *
 * Not a <form> — it renders inside the purchase <form>, and nested forms are
 * invalid HTML (the browser discards the inner one, so Enter would submit
 * the purchase). Values are held locally and passed to the action directly.
 */
export function QuickAddProductDialog({
  metals,
  categories,
  onCreated,
}: QuickAddProductDialogProps) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [values, setValues] = useState({
    name: "",
    productCode: "",
    categoryId: "",
    metalTypeId: "",
    defaultPurity: "",
    defaultMakingCharge: "",
    defaultStoneCharge: "",
  })
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const reset = () => {
    setValues({
      name: "",
      productCode: "",
      categoryId: "",
      metalTypeId: "",
      defaultPurity: "",
      defaultMakingCharge: "",
      defaultStoneCharge: "",
    })
    setErrors({})
  }

  const handleSave = () => {
    const formData = new FormData()
    Object.entries(values).forEach(([key, value]) => formData.set(key, value))

    startTransition(async () => {
      const result = await quickAddProductForPurchase(formData)

      if (result.success && result.product) {
        toast.success(result.message)
        onCreated(result.product)
        setOpen(false)
        reset()
      } else {
        setErrors(result.errors ?? {})
        toast.error(result.message)
      }
    })
  }

  const set = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: [] }))
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" />
        New product
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New product</DialogTitle>
            <DialogDescription>
              Added to your catalogue and selected on this line. Its metal,
              purity and charges prefill the line item.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-product-name">Product name *</Label>
                <Input
                  id="quick-product-name"
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  autoFocus
                />
                {errors.name?.[0] && (
                  <p className="text-sm text-destructive">{errors.name[0]}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-product-code">Product code</Label>
                <Input
                  id="quick-product-code"
                  value={values.productCode}
                  onChange={(event) => set("productCode", event.target.value)}
                  placeholder="Auto-generated if blank"
                />
                {errors.productCode?.[0] && (
                  <p className="text-sm text-destructive">
                    {errors.productCode[0]}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={values.categoryId}
                  onValueChange={(value) => set("categoryId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Metal</Label>
                <Select
                  value={values.metalTypeId}
                  onValueChange={(value) => set("metalTypeId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select metal" />
                  </SelectTrigger>
                  <SelectContent>
                    {metals.map((metal) => (
                      <SelectItem key={metal.id} value={metal.id}>
                        {metal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Purity</Label>
                <Select
                  value={values.defaultPurity}
                  onValueChange={(value) => set("defaultPurity", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Purity" />
                  </SelectTrigger>
                  <SelectContent>
                    {PURITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-product-making">Making charge</Label>
                <Input
                  id="quick-product-making"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.defaultMakingCharge}
                  onChange={(event) =>
                    set("defaultMakingCharge", event.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-product-stone">Stone charge</Label>
                <Input
                  id="quick-product-stone"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.defaultStoneCharge}
                  onChange={(event) =>
                    set("defaultStoneCharge", event.target.value)
                  }
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Item type, HSN and description aren&apos;t asked for here — set
              them on the Inventory &rarr; Products page when you have a moment.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
