"use client";

import { useEffect, useState } from "react";

import {
  InventoryStockStatus,
  InventoryFinish,
  ChargeType,
} from "@prisma/client";

import type { StockFormState } from "@/lib/inventory/stock-types";

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

import { ProductSelect } from "@/components/inventory/shared/product-select";
import { LocationSelect } from "@/components/shared/location-select";

type LocationOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  productCode: string;
  name: string;
  category: { id: string; name: string } | null;
  categoryType: { id: string; name: string } | null;
  metalType: { id: string; name: string } | null;
  defaultPurity: string | null;
  defaultMakingCharge: string | null;
  defaultStoneCharge: string | null;
  defaultGrossWeight: string | null;
  defaultNetWeight: string | null;
  defaultStoneWeight: string | null;
  isActive: boolean;
};

type Stock = {
  id?: string;

  productId: string;

  stockCode: string;

  tagNumber: string | null;

  metalTypeId: string | null;

  purity: string | null;

  status: string;

  finish: string;

  quantity: number;

  grossWeight: string | null;

  lessWeight: string | null;

  netWeight: string | null;

  stoneWeight: string | null;

  dmoWeight: string | null;

  wastagePercent: string | null;

  purchaseRate: string | null;

  saleRate: string | null;

  makingCharge: string | null;

  makingChargeType: ChargeType | null;

  stoneCharge: string | null;

  otherCharge: string | null;

  purchaseAmount: string | null;

  saleAmount: string | null;

  vendorName: string | null;

  purchaseDate: string | null;

  manufactureDate: string | null;

  locationId: string | null;

  remarks: string | null;

  isActive: boolean;
};

type StockFormProps = {
  mode: "create" | "edit";

  stock?: Stock;

  products: ProductOption[];

  locations: LocationOption[];

  state: StockFormState;

  pending: boolean;
};

function ErrorText({ error }: { error?: string[] }) {
  if (!error?.length) return null;

  return <p className="mt-1 text-sm text-red-600">{error[0]}</p>;
}

export function StockForm({
  mode,
  stock,
  products,
  locations,
  state,
  pending,
}: StockFormProps) {
  const [status, setStatus] = useState(
    stock?.status ?? InventoryStockStatus.IN_STOCK,
  );

  const [locationId, setLocationId] = useState(stock?.locationId ?? "");

  const [finish, setFinish] = useState(
    stock?.finish ?? InventoryFinish.KACHA,
  );

  const [isActive, setIsActive] = useState(
    stock?.isActive === false ? "false" : "true",
  );

  // Controlled so `MakingChargeInput` can react to them live for its %
  // calculation (rate x netWeight) — every other Pricing Details field stays
  // an uncontrolled `defaultValue` input, these two are the exception.
  const [purchaseRate, setPurchaseRate] = useState(stock?.purchaseRate ?? "");
  const [netWeight, setNetWeight] = useState(stock?.netWeight ?? "");
  const [grossWeight, setGrossWeight] = useState(stock?.grossWeight ?? "");
  const [stoneWeight, setStoneWeight] = useState(stock?.stoneWeight ?? "");

  // Weights follow the selected product until someone weighs the piece.
  //
  // Locked as a group rather than field by field: gross, stone and net are
  // one measurement (net = gross - stone), so filling two from a product and
  // keeping the third from a different one would produce a set that does not
  // add up. Editing an existing stock row starts locked — those numbers came
  // off a scale and must not be overwritten by picking a product.
  const [weightsTouched, setWeightsTouched] = useState(Boolean(stock?.id));

  function editWeight(setter: (value: string) => void) {
    return (value: string) => {
      setWeightsTouched(true);
      setter(value);
    };
  }

  // Metal, purity and the two charges are no longer entered here — the
  // server copies them from the product. This only tracks which product is
  // picked so the read-only summary can show what will be inherited.
  const [selectedProductId, setSelectedProductId] = useState(
    stock?.productId ?? "",
  );

  const selectedProduct = products.find((item) => item.id === selectedProductId);

  // Seed the weights from the chosen product, and keep following it while the
  // fields are untouched, so switching product corrects them rather than
  // leaving the previous product's figures behind.
  useEffect(() => {
    if (weightsTouched || !selectedProduct) return;

    setGrossWeight(selectedProduct.defaultGrossWeight ?? "");
    setNetWeight(selectedProduct.defaultNetWeight ?? "");
    setStoneWeight(selectedProduct.defaultStoneWeight ?? "");
  }, [selectedProduct, weightsTouched]);

  // `ProductSelect` is a shared component whose `ProductOption` type
  // expects `category`/`ornamentType`/`metalType` as display strings, not
  // the relation objects this form works with — flatten to names for it,
  // the full `products` array (with ids) is still used for the lookup in
  // `applyProductDefaults` above.
  const productSelectOptions = products.map((product) => ({
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    category: product.category?.name ?? null,
    ornamentType: product.categoryType?.name ?? null,
    metalType: product.metalType?.name ?? null,
    defaultPurity: product.defaultPurity,
    isActive: product.isActive,
  }));

  return (
    <div className="space-y-8">
      {/* ============================
          STOCK INFORMATION
      ============================ */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Stock Information</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label>Product *</Label>

            <ProductSelect
              products={productSelectOptions}
              name="productId"
              defaultValue={stock?.productId}
              placeholder="Select Product"
              onChange={(productId) => setSelectedProductId(productId)}
            />

            <ErrorText error={state.errors.productId} />
          </div>

          <div>
            <Label htmlFor="stockCode">Stock Code *</Label>

            <Input
              id="stockCode"
              name="stockCode"
              defaultValue={stock?.stockCode ?? ""}
              placeholder="STK-0001"
            />

            <ErrorText error={state.errors.stockCode} />
          </div>

          <div>
            <Label htmlFor="tagNumber">Tag Number</Label>

            <Input
              id="tagNumber"
              name="tagNumber"
              defaultValue={stock?.tagNumber ?? ""}
              placeholder="TAG-001"
            />

            <ErrorText error={state.errors.tagNumber} />
          </div>

          {/*
            Metal, purity, making charge and stone charge are NOT asked for
            here. They are defined once on the product and copied onto the
            stock row server-side, so the same information is never entered
            twice. Shown read-only so it stays clear what the saved row will
            carry — to change any of it, edit the product.
          */}
          <div className="lg:col-span-3">
            <Label>From the product</Label>

            {selectedProduct ? (
              <dl className="mt-1.5 grid gap-x-6 gap-y-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Metal
                  </dt>
                  <dd className="font-medium">
                    {selectedProduct.metalType?.name ?? (
                      <span className="text-destructive">Not set</span>
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Purity
                  </dt>
                  <dd className="font-medium">
                    {selectedProduct.defaultPurity?.replaceAll("_", " ") ?? "—"}
                  </dd>
                </div>

                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Making charge
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {selectedProduct.defaultMakingCharge ?? "—"}
                  </dd>
                </div>

                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Stone charge
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {selectedProduct.defaultStoneCharge ?? "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1.5 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Pick a product and its metal, purity and charges are applied
                automatically.
              </p>
            )}

            <ErrorText error={state.errors.metalTypeId} />
          </div>

          <div>
            <Label>Status</Label>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {Object.values(InventoryStockStatus).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="status" value={status} />
          </div>

          <div>
            <Label>Finish</Label>

            <Select value={finish} onValueChange={setFinish}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {Object.values(InventoryFinish).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item === "PAKKA" ? "Pakka / Hallmarked" : "Kacha"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="finish" value={finish} />
          </div>
        </div>
      </div>
      {/* ============================
          WEIGHT DETAILS
      ============================ */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Weight Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="quantity">Quantity</Label>

            <Input
              id="quantity"
              name="quantity"
              type="number"
              min="1"
              defaultValue={stock?.quantity ?? 1}
            />

            <ErrorText error={state.errors.quantity} />
          </div>

          <div>
            <Label htmlFor="grossWeight">Gross Weight (gm)</Label>

            <Input
              id="grossWeight"
              name="grossWeight"
              type="number"
              step="0.001"
              value={grossWeight}
              onChange={(event) => editWeight(setGrossWeight)(event.target.value)}
            />

            <ErrorText error={state.errors.grossWeight} />
          </div>

          <div>
            <Label htmlFor="lessWeight">Less Weight (gm)</Label>

            <Input
              id="lessWeight"
              name="lessWeight"
              type="number"
              step="0.001"
              defaultValue={stock?.lessWeight ?? ""}
            />

            <ErrorText error={state.errors.lessWeight} />
          </div>

          <div>
            <Label htmlFor="netWeight">Net Weight (gm)</Label>

            <Input
              id="netWeight"
              name="netWeight"
              type="number"
              step="0.001"
              value={netWeight}
              onChange={(event) => editWeight(setNetWeight)(event.target.value)}
            />

            <ErrorText error={state.errors.netWeight} />
          </div>

          <div>
            <Label htmlFor="stoneWeight">Stone Weight (gm)</Label>

            <Input
              id="stoneWeight"
              name="stoneWeight"
              type="number"
              step="0.001"
              value={stoneWeight}
              onChange={(event) => editWeight(setStoneWeight)(event.target.value)}
            />

            <ErrorText error={state.errors.stoneWeight} />
          </div>

          <div>
            <Label htmlFor="dmoWeight">Dust/Making/Other Wt (g)</Label>

            <Input
              id="dmoWeight"
              name="dmoWeight"
              type="number"
              step="0.001"
              defaultValue={stock?.dmoWeight ?? ""}
            />

            <ErrorText error={state.errors.dmoWeight} />
          </div>

          <div>
            <Label htmlFor="wastagePercent">Wastage %</Label>

            <Input
              id="wastagePercent"
              name="wastagePercent"
              type="number"
              step="0.01"
              defaultValue={stock?.wastagePercent ?? ""}
            />

            <ErrorText error={state.errors.wastagePercent} />
          </div>
        </div>
      </div>
      {/* ============================
          PRICING DETAILS
      ============================ */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Pricing Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="purchaseRate">Purchase Rate</Label>

            <Input
              id="purchaseRate"
              name="purchaseRate"
              type="number"
              step="0.01"
              value={purchaseRate}
              onChange={(event) => setPurchaseRate(event.target.value)}
            />

            <ErrorText error={state.errors.purchaseRate} />
          </div>

          <div>
            <Label htmlFor="saleRate">Sale Rate</Label>

            <Input
              id="saleRate"
              name="saleRate"
              type="number"
              step="0.01"
              defaultValue={stock?.saleRate ?? ""}
            />

            <ErrorText error={state.errors.saleRate} />
          </div>

          {/* Making charge and stone charge come from the product's defaults
              (see the note in Stock Information above). */}

          <div>
            <Label htmlFor="otherCharge">Other Charge</Label>

            <Input
              id="otherCharge"
              name="otherCharge"
              type="number"
              step="0.01"
              defaultValue={stock?.otherCharge ?? ""}
            />

            <ErrorText error={state.errors.otherCharge} />
          </div>

          <div>
            <Label htmlFor="purchaseAmount">Purchase Amount</Label>

            <Input
              id="purchaseAmount"
              name="purchaseAmount"
              type="number"
              step="0.01"
              defaultValue={stock?.purchaseAmount ?? ""}
            />

            <ErrorText error={state.errors.purchaseAmount} />
          </div>

          <div>
            <Label htmlFor="saleAmount">Sale Amount</Label>

            <Input
              id="saleAmount"
              name="saleAmount"
              type="number"
              step="0.01"
              defaultValue={stock?.saleAmount ?? ""}
            />

            <ErrorText error={state.errors.saleAmount} />
          </div>
        </div>
      </div>
      {/* ============================
          PURCHASE DETAILS
      ============================ */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Purchase Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="vendorName">Vendor Name</Label>

            <Input
              id="vendorName"
              name="vendorName"
              defaultValue={stock?.vendorName ?? ""}
              placeholder="Vendor Name"
            />

            <ErrorText error={state.errors.vendorName} />
          </div>

          <div>
            <Label htmlFor="purchaseDate">Purchase Date</Label>

            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={
                stock?.purchaseDate
                  ? new Date(stock.purchaseDate).toISOString().substring(0, 10)
                  : ""
              }
            />

            <ErrorText error={state.errors.purchaseDate} />
          </div>

          <div>
            <Label htmlFor="manufactureDate">Date of Manufacture</Label>

            <Input
              id="manufactureDate"
              name="manufactureDate"
              type="date"
              defaultValue={
                stock?.manufactureDate
                  ? new Date(stock.manufactureDate).toISOString().substring(0, 10)
                  : ""
              }
            />

            <ErrorText error={state.errors.manufactureDate} />
          </div>

          <div>
            <Label>Location</Label>

            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />

            <ErrorText error={state.errors.locationId} />
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

        <div className="mt-6">
          <Label htmlFor="remarks">Remarks</Label>

          <Textarea
            id="remarks"
            name="remarks"
            rows={5}
            defaultValue={stock?.remarks ?? ""}
            placeholder="Additional remarks..."
            className="min-h-[120px]"
          />

          <ErrorText error={state.errors.remarks} />
        </div>
      </div>

      {!state.success && state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Saving..."
              : "Updating..."
            : mode === "create"
              ? "Add Stock"
              : "Update Stock"}
        </Button>
      </div>
    </div>
  );
}
