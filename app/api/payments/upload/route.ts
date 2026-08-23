import { put } from "@vercel/blob";

import { requireAuth } from "@/lib/auth/auth";

export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await request.formData();
  const file = data.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  const filename = `${Date.now()}-${file.name}`;

  try {
    const blob = await put(`payment-receipts/${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (error) {
    console.error("payment receipt upload error:", error);
    return Response.json(
      { error: "Upload failed — check that BLOB_READ_WRITE_TOKEN is configured" },
      { status: 500 },
    );
  }
}
