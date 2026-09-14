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
};

export const BRAND_FONT_LABEL: Record<BrandFontFamily, string> = {
  INTER: "Inter (default)",
  ROBOTO: "Roboto",
  POPPINS: "Poppins",
  MERRIWEATHER: "Merriweather (serif)",
  PLAYFAIR_DISPLAY: "Playfair Display (elegant serif)",
  LATO: "Lato",
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
