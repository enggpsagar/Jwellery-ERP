"use client";

import { useEffect, useRef, useState } from "react";

import { PurityType } from "@prisma/client";

import type { ProductFormState } from "@/lib/inventory/product-types";
import { getStoreCategoryTypes } from "@/lib/actions/taxonomy-actions";

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

export type StoreMetalOption = {
  id: string;
  name: string;
  hasPurity: boolean;
};

export type StoreCategoryOption = {
  id: string;
  name: string;
};

export type StoreCategoryTypeOption = {
  id: string;
  categoryId: string;
  name: string;
};

type Product = {
  id?: string;
  productCode: string;
  name: string;
  categoryId: string | null;
  categoryTypeId: string | null;
  metalTypeId: string | null;
  defaultPurity: string | null;
  defaultMakingCharge: string | null;
  defaultMakingChargeType: "FIXED" | "PERCENTAGE" | null;
  defaultStoneCharge: string | null;
  defaultStoneChargeType: "FIXED" | "PERCENTAGE" | null;
  defaultGrossWeight: string | null;
  defaultNetWeight: string | null;
  defaultStoneWeight: string | null;
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
  metals: StoreMetalOption[];
  categories: StoreCategoryOption[];
};

function ErrorText({ error }: { error?: string[] }) {
  if (!error?.length) return null;

  return <p className="mt-1 text-sm text-red-600">{error[0]}</p>;
}

function ChargeTypeToggle({
  value,
  onChange,
}: {
  value: "FIXED" | "PERCENTAGE";
  onChange: (value: "FIXED" | "PERCENTAGE") => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5 text-xs">
      <Button
        type="button"
        size="sm"
        variant={value === "FIXED" ? "default" : "ghost"}
        className="h-6 px-2"
        onClick={() => onChange("FIXED")}
      >
        ₹
      </Button>

      <Button
        type="button"
        size="sm"
        variant={value === "PERCENTAGE" ? "default" : "ghost"}
        className="h-6 px-2"
        onClick={() => onChange("PERCENTAGE")}
      >
        %
      </Button>
    </div>
  );
}

export function ProductForm({
  mode,
  product,
  state,
  pending,
  metals,
  categories,
}: ProductFormProps) {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");

  const [categoryTypeId, setCategoryTypeId] = useState(
    product?.categoryTypeId ?? "",
  );

  const [metalTypeId, setMetalTypeId] = useState(product?.metalTypeId ?? "");

  const [types, setTypes] = useState<StoreCategoryTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  const previousCategoryIdRef = useRef(categoryId);

  const [defaultPurity, setDefaultPurity] = useState(
    product?.defaultPurity ?? "__none__",
  );

  const [isActive, setIsActive] = useState(
    product?.isActive === false ? "false" : "true",
  );

  // Create-only: offer to open the stock entry in the same step, so a new
  // product doesn't need a second trip to Inventory to become stockable.
  const [createStock, setCreateStock] = useState(false);

  const [defaultMakingChargeType, setDefaultMakingChargeType] = useState(
    product?.defaultMakingChargeType ?? "FIXED",
  );

  const [defaultStoneChargeType, setDefaultStoneChargeType] = useState(
    product?.defaultStoneChargeType ?? "FIXED",
  );

  // Net = gross - stone is how a jeweller works it out, so the field fills
  // itself in rather than making someone do the subtraction. It stops as
  // soon as the field is edited directly: an existing product already has a
  // net weight someone chose, and recomputing over it would quietly change
  // a figure that prices the piece.
  const [grossWeight, setGrossWeight] = useState(
    product?.defaultGrossWeight ?? "",
  );
  const [stoneWeight, setStoneWeight] = useState(
    product?.defaultStoneWeight ?? "",
  );
  const [netWeight, setNetWeight] = useState(product?.defaultNetWeight ?? "");
  const [netTouched, setNetTouched] = useState(
    Boolean(product?.defaultNetWeight),
  );

  const gross = Number(grossWeight);
  const stone = stoneWeight.trim() === "" ? 0 : Number(stoneWeight);

  const derivedNet =
    grossWeight.trim() !== "" &&
    Number.isFinite(gross) &&
    Number.isFinite(stone) &&
    gross - stone >= 0
      ? // Trailing zeros trimmed so the box reads 5.5 rather than 5.500,
        // while still respecting the column's three decimals.
        String(Number((gross - stone).toFixed(3)))
      : null;

  // Kept in an effect rather than derived straight into the input, because
  // the field has to stay editable once the user takes it over.
  useEffect(() => {
    if (netTouched) return;
    setNetWeight(derivedNet ?? "");
  }, [derivedNet, netTouched]);

  // Fetch the Types for whichever Category is currently selected, mirroring
  // the State -> City cascading pattern used on the Customer form.
  useEffect(() => {
    let cancelled = false;

    async function loadTypes() {
      if (!categoryId) {
        setTypes([]);
        return;
      }

      try {
        setLoadingTypes(true);
        const data = await getStoreCategoryTypes(categoryId);

        if (!cancelled) {
          setTypes(data || []);
        }
      } catch (err) {
        console.error("Failed to load category types:", err);
        if (!cancelled) {
          setTypes([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTypes(false);
        }
      }
    }

    loadTypes();

    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  // Only reset the selected Type when the Category actually changes as a
  // result of user interaction — not on initial mount (edit mode needs to
  // keep the product's existing Type selected while its Types load).
  useEffect(() => {
    if (previousCategoryIdRef.current !== categoryId) {
      setCategoryTypeId("");
      previousCategoryIdRef.current = categoryId;
    }
  }, [categoryId]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Basic Information</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="productCode">Product Code *</Label>

            <Input
              id="productCode"
              name="productCode"
              defaultValue={product?.productCode ?? ""}
              placeholder="RING-001"
            />

            <ErrorText error={state.errors.productCode} />
          </div>

          <div>
            <Label htmlFor="name">Product Name *</Label>

            <Input
              id="name"
              name="name"
              defaultValue={product?.name ?? ""}
              placeholder="Ladies Ring"
            />

            <ErrorText error={state.errors.name} />
          </div>

          <div>
            <Label>Category *</Label>

            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>

              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="categoryId" value={categoryId} />

            <ErrorText error={state.errors.categoryId} />
          </div>
          <div>
            <Label>Type</Label>

            <Select
              value={categoryTypeId || "__none__"}
              onValueChange={(value) =>
                setCategoryTypeId(value === "__none__" ? "" : value)
              }
              disabled={!categoryId || loadingTypes}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue
                  placeholder={
                    !categoryId
                      ? "Select a category first"
                      : loadingTypes
                        ? "Loading types..."
                        : "Select Type"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>

                {types.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="categoryTypeId"
              value={categoryTypeId}
            />

            <ErrorText error={state.errors.categoryTypeId} />
          </div>
        </div>
      </div>

      {/* ============================
          METAL DETAILS
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Metal Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label>Metal Type *</Label>

            <Select value={metalTypeId} onValueChange={setMetalTypeId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select metal type" />
              </SelectTrigger>

              <SelectContent>
                {metals.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="metalTypeId" value={metalTypeId} />

            <ErrorText error={state.errors.metalTypeId} />
          </div>

          <div>
            <Label>Default Purity</Label>

            <Select value={defaultPurity} onValueChange={setDefaultPurity}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select Purity" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>

                {Object.values(PurityType).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="hidden"
              name="defaultPurity"
              value={defaultPurity === "__none__" ? "" : defaultPurity}
            />

            <ErrorText error={state.errors.defaultPurity} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="defaultMakingCharge">Default Making Charge</Label>

              <ChargeTypeToggle
                value={defaultMakingChargeType}
                onChange={setDefaultMakingChargeType}
              />
            </div>

            <Input
              id="defaultMakingCharge"
              name="defaultMakingCharge"
              type="number"
              step="0.01"
              defaultValue={product?.defaultMakingCharge ?? ""}
              placeholder={defaultMakingChargeType === "PERCENTAGE" ? "0.00 %" : "0.00"}
            />

            <input
              type="hidden"
              name="defaultMakingChargeType"
              value={defaultMakingChargeType}
            />

            <ErrorText error={state.errors.defaultMakingCharge} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="defaultStoneCharge">Default Stone Charge</Label>

              <ChargeTypeToggle
                value={defaultStoneChargeType}
                onChange={setDefaultStoneChargeType}
              />
            </div>

            <Input
              id="defaultStoneCharge"
              name="defaultStoneCharge"
              type="number"
              step="0.01"
              defaultValue={product?.defaultStoneCharge ?? ""}
              placeholder={defaultStoneChargeType === "PERCENTAGE" ? "0.00 %" : "0.00"}
            />

            <input
              type="hidden"
              name="defaultStoneChargeType"
              value={defaultStoneChargeType}
            />

            <ErrorText error={state.errors.defaultStoneCharge} />
          </div>
        </div>
      </div>
      {/* ============================
          WEIGHTS
      ============================= */}

      <div className="rounded-xl border p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold">Weights</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Typical weights for this design. They prefill the stock entry, and
            each piece can still be corrected against the scale afterwards.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="defaultGrossWeight">Gross Weight (g)</Label>

            <Input
              id="defaultGrossWeight"
              name="defaultGrossWeight"
              type="number"
              step="0.001"
              min="0"
              value={grossWeight}
              onChange={(event) => setGrossWeight(event.target.value)}
              placeholder="0.000"
            />

            <ErrorText error={state.errors.defaultGrossWeight} />
          </div>

          <div>
            <Label htmlFor="defaultStoneWeight">Stone Weight (g)</Label>

            <Input
              id="defaultStoneWeight"
              name="defaultStoneWeight"
              type="number"
              step="0.001"
              min="0"
              value={stoneWeight}
              onChange={(event) => setStoneWeight(event.target.value)}
              placeholder="0.000"
            />

            <ErrorText error={state.errors.defaultStoneWeight} />
          </div>

          <div>
            <Label htmlFor="defaultNetWeight">Net Weight (g)</Label>

            <Input
              id="defaultNetWeight"
              name="defaultNetWeight"
              type="number"
              step="0.001"
              min="0"
              value={netWeight}
              onChange={(event) => {
                // Typing here takes ownership of the field — from this point
                // gross/stone stop driving it, so a deliberate figure is
                // never silently overwritten.
                setNetTouched(true);
                setNetWeight(event.target.value);
              }}
              placeholder="0.000"
            />

            {!netTouched && derivedNet !== null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Gross &minus; stone. Type to override.
              </p>
            ) : null}

            <ErrorText error={state.errors.defaultNetWeight} />
          </div>
        </div>
      </div>

      {/* ============================
          PRODUCT DETAILS
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Product Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="designCode">Design Code</Label>

            <Input
              id="designCode"
              name="designCode"
              defaultValue={product?.designCode ?? ""}
              placeholder="RG-001"
            />

            <ErrorText error={state.errors.designCode} />
          </div>

          <div>
            <Label htmlFor="hsnCode">HSN Code</Label>

            <Input
              id="hsnCode"
              name="hsnCode"
              defaultValue={product?.hsnCode ?? ""}
              placeholder="7113"
            />

            <ErrorText error={state.errors.hsnCode} />
          </div>

          <div>
            <Label>Status</Label>

            <Select value={isActive} onValueChange={setIsActive}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="true">Active</SelectItem>

                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <input type="hidden" name="isActive" value={isActive} />

            <ErrorText error={state.errors.isActive} />
          </div>
        </div>
      </div>

      {/* ============================
          ADDITIONAL INFORMATION
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Additional Information</h3>

        <div className="space-y-5">
          <div>
            <Label htmlFor="description">Description</Label>

            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={product?.description ?? ""}
              placeholder="Product description..."
              className="min-h-[120px]"
            />

            <ErrorText error={state.errors.description} />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>

            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={product?.notes ?? ""}
              placeholder="Internal notes..."
              className="min-h-[120px]"
            />

            <ErrorText error={state.errors.notes} />
          </div>
        </div>
      </div>

      {mode === "create" && (
        <div className="rounded-xl border p-6">
          <h3 className="mb-1 text-lg font-semibold">Stock entry</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Metal, purity and charges come from this product, so a stock entry
            started here needs nothing but a quantity.
          </p>

          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="createStockEntry"
              value="true"
              checked={createStock}
              onChange={(event) => setCreateStock(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Do you want to create a stock entry as well?
          </label>

          {createStock && (
            <div className="mt-4 max-w-xs">
              <Label htmlFor="stockQuantity">Quantity</Label>
              <Input
                id="stockQuantity"
                name="stockQuantity"
                type="number"
                min="0"
                step="1"
                placeholder="0"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Leave blank and the entry is created with a quantity of 0 —
                the product is stockable, with none on hand yet.
              </p>
              <ErrorText error={state.errors.stockQuantity} />
            </div>
          )}
        </div>
      )}

      {state.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.success
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}
      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={pending}>
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
