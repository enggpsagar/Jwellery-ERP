"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { PurityType } from "@prisma/client";

import type { ProductFormState } from "@/lib/inventory/product-types";
import {
  getStoreCategoryTypes,
  getStoreCategoriesForMetal,
  getStoreMetalOrigins,
  getStoreMetalPurities,
  type StoreMetalOriginRow,
  type StoreMetalPurityRow,
} from "@/lib/actions/taxonomy-actions";
import { classifyPurityFamily } from "@/lib/business-units";
import { resolveGramsPerCarat, toPrimaryUnit, matchLegacyPurityType } from "@/lib/purity";
import { LocationSelect, useShowLocationField, type LocationOption } from "@/components/shared/location-select";
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle";
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields";
import { AddCategoryDialog } from "@/components/inventory/shared/add-category-dialog";
import { AddCategoryTypeDialog } from "@/components/inventory/shared/add-category-type-dialog";
import { AddMetalDialog } from "@/components/inventory/shared/add-metal-dialog";
import { AddPurityDialog } from "@/components/inventory/shared/add-purity-dialog";

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
  primaryUnit: "GRAM" | "CARAT";
  sellingPrice: number | null;
};

export type StoreCategoryOption = {
  id: string;
  name: string;
};

export type StoreStyleOption = {
  id: string;
  name: string;
  isActive: boolean;
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
  targetStyleId: string | null;
  stoneOriginOptionId: string | null;
  defaultPurity: string | null;
  storeMetalPurityId: string | null;
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
  styles: StoreStyleOption[];
  origins: StoreMetalOriginRow[];
  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules) — see the same prop on InvoiceForm. */
  caratConversionRates: Record<PurityType, number>;
  /** Create-only — the quick "Stock entry" section's Location picker.
   * Blank/omitted is fine even for a location-restricted user: the server
   * action resolves the same default a full Add Stock entry would (their
   * one location auto-picked, or an explicit error if they hold more than
   * one and didn't choose) — see resolveWritableLocationId. */
  locations?: LocationOption[];
  /** Create-only — the store's configured default location (Settings >
   * Locations), pre-selected in the Stock entry Location picker above so a
   * new product doesn't start with it blank. Not used in edit mode: an
   * existing stock entry's saved location is untouched by this. */
  defaultLocationId?: string;
  /** Settings > Metals, Stones & Categories > "Require Style on products" —
   * hides the Style field entirely when off. Defaults true so a caller
   * that hasn't been updated still shows it, matching today's behavior. */
  styleFieldEnabled?: boolean;
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
  styles,
  origins: initialOrigins,
  caratConversionRates,
  locations = [],
  defaultLocationId,
  styleFieldEnabled = true,
}: ProductFormProps) {
  const showLocationField = useShowLocationField(locations.length);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");

  const [categoryTypeId, setCategoryTypeId] = useState(
    product?.categoryTypeId ?? "",
  );

  const [metalTypeId, setMetalTypeId] = useState(product?.metalTypeId ?? "");

  // Whether this product's own primary type is a real metal (Gold, Silver,
  // Platinum...) or a gemstone (Diamond, Ruby...) picked directly — drives
  // which list the field below offers and whether Default Purity /
  // "Includes a Stone" apply at all. Both cases still save into the same
  // metalTypeId column; this is purely which half of `metals` is offered
  // and which fields make sense once one is chosen. Derived on mount from
  // the saved product's own metal (edit mode); "METAL" by default for a
  // brand new product.
  const [productKind, setProductKind] = useState<"METAL" | "STONE">(
    initialMetals.find((item) => item.id === product?.metalTypeId)?.isGemstone
      ? "STONE"
      : "METAL",
  );

  const [targetStyleId, setTargetStyleId] = useState(product?.targetStyleId ?? "");

  const [stoneOriginOptionId, setStoneOriginOptionId] = useState(
    product?.stoneOriginOptionId ?? "",
  );

  // Local state (not the raw `categories` prop) for the same reason
  // `metals`/`origins` below are local — the inline "Add Category" dialog
  // needs to append a newly-created row and select it without a full page
  // reload, mid-way through filling out the rest of this form. Re-fetched
  // per selected Metal (see the effect below) — a category with no
  // "applicable metals" tags stays universal, one tagged to specific
  // metals only shows once one of those is selected.
  const [categories, setCategories] = useState(initialCategories);
  const [categorySearch, setCategorySearch] = useState("");
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCategoriesForMetal() {
      try {
        const data = await getStoreCategoriesForMetal(metalTypeId);
        if (!cancelled) setCategories(data);
      } catch (err) {
        console.error("Failed to load categories for metal:", err);
      }
    }

    loadCategoriesForMetal();

    return () => {
      cancelled = true;
    };
  }, [metalTypeId]);

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

  // The real per-Metal Purity selection (Settings > Taxonomy > Purities) —
  // the source of truth going forward. defaultPurity (the legacy enum,
  // below) is kept in sync from it purely so the existing gramsPerCarat/
  // carat-family math further down (all keyed on the enum) keeps working
  // unchanged — see the sync effect right after metalPurities loads.
  const [storeMetalPurityId, setStoreMetalPurityId] = useState(
    product?.storeMetalPurityId ?? "",
  );
  const [defaultPurity, setDefaultPurity] = useState(
    product?.defaultPurity ?? "__none__",
  );

  // A disabled metal/stone (turned off in Settings) is hidden from the
  // picker so it can't be chosen for a NEW product — but if this product
  // already uses one (disabled after it was picked), that entry stays
  // visible here so editing doesn't silently drop/replace their existing
  // selection. Which half of `metals` is offered — real metals or
  // gemstones — follows productKind, so "Metal" never mixes in Diamond/
  // Ruby/etc. and "Stone" never mixes in Gold/Silver/etc.
  const selectableMetals = metals.filter(
    (item) =>
      (item.isActive || item.id === product?.metalTypeId) &&
      (productKind === "STONE" ? item.isGemstone : !item.isGemstone),
  );

  const [metalSearch, setMetalSearch] = useState("");
  const [addMetalOpen, setAddMetalOpen] = useState(false);
  const [addPurityOpen, setAddPurityOpen] = useState(false);

  const filteredMetals = useMemo(() => {
    const query = metalSearch.trim().toLowerCase();
    if (!query) return selectableMetals;
    return selectableMetals.filter((item) => item.name.toLowerCase().includes(query));
  }, [selectableMetals, metalSearch]);

  const selectedMetal = metals.find((item) => item.id === metalTypeId);
  const metalFamily = selectedMetal
    ? classifyPurityFamily(selectedMetal)
    : null;

  // Real per-Metal Purity options (Settings > Taxonomy > Purities), fetched
  // for whichever Metal is currently selected — replaces the old hardcoded
  // PURITY_OPTIONS_BY_METAL map. Only meaningful in Metal mode; Stone mode
  // has no purity concept of its own (see the Purity field's own render
  // gate further down).
  const [metalPurities, setMetalPurities] = useState<StoreMetalPurityRow[]>([]);
  const [loadingMetalPurities, setLoadingMetalPurities] = useState(false);
  const [puritySearch, setPuritySearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPurities() {
      if (!metalTypeId || productKind !== "METAL") {
        setMetalPurities([]);
        return;
      }

      try {
        setLoadingMetalPurities(true);
        const data = await getStoreMetalPurities(metalTypeId);
        if (!cancelled) setMetalPurities(data);
      } catch (err) {
        console.error("Failed to load purities:", err);
        if (!cancelled) setMetalPurities([]);
      } finally {
        if (!cancelled) setLoadingMetalPurities(false);
      }
    }

    loadPurities();

    return () => {
      cancelled = true;
    };
  }, [metalTypeId, productKind]);

  const filteredPurities = useMemo(() => {
    const query = puritySearch.trim().toLowerCase();
    if (!query) return metalPurities;
    return metalPurities.filter((item) => item.label.toLowerCase().includes(query));
  }, [metalPurities, puritySearch]);

  // Keeps the legacy defaultPurity enum in sync with whichever real Purity
  // is selected, purely so gramsPerCarat/carat-family math further down
  // (still keyed on the enum) keeps working unchanged — see this state's
  // own doc comment above.
  useEffect(() => {
    const selected = metalPurities.find((item) => item.id === storeMetalPurityId);
    setDefaultPurity(matchLegacyPurityType(metalFamily, selected?.label) ?? "__none__");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMetalPurityId, metalPurities]);

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

  // The selected metal's configured Primary Unit (Settings > Taxonomy) —
  // what Gross/Stone/Net Weight are actually persisted in, regardless of
  // which unit the toggle below is currently showing for entry
  // convenience. One shared toggle for the whole Weights section (not one
  // per field), same reasoning as the Stock form: every weight here
  // describes the same design/piece.
  const primaryUnit = selectedMetal?.primaryUnit ?? "GRAM";
  const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
  const [weightUnit, setWeightUnit] = useState<"GRAM" | "CARAT">(primaryUnit);

  useEffect(() => {
    setWeightUnit(primaryUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId]);

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

  // A composite piece — e.g. a Gold ring with an embedded diamond — keeps
  // its metal as the primary purity/weight (unchanged), and separately
  // records the stone's own carat weight + rate, auto-summed into Stone
  // Charge. Distinct from isCaratFamily above: that's for a product whose
  // ENTIRE weight is carat-based (a loose Diamond/Stone with no separate
  // metal component at all).
  const [hasStoneComponent, setHasStoneComponent] = useState(
    product?.hasStoneComponent ?? false,
  );

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

    // "Includes a Stone" checked means this Carat Weight input is the one
    // living in the Stone Pricing box — the embedded stone's own weight —
    // regardless of whether the product's own metal also happens to be
    // carat-family. Checked first, ahead of isCaratFamily below: a Diamond-
    // metal product with Includes a Stone also checked still edits this
    // same field, and it must drive Stone Charge/Stone Weight, not silently
    // fall into the loose-item branch and leave them uncalculated.
    if (hasStoneComponent) {
      const caratNum = Number(value);
      const carat = value.trim() !== "" && Number.isFinite(caratNum) ? caratNum : 0;

      if (!stoneChargeTouched) {
        const rate = stoneRate.trim() === "" ? 0 : Number(stoneRate) || 0;
        setStoneCharge(String(Number((rate * carat).toFixed(2))));
      }

      // Stone Weight (g) has no unit toggle here (always grams, unlike a
      // line item's stoneWeightUnit) — always converts carat -> grams using
      // the same store-configurable resolveGramsPerCarat rate as everywhere
      // else on this form, rather than leaving Stone Weight alone.
      if (!stoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
        setStoneWeight(String(Number((carat * gramsPerCarat).toFixed(5))));
      }
      return;
    }

    // A genuinely carat-weighed item with no embedded stone (Diamond/Stone
    // as the product's own metal, its whole weight) converts Carat Weight
    // into Net Weight instead.
    if (!isCaratFamily) return;

    const caratNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(caratNum)) {
      setNetTouched(true);
      const gramsPerCarat = resolveGramsPerCarat(defaultPurity, caratConversionRates);
      setNetWeight(String(Number((caratNum * gramsPerCarat).toFixed(5))));
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

    // Only reverse-syncs into Carat Weight for a genuinely carat-weighed
    // item with no embedded stone — the same isCaratFamily && !hasStoneComponent
    // condition the standalone Carat Weight field itself is shown under.
    // Once "Includes a Stone" is checked, Carat Weight belongs to the
    // embedded stone in the Stone Pricing box instead, and editing the
    // metal's own Net Weight here must not silently overwrite it.
    if (!isCaratFamily || hasStoneComponent) return;

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

  // Only reset the selected Stone Type/Purity when the Metal actually
  // changes as a result of user interaction — not on initial mount (edit
  // mode needs to keep the product's existing selection while options
  // load).
  useEffect(() => {
    if (previousMetalTypeIdRef.current !== metalTypeId) {
      setStoneOriginOptionId("");
      setStoreMetalPurityId("");
      previousMetalTypeIdRef.current = metalTypeId;
    }
  }, [metalTypeId]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          {/* Opposite the card title, top-right — redundant once the
              product's own type IS a stone, so it only shows for Metal
              (there's no separate "embedded stone" to include on top of
              itself), and sits up here instead of taking its own grid
              slot below, to minimize space. */}
          {productKind === "METAL" && (
            <div className="flex items-center gap-2">
              <IncludesStoneToggle
                checked={hasStoneComponent}
                onChange={(checked) => {
                  setHasStoneComponent(checked)
                  // Stone Weight is now hidden once the toggle is off (see
                  // below) — clear it so a hidden field can't silently keep
                  // submitting whatever was last typed while it was visible.
                  if (!checked) {
                    setStoneWeight("")
                    setStoneWeightTouched(false)
                  }
                }}
              />
              <input
                type="hidden"
                name="hasStoneComponent"
                value={hasStoneComponent ? "true" : "false"}
              />
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
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
            {/* Leads the rest of the form (ahead of Category) since it
                decides which list the field beside it offers, and —
                through Default Purity below — the SKU itself. */}
            <Label>Metal / Stone <RequiredMark /></Label>

            <Select
              value={productKind}
              onValueChange={(value) => {
                const kind = value as "METAL" | "STONE";
                setProductKind(kind);
                // A metal and a gemstone are never both valid for the
                // field beside this one — switching modes clears it (and
                // whatever Stone Type went with it) rather than leaving a
                // now-mismatched selection silently in place.
                setMetalTypeId("");
                setStoneOriginOptionId("");
                if (kind === "STONE") {
                  // The product itself IS the stone now — the separate
                  // "Includes a Stone" (embedded-stone) case doesn't apply.
                  setHasStoneComponent(false);
                  setStoneWeight("");
                  setStoneWeightTouched(false);
                }
              }}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="METAL">Metal</SelectItem>
                <SelectItem value="STONE">Stone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{productKind === "STONE" ? "Stone" : "Metal Type"} <RequiredMark /></Label>

            <div className="flex gap-1.5">
              <Select value={metalTypeId} onValueChange={setMetalTypeId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder={productKind === "STONE" ? "Select stone" : "Select metal type"} />
                </SelectTrigger>

                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder={productKind === "STONE" ? "Search stones..." : "Search metal types..."}
                      value={metalSearch}
                      onChange={(event) => setMetalSearch(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>

                  {filteredMetals.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {productKind === "STONE" ? "No stones found" : "No metal types found"}
                      {metalSearch ? ` for "${metalSearch}"` : ""}
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
                title={productKind === "STONE" ? "Add Stone" : "Add Metal Type"}
                onClick={() => setAddMetalOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <input type="hidden" name="metalTypeId" value={metalTypeId} />

            <ErrorText error={state.errors.metalTypeId} />
          </div>

          {/* Purity/Stone Type + Includes-a-Stone follow Metal Type directly
              (Metal -> Metal Type -> Purity -> Category -> Type) instead of
              a separate card lower down. */}
          {productKind === "METAL" && (
          <div>
            <Label>Purity</Label>

            <div className="flex gap-1.5">
              <Select
                value={storeMetalPurityId || "__none__"}
                onValueChange={(value) => setStoreMetalPurityId(value === "__none__" ? "" : value)}
                disabled={selectedMetal ? !selectedMetal.hasPurity : false}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue
                    placeholder={
                      selectedMetal && !selectedMetal.hasPurity
                        ? "Not applicable for this metal"
                        : loadingMetalPurities
                          ? "Loading purities..."
                          : "Select Purity"
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {metalPurities.length > 5 && (
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
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Only meaningful once a Metal that tracks purity is picked
                  — same disabled condition as the Select itself. */}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-9 shrink-0 px-0"
                title="Add Purity"
                disabled={!selectedMetal || !selectedMetal.hasPurity}
                onClick={() => setAddPurityOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {selectedMetal && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedMetal.hasPurity
                  ? metalPurities.length === 0 && !loadingMetalPurities
                    ? `No purities configured for ${selectedMetal.name} yet — add them under Settings → Taxonomy → Purities.`
                    : `Showing purities configured for ${selectedMetal.name}.`
                  : `${selectedMetal.name} doesn't track purity.`}
              </p>
            )}

            <input type="hidden" name="storeMetalPurityId" value={storeMetalPurityId} />
            <input
              type="hidden"
              name="defaultPurity"
              value={defaultPurity === "__none__" ? "" : defaultPurity}
            />

            <ErrorText error={state.errors.defaultPurity} />
          </div>
          )}

          {productKind === "STONE" && selectedMetal?.isGemstone && (
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

          {/* Most Categories have no Types configured at all (Settings ->
              Taxonomy) — showing this picker with nothing but "None" to
              choose from is just clutter, so it only renders once the
              selected Category actually has Types, or while that's still
              being checked (avoids a flash of the field appearing then
              disappearing on a fast category switch). */}
          {categoryId && (loadingTypes || types.length > 0) && (
            <div>
              <Label>Type</Label>

              <div className="flex gap-1.5">
                <Select
                  value={categoryTypeId || "__none__"}
                  onValueChange={(value) =>
                    setCategoryTypeId(value === "__none__" ? "" : value)
                  }
                  disabled={loadingTypes}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue
                      placeholder={loadingTypes ? "Loading types..." : "Select Type"}
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
                  disabled={loadingTypes}
                  onClick={() => setAddTypeOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <ErrorText error={state.errors.categoryTypeId} />
            </div>
          )}

          <input
            type="hidden"
            name="categoryTypeId"
            value={categoryTypeId}
          />

          {styleFieldEnabled && (
            <div>
              <Label htmlFor="targetStyle">Style <RequiredMark /></Label>

              <Select value={targetStyleId || "__none__"} onValueChange={(value) => setTargetStyleId(value === "__none__" ? "" : value)}>
                <SelectTrigger id="targetStyle" className="h-11 w-full">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {styles
                    .filter((style) => style.isActive || style.id === targetStyleId)
                    .map((style) => (
                      <SelectItem key={style.id} value={style.id}>
                        {style.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <input type="hidden" name="targetStyleId" value={targetStyleId} />

              <ErrorText error={state.errors.targetStyleId} />
            </div>
          )}
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

      <AddMetalDialog
        open={addMetalOpen}
        onOpenChange={setAddMetalOpen}
        isGemstone={productKind === "STONE"}
        onCreated={(metal) => {
          setMetals((prev) => [...prev, metal]);
          setMetalTypeId(metal.id);
        }}
      />

      {selectedMetal && (
        <AddPurityDialog
          open={addPurityOpen}
          onOpenChange={setAddPurityOpen}
          storeMetalId={selectedMetal.id}
          onCreated={(purity) => {
            setMetalPurities((prev) => [...prev, purity]);
            setStoreMetalPurityId(purity.id);
          }}
        />
      )}

      {/* ============================
          STONE PRICING — opens right below Basic Information the moment
          "Includes a Stone" is checked there, instead of buried inside
          Weights further down.
      ============================= */}

      {hasStoneComponent && (
        <div className="rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 p-6">
          <h3 className="mb-6 text-lg font-semibold">Stone Pricing</h3>

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

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label htmlFor="defaultGrossWeight">Gross Weight <RequiredMark /></Label>

            <input type="hidden" name="defaultGrossWeight" value={submittedWeight(grossWeight)} />
            <div className="flex gap-1">
              <Input
                id="defaultGrossWeight"
                type="number"
                step="any"
                min="0"
                className="flex-1"
                value={displayWeight(grossWeight)}
                onChange={(event) => setGrossWeight(toGramsString(event.target.value))}
                placeholder="0.000"
              />
              <Select value={weightUnit} onValueChange={(unit) => setWeightUnit(unit as "GRAM" | "CARAT")}>
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GRAM">g</SelectItem>
                  <SelectItem value="CARAT">ct</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ErrorText error={state.errors.defaultGrossWeight} />
          </div>

          {/* Stone Weight is only ever visibly editable once "Includes a
              Stone" is checked — it then lives in the Stone Pricing box
              below, as "Net Stone Weight" next to the Stone Carat Weight it
              mirrors. While the toggle is off, the field stays fully
              hidden (its value is cleared when the toggle turns off — see
              the toggle's own onChange below) rather than shown here for a
              plain metal item; this hidden input is only what keeps
              defaultStoneWeight in the submitted form shape (as an empty/
              null value) for that off case. */}
          {!hasStoneComponent && (
            <input type="hidden" name="defaultStoneWeight" value={submittedWeight(stoneWeight)} />
          )}

          {/* Carat Weight for a genuinely carat-weighed item (a loose
              Diamond/Stone product, its own entire weight) stays here.
              Once "Includes a Stone" is also checked on top of that, this
              same field moves into the Stone Pricing box below instead
              (as the embedded stone's own carat weight) so there is one
              Carat Weight input, not two bound to the same value. */}
          {isCaratFamily && !hasStoneComponent && (
            <div>
              <Label htmlFor="defaultCaratWeight">Carat Weight (ct)</Label>

              <Input
                id="defaultCaratWeight"
                name="defaultCaratWeight"
                type="number"
                step="any"
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

          {/* Net Weight sits at the bottom, spanning the full width — it's
              derived from Gross minus stone, not a peer entry field, so it
              reads last and gets the same "auto-filled" green treatment as
              Net Stone Weight above once it hasn't been hand-edited. */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="defaultNetWeight">Net Weight <RequiredMark /></Label>
              {!netTouched && derivedNet !== null && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Auto-filled
                </span>
              )}
            </div>

            <input type="hidden" name="defaultNetWeight" value={submittedWeight(netWeight)} />
            <div className="flex gap-1">
              <Input
                id="defaultNetWeight"
                type="number"
                step="any"
                min="0"
                className={!netTouched && derivedNet !== null ? "flex-1 border-emerald-300 bg-emerald-50" : "flex-1"}
                value={displayWeight(netWeight)}
                onChange={(event) => handleNetWeightChange(toGramsString(event.target.value))}
                placeholder="0.000"
              />
              <div className="flex h-9 w-16 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                {weightUnit === "GRAM" ? "g" : "ct"}
              </div>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {netTouched
                ? "Manually entered"
                : derivedNet !== null
                  ? "Gross − stone — edit to override"
                  : "Auto-calculated from Gross Weight"}
            </p>

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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
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

              <div>
                {showLocationField && <Label htmlFor="locationId">Location</Label>}
                <LocationSelect
                  locations={locations}
                  name="locationId"
                  defaultValue={defaultLocationId}
                  placeholder="Select location (optional)"
                />
                {showLocationField && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Optional — left blank, the same default a full Add Stock
                    entry would use is applied automatically.
                  </p>
                )}
                <ErrorText error={state.errors.locationId} />
              </div>
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
