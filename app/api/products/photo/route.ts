import { put } from "@vercel/blob";

import { requireStoreScope } from "@/lib/store-context";
import { logger } from "@/lib/logger";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Uploads one Product photo from the Add/Edit Product form's "Product
// Images" section. Not tied to a product id — a new product has none yet —
// so it only stores the file and returns its URL; createProduct/
// updateProduct save the URL list on the row. Same Vercel Blob pattern as
// app/api/karigars/photo/route.ts, with its own path prefix and a 5MB cap
// (phone photos of jewellery routinely exceed the 2MB profile-photo limit).
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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Image must be JPG, PNG or WebP" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image must be under 5MB" }, { status: 400 });
  }

  try {
    const blob = await put(`product-photos/${storeId}/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    logger.error("product photo upload error", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
