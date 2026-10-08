/**
 * The purchase summary's GST, split into CGST / SGST (intra-state) or IGST
 * (inter-state) per GST rate — "CGST @ 1.5%", "SGST @ 1.5%" for a 3% line —
 * instead of one "GST (SGST+CGST or IGST)" total. A multi-part line can mix
 * rates across its metal/stone rows, so it's passed with ratePercent null and
 * lands in an unlabelled group. Falls back to the single total when the lines
 * carry no split at all (e.g. an older purchase saved before per-line tax).
 */

export type GstBreakdownLine = {
  ratePercent: number | null
  sgst: number
  cgst: number
  igst: number
}

const money = (value: number) => `₹${value.toFixed(2)}`
const formatRate = (rate: number) => `${Number(rate.toFixed(3))}%`

export function GstBreakdown({ lines, totalTax }: { lines: GstBreakdownLine[]; totalTax: number }) {
  const groups = new Map<string, GstBreakdownLine>()
  for (const line of lines) {
    if (!line.sgst && !line.cgst && !line.igst) continue
    const key = line.ratePercent == null ? "" : String(line.ratePercent)
    const group = groups.get(key) ?? { ratePercent: line.ratePercent, sgst: 0, cgst: 0, igst: 0 }
    group.sgst += line.sgst
    group.cgst += line.cgst
    group.igst += line.igst
    groups.set(key, group)
  }

  if (groups.size === 0) {
    return (
      <div className="flex justify-between">
        <span>GST</span>
        <span>{money(totalTax)}</span>
      </div>
    )
  }

  const rows: { label: string; amount: number }[] = []
  const sorted = [...groups.values()].sort((a, b) => (a.ratePercent ?? Infinity) - (b.ratePercent ?? Infinity))
  for (const group of sorted) {
    const half = group.ratePercent != null ? ` @ ${formatRate(group.ratePercent / 2)}` : ""
    const full = group.ratePercent != null ? ` @ ${formatRate(group.ratePercent)}` : ""
    if (group.cgst) rows.push({ label: `CGST${half}`, amount: group.cgst })
    if (group.sgst) rows.push({ label: `SGST${half}`, amount: group.sgst })
    if (group.igst) rows.push({ label: `IGST${full}`, amount: group.igst })
  }

  return (
    <>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between">
          <span>{row.label}</span>
          <span>{money(row.amount)}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="flex justify-between text-muted-foreground">
          <span>Total GST</span>
          <span>{money(totalTax)}</span>
        </div>
      )}
    </>
  )
}
