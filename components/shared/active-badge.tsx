import { Badge } from "@/components/ui/badge"

/** Active always reads green, Inactive always reads red — the shared
 * Badge's own "default" variant is the app's primary color (not
 * necessarily green), so every Active/Inactive indicator uses this
 * instead of picking a variant that may not land on the right hue. */
export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      className={
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }
    >
      {isActive ? "Active" : "Inactive"}
    </Badge>
  )
}
