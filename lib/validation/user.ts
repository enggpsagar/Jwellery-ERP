// File: src/lib/validation/user.ts

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { isValidAadhaarNumber, AADHAAR_INVALID_MESSAGE } from "@/lib/aadhaar";
import { isValidPanNumber, PAN_INVALID_MESSAGE } from "@/lib/pan";

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(100),

  email: z
    .string()
    .email()
    .optional()
    .or(z.literal("")),

  phone: z
    .string()
    .min(10)
    .max(15)
    .optional()
    .or(z.literal("")),

  role: z.nativeEnum(UserRole),

  isActive: z.boolean().default(true),

  // Optional KYC id — validated (12 digits + Verhoeff checksum) only when
  // actually entered. See lib/aadhaar.ts.
  aadhaarNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidAadhaarNumber(value), {
      message: AADHAAR_INVALID_MESSAGE,
    }),

  // Optional KYC id — validated (5 letters + 4 digits + 1 letter) only when
  // actually entered. See lib/pan.ts.
  panNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidPanNumber(value), {
      message: PAN_INVALID_MESSAGE,
    }),

  // Set via the Profile Photo uploader (Vercel Blob URL) — see
  // app/api/users/photo/route.ts. Never typed by hand.
  image: z.string().optional().or(z.literal("")),

  // Only meaningful when role is KARIGAR — links the login to a Karigar record.
  karigarId: z.string().cuid().optional().or(z.literal("")),

  // Only meaningful when role is STAFF — per-user module access overrides.
  // Empty/omitted means "use the default full Staff bundle."
  permissions: z.array(z.string()).optional().default([]),

  // Only meaningful when role is STAFF — which locations this user can see
  // data for. Empty/omitted means unrestricted (all locations), same
  // "empty = unrestricted" convention as permissions above.
  locationIds: z.array(z.string()).optional().default([]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.extend({
  id: z.string().cuid(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
