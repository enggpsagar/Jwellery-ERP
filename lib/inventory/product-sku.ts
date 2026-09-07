// Pure, environment-agnostic SKU-prefix logic — imported by both
// product-actions.ts (to actually generate the code, server-side) and
// product-form.tsx (to show a live preview as the user fills the form).
// Kept dependency-free (no Prisma import) so it's safe in a client component.

import { PurityType, TargetStyle } from "@prisma/client";

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

/** Pulls the numeric karat/fineness out of a PurityType (e.g. "GOLD_22K" ->
 * "22", "SILVER_925" -> "925") — null for DIAMOND/OTHER, which have no
 * karat/fineness number, so that segment is simply omitted from the SKU. */
export function purityNumber(purity: PurityType | null | undefined): string | null {
  if (!purity) return null;
  const match = /_(\d+)/.exec(purity);
  return match ? match[1] : null;
}

/**
 * The structured, human-readable part of a product's SKU — e.g. "G22-LR"
 * for a Gold 22K Ladies Ring — built from Metal + Purity + Target Style +
 * Category Type. The caller appends "-NNN" (a per-prefix sequence number,
 * assigned at save time — see createProduct's max+retry loop) since this
 * alone doesn't guarantee uniqueness.
 */
export function buildSkuPrefix(params: {
  metalName: string;
  purity: PurityType | null | undefined;
  targetStyle: TargetStyle;
  categoryTypeName: string | null | undefined;
  categoryName: string | null | undefined;
}): string {
  const metalInitial = params.metalName.trim().charAt(0).toUpperCase() || "X";
  const purityPart = purityNumber(params.purity) ?? "";
  const targetInitial = TARGET_STYLE_INITIAL[params.targetStyle];
  const typeLabel = params.categoryTypeName || params.categoryName || "";
  const typeInitial = typeLabel.trim().charAt(0).toUpperCase() || "X";

  return `${metalInitial}${purityPart}-${targetInitial}${typeInitial}`;
}
