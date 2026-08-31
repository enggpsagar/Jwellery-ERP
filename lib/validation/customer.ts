import { z } from "zod";

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(200),
  phone: z.string().trim().min(1, "Phone number is required").max(20),
  altPhone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(30).optional(),
  panNumber: z.string().trim().max(20).optional(),
  registrationId: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  openingBalance: z.number().optional(),
});

export type CustomerInputPayload = z.infer<typeof customerInputSchema>;

// PATCH allows a partial update — every field optional, but name/phone still
// required if present, since the core update function needs both regardless.
export const customerUpdateSchema = customerInputSchema;

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(["name", "createdAt", "openingBalance"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
