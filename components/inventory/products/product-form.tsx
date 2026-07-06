"use client";

import { useState } from "react";

import type {
  InventoryCategory,
  MetalType,
  OrnamentType,
  PurityType,
} from "@prisma/client";


import type { ProductFormState } from "@/lib/inventory/product-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Product = {
  id?: string;
  productCode: string;
  name: string;
  category: string;
  ornamentType: string | null;
  metalType: string;
  defaultPurity: string | null;
  defaultMakingCharge: string | null;
  defaultStoneCharge: string | null;
  designCode: string | null;
  hsnCode: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
};

type ProductFormProps = {
  mode: "create" | "edit";
  product?: Product;
  state: ProductFormState;
  pending: boolean;
};

function ErrorText({
  error,
}: {
  error?: string[];
}) {
  if (!error?.length) return null;

  return (
    <p className="mt-1 text-sm text-red-600">
      {error[0]}
    </p>
  );
}

export function ProductForm({
  mode,
  product,
  state,
  pending,
}: ProductFormProps) {
  const [category, setCategory] = useState(
    product?.category ?? InventoryCategory.ORNAMENT
  );

  const [ornamentType, setOrnamentType] = useState(
    product?.ornamentType ?? "__none__"
  );

  const [metalType, setMetalType] = useState(
    product?.metalType ?? MetalType.GOLD
  );

  const [defaultPurity, setDefaultPurity] = useState(
    product?.defaultPurity ?? "__none__"
  );

  const [isActive, setIsActive] = useState(
    product?.isActive === false ? "false" : "true"
  );

  return (
    <div className="space-y-8">

      <div className="rounded-xl border p-6">

        <h3 className="mb-6 text-lg font-semibold">
          Basic Information
        </h3>

        <div className="grid gap-6 lg:grid-cols-3">

          <div>
            <Label htmlFor="productCode">
              Product Code *
            </Label>

            <Input
              id="productCode"
              name="productCode"
              defaultValue={product?.productCode ?? ""}
              placeholder="RING-001"
            />

            <ErrorText
              error={state.errors.productCode}
            />
          </div>

          <div>
            <Label htmlFor="name">
              Product Name *
            </Label>

            <Input
              id="name"
              name="name"
              defaultValue={product?.name ?? ""}
              placeholder="Ladies Ring"
            />

            <ErrorText
              error={state.errors.name}
            />
          </div>

          <div>
            <Label>Category</Label>

            <Select
              value={category}
              onValueChange={setCategory}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {Object.values(
                  InventoryCategory
                ).map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                  >
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="category"
              value={category}
            />

            <ErrorText
              error={state.errors.category}
            />
          </div>
                    <div>
            <Label>Ornament Type</Label>

            <Select
              value={ornamentType}
              onValueChange={setOrnamentType}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select Ornament Type" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="__none__">
                  None
                </SelectItem>

                {Object.values(OrnamentType).map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                  >
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="ornamentType"
              value={
                ornamentType === "__none__"
                  ? ""
                  : ornamentType
              }
            />

            <ErrorText
              error={state.errors.ornamentType}
            />
          </div>

        </div>
      </div>

      {/* ============================
          METAL DETAILS
      ============================= */}

      <div className="rounded-xl border p-6">

        <h3 className="mb-6 text-lg font-semibold">
          Metal Details
        </h3>

        <div className="grid gap-6 lg:grid-cols-3">

          <div>
            <Label>Metal Type</Label>

            <Select
              value={metalType}
              onValueChange={setMetalType}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {Object.values(MetalType).map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                  >
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="metalType"
              value={metalType}
            />

            <ErrorText
              error={state.errors.metalType}
            />
          </div>

          <div>
            <Label>Default Purity</Label>

            <Select
              value={defaultPurity}
              onValueChange={setDefaultPurity}
            >
                <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select Purity" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="__none__">
                  None
                </SelectItem>

                {Object.values(PurityType).map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                  >
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="defaultPurity"
              value={
                defaultPurity === "__none__"
                  ? ""
                  : defaultPurity
              }
            />

            <ErrorText
              error={state.errors.defaultPurity}
            />
          </div>

          <div>
            <Label htmlFor="defaultMakingCharge">
              Default Making Charge
            </Label>

            <Input
              id="defaultMakingCharge"
              name="defaultMakingCharge"
              type="number"
              step="0.01"
              defaultValue={
                product?.defaultMakingCharge ?? ""
              }
              placeholder="0.00"
            />

            <ErrorText
              error={state.errors.defaultMakingCharge}
            />
          </div>

          <div>
            <Label htmlFor="defaultStoneCharge">
              Default Stone Charge
            </Label>

            <Input
              id="defaultStoneCharge"
              name="defaultStoneCharge"
              type="number"
              step="0.01"
              defaultValue={
                product?.defaultStoneCharge ?? ""
              }
              placeholder="0.00"
            />

            <ErrorText
              error={state.errors.defaultStoneCharge}
            />
          </div>

        </div>

      </div>
            {/* ============================
          PRODUCT DETAILS
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">
          Product Details
        </h3>

        <div className="grid gap-6 lg:grid-cols-3">

          <div>
            <Label htmlFor="designCode">
              Design Code
            </Label>

            <Input
              id="designCode"
              name="designCode"
              defaultValue={product?.designCode ?? ""}
              placeholder="RG-001"
            />

            <ErrorText
              error={state.errors.designCode}
            />
          </div>

          <div>
            <Label htmlFor="hsnCode">
              HSN Code
            </Label>

            <Input
              id="hsnCode"
              name="hsnCode"
              defaultValue={product?.hsnCode ?? ""}
              placeholder="7113"
            />

            <ErrorText
              error={state.errors.hsnCode}
            />
          </div>

          <div>
            <Label>Status</Label>

            <Select
              value={isActive}
              onValueChange={setIsActive}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="true">
                  Active
                </SelectItem>

                <SelectItem value="false">
                  Inactive
                </SelectItem>
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="isActive"
              value={isActive}
            />

            <ErrorText
              error={state.errors.isActive}
            />
          </div>

        </div>
      </div>

      {/* ============================
          ADDITIONAL INFORMATION
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">
          Additional Information
        </h3>

        <div className="space-y-5">

          <div>
            <Label htmlFor="description">
              Description
            </Label>

            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={product?.description ?? ""}
              placeholder="Product description..."
              className="min-h-[120px]"
            />

            <ErrorText
              error={state.errors.description}
            />
          </div>

          <div>
            <Label htmlFor="notes">
              Notes
            </Label>

            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={product?.notes ?? ""}
              placeholder="Internal notes..."
              className="min-h-[120px]"
            />

            <ErrorText
              error={state.errors.notes}
            />
          </div>

        </div>
      </div>

      {!state.success && state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div className="flex justify-end border-t pt-6">
        <Button
          type="submit"
          disabled={pending}
        >
          {pending
            ? mode === "create"
              ? "Creating..."
              : "Updating..."
            : mode === "create"
            ? "Create Product"
            : "Update Product"}
        </Button>
      </div>

    </div>
  );
}