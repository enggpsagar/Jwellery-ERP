/**
 * "Did you mean …?" hints for the Excel importers' row errors, drawn from
 * the store's existing records so a typo can be fixed without hunting
 * through Settings. Pure and client-safe (no prisma) — callers pass in the
 * records they already loaded for validation.
 *
 * Every hint starts with IMPORT_SUGGESTION_MARK so ImportErrorList can
 * style it apart from the error itself.
 */

export const IMPORT_SUGGESTION_MARK = " → ";

export type ImportCandidate = {
  /** What the user should type into the cell. */
  name: string;
  /** The record's own reference (party code, product code…), when it has one. */
  ref?: string | null;
  /** A short extra hint, e.g. the product name behind a product code. */
  detail?: string | null;
  /** Other text that should also match this record (e.g. a product's name
   * when the cell expects its code). */
  aliases?: (string | null | undefined)[];
};

/** Lower-case, letters and digits only — "Gold-22 K" and "gold 22k" compare equal. */
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Lower is closer; null = not close enough to suggest. */
function score(input: string, target: string): number | null {
  if (!input || !target) return null;
  if (input === target) return 0;
  const shorter = Math.min(input.length, target.length);
  if (shorter >= 3 && (target.includes(input) || input.includes(target))) {
    return 0.5 + Math.abs(target.length - input.length) / 100;
  }
  const allowed = Math.max(1, Math.floor(Math.max(input.length, target.length) / 3));
  const distance = levenshtein(input, target, allowed);
  return distance <= allowed ? distance : null;
}

export function describeCandidate(candidate: ImportCandidate) {
  const extra = [candidate.ref ? `ref ${candidate.ref}` : null, candidate.detail].filter(Boolean);
  return `"${candidate.name}"${extra.length ? ` (${extra.join(", ")})` : ""}`;
}

/** The closest existing records to what was typed, best first. */
export function closestCandidates(input: string, candidates: ImportCandidate[], limit = 2) {
  const key = normalize(input);
  if (!key) return [];
  const scored: { candidate: ImportCandidate; score: number }[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const id = `${candidate.name}\u0000${candidate.ref ?? ""}`;
    if (seen.has(id)) continue;
    let best: number | null = null;
    for (const text of [candidate.name, ...(candidate.aliases ?? [])]) {
      if (!text) continue;
      const s = score(key, normalize(text));
      if (s !== null && (best === null || s < best)) best = s;
    }
    if (best !== null) {
      seen.add(id);
      scored.push({ candidate, score: best });
    }
  }
  scored.sort((a, b) => a.score - b.score || a.candidate.name.localeCompare(b.candidate.name));
  // A runner-up is only worth showing when it's about as close as the best.
  const best = scored[0]?.score ?? 0;
  return scored
    .filter((entry) => entry.score <= best + 0.5)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/**
 * The hint to append to a "not found" error: the closest existing records,
 * or — when nothing is close and the list is short — every valid value.
 * Empty string when there is nothing useful to say. listUpTo: 0 = only
 * ever suggest close matches (for long lists like cities or product codes).
 */
export function suggestFrom(
  input: string,
  candidates: ImportCandidate[],
  options: { listUpTo?: number } = {},
): string {
  const close = closestCandidates(input, candidates);
  if (close.length) {
    return `${IMPORT_SUGGESTION_MARK}Did you mean ${close.map(describeCandidate).join(" or ")}?`;
  }
  const listUpTo = options.listUpTo ?? 8;
  if (candidates.length > 0 && candidates.length <= listUpTo) {
    const names = [...new Set(candidates.map((c) => c.name))].sort((a, b) => a.localeCompare(b));
    return `${IMPORT_SUGGESTION_MARK}Use one of: ${names.map((n) => `"${n}"`).join(", ")}`;
  }
  if (candidates.length === 0 && listUpTo > 0) {
    return `${IMPORT_SUGGESTION_MARK}None are set up yet — add one first`;
  }
  return "";
}

/** The hint for an "already exists" error: which record it is, and what to do. */
export function existingRecordHint(candidate: ImportCandidate, action: string) {
  return `${IMPORT_SUGGESTION_MARK}Already saved as ${describeCandidate(candidate)}. ${action}`;
}

/** The hint for a value repeated inside the same file. */
export function earlierRowHint(line: number) {
  return `${IMPORT_SUGGESTION_MARK}First used on row ${line} — keep one of the two rows`;
}

/** Plain names (taxonomy, locations…) as candidates. */
export function namesAsCandidates(names: Iterable<string>): ImportCandidate[] {
  return [...names].map((name) => ({ name }));
}
