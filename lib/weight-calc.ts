// lib/weight-calc.ts
//
// THE net / fine weight calculator (client-safe, pure). Settings > Weights
// (BusinessSettings) decides how it works; lib/fine-weight.ts (server) loads
// a store's settings + purity tables and calls these same functions, and
// every form calls them with the settings from useWeightSettings() for its
// live preview — so a preview can never disagree with what is saved.
//
//   Net  = Gross − (stone weight, if netDeductStoneWeight)
//                − (DMO / Less weight, if netDeductDmoWeight)
//   Fine = (Net, or Gross when fineWeightBasis = GROSS)
//          × (fineness % + (wastage %, if addWastageToFineWeight)) / 100
//          — metals with a purity only; any other metal's fine = its net.
//
// Rounding: weights are shown / printed with weightDecimalsGram (grams) or
// weightDecimalsCarat (carats) decimals. A derived net weight is rounded to
// that many decimals (3 by default — what every form already did). A fine
// weight keeps the column's 5 decimals while 3 or more are shown (exactly
// as before these settings existed), and is rounded to what is shown when
// fewer than 3 are chosen, so the stored figure is the printed one.
// Every default reproduces the behaviour before Settings > Weights existed.

export type FineWeightBasisValue = "NET" | "GROSS"
export type WeightUnitValue = "GRAM" | "CARAT"

export type WeightSettings = {
  netDeductStoneWeight: boolean
  netDeductDmoWeight: boolean
  fineWeightBasis: FineWeightBasisValue
  addWastageToFineWeight: boolean
  weightDecimalsGram: number
  weightDecimalsCarat: number
}

export const DEFAULT_WEIGHT_SETTINGS: WeightSettings = {
  netDeductStoneWeight: true,
  netDeductDmoWeight: true,
  fineWeightBasis: "NET",
  addWastageToFineWeight: false,
  weightDecimalsGram: 3,
  weightDecimalsCarat: 3,
}

/** Column precision: grams are Decimal(12,5), carats Decimal(10,3). */
export const MAX_GRAM_DECIMALS = 5
export const MAX_CARAT_DECIMALS = 3

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** Any partial / untrusted input → a complete, valid settings object. */
export function normalizeWeightSettings(input?: Partial<Record<keyof WeightSettings, unknown>> | null): WeightSettings {
  const d = DEFAULT_WEIGHT_SETTINGS
  if (!input) return { ...d }
  const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback)
  return {
    netDeductStoneWeight: bool(input.netDeductStoneWeight, d.netDeductStoneWeight),
    netDeductDmoWeight: bool(input.netDeductDmoWeight, d.netDeductDmoWeight),
    fineWeightBasis: input.fineWeightBasis === "GROSS" ? "GROSS" : "NET",
    addWastageToFineWeight: bool(input.addWastageToFineWeight, d.addWastageToFineWeight),
    weightDecimalsGram: clampInt(input.weightDecimalsGram, 0, MAX_GRAM_DECIMALS, d.weightDecimalsGram),
    weightDecimalsCarat: clampInt(input.weightDecimalsCarat, 0, MAX_CARAT_DECIMALS, d.weightDecimalsCarat),
  }
}

export function sameWeightSettings(a: WeightSettings, b: WeightSettings) {
  return (Object.keys(DEFAULT_WEIGHT_SETTINGS) as (keyof WeightSettings)[]).every((key) => a[key] === b[key])
}

/** Decimals a weight in this unit is shown / printed with. */
export function displayDecimals(unit: WeightUnitValue | string | null | undefined, settings: WeightSettings) {
  return unit === "CARAT" ? settings.weightDecimalsCarat : settings.weightDecimalsGram
}

/** Decimals a calculated net weight is rounded to (= shown). */
export function netDecimals(unit: WeightUnitValue | string | null | undefined, settings: WeightSettings) {
  return displayDecimals(unit, settings)
}

/** Decimals a calculated fine weight is stored with — 5 while 3+ are shown. */
export function fineDecimals(unit: WeightUnitValue | string | null | undefined, settings: WeightSettings) {
  const shown = displayDecimals(unit, settings)
  return shown >= 3 ? MAX_GRAM_DECIMALS : shown
}

export function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const num = Number(typeof value === "object" ? String(value) : value)
  return Number.isFinite(num) ? num : null
}

/** "9.700" — a weight with the store's decimals (no unit). "" for blank. */
export function formatWeight(value: unknown, unit: WeightUnitValue | string | null | undefined, settings: WeightSettings) {
  const num = toNumber(value)
  if (num === null) return ""
  return num.toFixed(displayDecimals(unit, settings))
}

/**
 * Display-only formatters bound to one store's decimals — THE way to show a
 * weight on screen, in a report or in an export's text. Client components
 * get one from useWeightFormat() (components/providers/weight-settings-
 * provider), server code from getWeightFormat(storeId)
 * (lib/weight-settings.server.ts). Never use these to round a stored value.
 *
 *   g(9.7)        → "9.700"        grams, fixed decimals, no unit
 *   ct(0.28)      → "0.280"        carats, fixed decimals, no unit
 *   grams(9.7)    → "9.700 g"      ("" for blank)
 *   carats(0.28)  → "0.280 ct"
 *   unit(v, u)    → grams or carats by unit ("CARAT" → ct)
 *   gramsLocale / caratsLocale → en-IN grouping, up to the store's decimals
 *                   (trailing zeros dropped — the style of the ledger/KPIs)
 *   gNum(9.71234) → 9.712         a report/export number cell (stays a number)
 *   stoneCt(0.28) → "0.28" — a stone row's carats, which have always been
 *                   shown with 2 decimals: at most 2, fewer when the store
 *                   chose fewer.
 */
export type WeightFormat = ReturnType<typeof weightFormatter>

export function weightFormatter(settings: WeightSettings) {
  const gramDecimals = settings.weightDecimalsGram
  const caratDecimals = settings.weightDecimalsCarat
  const stoneCaratDecimals = Math.min(2, caratDecimals)
  const fixed = (value: unknown, decimals: number) => {
    const num = toNumber(value)
    return num === null ? "" : num.toFixed(decimals)
  }
  const locale = (value: unknown, decimals: number) => {
    const num = toNumber(value)
    return num === null ? "" : num.toLocaleString("en-IN", { maximumFractionDigits: decimals })
  }
  const withUnit = (text: string, suffix: string) => (text === "" ? "" : `${text} ${suffix}`)
  return {
    settings,
    gramDecimals,
    caratDecimals,
    stoneCaratDecimals,
    g: (value: unknown) => fixed(value, gramDecimals),
    ct: (value: unknown) => fixed(value, caratDecimals),
    stoneCt: (value: unknown) => fixed(value, stoneCaratDecimals),
    grams: (value: unknown) => withUnit(fixed(value, gramDecimals), "g"),
    carats: (value: unknown) => withUnit(fixed(value, caratDecimals), "ct"),
    stoneCarats: (value: unknown) => withUnit(fixed(value, stoneCaratDecimals), "ct"),
    unit: (value: unknown, unit: WeightUnitValue | string | null | undefined) =>
      unit === "CARAT" ? withUnit(fixed(value, caratDecimals), "ct") : withUnit(fixed(value, gramDecimals), "g"),
    gramsLocale: (value: unknown) => locale(value, gramDecimals),
    caratsLocale: (value: unknown) => locale(value, caratDecimals),
    /** A report/export cell that stays a number, rounded to what is shown. */
    gNum: (value: number) => roundTo(value, gramDecimals),
  }
}

/** Default-settings formatter (3 decimals) — for code with no store at hand. */
export const DEFAULT_WEIGHT_FORMAT = weightFormatter(DEFAULT_WEIGHT_SETTINGS)

export type NetWeightInput = {
  grossWeight: unknown
  stoneWeight?: unknown
  /** DMO / dust / other weight. */
  dmoWeight?: unknown
  /** Stock's "Less Weight" — the same deduction as DMO. */
  lessWeight?: unknown
}

/**
 * Net weight from gross and its deductions, or null when there is no gross
 * (or the deductions exceed it) — callers then leave net as typed.
 */
export function deriveNetWeight(
  input: NetWeightInput,
  settings: WeightSettings,
  unit: WeightUnitValue | string | null = "GRAM",
  /** Override the rounding (the server keeps the column's 5 decimals while
   *  3+ are shown — what its Excel imports always stored). */
  decimals?: number,
): number | null {
  const gross = toNumber(input.grossWeight)
  if (!gross) return null
  const stone = settings.netDeductStoneWeight ? Math.max(toNumber(input.stoneWeight) ?? 0, 0) : 0
  const dmo = settings.netDeductDmoWeight
    ? Math.max(toNumber(input.dmoWeight) ?? 0, 0) + Math.max(toNumber(input.lessWeight) ?? 0, 0)
    : 0
  const net = gross - stone - dmo
  return net >= 0 ? roundTo(net, decimals ?? netDecimals(unit, settings)) : null
}

/** A short "Gross − stone − DMO" hint for the Net Weight field
 *  (dmoLabel null = the form has no DMO / Less input). */
export function netWeightHint(settings: WeightSettings, dmoLabel: string | null = null) {
  const parts = ["Gross"]
  if (settings.netDeductStoneWeight) parts.push("stone")
  if (settings.netDeductDmoWeight && dmoLabel) parts.push(dmoLabel)
  return parts.length === 1 ? "= Gross" : parts.join(" − ")
}

export type FineWeightInput = {
  netWeight: unknown
  grossWeight?: unknown
  /** The line's purity fineness % (ignored unless hasPurity). */
  finenessPercent: number
  /** The line's wastage / touch % (only counts with addWastageToFineWeight). */
  wastagePercent?: unknown
  /** StoreMetal.hasPurity — anything else's fine weight is its net. */
  hasPurity: boolean
  /** StoreMetal.primaryUnit — only decides rounding. */
  unit?: WeightUnitValue | string | null
}

/** The fineness % actually applied: fineness, plus wastage when that's on. */
export function effectiveFinenessPercent(finenessPercent: number, wastagePercent: unknown, settings: WeightSettings) {
  const wastage = settings.addWastageToFineWeight ? Math.max(toNumber(wastagePercent) ?? 0, 0) : 0
  return finenessPercent + wastage
}

/** Pure (24K / 999) weight of a line, or null when it has no net weight. */
export function calcFineWeight(input: FineWeightInput, settings: WeightSettings): number | null {
  const net = toNumber(input.netWeight)
  if (net === null) return null
  const decimals = fineDecimals(input.unit ?? "GRAM", settings)
  if (!input.hasPurity) return roundTo(net, decimals)
  const gross = toNumber(input.grossWeight)
  const base = settings.fineWeightBasis === "GROSS" && gross && gross > 0 ? gross : net
  return roundTo((base * effectiveFinenessPercent(input.finenessPercent, input.wastagePercent, settings)) / 100, decimals)
}

/** Wastage % as stored on a line: blank / 0 / invalid → null. */
export function normalizeWastagePercent(value: unknown): number | null {
  const num = toNumber(value)
  if (num === null || num <= 0) return null
  return Math.min(roundTo(num, 2), 999.99)
}

/** The Settings > Weights live example. */
export function weightExample(settings: WeightSettings) {
  const sample = { grossWeight: 10, stoneWeight: 0.2, dmoWeight: 0.1, finenessPercent: 91.6, wastagePercent: 2 }
  const net = deriveNetWeight(sample, settings) ?? 0
  const fine = calcFineWeight({ ...sample, netWeight: net, hasPurity: true }, settings) ?? 0
  return { ...sample, net, fine }
}
