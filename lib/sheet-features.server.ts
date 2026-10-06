import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { ALL_SHEET_FEATURES, type SheetFeatures } from "@/lib/sheet-features"

/**
 * The store's sheet features (see lib/sheet-features.ts), read once per
 * request. A store with no BusinessSettings row yet gets the schema's own
 * defaults (every toggle on).
 *
 * Masters: a Locations column only appears once the store has any location
 * (active or not — an inactive one can still be on old rows, so its name
 * stays exportable), and a GST Rate column only once it has any GST rate.
 */
export const getSheetFeatures = cache(async (storeId: string): Promise<SheetFeatures> => {
  const [settings, locationCount, gstRateCount] = await Promise.all([
    prisma.businessSettings.findUnique({
      where: { storeId },
      select: { styleFieldEnabled: true, ewayBillEnabled: true, eInvoiceEnabled: true, sendToArtisanEnabled: true },
    }),
    prisma.storeLocation.count({ where: { storeId } }),
    prisma.gstRate.count({ where: { storeId } }),
  ])
  return {
    style: settings?.styleFieldEnabled ?? ALL_SHEET_FEATURES.style,
    ewayBill: settings?.ewayBillEnabled ?? ALL_SHEET_FEATURES.ewayBill,
    eInvoice: settings?.eInvoiceEnabled ?? ALL_SHEET_FEATURES.eInvoice,
    sendToArtisan: settings?.sendToArtisanEnabled ?? ALL_SHEET_FEATURES.sendToArtisan,
    locations: locationCount > 0,
    gstRates: gstRateCount > 0,
  }
})
