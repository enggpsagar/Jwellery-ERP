// File: src/lib/validation/user.ts

import { UserRole } from "@prisma/client";
import { z } from "zod";

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
