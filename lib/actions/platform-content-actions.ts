// File: lib/actions/platform-content-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";

/**
 * Contact Us + FAQ content for Swarna Suite itself — platform-wide, edited
 * only by SUPER_ADMIN. See the doc comments on PlatformContactContent /
 * PlatformFaq in prisma/schema.prisma for why these deliberately have no
 * storeId, unlike almost everything else this app persists.
 *
 * Rendered on the public site (app/contact/page.tsx, app/faq/page.tsx) and
 * inside the authenticated app (app/(dashboard)/help/page.tsx) via the
 * shared components/public/* presentational components — both surfaces read
 * through getPlatformContactContent / getPublishedPlatformFaqs below so
 * there is exactly one source of truth.
 */

const PLATFORM_CONTENT_PATH = "/platform-content";
// Every place the content is actually rendered — revalidated together so an
// edit shows up immediately everywhere, not just in the editor that made it.
const CONTENT_CONSUMER_PATHS = ["/contact", "/faq", "/help"];

export type PlatformContactContentRow = {
  id: string;
  message: string;
  imageUrl: string;
  email: string;
  phone: string;
  address: string;
};

export type PlatformFaqRow = {
  id: string;
  question: string;
  answer: string;
  position: number;
  isPublished: boolean;
};

export type PlatformContentFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

const DEFAULT_CONTACT_MESSAGE =
  "Have a question or need help with your account? Reach out and we'll get back to you.";

function toContactRow(row: {
  id: string;
  message: string;
  imageUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}): PlatformContactContentRow {
  return {
    id: row.id,
    message: row.message ?? "",
    imageUrl: row.imageUrl ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
  };
}

function toFaqRow(row: {
  id: string;
  question: string;
  answer: string;
  position: number;
  isPublished: boolean;
}): PlatformFaqRow {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    position: row.position,
    isPublished: row.isPublished,
  };
}

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function revalidateContentSurfaces() {
  revalidatePath(PLATFORM_CONTENT_PATH);
  for (const path of CONTENT_CONSUMER_PATHS) revalidatePath(path);
}

/**
 * Fetch the single Contact Us content row, creating a default one on first
 * access so every surface always has something to render — same pattern as
 * getBusinessSettings in settings-actions.ts. Readable by anyone (public
 * pages have no session at all); only the update actions below are gated.
 */
export async function getPlatformContactContent(): Promise<PlatformContactContentRow> {
  let content = await prisma.platformContactContent.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!content) {
    content = await prisma.platformContactContent.create({
      data: { message: DEFAULT_CONTACT_MESSAGE },
    });
  }

  return toContactRow(content);
}

export async function updatePlatformContactContent(
  prevState: PlatformContentFormState,
  formData: FormData,
): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return {
      success: false,
      message: "Only a Super Admin can edit the Contact Us content.",
    };
  }

  const message = String(formData.get("message") || "").trim();
  if (!message) {
    return {
      success: false,
      message: "Please fix the form errors",
      errors: { message: ["The Contact Us message is required"] },
    };
  }

  const email = toOptionalString(formData.get("email"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      success: false,
      message: "Please fix the form errors",
      errors: { email: ["Enter a valid email address"] },
    };
  }

  try {
    // Singleton: reuse whichever row already exists rather than creating a
    // second one every time this is called before the first read happens to
    // have run.
    const existing = await prisma.platformContactContent.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existing) {
      await prisma.platformContactContent.update({
        where: { id: existing.id },
        data: {
          message,
          email,
          phone: toOptionalString(formData.get("phone")),
          address: toOptionalString(formData.get("address")),
        },
      });
    } else {
      await prisma.platformContactContent.create({
        data: {
          message,
          email,
          phone: toOptionalString(formData.get("phone")),
          address: toOptionalString(formData.get("address")),
        },
      });
    }

    revalidateContentSurfaces();
    return { success: true, message: "Contact Us content updated" };
  } catch (error) {
    console.error("updatePlatformContactContent error:", error);
    return { success: false, message: "Failed to update Contact Us content" };
  }
}

export async function removePlatformContactImage(): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return {
      success: false,
      message: "Only a Super Admin can edit the Contact Us content.",
    };
  }

  try {
    await prisma.platformContactContent.updateMany({
      data: { imageUrl: null },
    });

    revalidateContentSurfaces();
    return { success: true, message: "Image removed" };
  } catch (error) {
    console.error("removePlatformContactImage error:", error);
    return { success: false, message: "Failed to remove image" };
  }
}

/** Every FAQ entry, ordered for the editor. Pass publishedOnly for the public/app-facing surfaces. */
export async function getPlatformFaqs(
  params: { publishedOnly?: boolean } = {},
): Promise<PlatformFaqRow[]> {
  const faqs = await prisma.platformFaq.findMany({
    where: params.publishedOnly ? { isPublished: true } : undefined,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return faqs.map(toFaqRow);
}

function parseFaqFields(formData: FormData) {
  const question = String(formData.get("question") || "").trim();
  const answer = String(formData.get("answer") || "").trim();

  const errors: Record<string, string[]> = {};
  if (!question) errors.question = ["Question is required"];
  if (!answer) errors.answer = ["Answer is required"];

  return { question, answer, errors };
}

export async function createPlatformFaq(
  prevState: PlatformContentFormState,
  formData: FormData,
): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage FAQs." };
  }

  const { question, answer, errors } = parseFaqFields(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    // New entries go to the end of the list, matching Plan's sortOrder
    // convention — appended after whatever already has the highest position.
    const last = await prisma.platformFaq.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    await prisma.platformFaq.create({
      data: { question, answer, position: (last?.position ?? -1) + 1 },
    });

    revalidateContentSurfaces();
    return { success: true, message: "FAQ added" };
  } catch (error) {
    console.error("createPlatformFaq error:", error);
    return { success: false, message: "Failed to add FAQ" };
  }
}

export async function updatePlatformFaq(
  prevState: PlatformContentFormState,
  formData: FormData,
): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage FAQs." };
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) return { success: false, message: "FAQ not found" };

  const { question, answer, errors } = parseFaqFields(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    const updated = await prisma.platformFaq.updateMany({
      where: { id },
      data: { question, answer },
    });

    if (updated.count === 0) {
      return { success: false, message: "FAQ not found" };
    }

    revalidateContentSurfaces();
    return { success: true, message: "FAQ updated" };
  } catch (error) {
    console.error("updatePlatformFaq error:", error);
    return { success: false, message: "Failed to update FAQ" };
  }
}

export async function deletePlatformFaq(id: string): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage FAQs." };
  }

  try {
    await prisma.platformFaq.delete({ where: { id } });
    revalidateContentSurfaces();
    return { success: true, message: "FAQ deleted" };
  } catch (error) {
    console.error("deletePlatformFaq error:", error);
    return { success: false, message: "Failed to delete FAQ" };
  }
}

export async function setPlatformFaqPublished(
  id: string,
  isPublished: boolean,
): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage FAQs." };
  }

  try {
    await prisma.platformFaq.update({ where: { id }, data: { isPublished } });
    revalidateContentSurfaces();
    return {
      success: true,
      message: isPublished ? "FAQ published" : "FAQ unpublished",
    };
  } catch (error) {
    console.error("setPlatformFaqPublished error:", error);
    return { success: false, message: "Failed to update FAQ" };
  }
}

/**
 * Swap this entry's position with its neighbour in the given direction.
 * Simple swap-based reordering rather than drag-and-drop: this editor is a
 * short, occasionally-touched list for a non-technical audience, and a swap
 * needs no new dependency and no drag state to get wrong.
 */
export async function movePlatformFaq(
  id: string,
  direction: "up" | "down",
): Promise<PlatformContentFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return { success: false, message: "Only a Super Admin can manage FAQs." };
  }

  try {
    const all = await prisma.platformFaq.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });

    const index = all.findIndex((entry) => entry.id === id);
    if (index === -1) return { success: false, message: "FAQ not found" };

    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= all.length) {
      // Already at the edge — nothing to do, not an error.
      return { success: true, message: "FAQ order unchanged" };
    }

    const current = all[index];
    const neighbour = all[swapWith];

    await prisma.$transaction([
      prisma.platformFaq.update({
        where: { id: current.id },
        data: { position: neighbour.position },
      }),
      prisma.platformFaq.update({
        where: { id: neighbour.id },
        data: { position: current.position },
      }),
    ]);

    revalidateContentSurfaces();
    return { success: true, message: "FAQ order updated" };
  } catch (error) {
    console.error("movePlatformFaq error:", error);
    return { success: false, message: "Failed to reorder FAQs" };
  }
}
