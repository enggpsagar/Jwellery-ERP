// lib/actions/store-location-actions.ts
"use server";

// Named store-location-actions.ts (not location-actions.ts) — that filename
// is already taken by the unrelated State/City lookup module used on the
// Customer/Vendor address forms.

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";

export type StoreLocationRow = {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  isActive: boolean;
};

export type LocationFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

const LOCATIONS_PATH = "/settings/locations";

export async function getStoreLocations(): Promise<StoreLocationRow[]> {
  const storeId = await requireStoreScope();

  const locations = await prisma.storeLocation.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return locations.map((location) => ({
    id: location.id,
    name: location.name,
    state: location.state,
    city: location.city,
    isActive: location.isActive,
  }));
}

export async function upsertStoreLocation(
  prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { name: ["Location name is required"] },
      };
    }

    const storeId = await requireStoreScope();

    const existing = await prisma.storeLocation.findFirst({
      where: { storeId, name, NOT: id ? { id } : undefined },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "A location with this name already exists",
        errors: { name: ["A location with this name already exists"] },
      };
    }

    if (id) {
      const { count } = await prisma.storeLocation.updateMany({
        where: { id, storeId },
        data: { name },
      });

      if (count === 0) {
        return { success: false, message: "Location not found" };
      }
    } else {
      await prisma.storeLocation.create({
        data: { storeId, name },
      });
    }

    revalidatePath(LOCATIONS_PATH);

    return {
      success: true,
      message: id ? "Location updated successfully" : "Location added successfully",
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A location with this name already exists",
        errors: { name: ["A location with this name already exists"] },
      };
    }
    console.error("upsertStoreLocation error:", error);
    return { success: false, message: "Failed to save location" };
  }
}

export async function toggleStoreLocationActive(
  id: string,
  isActive: boolean,
): Promise<LocationFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can update these settings.",
    };
  }

  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.storeLocation.updateMany({
      where: { id, storeId },
      data: { isActive },
    });

    if (count === 0) {
      return { success: false, message: "Location not found" };
    }

    revalidatePath(LOCATIONS_PATH);

    return {
      success: true,
      message: isActive ? "Location activated" : "Location deactivated",
    };
  } catch (error) {
    console.error("toggleStoreLocationActive error:", error);
    return { success: false, message: "Failed to update location" };
  }
}
