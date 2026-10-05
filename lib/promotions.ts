// Offers & gift vouchers (Promotion / PromotionVoucher in schema.prisma) —
// the discount maths, shared by the invoice form's live preview and
// createInvoice (which re-validates the code and recomputes). Client-safe.
//
// The discount is spread over the ELIGIBLE lines (category / metal filter)
// as part of each line's scheme discount, so it comes off the taxable value
// before GST — a discount shown on the invoice reduces the value of supply.
//   PERCENT_OFF  % of the target (bill value or making + HM), ≤ maxDiscount
//   FLAT_OFF     ₹ off the target, never more than the target
//   BUY_X_GET_Y  for every X + Y pieces, the Y cheapest get getPercentOff
//                off (100 = free); counted piece by piece across lines
// A line can't be discounted below zero.

export type PromotionConfig = {
  id: string
  name: string
  type: "PERCENT_OFF" | "FLAT_OFF" | "BUY_X_GET_Y"
  target: "BILL" | "MAKING_CHARGES"
  percentOff: number | null
  amountOff: number | null
  buyQuantity: number | null
  getQuantity: number | null
  getPercentOff: number | null
  maxDiscount: number | null
  minBillAmount: number | null
  categoryIds: string[]
  metalTypeIds: string[]
}

export type PromotionLine = {
  key: string
  categoryId: string | null
  /** Every metal in the line (a piece of several metals lists them all). */
  metalTypeIds: string[]
  quantity: number
  /** The line's value before GST and before this offer: metal + making +
   *  HM + stone − its own scheme discount. */
  value: number
  /** Making + HM of the line (for a MAKING_CHARGES offer). */
  making: number
}

export type PromotionResult =
  | { ok: true; total: number; perLine: Record<string, number>; eligibleKeys: string[] }
  | { ok: false; reason: string }

const round2 = (value: number) => Math.round(value * 100) / 100

export function isLineEligible(promotion: PromotionConfig, line: PromotionLine) {
  const categoryOk = !promotion.categoryIds.length || (line.categoryId != null && promotion.categoryIds.includes(line.categoryId))
  const metalOk = !promotion.metalTypeIds.length || line.metalTypeIds.some((id) => promotion.metalTypeIds.includes(id))
  return categoryOk && metalOk
}

/** Splits `amount` over lines in proportion to `weights`, to the paisa. */
function spread(amount: number, weights: { key: string; weight: number; cap: number }[]) {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  const perLine: Record<string, number> = {}
  if (!(amount > 0) || !(totalWeight > 0)) return perLine
  let given = 0
  weights.forEach((w, index) => {
    const share =
      index === weights.length - 1 ? round2(amount - given) : round2((amount * w.weight) / totalWeight)
    const capped = Math.min(Math.max(share, 0), w.cap)
    perLine[w.key] = capped
    given = round2(given + capped)
  })
  return perLine
}

export function computePromotion(promotion: PromotionConfig, lines: PromotionLine[]): PromotionResult {
  const billValue = round2(lines.reduce((sum, line) => sum + Math.max(line.value, 0), 0))
  if (promotion.minBillAmount != null && billValue < promotion.minBillAmount) {
    return { ok: false, reason: `This offer needs a bill of at least ₹${promotion.minBillAmount.toFixed(2)}.` }
  }
  const eligible = lines.filter((line) => line.value > 0 && isLineEligible(promotion, line))
  if (!eligible.length) return { ok: false, reason: "No item on this bill qualifies for this offer." }

  const cap = (amount: number) =>
    round2(promotion.maxDiscount != null ? Math.min(amount, promotion.maxDiscount) : amount)

  let perLine: Record<string, number> = {}
  if (promotion.type === "BUY_X_GET_Y") {
    const buy = Math.max(promotion.buyQuantity ?? 0, 0)
    const get = Math.max(promotion.getQuantity ?? 0, 0)
    const percent = Math.min(Math.max(promotion.getPercentOff ?? 100, 0), 100)
    if (!(buy > 0) || !(get > 0)) return { ok: false, reason: "This offer isn't set up correctly." }
    const pieces = eligible
      .flatMap((line) => {
        const quantity = Math.max(1, Math.round(line.quantity || 1))
        const unit = line.value / quantity
        return Array.from({ length: quantity }, () => ({ key: line.key, unit }))
      })
      .sort((a, b) => b.unit - a.unit)
    const groupSize = buy + get
    const fullGroups = Math.floor(pieces.length / groupSize)
    if (!fullGroups) return { ok: false, reason: `Add ${groupSize} qualifying pieces to use this offer (buy ${buy}, get ${get}).` }
    // In each full group (most expensive first), the last `get` pieces are
    // the cheapest of that group.
    const raw: Record<string, number> = {}
    for (let group = 0; group < fullGroups; group++) {
      for (let i = group * groupSize + buy; i < (group + 1) * groupSize; i++) {
        const piece = pieces[i]
        raw[piece.key] = round2((raw[piece.key] ?? 0) + (piece.unit * percent) / 100)
      }
    }
    const total = cap(Object.values(raw).reduce((sum, v) => sum + v, 0))
    perLine = spread(
      total,
      Object.entries(raw).map(([key, weight]) => ({
        key,
        weight,
        cap: eligible.find((line) => line.key === key)?.value ?? 0,
      })),
    )
  } else {
    const base = (line: PromotionLine) => (promotion.target === "MAKING_CHARGES" ? Math.max(line.making, 0) : line.value)
    const targetValue = round2(eligible.reduce((sum, line) => sum + base(line), 0))
    if (!(targetValue > 0)) {
      return {
        ok: false,
        reason: promotion.target === "MAKING_CHARGES" ? "No making charges on the qualifying items." : "Nothing to discount.",
      }
    }
    const amount =
      promotion.type === "PERCENT_OFF"
        ? cap((targetValue * Math.min(Math.max(promotion.percentOff ?? 0, 0), 100)) / 100)
        : cap(Math.min(Math.max(promotion.amountOff ?? 0, 0), targetValue))
    perLine = spread(
      amount,
      eligible.map((line) => ({ key: line.key, weight: base(line), cap: line.value })),
    )
  }

  const total = round2(Object.values(perLine).reduce((sum, v) => sum + v, 0))
  if (!(total > 0)) return { ok: false, reason: "This offer gives no discount on this bill." }
  return { ok: true, total, perLine, eligibleKeys: eligible.map((line) => line.key) }
}

/** A short human label, e.g. "10% off making", "₹500 off", "Buy 2 get 1 free". */
export function describePromotion(promotion: Pick<PromotionConfig, "type" | "target" | "percentOff" | "amountOff" | "buyQuantity" | "getQuantity" | "getPercentOff">) {
  const on = promotion.target === "MAKING_CHARGES" ? " making charges" : ""
  if (promotion.type === "PERCENT_OFF") return `${promotion.percentOff ?? 0}% off${on}`
  if (promotion.type === "FLAT_OFF") return `₹${(promotion.amountOff ?? 0).toLocaleString("en-IN")} off${on}`
  const pct = promotion.getPercentOff ?? 100
  return `Buy ${promotion.buyQuantity ?? 0} get ${promotion.getQuantity ?? 0} ${pct >= 100 ? "free" : `at ${pct}% off`}`
}
