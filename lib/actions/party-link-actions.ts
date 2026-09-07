// lib/actions/party-link-actions.ts
"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"

export type LinkActionResult = {
  success: boolean
  message: string
  /** The id/name of the record on the other side, once linked/created —
   * lets the caller navigate straight to it. */
  id?: string
  name?: string
}

export type LinkableOption = {
  id: string
  name: string
  code: string | null
}

/**
 * Vendors in this store not already linked to a different customer — the
 * option list for the "Link to existing Vendor" picker on a Customer's
 * detail page. Excludes archived vendors: linking to one that's been
 * archived away would surface a dead-end relationship.
 */
export async function getLinkableVendors(): Promise<LinkableOption[]> {
  const storeId = await requireStoreScope()

  const vendors = await prisma.vendor.findMany({
    where: { storeId, isArchived: false, linkedCustomer: null },
    select: { id: true, name: true, vendorCode: true },
    orderBy: { name: "asc" },
  })

  return vendors.map((v) => ({ id: v.id, name: v.name, code: v.vendorCode }))
}

/** Mirrors getLinkableVendors for the "Link to existing Customer" picker on
 *  a Vendor's detail page. */
export async function getLinkableCustomers(): Promise<LinkableOption[]> {
  const storeId = await requireStoreScope()

  const customers = await prisma.customer.findMany({
    where: { storeId, isArchived: false, linkedVendorId: null },
    select: { id: true, name: true, customerCode: true },
    orderBy: { name: "asc" },
  })

  return customers.map((c) => ({ id: c.id, name: c.name, code: c.customerCode }))
}

/** Connects an already-existing Customer and Vendor as the same real-world
 *  party. Both must belong to the caller's own store, and the vendor must
 *  not already be claimed by a different customer (the link is 1:1). */
export async function linkVendorToCustomer(
  customerId: string,
  vendorId: string,
): Promise<LinkActionResult> {
  try {
    const storeId = await requireStoreScope()

    const [customer, vendor] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } }),
      prisma.vendor.findFirst({
        where: { id: vendorId, storeId },
        select: { id: true, name: true, linkedCustomer: { select: { id: true } } },
      }),
    ])

    if (!customer) return { success: false, message: "Party not found" }
    if (!vendor) return { success: false, message: "Vendor not found" }
    if (vendor.linkedCustomer && vendor.linkedCustomer.id !== customerId) {
      return { success: false, message: "This vendor is already linked to a different party" }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { linkedVendorId: vendorId },
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    revalidatePath(`/vendors/${vendorId}`)

    return { success: true, message: `Linked to vendor "${vendor.name}"`, id: vendor.id, name: vendor.name }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { success: false, message: "This vendor is already linked to a different party" }
    }
    console.error("linkVendorToCustomer error:", error)
    return { success: false, message: "Failed to link vendor" }
  }
}

/** Removes an existing Customer<->Vendor link. Neither record itself is
 *  touched — only the connection between them. */
export async function unlinkCustomerVendor(customerId: string): Promise<LinkActionResult> {
  try {
    const storeId = await requireStoreScope()

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { linkedVendorId: true },
    })
    if (!customer) return { success: false, message: "Party not found" }

    const vendorId = customer.linkedVendorId

    await prisma.customer.update({
      where: { id: customerId },
      data: { linkedVendorId: null },
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    if (vendorId) revalidatePath(`/vendors/${vendorId}`)

    return { success: true, message: "Vendor link removed" }
  } catch (error) {
    console.error("unlinkCustomerVendor error:", error)
    return { success: false, message: "Failed to remove the link" }
  }
}

/**
 * One-click "this customer is also a vendor" — creates a brand new Vendor
 * row pre-filled from the customer's own contact/GST details and links it
 * immediately, rather than making the store re-type everything into a
 * second form. The two records stay fully independent afterward (editing
 * one never touches the other) — this only seeds the starting point.
 */
export async function createLinkedVendorFromCustomer(customerId: string): Promise<LinkActionResult> {
  try {
    const storeId = await requireStoreScope()

    const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId } })
    if (!customer) return { success: false, message: "Party not found" }
    if (customer.linkedVendorId) {
      return { success: false, message: "This party is already linked to a vendor" }
    }

    const vendor = await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({
        data: {
          storeId,
          name: customer.name,
          phone: customer.phone,
          alternatePhone: customer.alternatePhone,
          email: customer.email,
          addressLine1: customer.addressLine1,
          addressLine2: customer.addressLine2,
          city: customer.city,
          state: customer.state,
          pincode: customer.pincode,
          gstin: customer.gstin,
          gstType: customer.gstType,
          aadhaarNumber: customer.aadhaarNumber,
          notes: customer.notes,
        },
      })

      await tx.customer.update({
        where: { id: customerId },
        data: { linkedVendorId: created.id },
      })

      return created
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/vendors")
    revalidatePath(`/vendors/${vendor.id}`)

    return {
      success: true,
      message: `Registered "${customer.name}" as a vendor too`,
      id: vendor.id,
      name: vendor.name,
    }
  } catch (error) {
    console.error("createLinkedVendorFromCustomer error:", error)
    return { success: false, message: "Failed to register as a vendor" }
  }
}

/** Mirrors createLinkedVendorFromCustomer — "this vendor is also a
 *  customer." Guards against Customer's own storeId+phone uniqueness: a
 *  vendor whose phone number is already some OTHER customer's phone can't
 *  be auto-created (the store should link to that existing customer
 *  instead, via "Link to existing Customer"). */
export async function createLinkedCustomerFromVendor(vendorId: string): Promise<LinkActionResult> {
  try {
    const storeId = await requireStoreScope()

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, storeId } })
    if (!vendor) return { success: false, message: "Vendor not found" }

    const alreadyLinked = await prisma.customer.findFirst({
      where: { linkedVendorId: vendorId },
      select: { id: true },
    })
    if (alreadyLinked) return { success: false, message: "This vendor is already linked to a party" }

    if (vendor.phone) {
      const phoneCollision = await prisma.customer.findFirst({
        where: { storeId, phone: vendor.phone },
        select: { id: true, name: true },
      })
      if (phoneCollision) {
        return {
          success: false,
          message: `A party named "${phoneCollision.name}" already uses this phone number — link to that party instead of creating a new one`,
        }
      }
    }

    const customer = await prisma.customer.create({
      data: {
        storeId,
        name: vendor.name,
        phone: vendor.phone,
        alternatePhone: vendor.alternatePhone,
        email: vendor.email,
        addressLine1: vendor.addressLine1,
        addressLine2: vendor.addressLine2,
        city: vendor.city,
        state: vendor.state,
        pincode: vendor.pincode,
        gstin: vendor.gstin,
        gstType: vendor.gstType,
        aadhaarNumber: vendor.aadhaarNumber,
        notes: vendor.notes,
        linkedVendorId: vendor.id,
      },
    })

    revalidatePath(`/vendors/${vendorId}`)
    revalidatePath("/customers")
    revalidatePath(`/customers/${customer.id}`)

    return {
      success: true,
      message: `Registered "${vendor.name}" as a party too`,
      id: customer.id,
      name: customer.name,
    }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return {
        success: false,
        message: "A party with this phone number already exists — link to that party instead",
      }
    }
    console.error("createLinkedCustomerFromVendor error:", error)
    return { success: false, message: "Failed to register as a party" }
  }
}
