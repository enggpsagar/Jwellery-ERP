"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";

export type PlanRow = {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

export type PlanFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

const PLANS_PATH = "/plans";

function toPlanRow(plan: {
  id: string;
  name: string;
  durationDays: number;
  price: { toString(): string };
  isActive: boolean;
  sortOrder: number;
}): PlanRow {
  return {
    id: plan.id,
    name: plan.name,
    durationDays: plan.durationDays,
    price: Number(plan.price),
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

/** Every plan by default; pass activeOnly to filter for pickers (e.g. the store-creation form). */
export async function getPlans(params: { activeOnly?: boolean } = {}): Promise<PlanRow[]> {
  const plans = await prisma.plan.findMany({
    where: params.activeOnly ? { isActive: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });

  return plans.map(toPlanRow);
}

function parsePlanFields(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const durationDays = Number(formData.get("durationDays"));
  const price = Number(formData.get("price"));
  const sortOrder = Number(formData.get("sortOrder") || 0);

  const errors: Record<string, string[]> = {};
  if (!name) errors.name = ["Plan name is required"];
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    errors.durationDays = ["Duration must be a whole number of days greater than 0"];
  }
  if (!Number.isFinite(price) || price < 0) {
    errors.price = ["Price must be 0 or greater"];
  }

  return { name, durationDays, price, sortOrder, errors };
}

export async function createPlan(prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage plans." };
  }

  const { name, durationDays, price, sortOrder, errors } = parsePlanFields(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    await prisma.plan.create({
      data: { name, durationDays, price, sortOrder },
    });

    revalidatePath(PLANS_PATH);
    return { success: true, message: `Plan "${name}" created` };
  } catch (error) {
    console.error("createPlan error:", error);
    return { success: false, message: "Failed to create plan" };
  }
}

export async function updatePlan(prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage plans." };
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) return { success: false, message: "Plan not found" };

  const { name, durationDays, price, sortOrder, errors } = parsePlanFields(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    const updated = await prisma.plan.updateMany({
      where: { id },
      data: { name, durationDays, price, sortOrder },
    });

    if (updated.count === 0) {
      return { success: false, message: "Plan not found" };
    }

    revalidatePath(PLANS_PATH);
    return { success: true, message: `Plan "${name}" updated` };
  } catch (error) {
    console.error("updatePlan error:", error);
    return { success: false, message: "Failed to update plan" };
  }
}

/**
 * Soft-deactivate/reactivate, same convention as StoreMetal/StoreLocation —
 * a deactivated plan disappears from the create-store picker (getPlans({
 * activeOnly: true })) but stores already on it keep their existing
 * planId/planExpiresAt untouched.
 */
export async function setPlanActive(id: string, isActive: boolean): Promise<PlanFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage plans." };
  }

  try {
    const plan = await prisma.plan.findUnique({ where: { id }, select: { name: true } });
    if (!plan) return { success: false, message: "Plan not found" };

    await prisma.plan.update({ where: { id }, data: { isActive } });

    revalidatePath(PLANS_PATH);
    return {
      success: true,
      message: `Plan "${plan.name}" ${isActive ? "reactivated" : "deactivated"}`,
    };
  } catch (error) {
    console.error("setPlanActive error:", error);
    return { success: false, message: "Failed to update plan status" };
  }
}
