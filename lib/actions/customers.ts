"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

export type CustomerFormValues = {
  name: string
  phone?: string
  alternatePhone?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  pincode?: string
  gstin?: string
  notes?: string
  openingBalance?: number
}

export async function getCustomers() {
  return db.customer.findMany({
    orderBy: {
      createdAt: "desc",
    },
  })
}

export async function createCustomer(data: CustomerFormValues) {
  if (!data.name?.trim()) {
    throw new Error("Customer name is required.")
  }

  const customerCount = await db.customer.count()
  const customerCode = `CUST-${String(customerCount + 1).padStart(4, "0")}`

  await db.customer.create({
    data: {
      customerCode,
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      alternatePhone: data.alternatePhone?.trim() || null,
      email: data.email?.trim() || null,
      addressLine1: data.addressLine1?.trim() || null,
      addressLine2: data.addressLine2?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      pincode: data.pincode?.trim() || null,
      gstin: data.gstin?.trim() || null,
      notes: data.notes?.trim() || null,
      openingBalance: data.openingBalance ?? 0,
    },
  })

  revalidatePath("/customers")

  return {
    success: true,
    message: "Customer added successfully.",
  }
}