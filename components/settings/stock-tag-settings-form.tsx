"use client"

import { useActionState, useEffect, useState } from "react"
import QRCode from "qrcode"
import { ArrowDown, ArrowUp, GripVertical, Plus, QrCode, ScanBarcode, X } from "lucide-react"

import { updateStockTagFields, type SettingsFormState } from "@/lib/actions/settings-actions"
import type { StockTagData, StockTagSettings } from "@/lib/actions/inventory/stock-tag-actions"
import {
  DEFAULT_BARCODE_TAG_FIELDS,
  DEFAULT_QR_TAG_FIELDS,
  STOCK_TAG_FIELDS,
  type StockTagField,
} from "@/lib/stock-tag-fields"
import { StockQrLabel } from "@/components/inventory/stock/stock-qr-label"
import { StockBarcodeLabel } from "@/components/inventory/stock/stock-barcode-label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

const initialState: SettingsFormState = { success: false, message: "" }

const LABELS = new Map<string, string>(STOCK_TAG_FIELDS.map((field) => [field.key, field.label]))

/** A gold + silver piece with two stones, so the preview shows every field. */
function sampleTag(storeName: string): StockTagData {
  return {
    id: "sample",
    storeName,
    code: "STK-2026-0001",
    stockCode: "STK-2026-0001",
    tagNumber: null,
    productName: "Earring",
    productCode: "G18KT-E-001",
    category: "Ornament · Earring",
    metals: [
      { name: "Gold", purity: "18 KT", weight: "1.794g" },
      { name: "Silver", purity: "925", weight: "0.500g" },
    ],
    karat: "18 KT",
    grossWeight: "2.350g",
    netWeight: "2.294g",
    stones: [
      { name: "Diamond", types: "Natural", carat: "0.28ct", pieces: 12, clarity: "VVS1", certificate: "IGI-123" },
      { name: "Ruby", types: null, carat: "0.10ct", pieces: 2, clarity: null, certificate: null },
    ],
    stoneTotalCarat: "0.38ct",
    stoneTotalPieces: 14,
    manufactureDate: "05/10/2026",
  }
}

/**
 * Settings > QR & Barcode Tags — per layout, which fields print and in what
 * order, with a live preview on a sample piece. Saved by updateStockTagFields.
 */
export function StockTagSettingsForm({
  initial,
  storeName,
  canEdit,
}: {
  initial: StockTagSettings
  storeName: string
  canEdit: boolean
}) {
  const toast = useToast()
  const [qrFields, setQrFields] = useState<StockTagField[]>(initial.qr)
  const [barcodeFields, setBarcodeFields] = useState<StockTagField[]>(initial.barcode)
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [state, formAction, pending] = useActionState(updateStockTagFields, initialState)

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/s/sample`).then(setQrDataUrl)
  }, [])

  useEffect(() => {
    if (!state.message) return
    if (state.success) toast.success(state.message)
    else toast.error(state.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const tag = sampleTag(storeName)

  return (
    <form action={formAction} className="space-y-6">
      {qrFields.map((field) => (
        <input key={`qr-${field}`} type="hidden" name="qrTagFields" value={field} />
      ))}
      {barcodeFields.map((field) => (
        <input key={`bc-${field}`} type="hidden" name="barcodeTagFields" value={field} />
      ))}

      <p className="text-sm text-muted-foreground">
        The QR code always holds the piece&apos;s scan link (scan it to sell the piece) and the barcode always holds
        its tag code. What you pick below is the text printed beside them. A tag is 80 × 30 mm, so the more you
        pick, the smaller the text prints.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <TagFieldsCard
          title="QR tag"
          icon={<QrCode className="h-4 w-4" />}
          fields={qrFields}
          onChange={setQrFields}
          defaults={DEFAULT_QR_TAG_FIELDS}
          canEdit={canEdit}
          testId="qr-tag-fields"
          preview={qrDataUrl ? <StockQrLabel tag={tag} qrDataUrl={qrDataUrl} fields={qrFields} /> : null}
        />
        <TagFieldsCard
          title="Barcode tag"
          icon={<ScanBarcode className="h-4 w-4" />}
          fields={barcodeFields}
          onChange={setBarcodeFields}
          defaults={DEFAULT_BARCODE_TAG_FIELDS}
          canEdit={canEdit}
          testId="barcode-tag-fields"
          preview={<StockBarcodeLabel tag={tag} fields={barcodeFields} />}
        />
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader className="mr-2 h-4 w-4" /> : null}
            Save tag fields
          </Button>
        </div>
      )}
    </form>
  )
}

function TagFieldsCard({
  title,
  icon,
  fields,
  onChange,
  defaults,
  canEdit,
  preview,
  testId,
}: {
  title: string
  icon: React.ReactNode
  fields: StockTagField[]
  onChange: (fields: StockTagField[]) => void
  defaults: StockTagField[]
  canEdit: boolean
  preview: React.ReactNode
  testId: string
}) {
  const unused = STOCK_TAG_FIELDS.filter((field) => !fields.includes(field.key))

  const move = (index: number, by: -1 | 1) => {
    const next = [...fields]
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  // Drag and drop (desktop): drag a printed row to reorder it, drag an "Add
  // a field" chip into the list to insert it at that spot, or drag a printed
  // row back onto "Add a field" to remove it. The arrows stay for keyboard
  // and touch, where native drag and drop doesn't fire.
  const [dragged, setDragged] = useState<StockTagField | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const dropInto = (at: number) => {
    if (!dragged) return
    const without = fields.filter((f) => f !== dragged)
    const from = fields.indexOf(dragged)
    // Removing a row above the drop point shifts that point up by one.
    const index = from !== -1 && from < at ? at - 1 : at
    const next = [...without]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, dragged)
    onChange(next)
  }

  const endDrag = () => {
    setDragged(null)
    setDropAt(null)
  }

  const dragProps = (field: StockTagField) =>
    canEdit
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", field)
            setDragged(field)
          },
          onDragEnd: endDrag,
        }
      : {}

  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(defaults)}>
            Reset
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center rounded-lg bg-muted/50 p-3">{preview}</div>

        <div
          className="space-y-1"
          data-testid={`${testId}-printed`}
          onDragOver={(e) => {
            if (!dragged) return
            e.preventDefault()
            // Below the last row (or an empty list) = append.
            if (e.target === e.currentTarget) setDropAt(fields.length)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dropAt !== null) dropInto(dropAt)
            endDrag()
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Printed, in this order{canEdit ? " — drag to reorder" : ""}
          </p>
          {fields.length === 0 && <p className="text-sm text-muted-foreground">Nothing — only the code prints.</p>}
          {fields.map((field, index) => (
            <div
              key={field}
              {...dragProps(field)}
              onDragOver={(e) => {
                if (!dragged) return
                e.preventDefault()
                const box = e.currentTarget.getBoundingClientRect()
                setDropAt(e.clientY < box.top + box.height / 2 ? index : index + 1)
              }}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-sm",
                canEdit && "cursor-grab active:cursor-grabbing",
                dragged === field && "opacity-40",
                dropAt === index && dragged && "border-t-2 border-t-primary",
                dropAt === index + 1 && index === fields.length - 1 && dragged && "border-b-2 border-b-primary",
              )}
            >
              {canEdit && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="flex-1">{LABELS.get(field)}</span>
              {canEdit && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Move down" disabled={index === fields.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${LABELS.get(field)}`} onClick={() => onChange(fields.filter((f) => f !== field))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        {canEdit && (unused.length > 0 || (dragged && fields.includes(dragged))) && (
          <div
            className={cn(
              "space-y-1 rounded-md",
              dragged && fields.includes(dragged) && "outline-2 outline-dashed outline-offset-4 outline-muted-foreground/40",
            )}
            data-testid={`${testId}-unused`}
            onDragOver={(e) => {
              // Only a printed row can be dropped here (= remove it).
              if (!dragged || !fields.includes(dragged)) return
              e.preventDefault()
              setDropAt(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragged && fields.includes(dragged)) onChange(fields.filter((f) => f !== dragged))
              endDrag()
            }}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Add a field{dragged && fields.includes(dragged) ? " — drop here to remove" : " — click, or drag into the list"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unused.map((field) => (
                <Button key={field.key} type="button" variant="outline" size="sm" className="h-7 cursor-grab text-xs" {...dragProps(field.key)} onClick={() => onChange([...fields, field.key])}>
                  <Plus className="mr-1 h-3 w-3" />
                  {field.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
