import { put } from "@vercel/blob";
import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/auth";
import { requireStoreScope } from "@/lib/store-context";

// Uploads a User.image photo from the Add/Edit User form. Deliberately not
// tied to a user id — a brand-new user doesn't have one yet when this is
// called from the create form — so this just stores the file and hands
// back a URL; createUserAction/updateUserAction attach it to the row
// afterward. Mirrors app/api/store/logo/route.ts's Vercel Blob pattern
// rather than app/api/profile/upload/route.ts's local-filesystem write,
// which doesn't persist reliably on Vercel's serverless functions.
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
    return Response.json({ error: "Photo must be under 2MB" }, { status: 400 });
  }

  const filename = `${Date.now()}-${file.name}`;

  try {
    const blob = await put(`user-photos/${storeId}-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("user photo upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
