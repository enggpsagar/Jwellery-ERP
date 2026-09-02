import type { GstScheme } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { gstSchemeLabel } from "@/lib/gst"

/**
 * Shows which of the three GST types (Retailer B2C / Wholesaler & Manufacturer
 * B2B / Composition Scheme) this store is currently configured for, wherever
 * a form asks for or uses GST information — so the scheme is never applied
 * silently. Always links back to Settings, the one place it's actually
 * changed, rather than duplicating the picker on every form that displays it.
 */
export function GstSchemeBadge({ scheme }: { scheme: GstScheme }) {
  return (
    <a
      href="/settings"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      title="Change this in Settings"
    >
      <span>GST Type:</span>
      <Badge variant="outline">{gstSchemeLabel(scheme)}</Badge>
    </a>
  )
}
