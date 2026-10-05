import type { StockTagData } from "@/lib/actions/inventory/stock-tag-actions"
import type { StockTagField } from "@/lib/stock-tag-fields"

export type StockTagLine = { key: string; text: string; bold?: boolean }

/**
 * The printed text of a tag, in the order Settings > Tags lists the fields.
 * `skip` leaves out fields a layout prints elsewhere (the barcode tag puts
 * store name and tag code beside the barcode).
 */
export function stockTagLines(
  tag: StockTagData,
  fields: readonly StockTagField[],
  { skip = [] as StockTagField[], codePrefix = "" } = {},
): StockTagLine[] {
  const has = (field: StockTagField) => fields.includes(field)
  const lines: StockTagLine[] = []

  for (const field of fields) {
    if (skip.includes(field)) continue
    switch (field) {
      case "STORE_NAME":
        lines.push({ key: field, text: tag.storeName.toUpperCase(), bold: true })
        break
      case "TAG_CODE":
        lines.push({ key: field, text: `${codePrefix}${tag.code}`, bold: true })
        break
      case "PRODUCT_NAME":
        lines.push({ key: field, text: tag.productName })
        break
      case "PRODUCT_CODE":
        if (tag.productCode) lines.push({ key: field, text: tag.productCode, bold: true })
        break
      case "CATEGORY":
        if (tag.category) lines.push({ key: field, text: tag.category })
        break
      case "METALS":
        tag.metals.forEach((metal, index) => {
          const name = [metal.name, metal.purity].filter(Boolean).join(" ")
          const weight = has("METAL_WEIGHTS") && metal.weight ? ` : ${metal.weight}` : ""
          lines.push({ key: `${field}-${index}`, text: `${name}${weight}` })
        })
        break
      case "METAL_WEIGHTS":
        // Printed on the METALS line when both are on.
        if (has("METALS")) break
        tag.metals.forEach((metal, index) => {
          if (metal.weight) lines.push({ key: `${field}-${index}`, text: `${metal.name} : ${metal.weight}` })
        })
        break
      case "GROSS_WEIGHT":
        if (tag.grossWeight) lines.push({ key: field, text: `G.W : ${tag.grossWeight}` })
        break
      case "NET_WEIGHT":
        if (tag.netWeight) lines.push({ key: field, text: `N.W : ${tag.netWeight}` })
        break
      case "STONES":
        tag.stones.forEach((stone, index) => {
          const amount = [stone.carat, stone.pieces != null ? `${stone.pieces}pcs` : null].filter(Boolean).join(" / ")
          const clarity = has("STONE_CLARITY") ? stoneClarity(stone) : null
          const text = [stone.name, stone.types].filter(Boolean).join(" ") + (amount ? ` : ${amount}` : "")
          lines.push({ key: `${field}-${index}`, text: clarity ? `${text} · ${clarity}` : text })
        })
        break
      case "STONE_CLARITY":
        // Printed on each STONES line when both are on.
        if (has("STONES")) break
        tag.stones.forEach((stone, index) => {
          const clarity = stoneClarity(stone)
          if (clarity) lines.push({ key: `${field}-${index}`, text: `${stone.name} : ${clarity}` })
        })
        break
      case "STONE_TOTAL":
        if (tag.stoneTotalCarat || tag.stoneTotalPieces) {
          lines.push({
            key: field,
            text: [
              tag.stoneTotalCarat ? `ST.WT : ${tag.stoneTotalCarat}` : null,
              tag.stoneTotalPieces ? `PCS : ${tag.stoneTotalPieces}` : null,
            ]
              .filter(Boolean)
              .join("  "),
          })
        }
        break
      case "MFG_DATE":
        if (tag.manufactureDate) lines.push({ key: field, text: `MFG ${tag.manufactureDate}` })
        break
    }
  }

  return lines
}

function stoneClarity(stone: StockTagData["stones"][number]) {
  return [stone.clarity, stone.certificate ? `Cert ${stone.certificate}` : null].filter(Boolean).join(" · ") || null
}

/** Smaller text as a tag fills up, so every chosen line fits the 30mm label. */
export function tagFontSize(lineCount: number) {
  if (lineCount <= 6) return "10px"
  if (lineCount <= 8) return "8.5px"
  if (lineCount <= 10) return "7px"
  return "6px"
}
