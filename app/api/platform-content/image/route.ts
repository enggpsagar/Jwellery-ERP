import { put } from "@vercel/blob";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";

/**
 * Image upload for the platform-wide Contact Us content. Same shape as
 * app/api/store/logo/route.ts (Vercel Blob `put()`, 2MB cap, image-mimetype
 * check) but gated to SUPER_ADMIN only and with no storeId — this is
 * Swarna Suite's own support content, not a per-store setting.
 */
export async function POST(request: Request) {
  try {
    await requireRole(UserRole.SUPER_ADMIN);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await request.formData();
  const file = data.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return Response.json({ error: "Image must be under 2MB" }, { status: 400 });
  }

  const filename = `${Date.now()}-${file.name}`;

  try {
    const blob = await put(`platform-content/contact-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // Singleton row: reuse whichever already exists rather than creating a
    // second one, same convention as updatePlatformContactContent.
    const existing = await prisma.platformContactContent.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existing) {
      await prisma.platformContactContent.update({
        where: { id: existing.id },
        data: { imageUrl: blob.url },
      });
    } else {
      await prisma.platformContactContent.create({
        data: {
          message:
            "Have a question or need help with your account? Reach out and we'll get back to you.",
          imageUrl: blob.url,
        },
      });
    }

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("platform contact image upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
