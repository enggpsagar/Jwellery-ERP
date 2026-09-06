// lib/business-units.server.ts
import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { MONEY_UNIT } from "@/lib/business-units"

/**
 * One selectable "business unit" — either the fixed "MONEY" sentinel or a
 * live StoreMetal row (a plain metal or a gemstone; `isGemstone` decides
 * gram-vs-carat formatting everywhere via formatUnitValue). This is the
 * single source every picker (Settings' Business Model checkboxes, the
 * Ledger/Customer Ledger entry-unit selectors) should render from, and what
 * BusinessSettings.businessUnits' entries resolve to — replacing the old
 * fixed Money/Gold/Silver/Diamond enum.
 */
export type BusinessUnitOption = {
  value: string
  label: string
  isGemstone: boolean
}

const MONEY_OPTION: BusinessUnitOption = {
  value: MONEY_UNIT,
  label: "Money",
  isGemstone: false,
}

/**
 * Every unit a store *could* select as a Business Model option right now:
 * Money (always first, always available) plus one entry per active
 * StoreMetal the store has configured in Taxonomy settings — both plain
 * metals and gemstones (Settings' Stones section, same StoreMetal table,
 * `isGemstone: true`). This is what the user meant by "the Business Model
 * should automatically fetch and display the available options from the
 * configured Metals and Categories" (Categories excluded per the confirmed
 * scoping — a StoreCategory classifies a product, it isn't a settlement
 * unit).
 */
export async function getAvailableBusinessUnitOptions(): Promise<BusinessUnitOption[]> {
  const storeId = await requireStoreScope()

  const metals = await prisma.storeMetal.findMany({
    where: { storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isGemstone: true },
  })

  return [
    MONEY_OPTION,
    ...metals.map((metal) => ({
      value: metal.id,
      label: metal.name,
      isGemstone: metal.isGemstone,
    })),
  ]
}

/**
 * The business units the current store has configured itself to transact
 * in — always at least one (falls back to Money). Each raw string in
 * BusinessSettings.businessUnits is either "MONEY" or a StoreMetal.id;
 * resolved here against the store's live StoreMetal rows so callers always
 * get a real label + isGemstone flag, never a bare id. A selection whose
 * StoreMetal has since been deleted or deactivated is silently dropped
 * (same "don't fail on stale config" spirit as the migration's backfill) —
 * existing ledger data referencing that metal is untouched, only its
 * appearance in this *current* picker list goes away.
 */
export async function getActiveBusinessUnits(): Promise<BusinessUnitOption[]> {
  const storeId = await requireStoreScope()

  const [settings, options] = await Promise.all([
    prisma.businessSettings.findUnique({
      where: { storeId },
      select: { businessUnits: true },
    }),
    getAvailableBusinessUnitOptions(),
  ])

  const optionByValue = new Map(options.map((option) => [option.value, option]))
  const selected = settings?.businessUnits?.length ? settings.businessUnits : [MONEY_UNIT]

  const resolved = selected
    .map((value) => optionByValue.get(value))
    .filter((option): option is BusinessUnitOption => Boolean(option))

  return resolved.length ? resolved : [MONEY_OPTION]
}
