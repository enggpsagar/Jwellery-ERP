// lib/actions/profile-actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/auth";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  image: string | null;
  role: string;
  status: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
};

export type ProfileFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

const initialState: ProfileFormState = { success: false, message: "" };

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

/**
 * Fetch the signed-in user's profile.
 * Mirrors GET /api/profile, exposed as a server action so it can be
 * called directly from server components without a network round-trip.
 */
export async function getProfile(): Promise<Profile | null> {
  const sessionUser = await requireAuth();

  const profile = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      status: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      pincode: true,
      country: true,
    },
  });

  return profile;
}

/**
 * Update the signed-in user's profile.
 * Mirrors PATCH /api/profile. Email can only be set once (matches the
 * existing route's behavior) since it is used as a login identifier.
 */
export async function updateProfile(
  prevState: ProfileFormState = initialState,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    const sessionUser = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
    });

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Name is required",
        errors: { name: ["Name is required"] },
      };
    }

    let email = user.email;
    const requestedEmail = toOptionalString(formData.get("email"));

    if (!user.email && requestedEmail) {
      const exists = await prisma.user.findUnique({
        where: { email: requestedEmail },
      });

      if (exists) {
        return {
          success: false,
          message: "Email already exists.",
          errors: { email: ["This email is already in use"] },
        };
      }

      email = requestedEmail;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        phone: toOptionalString(formData.get("phone")),
        email,
        image: toOptionalString(formData.get("image")) ?? user.image,
        addressLine1: toOptionalString(formData.get("addressLine1")),
        addressLine2: toOptionalString(formData.get("addressLine2")),
        city: toOptionalString(formData.get("city")),
        state: toOptionalString(formData.get("state")),
        pincode: toOptionalString(formData.get("pincode")),
        country: toOptionalString(formData.get("country")),
      },
    });

    revalidatePath("/profile");

    return { success: true, message: "Profile updated successfully" };
  } catch (error) {
    console.error("updateProfile error:", error);
    return { success: false, message: "Unable to update profile." };
  }
}

/**
 * Persist a newly uploaded avatar URL (the file itself is written by
 * POST /api/profile/upload, which returns the public URL to save here).
 */
export async function updateProfileImage(
  imageUrl: string,
): Promise<ProfileFormState> {
  try {
    const sessionUser = await requireAuth();

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { image: imageUrl },
    });

    revalidatePath("/profile");

    return { success: true, message: "Profile photo updated" };
  } catch (error) {
    console.error("updateProfileImage error:", error);
    return { success: false, message: "Unable to update profile photo." };
  }
}
