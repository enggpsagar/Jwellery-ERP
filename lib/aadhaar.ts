// lib/aadhaar.ts
//
// Aadhaar is optional everywhere it appears (Customer, Vendor, User) — this
// only validates the value when one is actually entered. Pure/no server-only
// imports, so it's safe to call from both a server action and a client form
// for instant feedback.

// Verhoeff's algorithm — the actual checksum scheme UIDAI uses for the
// 12th (last) digit of a real Aadhaar number. A plain "12 digits, doesn't
// start with 0/1" regex would accept a lot of numbers that are structurally
// impossible, so this multiplication/permutation/inverse table is the
// standard, deterministic way to catch those instead of guessing.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function verhoeffChecksumIsZero(digits: string): boolean {
  let checksum = 0
  const reversed = digits.split("").reverse().map(Number)

  reversed.forEach((digit, index) => {
    checksum = D[checksum][P[index % 8][digit]]
  })

  return checksum === 0
}

/**
 * True for a well-formed, checksum-valid 12-digit Aadhaar number. Accepts
 * spaces/dashes as visual separators (e.g. "1234 5678 9123") since that's
 * how Aadhaar is printed, but rejects anything else non-digit outright.
 */
export function isValidAadhaarNumber(rawValue: string): boolean {
  const value = rawValue.replace(/[\s-]/g, "")

  if (!/^\d{12}$/.test(value)) return false
  // Real Aadhaar numbers never start with 0 or 1.
  if (value[0] === "0" || value[0] === "1") return false

  return verhoeffChecksumIsZero(value)
}

/** Strips the same visual separators isValidAadhaarNumber tolerates, so the
 * stored value is always exactly 12 digits or empty. */
export function normalizeAadhaarNumber(rawValue: string): string {
  return rawValue.replace(/[\s-]/g, "").trim()
}

export const AADHAAR_INVALID_MESSAGE = "Enter a valid 12-digit Aadhaar number"
