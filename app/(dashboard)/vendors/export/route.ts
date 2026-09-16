
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { prisma } from "@/lib/prisma"
import { requireStoreScope, assertPlanActiveForExport, PlanExpiredError } from "@/lib/store-context"
import { formatShortDate } from "@/lib/utils"
import { logger } from "@/lib/logger";
import { mapVendorForExport } from "@/lib/actions/vendor-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"

type VendorSortBy = "name" | "createdAt" | "openingBalance"
type SortOrder = "asc" | "desc"

function formatDate(date?: Date | null) {
  return formatShortDate(date)
}

function getTimestampedFileName() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const seconds = String(now.getSeconds()).padStart(2, "0")

  return `vendors-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.xlsx`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const search = String(searchParams.get("search") || "").trim()
    const sortBy = (searchParams.get("sortBy") || "createdAt") as VendorSortBy
    const sortOrder = (searchParams.get("sortOrder") || "desc") as SortOrder

    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    const businessSettings = await getBusinessSettings()
    if (!businessSettings.vendorsModuleEnabled) {
      return NextResponse.json(
        { success: false, message: "The Vendors module is turned off in Settings" },
        { status: 403 },
      )
    }

    const where = {
      storeId,
      isArchived: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
              { state: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    }

    const orderBy =
      sortBy === "name"
        ? { name: sortOrder }
        : sortBy === "openingBalance"
          ? { openingBalance: sortOrder }
          : { createdAt: sortOrder }

    // Same include + mapVendor() this app's every other vendor list/detail
    // view uses (lib/actions/vendor-actions.ts) — this route used to run
    // its own separate, drifted copy of the pendingAmount/currentBalance
    // math (missing openingBalance and any CANCELLED-purchase filter).
    const vendors = await prisma.vendor.findMany({
      where,
      orderBy,
      include: {
        purchases: {
          select: {
            id: true,
            totalAmount: true,
            balanceAmount: true,
            purchaseDate: true,
            status: true,
          },
          orderBy: {
            purchaseDate: "desc",
          },
        },
        ledgerEntries: {
          select: {
            id: true,
            amount: true,
            entryDate: true,
          },
          orderBy: {
            entryDate: "desc",
          },
        },
      },
    })

    const rows = await Promise.all(vendors.map(async (vendor, index) => {
      const mapped = await mapVendorForExport(vendor)

      return {
        "Sr No": index + 1,
        "Vendor Name": vendor.name,
        Phone: vendor.phone ?? "",
        "Alternate Phone": vendor.alternatePhone ?? "",
        Email: vendor.email ?? "",
        Address: vendor.addressLine1 ?? "",
        City: vendor.city ?? "",
        State: vendor.state ?? "",
        Pincode: vendor.pincode ?? "",
        GSTIN: vendor.gstin ?? "",
        "Opening Balance": mapped.openingBalance,
        "Current Balance": mapped.currentBalance,
        "Total Orders": mapped.totalOrders,
        "Total Purchase Value": mapped.totalPurchaseValue,
        "Pending Amount": mapped.pendingAmount,
        "Last Purchase Date": mapped.lastPurchaseDate,
        "Last Payment Date": mapped.lastPaymentDate,
        Notes: vendor.notes ?? "",
        "Created At": formatDate(vendor.createdAt),
      }
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)

    const columnWidths = [
      { wch: 8 },  // Sr No
      { wch: 28 }, // Vendor Name
      { wch: 16 }, // Phone
      { wch: 18 }, // Alternate Phone
      { wch: 28 }, // Email
      { wch: 35 }, // Address
      { wch: 18 }, // City
      { wch: 18 }, // State
      { wch: 12 }, // Pincode
      { wch: 18 }, // GSTIN
      { wch: 16 }, // Opening Balance
      { wch: 16 }, // Current Balance
      { wch: 12 }, // Total Orders
      { wch: 20 }, // Total Purchase Value
      { wch: 18 }, // Pending Amount
      { wch: 18 }, // Last Purchase Date
      { wch: 18 }, // Last Payment Date
      { wch: 30 }, // Notes
      { wch: 18 }, // Created At
    ]

    worksheet["!cols"] = columnWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors")

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    })

    const filename = getTimestampedFileName()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    if (error instanceof PlanExpiredError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 403 })
    }
    logger.error("Vendor export failed", error)
    return NextResponse.json(
      { success: false, message: "Failed to export vendors" },
      { status: 500 }
    )
  }
}
