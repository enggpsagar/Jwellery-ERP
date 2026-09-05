"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { PurityType } from "@prisma/client";

import type { ProductFormState } from "@/lib/inventory/product-types";
import {
  getStoreCategoryTypes,
  getStoreMetalOrigins,
  type StoreMetalOriginRow,
} from "@/lib/actions/taxonomy-actions";
import { classifyMetalName } from "@/lib/business-units";
import { resolveGramsPerCarat } from "@/lib/purity";
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle";
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields";
import { AddCategoryDialog } from "@/components/inventory/shared/add-category-dialog";
import { AddCategoryTypeDialog } from "@/components/inventory/shared/add-category-type-dialog";
import { AddMetalDialog } from "@/components/inventory/shared/add-metal-dialog";

// A metal classifies into one of these groups by its name — GOLD/SILVER/
// DIAMOND/OTHER via classifyMetalName (the same name-substring heuristic
// used for formatting historical records elsewhere), plus local PLATINUM
// and STONE checks on top of it (classifyMetalName's own return type has
// neither a Platinum nor a generic Stone bucket, so extending it there
// would ripple into every other call site — out of scope here, this only
// decides which purities to offer and whether to show the Carat Weight field).
// STONE is a stand-alone loose-gemstone product line (a StoreMetal literally
// named e.g. "Stone"), not the stone embedded in a metal piece — that's the
// separate defaultStoneWeight field below, untouched by this.
type PurityFamily = "GOLD" | "SILVER" | "PLATINUM" | "DIAMOND" | "STONE" | "OTHER";

const PURITY_OPTIONS_BY_METAL: Record<PurityFamily, PurityType[]> = {
  GOLD: [PurityType.GOLD_24K, PurityType.GOLD_22K, PurityType.GOLD_20K, PurityType.GOLD_18K],
  SILVER: [PurityType.SILVER_999, PurityType.SILVER_925],
  PLATINUM: [PurityType.PLATINUM_950, PurityType.PLATINUM_900],
  DIAMOND: [PurityType.DIAMOND],
  // No PurityType exists for loose gemstone grades — OTHER is the closest
  // fit, same catch-all a non-purity-tracked metal already uses.
  STONE: [PurityType.OTHER],
  OTHER: [PurityType.OTHER],
};

// Checked ahead of the name-substring guess: `isGemstone` is the real,
// store-set flag from Settings' Stones section (StoreMetal.isGemstone), so a
// gemstone named e.g. "Ruby" or "Emerald" — no "diamond"/"stone" substring —
// still correctly gets the STONE family (carat weight, no fixed purity)
// instead of silently falling through to OTHER. A name containing "diamond"
// still wins DIAMOND specifically (its own real PurityType), matching
// existing Diamond products created before this flag existed.
function classifyPurityFamily(metal: { name: string; isGemstone?: boolean }): PurityFamily {
  const lower = metal.name.toLowerCase();
  if (lower.includes("platinum")) return "PLATINUM";
  if (lower.includes("diamond")) return "DIAMOND";
  if (lower.includes("stone")) return "STONE";
  if (metal.isGemstone) return "STONE";
  return classifyMetalName(metal.name) as PurityFamily;
}

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
import { RequiredMark } from "@/components/shared/required-mark"

export type StoreMetalOption = {
  id: string;
  name: string;
  hasPurity: boolean;
  isActive: boolean;
  isGemstone: boolean;
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
  stoneOriginOptionId: string | null;
  defaultPurity: string | null;
  defaultMakingCharge: string | null;
  defaultMakingChargeType: "FIXED" | "PERCENTAGE" | null;
  defaultStoneCharge: string | null;
  defaultStoneChargeType: "FIXED" | "PERCENTAGE" | null;
  defaultGrossWeight: string | null;
  defaultNetWeight: string | null;
  defaultStoneWeight: string | null;
  defaultCaratWeight: string | null;
  hasStoneComponent: boolean;
  defaultStoneRate: string | null;
  defaultStoneMetalTypeName: string | null;
  defaultStoneTypeNames: string | null;
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
  origins: StoreMetalOriginRow[];
  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules) — see the same prop on InvoiceForm. */
  caratConversionRates: Record<PurityType, number>;
};

function ErrorText({ error }: { error?: string[] }) {
  if (!error?.length) return null;

  return <p className="mt-1 text-sm text-red-600">{error[0]}</p>;
}

export function ProductForm({
  mode,
  product,
  state,
  pending,
  metals: initialMetals,
  categories: initialCategories,
  origins: initialOrigins,
  caratConversionRates,
}: ProductFormProps) {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");

  const [categoryTypeId, setCategoryTypeId] = useState(
    product?.categoryTypeId ?? "",
  );

  const [metalTypeId, setMetalTypeId] = useState(product?.metalTypeId ?? "");

  const [stoneOriginOptionId, setStoneOriginOptionId] = useState(
    product?.stoneOriginOptionId ?? "",
  );

  // Local state (not the raw `categories` prop) for the same reason
  // `metals`/`origins` below are local — the inline "Add Category" dialog
  // needs to append a newly-created row and select it without a full page
  // reload, mid-way through filling out the rest of this form.
  const [categories, setCategories] = useState(initialCategories);
  const [categorySearch, setCategorySearch] = useState("");
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((item) => item.name.toLowerCase().includes(query));
  }, [categories, categorySearch]);

  const [types, setTypes] = useState<StoreCategoryTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [addTypeOpen, setAddTypeOpen] = useState(false);

  const filteredTypes = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();
    if (!query) return types;
    return types.filter((item) => item.name.toLowerCase().includes(query));
  }, [types, typeSearch]);

  const [stoneOrigins, setStoneOrigins] = useState<StoreMetalOriginRow[]>([]);
  const [loadingStoneOrigins, setLoadingStoneOrigins] = useState(false);

  // Composite "Includes a Stone" picker state — which Stone (a gemstone
  // StoreMetal) and which of its Stone Types this product's embedded stone
  // is, mirroring the identical picker on Invoice/Kacha/Quotation line
  // items exactly. `metals`/`origins` are local state (not the raw props)
  // so StoneComponentFields' inline "Add Stone"/"Add Stone Type" dialogs
  // can append a newly-created row without a full page reload.
  const [metals, setMetals] = useState(initialMetals);
  const [origins, setOrigins] = useState(initialOrigins);
  const [stoneMetalTypeName, setStoneMetalTypeName] = useState(
    product?.defaultStoneMetalTypeName ?? "",
  );
  const [stoneTypeNames, setStoneTypeNames] = useState<string[]>(
    product?.defaultStoneTypeNames
      ? product.defaultStoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
      : [],
  );

  const previousCategoryIdRef = useRef(categoryId);
  const previousMetalTypeIdRef = useRef(metalTypeId);

  const [defaultPurity, setDefaultPurity] = useState(
    product?.defaultPurity ?? "__none__",
  );

  // A disabled metal (e.g. "Stone" turned off in Settings) is hidden from
  // the picker so it can't be chosen for a NEW product — but if this
  // product already uses one (disabled after it was picked), that entry
  // stays visible here so editing doesn't silently drop/replace their
  // existing selection.
  const selectableMetals = metals.filter(
    (item) => item.isActive || item.id === product?.metalTypeId,
  );

  const [metalSearch, setMetalSearch] = useState("");
  const [addMetalOpen, setAddMetalOpen] = useState(false);

  const filteredMetals = useMemo(() => {
    const query = metalSearch.trim().toLowerCase();
    if (!query) return selectableMetals;
    return selectableMetals.filter((item) => item.name.toLowerCase().includes(query));
  }, [selectableMetals, metalSearch]);

  const selectedMetal = metals.find((item) => item.id === metalTypeId);
  const metalFamily = selectedMetal
    ? classifyPurityFamily(selectedMetal)
    : null;
  const availablePurities = metalFamily
    ? PURITY_OPTIONS_BY_METAL[metalFamily]
    : Object.values(PurityType);

  const [puritySearch, setPuritySearch] = useState("");

  const filteredPurities = useMemo(() => {
    const query = puritySearch.trim().toLowerCase();
    if (!query) return availablePurities;
    return availablePurities.filter((item) =>
      item.replaceAll("_", " ").toLowerCase().includes(query),
    );
  }, [availablePurities, puritySearch]);

  // Switching metal (or its purity family no longer including what was
  // picked) clears a now-invalid Default Purity rather than silently
  // submitting a Gold purity against a Silver product.
  useEffect(() => {
    if (defaultPurity === "__none__") return;
    if (!availablePurities.includes(defaultPurity as PurityType)) {
      setDefaultPurity("__none__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId]);

  const [isActive, setIsActive] = useState(
    product?.isActive === false ? "false" : "true",
  );

  // Create-only: offer to open the stock entry in the same step, so a new
  // product doesn't need a second trip to Inventory to become stockable.
  const [createStock, setCreateStock] = useState(false);

  // Net = gross - stone is how a jeweller works it out, so the field fills
  // itself in rather than making someone do the subtraction. Active on both
  // create and edit — a change to Gross or Stone recomputes Net even over
  // an existing saved value — and stops only once Net Weight itself is
  // edited directly in this session.
  const [grossWeight, setGrossWeight] = useState(
    product?.defaultGrossWeight ?? "",
  );
  const [stoneWeight, setStoneWeight] = useState(
    product?.defaultStoneWeight ?? "",
  );
  const [netWeight, setNetWeight] = useState(product?.defaultNetWeight ?? "");
  const [netTouched, setNetTouched] = useState(false);

  // Diamonds and loose Stones are weighed by carat, not gram, but this form
  // only has one Weight field (Net Weight, shared with every other metal) —
  // so a Diamond/Stone product's Carat Weight converts into it directly
  // rather than getting a parallel weight of its own. 1 carat = 0.2 g, the
  // standard used industry-wide.
  const [caratWeight, setCaratWeight] = useState(
    product?.defaultCaratWeight ?? "",
  );
  const isCaratFamily = metalFamily === "DIAMOND" || metalFamily === "STONE";

  // A composite piece — e.g. a Gold ring with an embedded diamond — keeps
  // its metal as the primary purity/weight (unchanged), and separately
  // records the stone's own carat weight + rate, auto-summed into Stone
  // Charge. Distinct from isCaratFamily above: that's for a product whose
  // ENTIRE weight is carat-based (a loose Diamond/Stone with no separate
  // metal component at all).
  const [hasStoneComponent, setHasStoneComponent] = useState(
    product?.hasStoneComponent ?? false,
  );

  // A loose Diamond/Stone product IS the stone (its whole weight is carat-
  // based) — it can't also "include a stone" as a separate embedded
  // component. Mirrors the defaultPurity auto-clear above: switching the
  // metal into a carat family forces this off rather than silently keeping
  // both flags set, which used to hide the entire Stone Pricing section
  // (see the isCaratFamily/hasStoneComponent gates below) with no way to
  // view or edit a product's already-saved Stone Rate/Charge/Type at all.
  useEffect(() => {
    if (isCaratFamily && hasStoneComponent) {
      setHasStoneComponent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaratFamily]);

  const [stoneRate, setStoneRate] = useState(product?.defaultStoneRate ?? "");

  // Stone Charge — Stone Rate x Stone Carat Weight — had no input on this
  // form at all (defaultStoneCharge was a dead field: product-actions.ts
  // has always read it from form data, but nothing here ever rendered it),
  // so every product silently saved a null Stone Charge regardless of
  // Stone Rate/Carat Weight. Added below alongside the same auto-calc +
  // override pattern the line-item forms (invoice/purchase/kacha/quotation)
  // already use for their own Stone Charge field, for the "same logic...
  // when adding or editing a Product" parity the store owner asked for.
  const [stoneCharge, setStoneCharge] = useState(
    product?.defaultStoneCharge ?? "",
  );
  // Edit mode: a product that already has a saved Stone Charge shouldn't
  // have it silently recomputed the moment Stone Rate or Carat Weight is
  // touched for an unrelated correction.
  const [stoneChargeTouched, setStoneChargeTouched] = useState(
    Boolean(product?.defaultStoneCharge),
  );
  // Stone Weight (g) already existed and already feeds Net = Gross - Stone
  // below — it's this form's one physical-weight field, playing the same
  // role a line item's separate "Net Stone Weight" field does. Edit mode:
  // an already-recorded Stone Weight is authoritative and shouldn't be
  // silently overwritten by a later Carat Weight correction either.
  const [stoneWeightTouched, setStoneWeightTouched] = useState(
    Boolean(product?.defaultStoneWeight),
  );
  // Display-only — `stoneWeight` itself (submitted as defaultStoneWeight)
  // always stays in grams, the schema column's unit; this just controls
  // which unit StoneComponentFields' Net Stone Weight input shows/accepts,
  // converting to/from grams on the way in and out. Unlike a line item's
  // stoneWeightUnit (which reinterprets the same typed digits under a new
  // unit), switching this live-converts the displayed number so the
  // underlying grams value never silently changes meaning.
  const [stoneWeightUnit, setStoneWeightUnit] = useState<"GRAM" | "CARAT">("GRAM");

  function handleCaratWeightChange(value: string) {
    setCaratWeight(value);

    // A genuinely carat-weighed item (Diamond/Stone as the product's own
    // metal) converts Carat Weight into Net Weight.
    if (isCaratFamily) {
      const caratNum = Number(value);
      if (value.trim() !== "" && Number.isFinite(caratNum)) {
        setNetTouched(true);
        const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
        setNetWeight(String(Number((caratNum * gramsPerCarat).toFixed(5))));
      }
      return;
    }

    // For a composite piece, Carat Weight is the embedded stone's own
    // weight, independent of the metal's Net Weight — no conversion into
    // Net Weight applies. Instead it drives this stone's own pricing
    // (Stone Charge) and its own physical weight (Stone Weight), mirroring
    // the stoneChargeTouched/stoneWeightTouched pattern on every line-item
    // form's Stone Charge/Net Stone Weight fields.
    if (!hasStoneComponent) return;

    const caratNum = Number(value);
    const carat = value.trim() !== "" && Number.isFinite(caratNum) ? caratNum : 0;

    if (!stoneChargeTouched) {
      const rate = stoneRate.trim() === "" ? 0 : Number(stoneRate) || 0;
      setStoneCharge(String(Number((rate * carat).toFixed(2))));
    }

    // Stone Weight (g) has no unit toggle here (always grams, unlike a line
    // item's stoneWeightUnit) — always converts carat -> grams using the
    // same store-configurable resolveGramsPerCarat rate as everywhere else
    // on this form, rather than leaving Stone Weight alone.
    if (!stoneWeightTouched) {
      const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
      setStoneWeight(String(Number((carat * gramsPerCarat).toFixed(5))));
    }
  }

  function handleStoneRateChange(value: string) {
    setStoneRate(value);
    if (stoneChargeTouched) return;

    const rateNum = value.trim() === "" ? 0 : Number(value);
    const caratNum = caratWeight.trim() === "" ? 0 : Number(caratWeight);
    const rate = Number.isFinite(rateNum) ? rateNum : 0;
    const carat = Number.isFinite(caratNum) ? caratNum : 0;
    setStoneCharge(String(Number((rate * carat).toFixed(2))));
  }

  function handleStoneChargeChange(value: string) {
    setStoneCharge(value);
    setStoneChargeTouched(true);
  }

  function handleStoneWeightChange(value: string) {
    setStoneWeight(value);
    setStoneWeightTouched(true);
  }

  function handleNetWeightChange(value: string) {
    setNetTouched(true);
    setNetWeight(value);

    if (!isCaratFamily) return;

    const netNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(netNum)) {
      const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
      setCaratWeight(String(Number((netNum / gramsPerCarat).toFixed(5))));
    } else {
      setCaratWeight("");
    }
  }

  const gross = Number(grossWeight);
  const stone = stoneWeight.trim() === "" ? 0 : Number(stoneWeight);

  const derivedNet =
    grossWeight.trim() !== "" &&
    Number.isFinite(gross) &&
    Number.isFinite(stone) &&
    gross - stone >= 0
      ? // Trailing zeros trimmed so the box reads 5.5 rather than 5.500,
        // while still respecting the column's three decimals.
        String(Number((gross - stone).toFixed(5)))
      : null;

  // Kept in an effect rather than derived straight into the input, because
  // the field has to stay editable once the user takes it over. Skips its
  // very first run: on an edit page, gross/stone are already populated from
  // the saved product, so without this guard the effect would recompute (and
  // silently overwrite) Net Weight the instant the page loads, before the
  // user has touched anything.
  const skippedFirstNetCalc = useRef(false);
  useEffect(() => {
    if (!skippedFirstNetCalc.current) {
      skippedFirstNetCalc.current = true;
      return;
    }
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

  // Fetch the Store-Admin-defined Stone Type options (Natural, Lab-Grown,
  // or anything else the store has added) for whichever gemstone Metal is
  // currently selected — the exact same Category -> Type cascade above,
  // just keyed off metalTypeId + isGemstone instead of categoryId.
  useEffect(() => {
    let cancelled = false;

    async function loadStoneTypes() {
      if (!metalTypeId || !selectedMetal?.isGemstone) {
        setStoneOrigins([]);
        return;
      }

      try {
        setLoadingStoneOrigins(true);
        const data = await getStoreMetalOrigins(metalTypeId);

        if (!cancelled) {
          setStoneOrigins(data || []);
        }
      } catch (err) {
        console.error("Failed to load Stone Types:", err);
        if (!cancelled) {
          setStoneOrigins([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingStoneOrigins(false);
        }
      }
    }

    loadStoneTypes();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId, selectedMetal?.isGemstone]);

  // Only reset the selected Stone Type when the Metal actually changes as a
  // result of user interaction — not on initial mount (edit mode needs to
  // keep the product's existing Stone Type selected while options load).
  useEffect(() => {
    if (previousMetalTypeIdRef.current !== metalTypeId) {
      setStoneOriginOptionId("");
      previousMetalTypeIdRef.current = metalTypeId;
    }
  }, [metalTypeId]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Basic Information</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label htmlFor="productCode">Product Code <RequiredMark /></Label>

            <Input
              id="productCode"
              name="productCode"
              defaultValue={product?.productCode ?? ""}
              placeholder="RING-001"
            />

            <ErrorText error={state.errors.productCode} />
          </div>

          <div>
            <Label htmlFor="name">Product Name <RequiredMark /></Label>

            <Input
              id="name"
              name="name"
              defaultValue={product?.name ?? ""}
              placeholder="Ladies Ring"
            />

            <ErrorText error={state.errors.name} />
          </div>

          <div>
            <Label>Category <RequiredMark /></Label>

            <div className="flex gap-1.5">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>

                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>

                  {filteredCategories.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No categories found{categorySearch ? ` for "${categorySearch}"` : ""}
                    </div>
                  ) : (
                    filteredCategories.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-9 shrink-0 px-0"
                title="Add Category"
                onClick={() => setAddCategoryOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <input type="hidden" name="categoryId" value={categoryId} />

            <ErrorText error={state.errors.categoryId} />
          </div>
          <div>
            <Label>Type</Label>

            <div className="flex gap-1.5">
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
                  {types.length > 3 && (
                    <div className="p-2">
                      <Input
                        placeholder="Search types..."
                        value={typeSearch}
                        onChange={(event) => setTypeSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    </div>
                  )}

                  <SelectItem value="__none__">None</SelectItem>

                  {filteredTypes.length === 0 && typeSearch ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No types found for "{typeSearch}"
                    </div>
                  ) : (
                    filteredTypes.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-9 shrink-0 px-0"
                title="Add Type"
                disabled={!categoryId || loadingTypes}
                onClick={() => setAddTypeOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <input
              type="hidden"
              name="categoryTypeId"
              value={categoryTypeId}
            />

            <ErrorText error={state.errors.categoryTypeId} />
          </div>
        </div>
      </div>

      <AddCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        onCreated={(category) => {
          setCategories((prev) => [...prev, category]);
          setCategoryId(category.id);
        }}
      />

      {categoryId && (
        <AddCategoryTypeDialog
          open={addTypeOpen}
          onOpenChange={setAddTypeOpen}
          categoryId={categoryId}
          categoryName={categories.find((item) => item.id === categoryId)?.name ?? ""}
          onCreated={(type) => {
            setTypes((prev) => [...prev, type]);
            setCategoryTypeId(type.id);
          }}
        />
      )}

      {/* ============================
          METAL DETAILS
      ============================= */}

      <div className="rounded-xl border p-6">
        <h3 className="mb-6 text-lg font-semibold">Metal Details</h3>

        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Label>Metal Type <RequiredMark /></Label>

            <div className="flex gap-1.5">
              <Select value={metalTypeId} onValueChange={setMetalTypeId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select metal type" />
                </SelectTrigger>

                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search metal types..."
                      value={metalSearch}
                      onChange={(event) => setMetalSearch(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>

                  {filteredMetals.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No metal types found{metalSearch ? ` for "${metalSearch}"` : ""}
                    </div>
                  ) : (
                    filteredMetals.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {!item.isActive ? " (Disabled)" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-9 shrink-0 px-0"
                title="Add Metal Type"
                onClick={() => setAddMetalOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <input type="hidden" name="metalTypeId" value={metalTypeId} />

            <ErrorText error={state.errors.metalTypeId} />
          </div>

          <div>
            <Label>Default Purity</Label>

            <Select
              value={defaultPurity}
              onValueChange={setDefaultPurity}
              disabled={selectedMetal ? !selectedMetal.hasPurity : false}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue
                  placeholder={
                    selectedMetal && !selectedMetal.hasPurity
                      ? "Not applicable for this metal"
                      : "Select Purity"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                {availablePurities.length > 5 && (
                  <div className="p-2">
                    <Input
                      placeholder="Search purities..."
                      value={puritySearch}
                      onChange={(event) => setPuritySearch(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>
                )}

                <SelectItem value="__none__">None</SelectItem>

                {filteredPurities.length === 0 && puritySearch ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No purities found for "{puritySearch}"
                  </div>
                ) : (
                  filteredPurities.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item.replaceAll("_", " ")}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {selectedMetal && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedMetal.hasPurity
                  ? `Showing ${metalFamily?.toLowerCase() ?? "matching"} purities for ${selectedMetal.name}.`
                  : `${selectedMetal.name} doesn't track purity.`}
              </p>
            )}

            <input
              type="hidden"
              name="defaultPurity"
              value={defaultPurity === "__none__" ? "" : defaultPurity}
            />

            <ErrorText error={state.errors.defaultPurity} />
          </div>

          <div className="flex items-end pb-2">
            <IncludesStoneToggle
              checked={hasStoneComponent}
              onChange={setHasStoneComponent}
              disabled={isCaratFamily}
            />
            {isCaratFamily && (
              <p className="ml-3 text-xs text-muted-foreground">
                Not applicable — {selectedMetal?.name ?? "this metal"} is
                already carat-weighed as its own stone.
              </p>
            )}
            <input
              type="hidden"
              name="hasStoneComponent"
              value={hasStoneComponent ? "true" : "false"}
            />
          </div>

          {selectedMetal?.isGemstone && (
            <div>
              <Label>Stone Type</Label>

              <Select
                value={stoneOriginOptionId || "__none__"}
                onValueChange={(value) =>
                  setStoneOriginOptionId(value === "__none__" ? "" : value)
                }
                disabled={loadingStoneOrigins}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue
                    placeholder={
                      loadingStoneOrigins
                        ? "Loading Stone Types..."
                        : "Select Stone Type"
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>

                  {stoneOrigins.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!loadingStoneOrigins && stoneOrigins.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No Stone Types set up for {selectedMetal.name} yet — add
                  them under Settings → Taxonomy → Stone Types.
                </p>
              ) : null}

              <input
                type="hidden"
                name="stoneOriginOptionId"
                value={stoneOriginOptionId}
              />

              <ErrorText error={state.errors.stoneOriginOptionId} />
            </div>
          )}
        </div>
      </div>

      <AddMetalDialog
        open={addMetalOpen}
        onOpenChange={setAddMetalOpen}
        onCreated={(metal) => {
          setMetals((prev) => [...prev, metal]);
          setMetalTypeId(metal.id);
        }}
      />

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
              step="0.00001"
              min="0"
              value={grossWeight}
              onChange={(event) => setGrossWeight(event.target.value)}
              placeholder="0.000"
            />

            <ErrorText error={state.errors.defaultGrossWeight} />
          </div>

          {/* Once this is a composite piece with "Includes a Stone" checked,
              Stone Weight moves down into the Stone Pricing box below, next
              to the Stone Carat Weight it mirrors — see there. It stays here
              for a plain metal item or a genuinely carat-weighed one. */}
          {!(hasStoneComponent && !isCaratFamily) && (
            <div>
              <Label htmlFor="defaultStoneWeight">Stone Weight (g)</Label>

              <Input
                id="defaultStoneWeight"
                name="defaultStoneWeight"
                type="number"
                step="0.00001"
                min="0"
                value={stoneWeight}
                onChange={(event) => handleStoneWeightChange(event.target.value)}
                placeholder="0.000"
              />

              <ErrorText error={state.errors.defaultStoneWeight} />
            </div>
          )}

          <div>
            <Label htmlFor="defaultNetWeight">Net Weight (g)</Label>

            <Input
              id="defaultNetWeight"
              name="defaultNetWeight"
              type="number"
              step="0.00001"
              min="0"
              value={netWeight}
              onChange={(event) => handleNetWeightChange(event.target.value)}
              placeholder="0.000"
            />

            {!netTouched && derivedNet !== null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Gross &minus; stone. Type to override.
              </p>
            ) : null}

            <ErrorText error={state.errors.defaultNetWeight} />
          </div>

          {/* Carat Weight for a genuinely carat-weighed item (a loose
              Diamond/Stone product, its own entire weight) stays here.
              The composite case (Carat Weight as an embedded stone's own
              weight) moves into the Stone Pricing box below instead. */}
          {isCaratFamily && (
            <div>
              <Label htmlFor="defaultCaratWeight">Carat Weight (ct)</Label>

              <Input
                id="defaultCaratWeight"
                name="defaultCaratWeight"
                type="number"
                step="0.001"
                min="0"
                value={caratWeight}
                onChange={(event) =>
                  handleCaratWeightChange(event.target.value)
                }
                placeholder="0.000"
              />

              <p className="mt-1 text-xs text-muted-foreground">
                1 ct = 0.2 g. Converts with Net Weight automatically.
              </p>

              <ErrorText error={state.errors.defaultCaratWeight} />
            </div>
          )}
        </div>

        {/* Every stone-pricing field grouped together once "Includes a
            Stone" is checked, mirroring the same grouping used for a
            composite line item on Invoice/Purchase/Kacha/Quotation. */}
        {hasStoneComponent && !isCaratFamily && (
          <div className="mt-6 rounded-lg border border-dashed p-4">
            <h4 className="mb-4 text-sm font-semibold">Stone Pricing</h4>

            <StoneComponentFields
              metals={metals}
              origins={origins}
              onMetalsChange={setMetals}
              onOriginsChange={setOrigins}
              stoneMetalTypeName={stoneMetalTypeName}
              onStoneChange={(name, typeNames) => {
                setStoneMetalTypeName(name);
                setStoneTypeNames(typeNames);
              }}
              selectedTypeNames={stoneTypeNames}
              onTypesChange={setStoneTypeNames}
              caratWeight={Number(caratWeight) || 0}
              onCaratWeightChange={handleCaratWeightChange}
              stoneRate={Number(stoneRate) || 0}
              onStoneRateChange={handleStoneRateChange}
              stoneCharge={Number(stoneCharge) || 0}
              onStoneChargeChange={handleStoneChargeChange}
              stoneChargeTouched={stoneChargeTouched}
              stoneWeightInput={
                stoneWeightUnit === "CARAT"
                  ? Number(
                      (
                        (Number(stoneWeight) || 0) /
                        resolveGramsPerCarat(defaultPurity, caratConversionRates)
                      ).toFixed(3),
                    )
                  : Number(stoneWeight) || 0
              }
              onStoneWeightInputChange={(value) => {
                const typed = Number(value) || 0;
                const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
                const grams = stoneWeightUnit === "CARAT" ? typed * gramsPerCarat : typed;
                handleStoneWeightChange(String(Number(grams.toFixed(5))));
              }}
              stoneWeightUnit={stoneWeightUnit}
              onStoneWeightUnitChange={setStoneWeightUnit}
              netStoneWeightTouched={stoneWeightTouched}
            />

            <input type="hidden" name="defaultStoneMetalTypeName" value={stoneMetalTypeName} />
            <input type="hidden" name="defaultStoneTypeNames" value={stoneTypeNames.join(",")} />
            <input type="hidden" name="defaultCaratWeight" value={caratWeight} />
            <input type="hidden" name="defaultStoneRate" value={stoneRate} />
            <input type="hidden" name="defaultStoneCharge" value={stoneCharge} />
            <input type="hidden" name="defaultStoneWeight" value={stoneWeight} />

            <ErrorText error={state.errors.defaultCaratWeight} />
            <ErrorText error={state.errors.defaultStoneRate} />
            <ErrorText error={state.errors.defaultStoneCharge} />
            <ErrorText error={state.errors.defaultStoneWeight} />
          </div>
        )}
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

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="description">Description</Label>

            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={product?.description ?? ""}
              placeholder="Product description..."
              className="min-h-[60px]"
            />

            <ErrorText error={state.errors.description} />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>

            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={product?.notes ?? ""}
              placeholder="Internal notes..."
              className="min-h-[60px]"
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
