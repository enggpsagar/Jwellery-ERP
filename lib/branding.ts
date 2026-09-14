// FILE PATH: lib/branding.ts
import { BrandFontFamily, BrandRadius } from "@prisma/client";

/**
 * Which next/font CSS variable (app/layout.tsx) a BrandFontFamily choice
 * points --font-sans at. INTER intentionally maps to --font-sans itself
 * (not --font-inter — no such variable exists) since that's already the
 * app's own un-customized default set on <html>; every other value
 * overrides it.
 */
export const BRAND_FONT_VARIABLE: Record<BrandFontFamily, string> = {
  INTER: "var(--font-sans)",
  ROBOTO: "var(--font-roboto)",
  POPPINS: "var(--font-poppins)",
  MERRIWEATHER: "var(--font-merriweather)",
  PLAYFAIR_DISPLAY: "var(--font-playfair)",
  LATO: "var(--font-lato)",
  MONTSERRAT: "var(--font-montserrat)",
  NUNITO: "var(--font-nunito)",
  OPEN_SANS: "var(--font-open-sans)",
  RALEWAY: "var(--font-raleway)",
  WORK_SANS: "var(--font-work-sans)",
  OSWALD: "var(--font-oswald)",
};

export const BRAND_FONT_LABEL: Record<BrandFontFamily, string> = {
  INTER: "Inter (default)",
  ROBOTO: "Roboto",
  POPPINS: "Poppins",
  MERRIWEATHER: "Merriweather (serif)",
  PLAYFAIR_DISPLAY: "Playfair Display (elegant serif)",
  LATO: "Lato",
  MONTSERRAT: "Montserrat",
  NUNITO: "Nunito",
  OPEN_SANS: "Open Sans",
  RALEWAY: "Raleway",
  WORK_SANS: "Work Sans",
  OSWALD: "Oswald (condensed)",
};

// rem values — DEFAULT matches globals.css's own --radius: 0.5rem exactly,
// so a store that never touches this setting renders byte-identical to
// before Branding existed.
export const BRAND_RADIUS_VALUE: Record<BrandRadius, string> = {
  SHARP: "0rem",
  DEFAULT: "0.5rem",
  ROUNDED: "1rem",
};

export const BRAND_RADIUS_LABEL: Record<BrandRadius, string> = {
  SHARP: "Sharp corners",
  DEFAULT: "Default",
  ROUNDED: "Rounded corners",
};

/**
 * The five requested action-button colors that have a genuine, independent
 * existing source to override (see StoreBranding's own schema doc comment
 * for why Add/Save aren't here too — both stay tied to accentColor).
 */
export const BRAND_ACTION_KEYS = [
  "editColor",
  "deleteColor",
  "cancelColor",
  "exportColor",
  "importColor",
] as const;
export type BrandActionKey = (typeof BRAND_ACTION_KEYS)[number];

export const BRAND_ACTION_LABEL: Record<BrandActionKey, string> = {
  editColor: "Edit",
  deleteColor: "Delete",
  cancelColor: "Cancel",
  exportColor: "Export",
  importColor: "Import",
};

// Every action color's own un-customized default — what it already looks
// like today, before this field existed. Shown as each picker's
// placeholder/reset value, and is what CSS actually falls back to (see
// globals.css's --btn-*-bg tokens) when a store leaves it blank.
export const BRAND_ACTION_DEFAULT: Record<BrandActionKey, string> = {
  editColor: "#2563eb",
  deleteColor: "#e7000b",
  cancelColor: "#78716c",
  exportColor: "#2a6fb5",
  importColor: "#8b5fbf",
};

// Which --btn-*-bg/-text pair (globals.css) each field overrides — kept as
// an explicit map, not derived from the field name at runtime, so the
// (dashboard) layout's override logic can't silently drift from what
// button.tsx's variants actually read.
export const BRAND_ACTION_CSS_PREFIX: Record<BrandActionKey, string> = {
  editColor: "btn-edit",
  deleteColor: "btn-delete",
  cancelColor: "btn-cancel",
  exportColor: "btn-export",
  importColor: "btn-import",
};

export const BRAND_STATUS_KEYS = [
  "statusDraftColor",
  "statusPendingColor",
  "statusCompletedColor",
  "statusActiveColor",
  "statusInactiveColor",
] as const;
export type BrandStatusKey = (typeof BRAND_STATUS_KEYS)[number];

export const BRAND_STATUS_LABEL: Record<BrandStatusKey, string> = {
  statusDraftColor: "Draft",
  statusPendingColor: "Pending",
  statusCompletedColor: "Completed",
  statusActiveColor: "Active",
  statusInactiveColor: "Inactive / Cancelled",
};

// Which --status-*-bg/-text pair (globals.css) each field overrides — same
// explicit-map convention as BRAND_ACTION_CSS_PREFIX above.
export const BRAND_STATUS_CSS_PREFIX: Record<BrandStatusKey, string> = {
  statusDraftColor: "status-draft",
  statusPendingColor: "status-pending",
  statusCompletedColor: "status-completed",
  statusActiveColor: "status-active",
  statusInactiveColor: "status-inactive",
};

export const BRAND_STATUS_DEFAULT: Record<BrandStatusKey, string> = {
  statusDraftColor: "#1447e6",
  statusPendingColor: "#e17100",
  statusCompletedColor: "#00a63e",
  statusActiveColor: "#00a63e",
  statusInactiveColor: "#e7000b",
};

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function relativeLuminance(hex: string): number | null {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return null;
  const full = normalizeHex(hex);
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;
  const [rl, gl, bl] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Standard WCAG contrast ratio (1-21) between two hex colors, or null if
 * either isn't a valid hex — used only as a soft "hard to read" warning in
 * the Branding form, never to block a save.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  if (lA === null || lB === null) return null;
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Given a background hex, picks near-white or near-black text — the
 * automatic pairing every customizable surface in this feature relies on
 * instead of a separate "text color" picker per surface (buttons, status
 * badges, the sidebar). Falls back to near-black (the safer default against
 * an unreadable/invalid hex) rather than throwing.
 */
export function pickReadableTextColor(backgroundHex: string): string {
  const luminance = relativeLuminance(backgroundHex);
  if (luminance === null) return "#1f2937";
  return luminance > 0.45 ? "#1f2937" : "#ffffff";
}
