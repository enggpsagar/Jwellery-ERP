"use client"

import { useRef, useState } from "react"
import { Paperclip, X } from "lucide-react"

import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type PaymentMethodValue = {
  method: string
  amount: number
  reference: string
  bankName: string
  attachmentUrl: string
}

export function emptyPaymentMethodValue(): PaymentMethodValue {
  return { method: "CASH", amount: 0, reference: "", bankName: "", attachmentUrl: "" }
}

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "NET_BANKING", label: "Net Banking" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
]

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i

type PaymentMethodFieldsProps = {
  value: PaymentMethodValue
  onChange: (patch: Partial<PaymentMethodValue>) => void
  maxAmount?: number
}

/**
 * One "payment method" row — method select, its method-specific fields
 * (UPI transaction id / bank name + UTR / bank name + cheque number), an
 * amount input, and a receipt-image uploader hitting
 * /api/payments/upload. Reused identically across the invoice, purchase,
 * and karigar "Record Payment" dialogs (1-2 rows per dialog, for an
 * optional two-way split).
 */
export function PaymentMethodFields({ value, onChange, maxAmount }: PaymentMethodFieldsProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/payments/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        toast.error(data.error || "Failed to upload receipt")
        return
      }

      onChange({ attachmentUrl: data.url })
      toast.success("Receipt attached")
    } catch {
      toast.error("Failed to upload receipt")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const attachmentName = value.attachmentUrl ? value.attachmentUrl.split("/").pop() : ""
  const isImage = value.attachmentUrl ? IMAGE_EXT_RE.test(value.attachmentUrl) : false

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label required>Payment Method</Label>
          <Select
            value={value.method}
            onValueChange={(method) => onChange({ method, reference: "", bankName: "" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label required>Amount{maxAmount !== undefined ? ` (max ₹${maxAmount.toFixed(2)})` : ""}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max={maxAmount}
            value={value.amount === 0 ? "" : value.amount}
            onChange={(e) => onChange({ amount: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      {value.method === "UPI" && (
        <div className="space-y-2">
          <Label>UPI Transaction ID</Label>
          <Input
            value={value.reference}
            onChange={(e) => onChange({ reference: e.target.value })}
            placeholder="e.g. 123456789012"
          />
        </div>
      )}

      {value.method === "NET_BANKING" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={value.bankName}
              onChange={(e) => onChange({ bankName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Reference / UTR Number</Label>
            <Input
              value={value.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
            />
          </div>
        </div>
      )}

      {value.method === "CHEQUE" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={value.bankName}
              onChange={(e) => onChange({ bankName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Cheque Number</Label>
            <Input
              value={value.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Attach Receipt (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {!value.attachmentUrl && !uploading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5 mr-1.5" />
            Choose File
          </Button>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader className="h-4 w-4" />
            Uploading...
          </div>
        )}

        {!uploading && value.attachmentUrl && (
          <div className="flex items-center gap-2 rounded-md border p-2">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.attachmentUrl}
                alt="Receipt preview"
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {attachmentName}
            </span>
            <button
              type="button"
              onClick={() => onChange({ attachmentUrl: "" })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Remove attachment</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
