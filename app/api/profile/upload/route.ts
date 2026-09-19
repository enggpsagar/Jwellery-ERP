import { put } from "@vercel/blob";

import { requireAuth } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";

// A local-filesystem write here doesn't persist reliably on Vercel's
// serverless functions -- each invocation can land on a different
// instance with its own ephemeral filesystem, so a photo written by one
// request could simply be gone by the time a later request (even the very
// next page load) tries to read it back. Mirrors
// app/api/users/photo/route.ts's already-correct Vercel Blob pattern.
export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.id;
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
    return Response.json({ error: "Photo must be under 2MB" }, { status: 400 });
  }

  const filename = `${Date.now()}-${file.name}`;

  try {
    const blob = await put(`profile-photos/${userId}-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    logger.error("profile photo upload error", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}