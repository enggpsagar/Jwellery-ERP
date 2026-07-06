// File: src/lib/otp.ts

import crypto from "crypto";

export function generateOTP(length = 6): string {
  return Array.from({ length }, () =>
    crypto.randomInt(0, 10)
  ).join("");
}

export function hashOTP(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

export function verifyOTP(
  code: string,
  hashedCode: string
): boolean {
  return hashOTP(code) === hashedCode;
}