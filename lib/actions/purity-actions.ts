"use server";

import { revalidatePath } from "next/cache";
import { PurityType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole } from "@/lib/auth/auth";
import { DEFAULT_FINENESS, getFinenessMap } from "@/lib/purity";

export type PurityFinenessRow = {
  purity: PurityType;
  finenessPercent: number;
};

export type PurityFormState = {
  success: boolean;
  message: string;
};

/** Full fineness table for the current store, seeded with defaults if empty. */
export async function getPurityFineness(): Promise<PurityFinenessRow[]> {
  const storeId = await requireStoreScope();
  const map = await getFinenessMap(storeId);

  return (Object.keys(DEFAULT_FINENESS) as PurityType[]).map((purity) => ({
    purity,
    finenessPercent: map[purity],
  }));
}

export async function updatePurityFineness(
  prevState: PurityFormState,
  formData: FormData,
): Promise<PurityFormState> {
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

    const updates = (Object.keys(DEFAULT_FINENESS) as PurityType[]).map(
      (purity) => {
        const raw = formData.get(`fineness_${purity}`);
        const value = Number(raw);
        const finenessPercent =
          raw === null || raw === "" || Number.isNaN(value)
            ? DEFAULT_FINENESS[purity]
            : Math.min(100, Math.max(0, value));

        return prisma.purityFineness.upsert({
          where: { storeId_purity: { storeId, purity } },
          update: { finenessPercent },
          create: { storeId, purity, finenessPercent },
        });
      },
    );

    await prisma.$transaction(updates);

    revalidatePath("/settings/purity");

    return { success: true, message: "Purity settings updated successfully" };
  } catch (error) {
    console.error("updatePurityFineness error:", error);
    return { success: false, message: "Failed to update purity settings" };
  }
}
