"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  InventoryStockStatus,
  InventoryFinish,
  ChargeType,
  type PurityType,
} from "@prisma/client";

import type { StockFormState } from "@/lib/inventory/stock-types";
import { isCaratWeighedMetal, resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity";
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions";

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
import { CustomerSelect } from "@/components/customers/customer-select";
import { LocationSelect, useShowLocationField } from "@/components/shared/location-select";
import { RequiredMark } from "@/components/shared/required-mark"

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
  defaultCaratWeight: string | null;
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

  caratWeight: string | null;

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
};

type StockFormProps = {
  mode: "create" | "edit";

  stock?: Stock;

  products: ProductOption[];

  locations: LocationOption[];

  /** Create-only — the store's configured default location (Settings >
   * Locations), pre-selected in the Location picker so a new stock entry
   * doesn't start blank. Not used in edit mode: an existing stock entry's
   * saved location is untouched by this. */
  defaultLocationId?: string | null;

  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules) — see the same prop on InvoiceForm. */
  caratConversionRates: Record<PurityType, number>;

  /** Every metal/stone (Settings > Taxonomy), for the selected product's
   * configured Primary Unit — see the Weight Unit toggle below. */
  metals: StoreMetalRow[];

  /** Active Parties flagged as a Supplier, for the Vendor Name picker
   * below — same isSupplier scoping as the Suppliers list/Purchases'
   * own Vendor field. */
  suppliers: { id: string; name: string; phone: string | null }[];

  /** Create-only — the next sequential STK-{year}-{0001} code (see
   * getNextStockCode), pre-filling Stock Code so it's never a blank
   * required field on a fresh entry. Still a plain editable text input —
   * a store owner can always replace it with their own code. */
  nextStockCode?: string;

  state: StockFormState;

  pending: boolean;

  /** The enclosing <form> element, owned by the parent (StockCreateForm) —
   * threaded down so this component can read/restore its own uncontrolled
   * fields (tagNumber, saleRate, purchaseDate, etc.) around a detour to
   * "Add New Product". Create-only; edit mode has no such detour. */
  formRef?: React.RefObject<HTMLFormElement | null>;
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
  defaultLocationId,
  caratConversionRates,
  metals,
  suppliers,
  nextStockCode,
  state,
  pending,
  formRef,
}: StockFormProps) {
  const showLocationField = useShowLocationField(locations.length);
  const [status, setStatus] = useState(
    stock?.status ?? InventoryStockStatus.IN_STOCK,
  );

  // Edit mode always keeps the stock entry's own saved location. Create
  // mode falls back to the store's configured default only when nothing
  // else has already resolved a value (there's no other auto-pick logic in
  // this form today — see stock-create-form.tsx / new/page.tsx).
  const [locationId, setLocationId] = useState(
    stock?.locationId ?? defaultLocationId ?? "",
  );

  const [finish, setFinish] = useState(
    stock?.finish ?? InventoryFinish.KACHA,
  );

  // Controlled so Purchase/Sale Amount can auto-calculate from them live.
  const [purchaseRate, setPurchaseRate] = useState(stock?.purchaseRate ?? "");
  const [saleRate, setSaleRate] = useState(stock?.saleRate ?? "");
  const [otherCharge, setOtherCharge] = useState(stock?.otherCharge ?? "");
  const [purchaseAmount, setPurchaseAmount] = useState(stock?.purchaseAmount ?? "");
  const [saleAmount, setSaleAmount] = useState(stock?.saleAmount ?? "");
  // Locks the auto-calc the moment the amount itself is hand-edited — same
  // one-way "touched" convention as netTouched/weightsTouched below. Starts
  // locked on an existing saved row so opening it for edit never silently
  // recomputes a figure that came off a real bill.
  const [purchaseAmountTouched, setPurchaseAmountTouched] = useState(Boolean(stock?.id));
  const [saleAmountTouched, setSaleAmountTouched] = useState(Boolean(stock?.id));
  // Vendor Name stays a free-text column (no schema change) -- the picker
  // below just suggests names from the actual Supplier list instead of a
  // blank text box, storing whichever name was picked (or typed via "Add
  // New") straight into it.
  const [vendorName, setVendorName] = useState(stock?.vendorName ?? "");
  const [netWeight, setNetWeight] = useState(stock?.netWeight ?? "");
  const [grossWeight, setGrossWeight] = useState(stock?.grossWeight ?? "");
  const [stoneWeight, setStoneWeight] = useState(stock?.stoneWeight ?? "");
  const [lessWeight, setLessWeight] = useState(stock?.lessWeight ?? "");

  // Diamond/Stone stock is weighed by carat, not gram — converts into Net
  // Weight directly (same 1 ct = 0.2 g convention as the Product form and
  // every purchase/sale line-item form).
  const [caratWeight, setCaratWeight] = useState(stock?.caratWeight ?? "");

  // Net = gross - less - stone, the same subtraction a jeweller does by
  // hand — mirrors the auto-fill on the Product form. Active on both
  // create and edit (a change to any deduction field recomputes Net
  // Weight even over an existing saved value); stops only once Net
  // Weight itself is edited directly in this session.
  const [netTouched, setNetTouched] = useState(false);

  function toNum(value: string) {
    const trimmed = value.trim();
    return trimmed === "" ? 0 : Number(trimmed);
  }

  function deriveNet(gross: string, less: string, stone: string) {
    if (gross.trim() === "" || !Number.isFinite(Number(gross))) return null;
    const net = toNum(gross) - toNum(less) - toNum(stone);
    return net >= 0 ? String(Number(net.toFixed(3))) : null;
  }

  function editGrossWeight(value: string) {
    setWeightsTouched(true);
    setGrossWeight(value);
    if (netTouched) return;
    const derived = deriveNet(value, lessWeight, stoneWeight);
    if (derived !== null) setNetWeight(derived);
  }

  function editLessWeight(value: string) {
    setWeightsTouched(true);
    setLessWeight(value);
    if (netTouched) return;
    const derived = deriveNet(grossWeight, value, stoneWeight);
    if (derived !== null) setNetWeight(derived);
  }

  function editStoneWeight(value: string) {
    setWeightsTouched(true);
    setStoneWeight(value);
    if (netTouched) return;
    const derived = deriveNet(grossWeight, lessWeight, value);
    if (derived !== null) setNetWeight(derived);
  }

  function editNetWeight(value: string) {
    setWeightsTouched(true);
    setNetTouched(true);
    setNetWeight(value);

    if (!isCaratFamily) return;

    const netNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(netNum)) {
      const gramsPerCarat = resolveGramsPerCarat(selectedProduct?.defaultPurity, caratConversionRates);
      setCaratWeight(String(Number((netNum / gramsPerCarat).toFixed(3))));
    } else {
      setCaratWeight("");
    }
  }

  function editCaratWeight(value: string) {
    setWeightsTouched(true);
    setCaratWeight(value);

    const caratNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(caratNum)) {
      setNetTouched(true);
      const gramsPerCarat = resolveGramsPerCarat(selectedProduct?.defaultPurity, caratConversionRates);
      setNetWeight(String(Number((caratNum * gramsPerCarat).toFixed(5))));
    }
  }

  // Weights follow the selected product until someone weighs the piece.
  //
  // Locked as a group rather than field by field: gross, stone and net are
  // one measurement (net = gross - stone), so filling two from a product and
  // keeping the third from a different one would produce a set that does not
  // add up. Editing an existing stock row starts locked — those numbers came
  // off a scale and must not be overwritten by picking a product.
  const [weightsTouched, setWeightsTouched] = useState(Boolean(stock?.id));

  // Metal, purity and the two charges are no longer entered here — the
  // server copies them from the product. This only tracks which product is
  // picked so the read-only summary can show what will be inherited.
  const [selectedProductId, setSelectedProductId] = useState(
    stock?.productId ?? "",
  );

  // Re-mount key for ProductSelect after a restore — it only seeds its own
  // internal selection from `defaultValue` on first mount, same reason
  // purchase-form.tsx bumps its own productSelectKeys after restoring.
  const [productSelectKey, setProductSelectKey] = useState(0);

  const selectedProduct = products.find((item) => item.id === selectedProductId);

  // Same Diamond/Stone signal as product-form.tsx's classifyPurityFamily —
  // gates the Carat Weight field and its conversion against Net Weight.
  const isCaratFamily = isCaratWeighedMetal(selectedProduct?.metalType?.name);

  // The selected product's metal's configured Primary Unit (Settings >
  // Taxonomy) — what Gross/Less/Net/Stone/Dust weight are actually
  // persisted in, regardless of which unit the toggle below is currently
  // showing for entry convenience.
  const primaryUnit = metals.find((m) => m.id === selectedProduct?.metalType?.id)?.primaryUnit ?? "GRAM";
  const gramsPerCarat = resolveGramsPerCarat(selectedProduct?.defaultPurity, caratConversionRates);

  // The quantity Purchase/Sale Rate is actually priced against — carat for
  // a Diamond/Stone piece (rate per carat), net weight (grams) otherwise,
  // same convention invoice-form.tsx's lineQuantity uses.
  const pricedWeight = isCaratFamily ? toNum(caratWeight) : toNum(netWeight);

  // Purchase Amount = Purchase Rate × priced weight + Other Charge. Follows
  // live while untouched, same one-way lock as Net Weight's own auto-fill —
  // stops the moment Purchase Amount itself is hand-edited.
  useEffect(() => {
    if (purchaseAmountTouched) return;
    if (purchaseRate.trim() === "" && otherCharge.trim() === "") {
      setPurchaseAmount("");
      return;
    }
    const amount = toNum(purchaseRate) * pricedWeight + toNum(otherCharge);
    setPurchaseAmount(String(Number(amount.toFixed(2))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseRate, otherCharge, pricedWeight, purchaseAmountTouched]);

  // Sale Amount = Sale Rate × priced weight. Same auto-fill/lock convention.
  useEffect(() => {
    if (saleAmountTouched) return;
    if (saleRate.trim() === "") {
      setSaleAmount("");
      return;
    }
    const amount = toNum(saleRate) * pricedWeight;
    setSaleAmount(String(Number(amount.toFixed(2))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleRate, pricedWeight, saleAmountTouched]);

  // Picking a Product used to only inherit Metal/Purity/Making/Stone
  // Charge (copied server-side at submission, never shown here) -- every
  // weight field stayed blank, forcing a re-type of numbers the product
  // already has on file. Now pulls the product's own typical Gross/Stone/
  // Carat/Net Weight in as a starting point. Net Weight is deliberately
  // left un-"touched" afterward (not marked netTouched) so it keeps
  // auto-recomputing if this specific piece's Gross/Less/Stone weight
  // ends up adjusted, same as any other product-defaults case. Guarded so
  // it only runs once per product pick, never in edit mode (an existing
  // stock row's own saved weights always win), and never over weights the
  // user has already started typing.
  const appliedProductDefaultsRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "create" || !selectedProductId || !selectedProduct) return;
    if (appliedProductDefaultsRef.current === selectedProductId) return;
    appliedProductDefaultsRef.current = selectedProductId;
    if (weightsTouched) return;

    if (selectedProduct.defaultGrossWeight) setGrossWeight(selectedProduct.defaultGrossWeight);
    if (selectedProduct.defaultStoneWeight) setStoneWeight(selectedProduct.defaultStoneWeight);
    if (isCaratFamily && selectedProduct.defaultCaratWeight) setCaratWeight(selectedProduct.defaultCaratWeight);
    if (selectedProduct.defaultNetWeight) setNetWeight(selectedProduct.defaultNetWeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  // One shared toggle for the whole Weight Details section, not one per
  // field — every weight here describes the same physical piece/metal, so
  // a per-field unit would just be more clicks for no real benefit (unlike
  // a multi-line document where Stone Weight can genuinely differ in
  // nature from the metal's own weight). Defaults to the metal's Primary
  // Unit; a store owner can still switch it to enter a one-off weighing in
  // the other unit — the value is always converted to Primary Unit at
  // submit (see the hidden inputs below) regardless of what's shown here.
  const [weightUnit, setWeightUnit] = useState<"GRAM" | "CARAT">(primaryUnit);

  function displayWeight(grams: string) {
    if (grams.trim() === "" || !Number.isFinite(Number(grams))) return "";
    return String(toPrimaryUnit(Number(grams), "GRAM", weightUnit, gramsPerCarat));
  }

  function toGramsString(typed: string) {
    if (typed.trim() === "" || !Number.isFinite(Number(typed))) return "";
    return String(toPrimaryUnit(Number(typed), weightUnit, "GRAM", gramsPerCarat));
  }

  // The actual submitted value — the metal's real configured Primary Unit,
  // independent of whatever weightUnit the toggle happens to be showing.
  function submittedWeight(grams: string) {
    if (grams.trim() === "" || !Number.isFinite(Number(grams))) return "";
    return String(toPrimaryUnit(Number(grams), "GRAM", primaryUnit, gramsPerCarat));
  }

  // Seed the weights from the chosen product, and keep following it while the
  // fields are untouched, so switching product corrects them rather than
  // leaving the previous product's figures behind.
  useEffect(() => {
    if (weightsTouched || !selectedProduct) return;

    setGrossWeight(selectedProduct.defaultGrossWeight ?? "");
    setNetWeight(selectedProduct.defaultNetWeight ?? "");
    setStoneWeight(selectedProduct.defaultStoneWeight ?? "");
    setCaratWeight(selectedProduct.defaultCaratWeight ?? "");
    setWeightUnit(primaryUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, weightsTouched]);

  const searchParams = useSearchParams();

  /**
   * Parks the whole in-progress new stock entry before navigating off to
   * "Add New Product" — without this, that detour would silently throw
   * away every field already typed. Same technique as purchase-form.tsx's
   * own saveDraft: controlled fields come from React state, the handful of
   * plain uncontrolled inputs (tagNumber, saleRate, purchaseDate, ...) are
   * read directly off the form element via formRef.
   */
  function saveDraft() {
    if (mode !== "create") return;

    const form = formRef?.current;
    const field = (name: string) =>
      form ? String((form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "") : "";

    const draft = {
      selectedProductId,
      status,
      finish,
      locationId,
      weightUnit,
      weightsTouched,
      netTouched,
      grossWeight,
      lessWeight,
      netWeight,
      stoneWeight,
      caratWeight,
      purchaseRate,
      saleRate,
      otherCharge,
      purchaseAmount,
      saleAmount,
      purchaseAmountTouched,
      saleAmountTouched,
      stockCode: field("stockCode"),
      tagNumber: field("tagNumber"),
      quantity: field("quantity"),
      vendorName: field("vendorName"),
      purchaseDate: field("purchaseDate"),
      manufactureDate: field("manufactureDate"),
      remarks: field("remarks"),
    };

    try {
      sessionStorage.setItem("stock-form-draft", JSON.stringify(draft));
    } catch {
      // A full/blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: reads any parked draft, applies the
  // newly-created product, and refills every field.
  const restoredRef = useRef(false);

  useEffect(() => {
    if (mode !== "create" || restoredRef.current) return;
    restoredRef.current = true;

    const newProductId = searchParams.get("newProductId");
    if (!newProductId) return;

    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("stock-form-draft");
      if (raw) sessionStorage.removeItem("stock-form-draft");
    } catch {
      raw = null;
    }
    if (!raw) return;

    let draft: Record<string, string | boolean> | null = null;
    try {
      draft = JSON.parse(raw);
    } catch {
      draft = null;
    }
    if (!draft) return;

    const str = (key: string, fallback = "") => (typeof draft?.[key] === "string" ? (draft[key] as string) : fallback);
    const bool = (key: string, fallback = false) => (typeof draft?.[key] === "boolean" ? (draft[key] as boolean) : fallback);

    setSelectedProductId(newProductId);
    setStatus(str("status", InventoryStockStatus.IN_STOCK) as InventoryStockStatus);
    setFinish(str("finish", InventoryFinish.KACHA) as InventoryFinish);
    setLocationId(str("locationId"));
    setWeightUnit(str("weightUnit", "GRAM") as "GRAM" | "CARAT");
    setWeightsTouched(bool("weightsTouched", true));
    setNetTouched(bool("netTouched"));
    setGrossWeight(str("grossWeight"));
    setLessWeight(str("lessWeight"));
    setNetWeight(str("netWeight"));
    setStoneWeight(str("stoneWeight"));
    setCaratWeight(str("caratWeight"));
    setPurchaseRate(str("purchaseRate"));
    setSaleRate(str("saleRate"));
    setOtherCharge(str("otherCharge"));
    setPurchaseAmountTouched(bool("purchaseAmountTouched"));
    setSaleAmountTouched(bool("saleAmountTouched"));
    setPurchaseAmount(str("purchaseAmount"));
    setSaleAmount(str("saleAmount"));

    if (formRef?.current) {
      const restoreField = (name: string, value: string) => {
        const el = formRef.current?.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (el && value) el.value = value;
      };
      restoreField("stockCode", str("stockCode"));
      restoreField("tagNumber", str("tagNumber"));
      restoreField("quantity", str("quantity"));
      restoreField("vendorName", str("vendorName"));
      restoreField("purchaseDate", str("purchaseDate"));
      restoreField("manufactureDate", str("manufactureDate"));
      restoreField("remarks", str("remarks"));
    }

    // ProductSelect only seeds its own selection from `defaultValue` on
    // first mount — remount it so the restored pick actually shows.
    setProductSelectKey((key) => key + 1);

    // Strip the one-shot param via history rather than router.replace, so
    // Next doesn't re-render the route and undo what was just restored.
    window.history.replaceState({}, "", "/inventory/stock/new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-selects the Product when arriving here from the Stock list with a
  // row already selected (its Add Stock button carries ?productId=...) --
  // a much simpler case than the newProductId restore above, since there's
  // no in-progress draft to restore, just a starting pick to seed once.
  useEffect(() => {
    if (mode !== "create") return;

    const productId = searchParams.get("productId");
    if (!productId) return;

    setSelectedProductId(productId);
    // ProductSelect only seeds its own selection from `defaultValue` on
    // first mount -- remount it so the pre-selected pick actually shows.
    setProductSelectKey((key) => key + 1);

    window.history.replaceState({}, "", "/inventory/stock/new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <Label>Product <RequiredMark /></Label>

            <ProductSelect
              key={productSelectKey}
              products={productSelectOptions}
              name="productId"
              defaultValue={mode === "create" ? selectedProductId : stock?.productId}
              placeholder="Select Product"
              onChange={(productId) => setSelectedProductId(productId)}
              {...(mode === "create"
                ? {
                    addNewHref: `/inventory/products/new?returnTo=${encodeURIComponent("/inventory/stock/new")}`,
                    onBeforeAddNew: saveDraft,
                  }
                : {})}
            />

            <ErrorText error={state.errors.productId} />
          </div>

          <div>
            <Label htmlFor="stockCode">Stock Code <RequiredMark /></Label>

            <Input
              id="stockCode"
              name="stockCode"
              defaultValue={stock?.stockCode ?? nextStockCode ?? ""}
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

          {/* Status and Finish are the only two fields in this row -- on a
              3-column grid that leaves a third, empty column dragging them
              to the left instead of centered. Wrapped in their own
              full-width 2-column sub-grid so the pair splits the row evenly
              instead of sitting stranded on one side. */}
          <div className="grid gap-6 sm:grid-cols-2 lg:col-span-3">
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
                      {item === "PAKKA" ? "Finished / Hallmarked" : "Unfinished"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input type="hidden" name="finish" value={finish} />
            </div>
          </div>
        </div>
      </div>
      {/* ============================
          WEIGHT DETAILS
      ============================ */}

      <div className="rounded-xl border p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Weight Details</h3>

          <div className="flex items-center gap-2">
            <Label htmlFor="weightUnit" className="text-xs text-muted-foreground">
              Weight Unit
            </Label>
            <Select value={weightUnit} onValueChange={(unit) => setWeightUnit(unit as "GRAM" | "CARAT")}>
              <SelectTrigger id="weightUnit" className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GRAM">Gram</SelectItem>
                <SelectItem value="CARAT">Carat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
            <Label htmlFor="grossWeight">Gross Weight <RequiredMark /></Label>

            <input type="hidden" name="grossWeight" value={submittedWeight(grossWeight)} />
            <Input
              id="grossWeight"
              type="number"
              step="any"
              required
              value={displayWeight(grossWeight)}
              onChange={(event) => editGrossWeight(toGramsString(event.target.value))}
            />

            <ErrorText error={state.errors.grossWeight} />
          </div>

          <div>
            <Label htmlFor="lessWeight">Less Weight</Label>

            <input type="hidden" name="lessWeight" value={submittedWeight(lessWeight)} />
            <Input
              id="lessWeight"
              type="number"
              step="any"
              value={displayWeight(lessWeight)}
              onChange={(event) => editLessWeight(toGramsString(event.target.value))}
            />

            <ErrorText error={state.errors.lessWeight} />
          </div>

          <div>
            <Label htmlFor="netWeight">Net Weight <RequiredMark /></Label>

            <input type="hidden" name="netWeight" value={submittedWeight(netWeight)} />
            <Input
              id="netWeight"
              type="number"
              step="any"
              required
              value={displayWeight(netWeight)}
              onChange={(event) => editNetWeight(toGramsString(event.target.value))}
            />
            {!netTouched && (
              <p className="mt-1 text-xs text-muted-foreground">
                Gross − less − stone − dust/other. Type to override.
              </p>
            )}

            <ErrorText error={state.errors.netWeight} />
          </div>

          <div>
            <Label htmlFor="stoneWeight">Stone Weight</Label>

            <input type="hidden" name="stoneWeight" value={submittedWeight(stoneWeight)} />
            <Input
              id="stoneWeight"
              type="number"
              step="any"
              value={displayWeight(stoneWeight)}
              onChange={(event) => editStoneWeight(toGramsString(event.target.value))}
            />

            <ErrorText error={state.errors.stoneWeight} />
          </div>

          {isCaratFamily && (
            <div>
              <Label htmlFor="caratWeight">Carat Weight (ct)</Label>

              <Input
                id="caratWeight"
                name="caratWeight"
                type="number"
                step="any"
                min="0"
                value={caratWeight}
                onChange={(event) => editCaratWeight(event.target.value)}
              />

              <p className="mt-1 text-xs text-muted-foreground">
                1 ct = 0.2 g. Converts with Net Weight automatically.
              </p>

              <ErrorText error={state.errors.caratWeight} />
            </div>
          )}
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
              value={saleRate}
              onChange={(event) => setSaleRate(event.target.value)}
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
              value={otherCharge}
              onChange={(event) => setOtherCharge(event.target.value)}
            />

            <ErrorText error={state.errors.otherCharge} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="purchaseAmount">Purchase Amount</Label>
              {!purchaseAmountTouched && purchaseAmount !== "" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Auto-calculated
                </span>
              )}
            </div>

            <Input
              id="purchaseAmount"
              name="purchaseAmount"
              type="number"
              step="0.01"
              value={purchaseAmount}
              onChange={(event) => {
                setPurchaseAmountTouched(true);
                setPurchaseAmount(event.target.value);
              }}
            />
            {!purchaseAmountTouched && (
              <p className="mt-1 text-xs text-muted-foreground">
                Purchase Rate × weight + Other Charge. Type to override.
              </p>
            )}

            <ErrorText error={state.errors.purchaseAmount} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="saleAmount">Sale Amount</Label>
              {!saleAmountTouched && saleAmount !== "" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Auto-calculated
                </span>
              )}
            </div>

            <Input
              id="saleAmount"
              name="saleAmount"
              type="number"
              step="0.01"
              value={saleAmount}
              onChange={(event) => {
                setSaleAmountTouched(true);
                setSaleAmount(event.target.value);
              }}
            />
            {!saleAmountTouched && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sale Rate × weight. Type to override.
              </p>
            )}

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

            {/* Suggests names from the actual Supplier list (Parties
                flagged as a Supplier, same list Purchases' own Vendor
                field uses) instead of a blank text box -- Vendor Name
                itself stays free text (no schema change), so picking a
                supplier here just fills it in with that name. */}
            <CustomerSelect
              customers={suppliers}
              defaultValue={suppliers.find((supplier) => supplier.name === vendorName)?.id}
              onChange={(_id, supplier) => setVendorName(supplier?.name ?? "")}
              placeholder="Select or search a supplier"
              termLabel="supplier"
            />
            <input type="hidden" name="vendorName" value={vendorName} />

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
                  : mode === "create"
                    ? new Date().toISOString().slice(0, 10)
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
            {showLocationField && <Label>Store Location</Label>}

            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />

            <ErrorText error={state.errors.locationId} />
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
