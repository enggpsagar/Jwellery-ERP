"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { PurityType } from "@prisma/client";

import type { ProductFormState } from "@/lib/inventory/product-types";
import {
  getStoreCategoryTypes,
  getStoreCategoriesForMetal,
  getStoreMetalPurities,
  type StoreMetalOriginRow,
  type StoreMetalPurityRow,
} from "@/lib/actions/taxonomy-actions";
import { classifyPurityFamily } from "@/lib/business-units";
import { resolveGramsPerCarat, toPrimaryUnit, matchLegacyPurityType } from "@/lib/purity";
import { LocationSelect, useShowLocationField, type LocationOption } from "@/components/shared/location-select";
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
  /** Present only when this product already has real component rows (see
   * getProductById's own include) — a legacy product saved before this
   * feature existed has neither array, and the form seeds one metal row
   * from the scalar fields above instead. */
  metalComponents?: {
    id: string;
    metalTypeId: string;
    metalTypeName: string;
    storeMetalPurityId: string | null;
    storeMetalPurityLabel: string | null;
    grossWeight: string | null;
    netWeight: string | null;
  }[];
  stoneComponents?: {
    id: string;
    stoneMetalTypeName: string;
    stoneTypeNames: string | null;
    caratWeight: string | null;
    stoneWeight: string | null;
    stoneRate: string | null;
    stoneCharge: string | null;
    stoneChargeType: "FIXED" | "PERCENTAGE";
  }[];
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

// One row of the "Metal" repeater — only meaningful for productKind ===
// "METAL" (a real multi-metal piece, e.g. two-tone Gold+Silver); a
// productKind === "STONE" product (a loose gemstone with no separate
// metal) keeps using its own single Metal/Stone select unchanged and
// never renders these rows, though it still submits an equivalent
// one-row array on the wire (see buildLegacyMetalComponent below) so
// every product ends up with at least one ProductMetalComponent row.
type MetalComponentRow = {
  key: string;
  metalTypeId: string;
  storeMetalPurityId: string;
  // Always grams — a real (non-gemstone) metal is gram-based in this app's
  // own data model (only a gemstone StoreMetal row is ever carat-based, and
  // gemstones are excluded from the metal-component picker's own list), so
  // there's no unit toggle here the way the single top-level Gross/Net
  // Weight fields (productKind "STONE") need one.
  grossWeight: string;
  netWeight: string;
  netTouched: boolean;
};

function emptyMetalComponent(key: string = crypto.randomUUID()): MetalComponentRow {
  return { key, metalTypeId: "", storeMetalPurityId: "", grossWeight: "", netWeight: "", netTouched: false };
}

// One row of the "Stone" repeater — replaces the old single "Includes a
// Stone" toggle + one StoneComponentFields instance. Each row wraps that
// same component (fully prop-driven, needs no change to run in a loop).
type StoneComponentRow = {
  key: string;
  stoneMetalTypeName: string;
  stoneTypeNames: string[];
  caratWeight: string;
  stoneRate: string;
  stoneCharge: string;
  stoneChargeTouched: boolean;
  stoneWeight: string; // grams
  stoneWeightTouched: boolean;
  stoneWeightUnit: "GRAM" | "CARAT";
};

function emptyStoneComponent(key: string = crypto.randomUUID()): StoneComponentRow {
  return {
    key,
    stoneMetalTypeName: "",
    stoneTypeNames: [],
    caratWeight: "",
    stoneRate: "",
    stoneCharge: "",
    stoneChargeTouched: false,
    stoneWeight: "",
    stoneWeightTouched: false,
    stoneWeightUnit: "GRAM",
  };
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

  // The metal-component repeater (productKind "METAL" only). Seeded from
  // real component rows when this product already has them, falling back
  // to a single row built from the legacy scalar fields for a product
  // saved before this feature existed (or a brand-new product).
  const [metalComponents, setMetalComponents] = useState<MetalComponentRow[]>(() => {
    if (product?.metalComponents?.length) {
      return product.metalComponents.map((component) => ({
        key: component.id,
        metalTypeId: component.metalTypeId,
        storeMetalPurityId: component.storeMetalPurityId ?? "",
        grossWeight: component.grossWeight ?? "",
        netWeight: component.netWeight ?? "",
        // A saved value is authoritative — don't let the gross-driven
        // auto-calc effect silently recompute over it the instant this
        // page loads.
        netTouched: true,
      }));
    }
    if (product && !initialMetals.find((item) => item.id === product.metalTypeId)?.isGemstone) {
      return [
        {
          key: "legacy-0",
          metalTypeId: product.metalTypeId ?? "",
          storeMetalPurityId: product.storeMetalPurityId ?? "",
          grossWeight: product.defaultGrossWeight ?? "",
          netWeight: product.defaultNetWeight ?? "",
          netTouched: Boolean(product.defaultNetWeight),
        },
      ];
    }
    return [emptyMetalComponent()];
  });

  // Which metal-component row's own "Add Metal Type" / "Add Purity"
  // quick-create is open, if any — same per-row-key dialog pattern already
  // built for Invoice/Kacha/Quotation/Purchase's own line items.
  const [addMetalForKey, setAddMetalForKey] = useState<string | null>(null);
  const [addPurityForKey, setAddPurityForKey] = useState<string | null>(null);

  // Real per-Metal Purity options (Settings > Taxonomy > Purities), cached
  // per metalTypeId since each metal-component row can have its own metal —
  // mirrors the identical cache already built for Invoice/Kacha/Quotation's
  // own line items. Separate from (not a replacement for) the single
  // top-level `metalPurities` state further below, which productKind
  // "STONE" continues to use completely unchanged.
  const [metalPuritiesCache, setMetalPuritiesCache] = useState<Record<string, StoreMetalPurityRow[]>>({});

  function ensureMetalPurities(metalTypeId: string) {
    if (!metalTypeId || metalPuritiesCache[metalTypeId]) return;
    getStoreMetalPurities(metalTypeId)
      .then((data) => setMetalPuritiesCache((prev) => ({ ...prev, [metalTypeId]: data })))
      .catch((err) => console.error("Failed to load purities:", err));
  }

  useEffect(() => {
    for (const component of metalComponents) {
      if (component.metalTypeId) ensureMetalPurities(component.metalTypeId);
    }
    // Only needs to run once per distinct metalTypeId newly appearing —
    // ensureMetalPurities itself is a no-op once cached, so re-running this
    // on every metalComponents change (e.g. a weight edit) is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalComponents.map((c) => c.metalTypeId).join(",")]);

  function updateMetalComponent(key: string, patch: Partial<MetalComponentRow>) {
    setMetalComponents((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  // The FIRST metal-component row is this product's "primary" metal for
  // every purpose a single value is still needed elsewhere (Category
  // tagging, the legacy metalTypeId/defaultGrossWeight/defaultNetWeight
  // columns, embedded-stone carat conversion) — see the schema's own doc
  // comment on ProductMetalComponent for why weight specifically is never
  // summed across components.
  const primaryMetalComponent = metalComponents[0];

  // Whichever metal actually drives Category tagging / purity-family
  // classification right now — the metal-component repeater's first row
  // for productKind "METAL", or the single top-level select for "STONE",
  // exactly as today.
  const effectiveMetalTypeId = productKind === "METAL" ? (primaryMetalComponent?.metalTypeId ?? "") : metalTypeId;

  useEffect(() => {
    let cancelled = false;

    async function loadCategoriesForMetal() {
      try {
        const data = await getStoreCategoriesForMetal(effectiveMetalTypeId);
        if (!cancelled) setCategories(data);
      } catch (err) {
        console.error("Failed to load categories for metal:", err);
      }
    }

    loadCategoriesForMetal();

    return () => {
      cancelled = true;
    };
  }, [effectiveMetalTypeId]);

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

  // `metals`/`origins` are local state (not the raw props) so the various
  // inline "Add Metal"/"Add Stone"/"Add Stone Type" dialogs across this
  // form (single STONE-kind select, metal-component rows, stone-component
  // rows) can each append a newly-created row without a full page reload.
  const [metals, setMetals] = useState(initialMetals);
  const [origins, setOrigins] = useState(initialOrigins);

  // The stone-component repeater (productKind "METAL" only) — replaces the
  // old single hasStoneComponent toggle + one StoneComponentFields
  // instance. Seeded the same "real rows, else legacy fallback" way as
  // metalComponents above.
  const [stoneComponents, setStoneComponents] = useState<StoneComponentRow[]>(() => {
    if (product?.stoneComponents?.length) {
      return product.stoneComponents.map((component) => ({
        key: component.id,
        stoneMetalTypeName: component.stoneMetalTypeName,
        stoneTypeNames: component.stoneTypeNames
          ? component.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
          : [],
        caratWeight: component.caratWeight ?? "",
        stoneRate: component.stoneRate ?? "",
        stoneCharge: component.stoneCharge ?? "",
        stoneChargeTouched: Boolean(component.stoneCharge),
        stoneWeight: component.stoneWeight ?? "",
        stoneWeightTouched: Boolean(component.stoneWeight),
        stoneWeightUnit: "GRAM" as const,
      }));
    }
    if (product?.hasStoneComponent) {
      return [
        {
          key: "legacy-0",
          stoneMetalTypeName: product.defaultStoneMetalTypeName ?? "",
          stoneTypeNames: product.defaultStoneTypeNames
            ? product.defaultStoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
            : [],
          caratWeight: product.defaultCaratWeight ?? "",
          stoneRate: product.defaultStoneRate ?? "",
          stoneCharge: product.defaultStoneCharge ?? "",
          stoneChargeTouched: Boolean(product.defaultStoneCharge),
          stoneWeight: product.defaultStoneWeight ?? "",
          stoneWeightTouched: Boolean(product.defaultStoneWeight),
          stoneWeightUnit: "GRAM" as const,
        },
      ];
    }
    // A Stone-kind product saved before this repeater replaced its single
    // Stone/Stone Type select — its identity lives in metalTypeId/
    // stoneOriginOptionId (real FKs) rather than any of the free-text
    // fields above, so this seeds one row from those instead. Rate/Charge/
    // Weight were never stored at the product level for this case (Selling
    // Price resolves dynamically off the FK chain — see resolveStockSellingRate
    // in lib/purity.ts), so they start blank for manual entry, same as any
    // newly-added row.
    const isExistingGemstone = initialMetals.find((item) => item.id === product?.metalTypeId)?.isGemstone;
    if (isExistingGemstone) {
      return [
        {
          key: "legacy-0",
          stoneMetalTypeName: initialMetals.find((item) => item.id === product?.metalTypeId)?.name ?? "",
          stoneTypeNames: [initialOrigins.find((item) => item.id === product?.stoneOriginOptionId)?.name].filter(
            (name): name is string => Boolean(name),
          ),
          caratWeight: product?.defaultCaratWeight ?? "",
          stoneRate: "",
          stoneCharge: "",
          stoneChargeTouched: false,
          stoneWeight: product?.defaultNetWeight ?? "",
          stoneWeightTouched: Boolean(product?.defaultNetWeight),
          stoneWeightUnit: "GRAM" as const,
        },
      ];
    }
    return [];
  });

  function updateStoneComponent(key: string, patch: Partial<StoneComponentRow>) {
    setStoneComponents((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  // For productKind "STONE", metalTypeId (and everything it drives —
  // Primary Unit, grams-per-carat conversion, Category's isGemstone
  // exemption, taxonomy validation) now follows the Stone Pricing
  // repeater's own first row instead of a dedicated top-level select —
  // that row's stoneMetalTypeName is a free-text name (see
  // StoneComponentFields' own doc comment), resolved back to the real
  // StoreMetal id here the same way a name-only field always has to be.
  useEffect(() => {
    if (productKind !== "STONE") return;
    const name = stoneComponents[0]?.stoneMetalTypeName ?? "";
    const resolved = metals.find((item) => item.isGemstone && item.name === name);
    setMetalTypeId(resolved?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKind, stoneComponents[0]?.stoneMetalTypeName, metals]);

  const previousCategoryIdRef = useRef(categoryId);
  const previousMetalTypeIdRef = useRef(metalTypeId);

  // The real per-Metal Purity selection (Settings > Taxonomy > Purities) —
  // used only by productKind "STONE" going forward (the "METAL" repeater
  // has its own per-row equivalent above); kept exactly as it always was
  // rather than special-cased, since it was already a no-op for "STONE"
  // (the Purity field itself only ever rendered for "METAL") and this
  // avoids touching working code outside this change's real scope.
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
  function selectableMetalsFor(kind: "METAL" | "STONE", keepId?: string | null) {
    return metals.filter(
      (item) =>
        (item.isActive || item.id === keepId) &&
        (kind === "STONE" ? item.isGemstone : !item.isGemstone),
    );
  }

  // Reflects whichever metal is actually "selected" right now for
  // purity-family classification — the STONE-kind single select, or the
  // METAL-kind repeater's primary row.
  const selectedMetal = metals.find((item) => item.id === effectiveMetalTypeId);
  const metalFamily = selectedMetal
    ? classifyPurityFamily(selectedMetal)
    : null;

  // Real per-Metal Purity options (Settings > Taxonomy > Purities), fetched
  // for the single STONE-kind select (always empty/unused for "METAL",
  // which has its own metalPuritiesCache above — the fetch below already
  // no-ops for "METAL" via the productKind check, unchanged from before
  // this feature existed).
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
  // own doc comment above. STONE-kind only in practice (see above).
  useEffect(() => {
    const selected = metalPurities.find((item) => item.id === storeMetalPurityId);
    setDefaultPurity(matchLegacyPurityType(metalFamily, selected?.label) ?? "__none__");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMetalPurityId, metalPurities]);

  // The primary metal-component row's own resolved purity — governs an
  // embedded stone's carat-to-gram conversion for productKind "METAL",
  // the same role the single top-level `defaultPurity` plays for "STONE".
  // Recomputed live from the array rather than synced through an effect,
  // since there's no single field left to sync it onto.
  const primaryComponentPurityLabel = primaryMetalComponent
    ? (metalPuritiesCache[primaryMetalComponent.metalTypeId] ?? []).find(
        (item) => item.id === primaryMetalComponent.storeMetalPurityId,
      )?.label
    : undefined;
  const primaryComponentMetal = primaryMetalComponent
    ? metals.find((item) => item.id === primaryMetalComponent.metalTypeId)
    : undefined;
  const primaryComponentFamily = primaryComponentMetal ? classifyPurityFamily(primaryComponentMetal) : null;
  const stoneConversionPurity =
    productKind === "METAL"
      ? matchLegacyPurityType(primaryComponentFamily, primaryComponentPurityLabel) ?? "__none__"
      : defaultPurity;

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
  // edited directly in this session. productKind "STONE" only now (a loose
  // gemstone's own single Gross/Net Weight pair) — the METAL-kind
  // repeater's own per-row Net Weight has its own simpler auto-calc
  // (defaults to that row's own Gross Weight) further below.
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
  // a Diamond/Stone product's own Carat Weight is the exact same physical
  // quantity as its Net Weight, just in a different unit (Gross Weight's
  // own g/ct toggle already covers entering it that way), so it's derived
  // straight from Net Weight at submission time (see submittedCaratWeight
  // below) rather than kept as a second, separately-synced field. 1 carat
  // = 0.2 g, the standard used industry-wide.
  const isCaratFamily = metalFamily === "DIAMOND" || metalFamily === "STONE";

  // The selected metal's configured Primary Unit (Settings > Taxonomy) —
  // what Gross/Stone/Net Weight are actually persisted in, regardless of
  // which unit the toggle below is currently showing for entry
  // convenience. STONE-kind only (see grossWeight's own comment above).
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
  // metal component at all). Derived from the repeater now rather than a
  // single toggle.
  const hasStoneComponent = stoneComponents.length > 0;

  function handleNetWeightChange(value: string) {
    setNetTouched(true);
    setNetWeight(value);
  }

  // A Stone-kind product's own Net Weight is the sum of every stone row's
  // own Net Stone Weight — there's no separate top-level Gross Weight to
  // subtract from anymore (removed; a loose stone parcel has no gross-vs-
  // net distinction of its own, unlike a metal piece with an embedded
  // stone). stoneComponents' own stoneWeight is always stored in grams,
  // same convention as netWeight itself.
  const stoneWeightSum = stoneComponents.reduce((sum, row) => sum + (Number(row.stoneWeight) || 0), 0);

  const derivedNet =
    stoneWeightSum > 0
      ? // Trailing zeros trimmed so the box reads 5.5 rather than 5.500,
        // while still respecting the column's three decimals.
        String(Number(stoneWeightSum.toFixed(5)))
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

  // ---- Submitted, legacy-shaped scalar values -----------------------
  // Every one of these mirrors exactly what this form always submitted
  // under these field names — product-actions.ts's validation/SKU-
  // generation/stock-entry-prefill logic is unchanged and still trusts
  // them directly. For productKind "METAL" they're now computed from the
  // repeaters' PRIMARY (first) row/sum, per the schema's own fine-weight
  // safety rule (see ProductMetalComponent's doc comment) rather than read
  // off single top-level state.
  const submittedMetalTypeId = productKind === "METAL" ? (primaryMetalComponent?.metalTypeId ?? "") : metalTypeId;
  const submittedStoreMetalPurityId =
    productKind === "METAL" ? (primaryMetalComponent?.storeMetalPurityId ?? "") : storeMetalPurityId;
  const submittedDefaultPurity =
    productKind === "METAL" ? (stoneConversionPurity === "__none__" ? "" : stoneConversionPurity) : (defaultPurity === "__none__" ? "" : defaultPurity);
  const submittedNetWeight = productKind === "METAL" ? (primaryMetalComponent?.netWeight ?? "") : submittedWeight(netWeight);
  // No separate Gross Weight of its own anymore for a Stone-kind product —
  // submits the same value as Net Weight (see stoneWeightSum's own doc
  // comment above), which also keeps the still-required defaultGrossWeight
  // column satisfied server-side.
  const submittedGrossWeight = productKind === "METAL" ? (primaryMetalComponent?.grossWeight ?? "") : submittedNetWeight;

  const stoneChargeSum = stoneComponents.reduce((sum, row) => sum + (Number(row.stoneCharge) || 0), 0);
  const primaryStone = stoneComponents[0];

  const submittedHasStoneComponent = productKind === "METAL" && hasStoneComponent;
  const submittedStoneWeight =
    productKind === "METAL"
      ? (submittedHasStoneComponent ? String(Number(stoneWeightSum.toFixed(5))) : "")
      : submittedWeight(stoneWeight);
  const submittedStoneCharge = submittedHasStoneComponent ? String(Number(stoneChargeSum.toFixed(2))) : "";
  const submittedStoneRate = submittedHasStoneComponent ? (primaryStone?.stoneRate ?? "") : "";
  const submittedStoneMetalTypeName = submittedHasStoneComponent ? (primaryStone?.stoneMetalTypeName ?? "") : "";
  const submittedStoneTypeNames = submittedHasStoneComponent
    ? stoneComponents.map((row) => row.stoneTypeNames.join(",")).filter(Boolean).join(",")
    : "";
  // Derived straight from Net Weight rather than a separately-entered
  // field -- see the comment on isCaratFamily above.
  const netWeightNum = Number(netWeight);
  const derivedCaratWeight =
    netWeight.trim() !== "" && Number.isFinite(netWeightNum)
      ? String(Number((netWeightNum / gramsPerCarat).toFixed(5)))
      : "";
  const submittedCaratWeight = productKind === "STONE" ? derivedCaratWeight : (primaryStone?.caratWeight ?? "");

  const metalComponentsJson = JSON.stringify(
    productKind === "METAL"
      ? metalComponents
          .filter((row) => row.metalTypeId)
          .map((row) => ({
            metalTypeId: row.metalTypeId,
            storeMetalPurityId: row.storeMetalPurityId || null,
            grossWeight: row.grossWeight || null,
            netWeight: row.netWeight || null,
          }))
      : metalTypeId
        ? [{ metalTypeId, storeMetalPurityId: null, grossWeight: submittedWeight(grossWeight) || null, netWeight: submittedWeight(netWeight) || null }]
        : [],
  );

  // Submitted for both kinds now — a Stone-kind product's own stone(s) are
  // these same repeater rows (see the metalTypeId-sync effect near
  // stoneComponents' own declaration), not a separate scalar selection.
  const stoneComponentsJson = JSON.stringify(
    stoneComponents
      .filter((row) => row.stoneMetalTypeName.trim())
      .map((row) => ({
        stoneMetalTypeName: row.stoneMetalTypeName,
        stoneTypeNames: row.stoneTypeNames.join(","),
        caratWeight: row.caratWeight || null,
        stoneWeight: row.stoneWeight || null,
        stoneRate: row.stoneRate || null,
        stoneCharge: row.stoneCharge || null,
        stoneChargeType: "FIXED",
      })),
  );

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Basic Information</h3>
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
                // field beside this one — switching modes clears both the
                // single select AND the repeaters rather than leaving a
                // now-mismatched selection silently in place.
                setMetalTypeId("");
                setStoneOriginOptionId("");
                setMetalComponents([emptyMetalComponent()]);
                // A Stone-kind product IS its stone(s) — starts with one row
                // instead of empty, unlike the Metal-kind repeater below
                // where an embedded stone stays genuinely optional.
                setStoneComponents(kind === "STONE" ? [emptyStoneComponent()] : []);
                // Category/Type are hidden entirely for Stone (see below) —
                // clear them on every switch so a category picked while on
                // Metal doesn't silently keep submitting behind the
                // now-hidden fields once switched to Stone.
                setCategoryId("");
                setCategoryTypeId("");
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

          {productKind === "STONE" && (
            // Which Stone(s) this product actually is now lives entirely in
            // the Stone Pricing box below (one row per stone) — no separate
            // top-level Stone/Stone Type select duplicating that same
            // picker, and no separate Gross Weight either (see
            // stoneWeightSum's own doc comment — Net Weight below is now
            // the sum of every row's own Net Stone Weight). metalTypeId
            // itself is still submitted via the shared hidden input further
            // below (submittedMetalTypeId), kept in sync with the
            // repeater's first row — see the effect near where metalTypeId
            // is declared.
            <ErrorText error={state.errors.metalTypeId} />
          )}

          {/* Hidden entirely for the gemstone family — a loose Diamond/
              Stone product isn't itself an ornament shape (Ring/Bangle/
              ...), and showing Category/Type with no sensible options for
              it was just confusing. Category/Type are cleared (see the
              Metal/Stone switch above) whenever this hides, so nothing
              stale submits behind it. */}
          {productKind !== "STONE" && (
          <>
          <div>
            <Label>Category <RequiredMark /></Label>

            {categories.length > 0 ? (
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
            ) : (
              // Nothing to pick from — this store has no category that's
              // either universal or tagged to the current Metal/Stone yet
              // (see getStoreCategoriesForMetal). A dropdown with only "no
              // categories found" is clutter; a plain "Add Category" prompt
              // gets a store past this the first time, and the real picker
              // appears the moment one exists — same "hide until there's
              // something to show" reasoning as the Type field below.
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-start text-muted-foreground"
                onClick={() => setAddCategoryOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add a category to get started
              </Button>
            )}

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
          </>
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

      {/* ============================
          METALS — productKind "METAL" only. Replaces the old single Metal
          Type/Purity/Gross Weight/Net Weight fields with a repeatable list,
          same "Add row" pattern as Invoice/Purchase/Kacha/Quotation's own
          line items.
      ============================= */}

      {productKind === "METAL" && (
        <div className="rounded-xl border p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Metals</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Usually just one. Add another for a genuinely multi-metal piece
                (e.g. a two-tone Gold + Silver ring).
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMetalComponents((prev) => [...prev, emptyMetalComponent()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Metal
            </Button>
          </div>

          <div className="space-y-4">
            {metalComponents.map((row, index) => {
              const rowMetal = metals.find((item) => item.id === row.metalTypeId);
              const rowPurities = metalPuritiesCache[row.metalTypeId] ?? [];
              const rowMetals = selectableMetalsFor("METAL");

              return (
                <div key={row.key} className="rounded-lg border p-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">
                        Metal Type <RequiredMark />
                        {index === 0 && <span className="ml-1 font-normal text-muted-foreground">(primary)</span>}
                      </Label>
                      <div className="flex gap-1.5">
                        <Select
                          value={row.metalTypeId}
                          onValueChange={(value) => {
                            ensureMetalPurities(value);
                            updateMetalComponent(row.key, { metalTypeId: value, storeMetalPurityId: "" });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select metal" />
                          </SelectTrigger>
                          <SelectContent>
                            {rowMetals.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="w-9 shrink-0 px-0"
                          title="Add Metal Type"
                          onClick={() => setAddMetalForKey(row.key)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Purity</Label>
                      <div className="flex gap-1.5">
                        <Select
                          value={row.storeMetalPurityId || "__none__"}
                          onValueChange={(value) =>
                            updateMetalComponent(row.key, { storeMetalPurityId: value === "__none__" ? "" : value })
                          }
                          disabled={!rowMetal || !rowMetal.hasPurity}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={rowMetal && !rowMetal.hasPurity ? "N/A" : "Select"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {rowPurities.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="w-9 shrink-0 px-0"
                          title="Add Purity"
                          disabled={!rowMetal || !rowMetal.hasPurity}
                          onClick={() => setAddPurityForKey(row.key)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Gross Weight (g) <RequiredMark /></Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={row.grossWeight}
                        placeholder="0.000"
                        onChange={(event) => {
                          const value = event.target.value;
                          const patch: Partial<MetalComponentRow> = { grossWeight: value };
                          if (!row.netTouched) patch.netWeight = value;
                          updateMetalComponent(row.key, patch);
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Net Weight (g) <RequiredMark /></Label>
                        {!row.netTouched && row.grossWeight && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            Auto
                          </span>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={row.netWeight}
                        placeholder="0.000"
                        className={!row.netTouched && row.grossWeight ? "border-emerald-300 bg-emerald-50" : undefined}
                        onChange={(event) => updateMetalComponent(row.key, { netWeight: event.target.value, netTouched: true })}
                      />
                    </div>
                  </div>

                  {metalComponents.length > 1 && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setMetalComponents((prev) => prev.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <ErrorText error={state.errors.metalComponentsJson} />
        </div>
      )}

      <input type="hidden" name="metalComponentsJson" value={metalComponentsJson} />
      <input type="hidden" name="stoneComponentsJson" value={stoneComponentsJson} />
      <input type="hidden" name="metalTypeId" value={submittedMetalTypeId} />
      <input type="hidden" name="storeMetalPurityId" value={submittedStoreMetalPurityId} />
      <input type="hidden" name="defaultPurity" value={submittedDefaultPurity} />
      <input type="hidden" name="defaultGrossWeight" value={submittedGrossWeight} />
      <input type="hidden" name="defaultNetWeight" value={submittedNetWeight} />
      <input type="hidden" name="hasStoneComponent" value={submittedHasStoneComponent ? "true" : "false"} />
      <input type="hidden" name="defaultStoneWeight" value={submittedStoneWeight} />
      <input type="hidden" name="defaultStoneCharge" value={submittedStoneCharge} />
      <input type="hidden" name="defaultStoneRate" value={submittedStoneRate} />
      <input type="hidden" name="defaultStoneMetalTypeName" value={submittedStoneMetalTypeName} />
      <input type="hidden" name="defaultStoneTypeNames" value={submittedStoneTypeNames} />
      <input type="hidden" name="defaultCaratWeight" value={submittedCaratWeight} />

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

      {/* Metal-component repeater's own "Add Metal Type"/"Add Purity" —
          rendered via Radix's own portal, so being inside <form> in the
          JSX tree doesn't nest them in the actual <form> DOM node. */}
      <AddMetalDialog
        open={addMetalForKey !== null}
        onOpenChange={(open) => { if (!open) setAddMetalForKey(null); }}
        isGemstone={false}
        onCreated={(metal) => {
          setMetals((prev) => [...prev, metal]);
          if (addMetalForKey) {
            ensureMetalPurities(metal.id);
            updateMetalComponent(addMetalForKey, { metalTypeId: metal.id, storeMetalPurityId: "" });
          }
          setAddMetalForKey(null);
        }}
      />

      {addPurityForKey && (() => {
        const targetRow = metalComponents.find((row) => row.key === addPurityForKey);
        if (!targetRow || !targetRow.metalTypeId) return null;
        const targetMetalTypeId = targetRow.metalTypeId;
        return (
          <AddPurityDialog
            open
            onOpenChange={(open) => { if (!open) setAddPurityForKey(null); }}
            storeMetalId={targetMetalTypeId}
            onCreated={(purity) => {
              setMetalPuritiesCache((prev) => ({
                ...prev,
                [targetMetalTypeId]: [...(prev[targetMetalTypeId] ?? []), purity],
              }));
              updateMetalComponent(targetRow.key, { storeMetalPurityId: purity.id });
              setAddPurityForKey(null);
            }}
          />
        );
      })()}

      {/* ============================
          STONES — productKind "METAL" (optional, embedded stone) or "STONE"
          (required, this IS the product — see the metalTypeId-sync effect
          near stoneComponents' own declaration). Replaces the old single
          "Includes a Stone" toggle + one StoneComponentFields instance with
          a repeatable list; each row wraps that same component unchanged.
      ============================= */}

      {(productKind === "METAL" || productKind === "STONE") && (
        <div className="rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Stone Pricing</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {productKind === "STONE"
                  ? "Add one row per stone in this product (e.g. both a Ruby and a Diamond in the same parcel)."
                  : "Optional — add one row per embedded stone (e.g. both a Ruby and a Diamond on the same piece)."}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStoneComponents((prev) => [...prev, emptyStoneComponent()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Stone
            </Button>
          </div>

          {stoneComponents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {productKind === "STONE" ? "Add at least one stone." : "No stones added yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {stoneComponents.map((row) => (
                <div key={row.key} className="rounded-lg border border-emerald-200 bg-white p-4">
                  <StoneComponentFields
                    metals={metals}
                    origins={origins}
                    onMetalsChange={setMetals}
                    onOriginsChange={setOrigins}
                    stoneMetalTypeName={row.stoneMetalTypeName}
                    onStoneChange={(name, typeNames) => updateStoneComponent(row.key, { stoneMetalTypeName: name, stoneTypeNames: typeNames })}
                    selectedTypeNames={row.stoneTypeNames}
                    onTypesChange={(names) => updateStoneComponent(row.key, { stoneTypeNames: names })}
                    caratWeight={Number(row.caratWeight) || 0}
                    onCaratWeightChange={(value) => {
                      const caratNum = Number(value);
                      const carat = value.trim() !== "" && Number.isFinite(caratNum) ? caratNum : 0;
                      const patch: Partial<StoneComponentRow> = { caratWeight: value };
                      if (!row.stoneChargeTouched) {
                        const rate = row.stoneRate.trim() === "" ? 0 : Number(row.stoneRate) || 0;
                        patch.stoneCharge = String(Number((rate * carat).toFixed(2)));
                      }
                      if (!row.stoneWeightTouched) {
                        const rate = resolveGramsPerCarat(stoneConversionPurity, caratConversionRates);
                        patch.stoneWeight = String(Number((carat * rate).toFixed(5)));
                      }
                      updateStoneComponent(row.key, patch);
                    }}
                    stoneRate={Number(row.stoneRate) || 0}
                    onStoneRateChange={(value) => {
                      const patch: Partial<StoneComponentRow> = { stoneRate: value };
                      if (!row.stoneChargeTouched) {
                        const rateNum = value.trim() === "" ? 0 : Number(value);
                        const caratNum = row.caratWeight.trim() === "" ? 0 : Number(row.caratWeight);
                        const rate = Number.isFinite(rateNum) ? rateNum : 0;
                        const carat = Number.isFinite(caratNum) ? caratNum : 0;
                        patch.stoneCharge = String(Number((rate * carat).toFixed(2)));
                      }
                      updateStoneComponent(row.key, patch);
                    }}
                    stoneCharge={Number(row.stoneCharge) || 0}
                    onStoneChargeChange={(value) => updateStoneComponent(row.key, { stoneCharge: value, stoneChargeTouched: true })}
                    stoneChargeTouched={row.stoneChargeTouched}
                    stoneWeightInput={
                      row.stoneWeightUnit === "CARAT"
                        ? Number(((Number(row.stoneWeight) || 0) / resolveGramsPerCarat(stoneConversionPurity, caratConversionRates)).toFixed(3))
                        : Number(row.stoneWeight) || 0
                    }
                    onStoneWeightInputChange={(value) => {
                      const typed = Number(value) || 0;
                      const rate = resolveGramsPerCarat(stoneConversionPurity, caratConversionRates);
                      const grams = row.stoneWeightUnit === "CARAT" ? typed * rate : typed;
                      updateStoneComponent(row.key, { stoneWeight: String(Number(grams.toFixed(5))), stoneWeightTouched: true });
                    }}
                    stoneWeightUnit={row.stoneWeightUnit}
                    onStoneWeightUnitChange={(unit) => updateStoneComponent(row.key, { stoneWeightUnit: unit })}
                    netStoneWeightTouched={row.stoneWeightTouched}
                  />

                  {/* A Stone-kind product must always keep at least one
                      row — that's the whole product, not an optional
                      extra — so Remove hides on the last one instead of
                      letting the box empty out. */}
                  {(productKind !== "STONE" || stoneComponents.length > 1) && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setStoneComponents((prev) => prev.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <ErrorText error={state.errors.defaultCaratWeight} />
          <ErrorText error={state.errors.defaultStoneRate} />
          <ErrorText error={state.errors.defaultStoneCharge} />
          <ErrorText error={state.errors.defaultStoneWeight} />
        </div>
      )}

      {/* ============================
          NET WEIGHT (productKind "STONE" only) — a loose gemstone's own
          total weight, summed from every stone row above (no separate
          Gross Weight of its own anymore — see stoneWeightSum's own doc
          comment). The "METAL" repeater's own per-row Net Weight fields
          above replace this entirely.
      ============================= */}

      {/* No separate Carat Weight field here anymore -- for a genuinely
          carat-weighed item (a loose Diamond/Stone product, its own entire
          weight) it's the exact same physical quantity as Net Weight,
          which already has its own g/ct unit toggle here. defaultCaratWeight
          is still derived below (for product-detail-content.tsx's display
          and any other reader) directly from Net Weight, not from a second
          manually-entered field. */}
      {productKind === "STONE" && (
        <div className="max-w-sm">
          <div className="flex items-center justify-between">
            <Label htmlFor="defaultNetWeight">Net Weight <RequiredMark /></Label>
            {!netTouched && derivedNet !== null && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Auto-filled
              </span>
            )}
          </div>

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
                ? "Sum of every stone's Net Stone Weight above — edit to override"
                : "Auto-calculated from the stones added above"}
          </p>

          <ErrorText error={state.errors.defaultNetWeight} />
        </div>
      )}

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
