"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  continueWeightRecalculation,
  previewWeightSettings,
  saveWeightSettings,
  type WeightSettingsPreview,
} from "@/lib/actions/weight-settings-actions"
import type { RecalcPhase, WeightRecalcJob, WeightRecalcLogEntry } from "@/lib/weight-recalc.server"
import {
  MAX_CARAT_DECIMALS,
  MAX_GRAM_DECIMALS,
  formatWeight,
  sameWeightSettings,
  weightExample,
  type WeightSettings,
} from "@/lib/weight-calc"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

// Kept here (not imported) because lib/weight-recalc.server.ts is server-only;
// only its types cross over.
const PHASES: { id: RecalcPhase; label: string }[] = [
  { id: "ledgerEntry", label: "Stock-added ledger entries" },
  { id: "pieceComponent", label: "Metal rows of multi-part pieces" },
  { id: "inventoryStock", label: "Stock pieces" },
  { id: "purchaseItem", label: "Purchase lines" },
  { id: "invoiceItem", label: "Invoice lines" },
  { id: "kachaInvoiceItem", label: "Estimate lines" },
  { id: "quotationItem", label: "Quotation lines" },
]

function Checkbox({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  )
}

function Radio({ name, value, checked, onChange, label, hint }: { name: string; value: string; checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="radio" name={name} value={value} className="mt-0.5 h-4 w-4" checked={checked} onChange={onChange} data-testid={`weights-basis-${value}`} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  )
}

const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })

export function WeightSettingsForm({
  initial,
  initialJob,
  log,
}: {
  initial: WeightSettings
  initialJob: WeightRecalcJob | null
  log: WeightRecalcLogEntry[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [preview, setPreview] = useState<Extract<WeightSettingsPreview, { ok: true }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<WeightRecalcJob | null>(initialJob)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const stopRef = useRef(false)

  useEffect(() => () => {
    stopRef.current = true
  }, [])

  const set = <K extends keyof WeightSettings>(key: K, value: WeightSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const dirty = !sameWeightSettings(saved, draft)
  const example = weightExample(draft)
  const g = (value: number) => formatWeight(value, "GRAM", draft)

  async function runJob(start: WeightRecalcJob) {
    setRunning(true)
    setRunError(null)
    let current = start
    stopRef.current = false
    while (!stopRef.current) {
      const result = await continueWeightRecalculation(current.id)
      if (!result.ok) {
        setRunError(result.message)
        break
      }
      if (result.done) {
        setJob(null)
        toast.success(result.entry.note)
        router.refresh()
        break
      }
      current = result.job
      setJob(current)
    }
    setRunning(false)
  }

  async function onSave() {
    setBusy(true)
    const result = await previewWeightSettings(draft)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    if (result.needsRecalc) {
      setPreview(result)
      return
    }
    await commit(false)
  }

  async function commit(recalculate: boolean) {
    setBusy(true)
    const result = await saveWeightSettings(draft, { recalculate })
    setBusy(false)
    setPreview(null)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setSaved(draft)
    toast.success(result.message)
    if (result.job) {
      setJob(result.job)
      void runJob(result.job)
    } else {
      router.refresh()
    }
  }

  const totalRows = job ? PHASES.reduce((sum, phase) => sum + job.totals[phase.id].rows, 0) : 0
  const percent = job && totalRows ? Math.min(100, Math.round((job.scanned / totalRows) * 100)) : 0

  return (
    <div className="space-y-6">
      {job ? (
        <Card data-testid="weights-recalc-progress">
          <CardHeader>
            <CardTitle className="text-base">Recalculating existing records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="h-2 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-muted-foreground">
              {job.scanned.toLocaleString("en-IN")} of {totalRows.toLocaleString("en-IN")} records checked ·{" "}
              {PHASES.find((phase) => phase.id === job.phase)?.label}. Runs in batches of 500 — you can leave this page and resume later.
            </p>
            {runError ? <p className="text-red-600">{runError}</p> : null}
            {!running ? (
              <Button type="button" size="sm" onClick={() => runJob(job)} data-testid="weights-recalc-resume">
                Resume
              </Button>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader className="h-4 w-4" /> Working…
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Net weight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Net weight is Gross weight minus:</p>
          <Checkbox
            id="weights-net-stone"
            checked={draft.netDeductStoneWeight}
            onChange={(v) => set("netDeductStoneWeight", v)}
            label="Stone weight"
          />
          <Checkbox
            id="weights-net-dmo"
            checked={draft.netDeductDmoWeight}
            onChange={(v) => set("netDeductDmoWeight", v)}
            label="DMO / Less weight (dust, making, other)"
          />
          <p className="text-xs text-muted-foreground">A Net weight typed by hand on a form is always kept as typed.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Fine (24K) weight basis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Radio name="basis" value="NET" checked={draft.fineWeightBasis === "NET"} onChange={() => set("fineWeightBasis", "NET")} label="Net weight × Fineness %" hint="The usual way (default)." />
          <Radio name="basis" value="GROSS" checked={draft.fineWeightBasis === "GROSS"} onChange={() => set("fineWeightBasis", "GROSS")} label="Gross weight × Fineness %" hint="Falls back to net when a record has no gross weight." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Wastage / touch %</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set a default Wastage % per purity in Settings › Metals &amp; Categories. It is copied onto each new sale and purchase line, where it stays editable.
          </p>
          <Checkbox
            id="weights-add-wastage"
            checked={draft.addWastageToFineWeight}
            onChange={(v) => set("addWastageToFineWeight", v)}
            label="Add wastage to fine weight"
            hint="Fine = basis × (Fineness % + Wastage %) / 100. Off: wastage is only recorded."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Rounding</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div className="w-44 space-y-1.5">
            <Label htmlFor="weights-decimals-gram">Decimals for grams</Label>
            <Input
              id="weights-decimals-gram"
              type="number"
              min={0}
              max={MAX_GRAM_DECIMALS}
              value={draft.weightDecimalsGram}
              onChange={(e) => set("weightDecimalsGram", Math.min(MAX_GRAM_DECIMALS, Math.max(0, Math.round(Number(e.target.value) || 0))))}
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label htmlFor="weights-decimals-carat">Decimals for carats</Label>
            <Input
              id="weights-decimals-carat"
              type="number"
              min={0}
              max={MAX_CARAT_DECIMALS}
              value={draft.weightDecimalsCarat}
              onChange={(e) => set("weightDecimalsCarat", Math.min(MAX_CARAT_DECIMALS, Math.max(0, Math.round(Number(e.target.value) || 0))))}
            />
          </div>
          <p className="w-full text-xs text-muted-foreground">
            Weights are shown and printed with these decimals (default 3). A calculated net weight is rounded to them; fine weight is kept to 5 decimals unless you choose fewer than 3, when it is rounded to what is shown.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Example</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" data-testid="weights-example">
            Gross {g(example.grossWeight)} g, Stone {g(example.stoneWeight)} g, DMO {g(example.dmoWeight)} g, 22K {example.finenessPercent}%, wastage {example.wastagePercent}% →{" "}
            <strong>Net {g(example.net)} g</strong>, <strong>Fine {g(example.fine)} g</strong>
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => setDraft(saved)}>
          Reset
        </Button>
        <Button type="button" disabled={!dirty || busy || running || Boolean(job)} onClick={onSave} data-testid="weights-save">
          {busy ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
      </div>

      {log.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="weights-history">
            {log.map((entry) => (
              <div key={entry.id} className="rounded-md border px-3 py-2">
                <p className="font-medium">{entry.note}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(entry.at)}
                  {entry.by ? ` · ${entry.by}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recalculate existing records?</DialogTitle>
            <DialogDescription>
              These settings change how stored weights work out. Fine weight is recalculated on every record of this store. Net weight changes only on unsold stock and on unpaid estimates / open quotations — issued invoices, purchases, credit notes and anything paid or converted keep their net weight, amounts and GST.
            </DialogDescription>
          </DialogHeader>
          {preview?.scope ? (
            <table className="w-full text-sm" data-testid="weights-confirm-counts">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Records</th>
                  <th className="py-1 text-right">Fine checked</th>
                  <th className="py-1 text-right">Net may change</th>
                </tr>
              </thead>
              <tbody>
                {PHASES.map((phase) => (
                  <tr key={phase.id} data-testid={`weights-count-${phase.id}`}>
                    <td className="py-1">{phase.label}</td>
                    <td className="py-1 text-right" data-testid={`weights-count-${phase.id}-rows`}>
                      {preview.scope![phase.id].rows}
                    </td>
                    <td className="py-1 text-right" data-testid={`weights-count-${phase.id}-net`}>
                      {preview.netChanges ? preview.scope![phase.id].netEligible : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => commit(true)} disabled={busy} data-testid="weights-confirm">
              {busy ? <Loader className="h-4 w-4" /> : "Save & recalculate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
