import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArtisanActiveToggle } from "@/components/karigars/artisan-active-toggle"

/** The Status card on the standalone artisan detail page's own grid. The
 *  Karigars list's split-panel view shows the same ArtisanActiveToggle
 *  inline next to Edit instead (see karigar-detail-panel.tsx) rather than
 *  spending a whole grid card on it there. */
export function KarigarStatusCard({
  karigarId,
  isActive,
}: {
  karigarId: string
  isActive: boolean
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ArtisanActiveToggle karigarId={karigarId} isActive={isActive} />
      </CardContent>
    </Card>
  )
}
