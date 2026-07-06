
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { prisma } from "@/lib/prisma"

type CustomerSortBy = "name" | "createdAt" | "openingBalance"
type SortOrder = "asc" | "desc"

function formatCurrency(value: number) {
  return `₹ ${value.toLocaleString("en-IN")}`
}

function formatDate(date?: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function getTimestampedFileName() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const seconds = String(now.getSeconds()).padStart(2, "0")

  return `customers-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.xlsx`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const search = String(searchParams.get("search") || "").trim()
    const sortBy = (searchParams.get("sortBy") || "createdAt") as CustomerSortBy
    const sortOrder = (searchParams.get("sortOrder") || "desc") as SortOrder

    const where = {
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

    const customers = await prisma.customer.findMany({
      where,
      orderBy,
      include: {
        invoices: {
          select: {
            id: true,
            totalAmount: true,
            balanceAmount: true,
            invoiceDate: true,
          },
          orderBy: {
            invoiceDate: "desc",
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

    const rows = customers.map((customer, index) => {
      const totalOrders = customer.invoices.length

      const totalPurchaseValueNumber = customer.invoices.reduce(
        (sum, invoice) => sum + Number(invoice.totalAmount || 0),
        0
      )

      const pendingAmountNumber = customer.invoices.reduce(
        (sum, invoice) => sum + Number(invoice.balanceAmount || 0),
        0
      )

      const lastPurchaseDate =
        customer.invoices.length > 0
          ? formatDate(customer.invoices[0].invoiceDate)
          : "-"

      const lastPaymentDate =
        customer.ledgerEntries.length > 0
          ? formatDate(customer.ledgerEntries[0].entryDate)
          : "-"

      return {
        "Sr No": index + 1,
        "Customer Name": customer.name,
        Phone: customer.phone ?? "",
        "Alternate Phone": customer.alternatePhone ?? "",
        Email: customer.email ?? "",
        Address: customer.addressLine1 ?? "",
        City: customer.city ?? "",
        State: customer.state ?? "",
        Pincode: customer.pincode ?? "",
        GSTIN: customer.gstin ?? "",
        "Opening Balance": Number(customer.openingBalance ?? 0),
        "Current Balance": Number(customer.openingBalance ?? 0),
        "Total Orders": totalOrders,
        "Total Purchase Value": formatCurrency(totalPurchaseValueNumber),
        "Pending Amount": formatCurrency(pendingAmountNumber),
        "Last Purchase Date": lastPurchaseDate,
        "Last Payment Date": lastPaymentDate,
        Notes: customer.notes ?? "",
        "Created At": formatDate(customer.createdAt),
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)

    const columnWidths = [
      { wch: 8 },  // Sr No
      { wch: 28 }, // Customer Name
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")

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
    console.error("Customer export failed:", error)
    return NextResponse.json(
      { success: false, message: "Failed to export customers" },
      { status: 500 }
    )
  }
}