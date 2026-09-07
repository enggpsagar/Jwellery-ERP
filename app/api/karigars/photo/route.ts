import { put } from "@vercel/blob";

import { requireStoreScope } from "@/lib/store-context";

// Uploads a Karigar (Artisan) profile photo from the Add/Edit Artisan form.
// Deliberately not tied to a karigar id — a brand-new artisan doesn't have
// one yet when this is called from the create form — so this just stores
// the file and hands back a URL; createKarigar/updateKarigar attach it to
// the row afterward. Mirrors app/api/users/photo/route.ts's Vercel Blob
// pattern exactly, just its own blob path prefix.
export async function POST(request: Request) {
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
    const blob = await put(`karigar-photos/${storeId}-${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("karigar photo upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
