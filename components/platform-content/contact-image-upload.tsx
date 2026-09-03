"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { ImageIcon, Trash2, Upload } from "lucide-react"

import { removePlatformContactImage } from "@/lib/actions/platform-content-actions"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

type ContactImageUploadProps = {
  imageUrl: string
}

/**
 * Image upload for the platform Contact Us content — same shape as
 * components/settings/store-logo-upload.tsx (file input → POST to an
 * upload route → preview), pointed at /api/platform-content/image instead
 * of /api/store/logo. This component is only ever rendered on the
 * SUPER_ADMIN editor page, so there is no `canEdit` prop to gate on.
 */
export function ContactImageUpload({ imageUrl }: ContactImageUploadProps) {
  const router = useRouter()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(imageUrl)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB")
      return
    }

    const formData = new FormData()
    formData.append("file", file)

    setUploading(true)
    try {
      const res = await fetch("/api/platform-content/image", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Upload failed")
      }

      setPreview(data.url)
      toast.success("Image updated")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleRemove() {
    setUploading(true)
    try {
      const result = await removePlatformContactImage()
      if (!result.success) throw new Error(result.message)
      setPreview("")
      toast.success("Image removed")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove image")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Contact us" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader className="mr-2 h-4 w-4" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {preview ? "Change Image" : "Upload Image"}
        </Button>

        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={handleRemove}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
