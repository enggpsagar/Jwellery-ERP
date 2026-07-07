"use client";

import { useState } from "react";

import { InventoryStockStatus, MetalType, PurityType } from "@prisma/client";

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

type ProductOption = {
  id: string;
  productCode: string;
  name: string;
  category: string | null;
  ornamentType: string | null;
  metalType: string | null;
  defaultPurity: string | null;
};

type Stock = {
  id?: string;

  productId: string;

  stockCode: string;

  tagNumber: string | null;

  metalType: string;

  purity: string | null;

  status: string;

  quantity: number;

  grossWeight: string | null;

  lessWeight: string | null;

  netWeight: string | null;

  stoneWeight: string | null;

  wastagePercent: string | null;

  purchaseRate: string | null;

  saleRate: string | null;

  makingCharge: string | null;

  stoneCharge: string | null;

  otherCharge: string | null;

  purchaseAmount: string | null;

  saleAmount: string | null;

  vendorName: string | null;

  purchaseDate: string | null;

  location: string | null;

  remarks: string | null;

  isActive: boolean;
};

type StockFormProps = {
  mode: "create" | "edit";

  stock?: Stock;

  products: ProductOption[];

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
  state,
  pending,
}: StockFormProps) {
  const [productId, setProductId] = useState(stock?.productId ?? "");

  const [metalType, setMetalType] = useState(
    stock?.metalType ?? MetalType.GOLD,
  );

  const [purity, setPurity] = useState(stock?.purity ?? "__none__");

  const [status, setStatus] = useState(
    stock?.status ?? InventoryStockStatus.IN_STOCK,
  );

  const [isActive, setIsActive] = useState(
    stock?.isActive === false ? "false" : "true",
  );

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

            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select Product" />
              </SelectTrigger>

              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.productCode} - {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="productId" value={productId} />

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

          <div>
            <Label>Metal Type</Label>

            <Select value={metalType} onValueChange={setMetalType}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {Object.values(MetalType).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input type="hidden" name="metalType" value={metalType} />
          </div>

          <div>
            <Label>Purity</Label>

            <Select value={purity} onValueChange={setPurity}>
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
              name="purity"
              value={purity === "__none__" ? "" : purity}
            />
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
              defaultValue={stock?.grossWeight ?? ""}
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
              defaultValue={stock?.netWeight ?? ""}
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
              defaultValue={stock?.stoneWeight ?? ""}
            />

            <ErrorText error={state.errors.stoneWeight} />
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
              defaultValue={stock?.purchaseRate ?? ""}
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

          <div>
            <Label htmlFor="makingCharge">Making Charge</Label>

            <Input
              id="makingCharge"
              name="makingCharge"
              type="number"
              step="0.01"
              defaultValue={stock?.makingCharge ?? ""}
            />

            <ErrorText error={state.errors.makingCharge} />
          </div>

          <div>
            <Label htmlFor="stoneCharge">Stone Charge</Label>

            <Input
              id="stoneCharge"
              name="stoneCharge"
              type="number"
              step="0.01"
              defaultValue={stock?.stoneCharge ?? ""}
            />

            <ErrorText error={state.errors.stoneCharge} />
          </div>

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
            <Label htmlFor="location">Location</Label>

            <Input
              id="location"
              name="location"
              defaultValue={stock?.location ?? ""}
              placeholder="Store / Locker"
            />

            <ErrorText error={state.errors.location} />
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
