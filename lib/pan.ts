// lib/pan.ts
//
// PAN is optional everywhere it appears (Customer, User, Karigar) — this
// only validates the value when one is actually entered. Pure/no
// server-only imports, so it's safe to call from a client form too.

// Format UIDAI/Income Tax uses: 5 letters, 4 digits, 1 letter — e.g.
// ABCDE1234F. The 4th letter encodes holder type (P=individual, C=company,
// ...) and the last is a checksum, but neither is validated here — this
// only catches the structural typos a plain "10 characters" check would
// miss (letters where digits belong, wrong length, lowercase).
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function isValidPanNumber(rawValue: string): boolean {
  return PAN_REGEX.test(rawValue.trim().toUpperCase())
}

/** Always stored uppercase — PAN has no lowercase form. */
export function normalizePanNumber(rawValue: string): string {
  return rawValue.trim().toUpperCase()
}

export const PAN_INVALID_MESSAGE = "Enter a valid PAN number (e.g. ABCDE1234F)"
