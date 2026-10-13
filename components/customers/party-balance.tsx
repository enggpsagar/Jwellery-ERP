import { cn } from "@/lib/utils"
import {
  formatPartyAmount,
  partyBalanceDirection,
  type PartyBalanceDirection,
} from "@/lib/party-balance"

const BADGE_CLASSES: Record<PartyBalanceDirection, string> = {
  Receivable: "border-red-200 bg-red-50 text-red-700",
  Payable: "border-blue-200 bg-blue-50 text-blue-700",
  Settled: "border-border bg-muted text-muted-foreground",
}

const AMOUNT_CLASSES: Record<PartyBalanceDirection, string> = {
  Receivable: "text-red-600",
  Payable: "text-blue-600",
  Settled: "text-foreground",
}

export function PartyBalanceBadge({
  direction,
  className,
}: {
  direction: PartyBalanceDirection
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        BADGE_CLASSES[direction],
        className,
      )}
    >
      {direction}
    </span>
  )
}

/**
 * A party's one net balance (lib/party-balance.ts): the amount plus a
 * Receivable / Payable badge, or just "Settled" at zero. Used by the Parties
 * list, side panel, detail page, ledger and payment pickers so they all read
 * the same.
 */
export function PartyBalance({
  net,
  className,
  size = "sm",
  fractionDigits = 2,
}: {
  net: number
  className?: string
  size?: "sm" | "lg"
  fractionDigits?: number
}) {
  const direction = partyBalanceDirection(net)
  if (direction === "Settled") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <PartyBalanceBadge direction="Settled" />
      </span>
    )
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-2xl tracking-tight" : "font-medium",
          AMOUNT_CLASSES[direction],
        )}
      >
        {formatPartyAmount(net, fractionDigits)}
      </span>
      <PartyBalanceBadge direction={direction} />
    </span>
  )
}
