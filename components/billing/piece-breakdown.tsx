import { round5, type StoredPieceComponent } from "@/lib/piece-components"

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The metals and stones of a piece made of several, listed under its line
 * on the invoice detail page and every print template — e.g.
 * "Gold 22K · 8.200 g (7.511 g pure) · ₹55,760.00 · GST 3%". Renders nothing
 * for an ordinary single-metal line.
 */
export function PieceBreakdown({
  components,
  className = "mt-0.5 space-y-0.5 text-[11px] leading-snug text-muted-foreground",
  showGst = true,
}: {
  components?: StoredPieceComponent[] | null
  className?: string
  /** Off on a Kacha slip, which carries no GST (its rows may still keep a
   *  rate, for when the slip is converted to a Pakka invoice). */
  showGst?: boolean
}) {
  if (!components?.length) return null
  return (
    <ul className={className}>
      {components.map((row, index) => {
        const gst = showGst && row.gstRatePercent != null ? ` · GST ${row.gstRatePercent}%` : ""
        if (row.kind === "METAL") {
          const pure = row.fineWeight != null && row.netWeight != null && round5(row.fineWeight) !== round5(row.netWeight)
          return (
            <li key={index}>
              {[row.metalName, row.purityLabel].filter(Boolean).join(" ") || "Metal"} · {(row.netWeight ?? 0).toFixed(3)} g
              {pure ? ` (${(row.fineWeight ?? 0).toFixed(3)} g pure)` : ""} · {rupees(row.amount)}
              {gst}
            </li>
          )
        }
        return (
          <li key={index}>
            {[row.stoneMetalTypeName, row.stoneTypeNames].filter(Boolean).join(" · ") || "Stone"} ·{" "}
            {(row.caratWeight ?? 0).toFixed(2)} ct · {rupees(row.amount)}
            {gst}
          </li>
        )
      })}
    </ul>
  )
}
