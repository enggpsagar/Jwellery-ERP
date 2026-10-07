import { WeightText } from "@/components/shared/weight-text"
import { round5, stoneDetailsText, type StoredPieceComponent } from "@/lib/piece-components"

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
  weightDecimals,
}: {
  components?: StoredPieceComponent[] | null
  className?: string
  /** Off on a Kacha slip, which carries no GST (its rows may still keep a
   *  rate, for when the slip is converted to a Pakka invoice). */
  showGst?: boolean
  /** Settings > Weights decimals for grams (print templates pass theirs);
   *  left out, the active store's setting is used (useWeightFormat). */
  weightDecimals?: number
}) {
  if (!components?.length) return null
  const grams = (value: number) =>
    weightDecimals == null ? <WeightText value={value} /> : `${value.toFixed(weightDecimals)} g`
  return (
    <ul className={className}>
      {components.map((row, index) => {
        const gst = showGst && row.gstRatePercent != null ? ` · GST ${row.gstRatePercent}%` : ""
        if (row.kind === "METAL") {
          const pure = row.fineWeight != null && row.netWeight != null && round5(row.fineWeight) !== round5(row.netWeight)
          return (
            <li key={index}>
              {[row.metalName, row.purityLabel].filter(Boolean).join(" ") || "Metal"} · {grams(row.netWeight ?? 0)}
              {pure ? <> ({grams(row.fineWeight ?? 0)} pure)</> : ""} · {rupees(row.amount)}
              {gst}
            </li>
          )
        }
        const details = stoneDetailsText(row)
        return (
          <li key={index}>
            {[row.stoneMetalTypeName, row.stoneTypeNames].filter(Boolean).join(" · ") || "Stone"} ·{" "}
            <WeightText value={row.caratWeight ?? 0} stone />
            {details ? ` · ${details}` : ""} · {rupees(row.amount)}
            {gst}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A single-stone line's stone count / clarity / certificate under the item
 * (InvoiceItem / KachaInvoiceItem / QuotationItem .stonePieces etc.), e.g.
 * "Diamond Natural 0.28 ct · 12 pcs · VVS · Cert IGI-123". Renders nothing
 * when none of the three is set, or on a multi-part line (its rows show them).
 */
export function LineStoneDetails({
  item,
  className = "mt-0.5 text-[11px] leading-snug text-muted-foreground",
}: {
  item: {
    stoneMetalTypeName?: string | null
    stoneTypeNames?: string | null
    caratWeight?: number | null
    stonePieces?: number | null
    stoneClarity?: string | null
    stoneCertificateNumber?: string | null
    components?: unknown[] | null
  }
  className?: string
}) {
  if (item.components?.length) return null
  const details = stoneDetailsText({
    pieces: item.stonePieces,
    clarity: item.stoneClarity,
    certificateNumber: item.stoneCertificateNumber,
  })
  if (!details) return null
  const name = [item.stoneMetalTypeName, item.stoneTypeNames].filter(Boolean).join(" ") || "Stone"
  return (
    <p className={className} data-testid="line-stone-details">
      {name}
      {item.caratWeight ? (
        <>
          {" "}
          <WeightText value={Number(item.caratWeight)} stone />
        </>
      ) : (
        ""
      )}{" "}
      · {details}
    </p>
  )
}
