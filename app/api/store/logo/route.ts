import { put } from "@vercel/blob";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { requireStoreScope } from "@/lib/store-context";

export async function POST(request: Request) {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let storeId: string;
  try {
    storeId = await requireStoreScope();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No store selected" },
      { status: 400 },
    );
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
    return Response.json({ error: "Logo must be under 2MB" }, { status: 400 });
  }

  const filename = `${Date.now()}-${file.name}`;

  try {
    const blob = await put(`store-logos/${storeId}-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    await prisma.businessSettings.upsert({
      where: { storeId },
      update: { logoUrl: blob.url },
      create: {
        storeId,
        businessName: "My Jewellery Store",
        logoUrl: blob.url,
      },
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("store logo upload error:", error);
    // Surfaces the real cause instead of always blaming the token — once
    // that's actually configured, a stale hardcoded message here would
    // hide whatever the new failure actually is.
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
