"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { createProduct } from "@/lib/actions/inventory/product-actions";
import { initialProductFormState } from "@/lib/inventory/product-types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddProductDialog() {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    createProduct,
    initialProductFormState,
  );

  useEffect(() => {
    if (state.success) {
      window.alert(state.message || "Product created successfully");
      setOpen(false);
    }
  }, [state.success, state.message]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger>
        <span className="inline-flex items-center gap-2">Add Product</span>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <form action={formAction} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>
              Create a jewellery product master for inventory stock.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productCode">Product Code</Label>
              <Input
                id="productCode"
                name="productCode"
                placeholder="RING-001"
              />
              {state.errors?.productCode?.[0] && (
                <p className="text-sm text-red-600">
                  {state.errors.productCode[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Product Name</Label>
              <Input id="name" name="name" placeholder="Ladies Ring" />
              {state.errors?.name?.[0] && (
                <p className="text-sm text-red-600">{state.errors.name[0]}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="designCode">Design Code</Label>
              <Input id="designCode" name="designCode" placeholder="DES-101" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hsnCode">HSN Code</Label>
              <Input id="hsnCode" name="hsnCode" placeholder="7113" />
            </div>
          </div>

          {/* Hidden default values so createProduct gets expected fields */}
          <input type="hidden" name="category" value="ORNAMENT" />
          <input type="hidden" name="metalType" value="GOLD" />
          <input type="hidden" name="isActive" value="true" />

          {!state.success && state.message ? (
            <p className="text-sm text-red-600">{state.message}</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
