import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Read-only Category / Type / Style of the Product behind a picked stock
 * piece — the same three fields a "Create New Line Item" line asks for, shown
 * (not editable) once a line is linked, so every sale form (Invoice, Kacha,
 * Quotation) shows what was picked the same way. Renders bare grid cells;
 * the caller supplies the grid. Names come from the stock picker's own list
 * (lib/inventory/stock-option-details.ts).
 */
export function LinkedProductDetails({
  categoryName,
  categoryTypeName,
  targetStyleName,
  showStyle = true,
  inputClassName,
}: {
  categoryName: string | null | undefined
  categoryTypeName: string | null | undefined
  targetStyleName: string | null | undefined
  /** Hide Style when the store doesn't use Styles at all. */
  showStyle?: boolean
  /** Match the caller's own input height (Invoice's lines use h-11). */
  inputClassName?: string
}) {
  const fields: Array<[string, string | null | undefined]> = [
    ["Category", categoryName],
    ["Type", categoryTypeName],
  ]
  if (showStyle || targetStyleName) fields.push(["Style", targetStyleName])

  return (
    <>
      {fields.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input
            value={value || "—"}
            readOnly
            tabIndex={-1}
            aria-readonly
            className={`bg-muted text-muted-foreground ${inputClassName ?? ""}`}
          />
        </div>
      ))}
    </>
  )
}
