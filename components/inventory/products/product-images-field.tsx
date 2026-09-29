"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, Star, X } from "lucide-react"

import { useToast } from "@/components/providers/toast-provider"
import { cn } from "@/lib/utils"

// Kept in step with MAX_PRODUCT_IMAGES in product-actions.ts (a "use
// server" file can only export async functions) and the upload route's own
// type/size checks.
const MAX_IMAGES = 8
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

/**
 * Optional "Product Images" section for Add/Edit Product. Each file uploads
 * as soon as it's picked (/api/products/photo) and the resulting URLs are
 * submitted with the form as `imageUrlsJson`, first = cover. Thumbnails are
 * fixed square tiles with object-cover, so any photo shape or size keeps
 * the grid intact.
 */
export function ProductImagesField({ initialUrls = [] }: { initialUrls?: string[] }) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<string[]>(initialUrls)
  const [uploading, setUploading] = useState(0)

  const remaining = MAX_IMAGES - urls.length - uploading

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (inputRef.current) inputRef.current.value = ""
    if (files.length === 0) return

    const accepted = files.slice(0, Math.max(0, remaining))
    if (files.length > accepted.length) {
      toast.error(`You can add up to ${MAX_IMAGES} images per product.`)
    }

    const valid = accepted.filter((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: use a JPG, PNG or WebP image.`)
        return false
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: image must be under 5MB.`)
        return false
      }
      return true
    })
    if (valid.length === 0) return

    setUploading((count) => count + valid.length)
    // One at a time, in the order picked, so the grid order matches it.
    for (const file of valid) {
      try {
        const body = new FormData()
        body.append("file", file)
        const res = await fetch("/api/products/photo", { method: "POST", body })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")
        setUrls((current) => (current.length < MAX_IMAGES ? [...current, data.url] : current))
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`)
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  function remove(url: string) {
    setUrls((current) => current.filter((item) => item !== url))
  }

  function makeCover(url: string) {
    setUrls((current) => [url, ...current.filter((item) => item !== url)])
  }

  return (
    <div className="rounded-xl border p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">
          Product Images <span className="text-sm font-normal text-muted-foreground">(optional)</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Up to {MAX_IMAGES} · JPG, PNG or WebP, 5MB each · the first image is the cover
        </p>
      </div>

      <input type="hidden" name="imageUrlsJson" value={JSON.stringify(urls)} />
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        className="hidden"
        aria-label="Add product images"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Product images">
        {urls.map((url, index) => (
          <li key={url} className="relative aspect-square min-w-0 overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Product image ${index + 1}`} className="h-full w-full object-cover" />

            {index === 0 && (
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Cover
              </span>
            )}

            <button
              type="button"
              onClick={() => remove(url)}
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
              aria-label={`Remove image ${index + 1}`}
              title="Remove"
            >
              <X className="size-3.5" />
            </button>

            {index > 0 && (
              <button
                type="button"
                onClick={() => makeCover(url)}
                className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                aria-label={`Make image ${index + 1} the cover`}
                title="Make cover"
              >
                <Star className="size-3.5" />
              </button>
            )}
          </li>
        ))}

        {Array.from({ length: uploading }).map((_, index) => (
          <li
            key={`uploading-${index}`}
            className="flex aspect-square items-center justify-center rounded-lg border bg-muted"
            aria-label="Uploading image"
          >
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </li>
        ))}

        {remaining > 0 && (
          <li className="aspect-square">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed",
                "text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary",
              )}
            >
              <ImagePlus className="size-5" />
              Add images
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
