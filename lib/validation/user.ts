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
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.extend({
  id: z.string().cuid(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;