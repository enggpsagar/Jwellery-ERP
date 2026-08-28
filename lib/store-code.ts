/**
 * Store codes, built from where the shop is and what it is called.
 *
 * Shape: `<STATE>-<AREA>-<NAME>`, e.g. Himalaya Jewellers in Nagpur,
 * Maharashtra becomes `MH-NAG-HIM`.
 *
 * The code is location-derived on purpose, so it stays meaningful when read
 * on an invoice or in a list, and it is never editable afterwards — an
 * identifier that can be changed is one that stops identifying anything, and
 * this one is stamped on records that outlive the edit.
 */

/**
 * Official two-letter abbreviations, so "Maharashtra" is always MH rather
 * than whatever the first two letters happen to be. Anything unlisted falls
 * back to its first two letters, which is wrong less often than refusing.
 */
const STATE_CODES: Record<string, string> = {
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  assam: "AS",
  bihar: "BR",
  chhattisgarh: "CG",
  goa: "GA",
  gujarat: "GJ",
  haryana: "HR",
  "himachal pradesh": "HP",
  jharkhand: "JH",
  karnataka: "KA",
  kerala: "KL",
  "madhya pradesh": "MP",
  maharashtra: "MH",
  manipur: "MN",
  meghalaya: "ML",
  mizoram: "MZ",
  nagaland: "NL",
  odisha: "OD",
  orissa: "OD",
  punjab: "PB",
  rajasthan: "RJ",
  sikkim: "SK",
  "tamil nadu": "TN",
  telangana: "TS",
  tripura: "TR",
  "uttar pradesh": "UP",
  uttarakhand: "UK",
  "west bengal": "WB",
  delhi: "DL",
  "new delhi": "DL",
  "jammu and kashmir": "JK",
  ladakh: "LA",
  chandigarh: "CH",
  puducherry: "PY",
  pondicherry: "PY",
  "andaman and nicobar islands": "AN",
  "dadra and nagar haveli": "DN",
  "daman and diu": "DD",
  lakshadweep: "LD",
};

/** Letters and digits only, uppercased. */
function alnum(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function stateSegment(state: string | null | undefined): string {
  const trimmed = (state ?? "").trim().toLowerCase();
  if (!trimmed) return "XX";

  const mapped = STATE_CODES[trimmed];
  if (mapped) return mapped;

  return alnum(trimmed).slice(0, 2) || "XX";
}

function areaSegment(area: string | null | undefined): string {
  const cleaned = alnum(area ?? "");
  return cleaned.slice(0, 3) || "GEN";
}

/**
 * Trade words that describe what the shop sells rather than which shop it is.
 * "Himalaya Jwellers" is identified by "Himalaya"; folding the suffix into
 * the code gives HJI, which identifies nothing.
 */
const GENERIC_NAME_WORDS = new Set([
  "JEWELLERS", "JEWELLER", "JWELLERS", "JWELLER", "JEWELERS", "JEWELER",
  "JEWELLERY", "JEWELRY", "JEWELS", "JEWEL",
  "GOLD", "SILVER", "DIAMOND", "DIAMONDS", "ORNAMENTS", "BULLION",
  "STORE", "STORES", "SHOP", "SHOPPE", "EMPORIUM", "HOUSE", "PALACE",
  "SONS", "BROS", "BROTHERS", "CO", "COMPANY", "AND", "THE",
  "PVT", "LTD", "LLP", "INC",
]);

/**
 * Three letters that stand for the shop.
 *
 * Generic trade words are dropped first, then: one meaningful word gives its
 * leading letters ("Himalaya" -> HIM); two give the first two of the first
 * plus the first of the second ("Shree Ram" -> SHR), which reads better than
 * the bare initials "SR"; three or more give initials ("R K Sons" -> RKS).
 */
function nameSegment(name: string): string {
  const all = (name ?? "")
    .split(/\s+/)
    .map((word) => alnum(word))
    .filter(Boolean);

  if (all.length === 0) return "STR";

  // Keep the generic words if that is all there is — "Gold Palace" should
  // still produce something rather than falling back to STR.
  const meaningful = all.filter((word) => !GENERIC_NAME_WORDS.has(word));
  const words = meaningful.length > 0 ? meaningful : all;

  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, "X");

  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 1)).padEnd(3, "X");
  }

  return words.map((word) => word[0]).join("").slice(0, 3);
}

export type StoreCodeParts = {
  name: string;
  state?: string | null;
  /** City, town or area the shop trades in. */
  area?: string | null;
};

/** The code without any uniqueness handling — see `buildUniqueStoreCode`. */
export function buildStoreCode(parts: StoreCodeParts): string {
  return [
    stateSegment(parts.state),
    areaSegment(parts.area),
    nameSegment(parts.name),
  ].join("-");
}

/**
 * The code, guaranteed not to collide with one already taken.
 *
 * `Store.code` is globally unique, and two shops of the same name in the same
 * town is entirely ordinary — so a numeric suffix is appended rather than
 * failing and asking the owner to invent something.
 */
export function buildUniqueStoreCode(
  parts: StoreCodeParts,
  taken: Iterable<string>,
): string {
  const base = buildStoreCode(parts);
  const used = new Set([...taken].map((code) => code.toUpperCase()));

  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString().slice(-5)}`;
}
