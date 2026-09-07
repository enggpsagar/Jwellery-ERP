// Pure, environment-agnostic SKU-prefix logic — imported by both
// product-actions.ts (to actually generate the code, server-side),
// product-form.tsx (to show a live preview as the user fills the form),
// and sku-format-form.tsx (to show a live example per format preset in
// Settings). Kept dependency-free (no Prisma import) so it's safe in a
// client component.

import { PurityType, SkuFormat, TargetStyle } from "@prisma/client";

export const TARGET_STYLE_INITIAL: Record<TargetStyle, string> = {
  LADIES: "L",
  GENTS: "G",
  KIDS: "K",
  UNISEX: "U",
};

export const TARGET_STYLE_LABEL: Record<TargetStyle, string> = {
  LADIES: "Ladies",
  GENTS: "Gents",
  KIDS: "Kids",
  UNISEX: "Unisex",
};

/** One row per selectable preset — drives the Settings picker's radio list
 * (label/description) and, together with composeSkuPrefix, its live
 * per-store example. */
export const SKU_FORMAT_OPTIONS: {
  value: SkuFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "METAL_PURITY_STYLE_CATEGORY",
    label: "Metal+Purity, Style+Category",
    description: "Metal and purity first, then style and category — e.g. G22-LR-001.",
  },
  {
    value: "METAL_CATEGORY_PURITY",
    label: "Metal+Category+Purity",
    description: "One combined block with metal, category, then purity — e.g. GR22-001.",
  },
  {
    value: "CATEGORY_METAL_PURITY",
    label: "Category, then Metal+Purity",
    description: "Category leads, followed by metal and purity — e.g. R-G22-001.",
  },
  {
    value: "STYLE_CATEGORY_METAL_PURITY",
    label: "Style+Category, then Metal+Purity",
    description: "Style and category lead, followed by metal and purity — e.g. LR-G22-001.",
  },
];

/** Pulls the numeric karat/fineness out of a PurityType (e.g. "GOLD_22K" ->
 * "22", "SILVER_925" -> "925") — null for DIAMOND/OTHER, which have no
 * karat/fineness number, so that segment is simply omitted from the SKU. */
export function purityNumber(purity: PurityType | null | undefined): string | null {
  if (!purity) return null;
  const match = /_(\d+)/.exec(purity);
  return match ? match[1] : null;
}

function initial(label: string | null | undefined, fallback = "X"): string {
  return label?.trim().charAt(0).toUpperCase() || fallback;
}

/**
 * Arranges four already-extracted letter/number pieces into the prefix
 * shape for one SkuFormat preset — the layer both buildSkuPrefix (real
 * generation, from live Product data) and the Settings preview (from
 * representative store data) share, so the two can never drift apart.
 * `groups` are dash-joined; a blank group (e.g. no purity number for
 * Diamond/Other) is dropped instead of leaving a stray "--" or trailing
 * dash.
 */
function joinGroups(groups: string[]): string {
  return groups.filter(Boolean).join("-");
}

export function composeSkuPrefix(
  format: SkuFormat,
  parts: {
    metalInitial: string;
    purityDigits: string;
    targetInitial: string;
    categoryInitial: string;
  },
): string {
  const { metalInitial, purityDigits, targetInitial, categoryInitial } = parts;

  switch (format) {
    case "METAL_CATEGORY_PURITY":
      return `${metalInitial}${categoryInitial}${purityDigits}`;
    case "CATEGORY_METAL_PURITY":
      return joinGroups([categoryInitial, `${metalInitial}${purityDigits}`]);
    case "STYLE_CATEGORY_METAL_PURITY":
      return joinGroups([`${targetInitial}${categoryInitial}`, `${metalInitial}${purityDigits}`]);
    case "METAL_PURITY_STYLE_CATEGORY":
    default:
      return joinGroups([`${metalInitial}${purityDigits}`, `${targetInitial}${categoryInitial}`]);
  }
}

/**
 * The structured, human-readable part of a product's SKU — e.g. "G22-LR"
 * for a Gold 22K Ladies Ring under the default preset — built from Metal +
 * Purity + Target Style + Category Type, arranged per the store's
 * configured SkuFormat (Settings > Business Settings > SKU Format). The
 * caller appends "-NNN" (a per-prefix sequence number, assigned at save
 * time — see createProduct's max+retry loop) since this alone doesn't
 * guarantee uniqueness.
 */
export function buildSkuPrefix(params: {
  metalName: string;
  purity: PurityType | null | undefined;
  targetStyle: TargetStyle;
  categoryTypeName: string | null | undefined;
  categoryName: string | null | undefined;
  format?: SkuFormat;
}): string {
  const typeLabel = params.categoryTypeName || params.categoryName || "";

  return composeSkuPrefix(params.format ?? "METAL_PURITY_STYLE_CATEGORY", {
    metalInitial: initial(params.metalName),
    purityDigits: purityNumber(params.purity) ?? "",
    targetInitial: TARGET_STYLE_INITIAL[params.targetStyle],
    categoryInitial: initial(typeLabel),
  });
}

/**
 * A representative "-001" example for one format preset, built from the
 * store's own metal/category NAMES (so the letters are genuinely the
 * store's, not a hardcoded stock photo) but a fixed illustrative purity
 * ("22", i.e. a 22K-equivalent) and style (Ladies) — those two aren't
 * being compared across presets, only the LAYOUT is, so a fixed pair keeps
 * every preset's example directly comparable. Powers the Settings picker.
 */
export function exampleSkuForFormat(
  format: SkuFormat,
  sample: { metalName: string; categoryName: string },
): string {
  const prefix = composeSkuPrefix(format, {
    metalInitial: initial(sample.metalName, "G"),
    purityDigits: "22",
    targetInitial: TARGET_STYLE_INITIAL.LADIES,
    categoryInitial: initial(sample.categoryName, "R"),
  });
  return `${prefix}-001`;
}
