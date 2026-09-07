"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, ExternalLink, Link2, Unlink } from "lucide-react"

import {
  createLinkedVendorFromCustomer,
  getLinkableVendors,
  linkVendorToCustomer,
  unlinkCustomerVendor,
  type LinkableOption,
} from "@/lib/actions/party-link-actions"
import { Button } from "@/components/ui/button"
import { ActiveBadge } from "@/components/shared/active-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/providers/toast-provider"

type LinkedVendorInfo = {
  id: string
  name: string
  vendorCode: string | null
  isActive: boolean
  pendingAmount: string
}

type CustomerVendorLinkCardProps = {
  customerId: string
  linkedVendor: LinkedVendorInfo | null
  /** Called after a successful link/unlink/register, in addition to the
   * standalone page's own router.refresh() — the inline master-detail
   * panel on the Customers list fetches its own copy of the customer
   * client-side and needs an explicit nudge to refetch it, since a mere
   * router.refresh() only re-runs Server Component data. */
  onChanged?: () => void
}

/**
 * "Is this customer also a vendor?" section on the Customer detail view —
 * shown whether reached via the standalone /customers/[id] page or the
 * inline panel on the Customers list. See VendorCustomerLinkCard for the
 * mirror image on a Vendor's own detail view.
 */
export function CustomerVendorLinkCard({
  customerId,
  linkedVendor,
  onChanged,
}: CustomerVendorLinkCardProps) {
  const router = useRouter()
  const toast = useToast()

  const [loading, setLoading] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [options, setOptions] = React.useState<LinkableOption[]>([])
  const [loadingOptions, setLoadingOptions] = React.useState(false)
  const [selectedVendorId, setSelectedVendorId] = React.useState("")
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = React.useState(false)

  function afterChange() {
    router.refresh()
    onChanged?.()
  }

  async function handleRegisterAsVendor() {
    try {
      setLoading(true)
      const result = await createLinkedVendorFromCustomer(customerId)
      if (result.success) {
        toast.success(result.message)
        afterChange()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to register as vendor")
    } finally {
      setLoading(false)
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    setLoadingOptions(true)
    try {
      setOptions(await getLinkableVendors())
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingOptions(false)
    }
  }

  async function handleLinkExisting() {
    if (!selectedVendorId) return

    try {
      setLoading(true)
      const result = await linkVendorToCustomer(customerId, selectedVendorId)
      if (result.success) {
        toast.success(result.message)
        setPickerOpen(false)
        setSelectedVendorId("")
        afterChange()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to link vendor")
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlink() {
    try {
      setLoading(true)
      const result = await unlinkCustomerVendor(customerId)
      if (result.success) {
        toast.success(result.message)
        setConfirmUnlinkOpen(false)
        afterChange()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to remove the link")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            Vendor Relationship
          </CardTitle>
        </CardHeader>
        <CardContent>
          {linkedVendor ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{linkedVendor.name}</span>
                  <ActiveBadge isActive={linkedVendor.isActive} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {linkedVendor.vendorCode ? `${linkedVendor.vendorCode} — ` : ""}
                  Pending payable: {linkedVendor.pendingAmount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link href={`/vendors/${linkedVendor.id}`}>
                    <ExternalLink className="h-4 w-4" />
                    View Vendor
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => setConfirmUnlinkOpen(true)}
                  disabled={loading}
                >
                  <Unlink className="h-4 w-4" />
                  Unlink
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-64 flex-1 text-sm text-muted-foreground">
                Also buy stock back from this customer? Connect them to a vendor record.
              </p>
              <Button size="sm" className="gap-2" onClick={handleRegisterAsVendor} disabled={loading}>
                <Link2 className="h-4 w-4" />
                {loading ? "Registering..." : "Register as Vendor"}
              </Button>
              <Button
                size="sm"
                onClick={openPicker}
                disabled={loading}
                className="bg-[var(--chart-4)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-4)_88%,black)]"
              >
                Link to Existing Vendor
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!loading) setPickerOpen(open)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to an existing Vendor</DialogTitle>
            <DialogDescription>
              Pick the Vendor record for the same person or business.
            </DialogDescription>
          </DialogHeader>

          <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={loadingOptions ? "Loading vendors..." : "Select a vendor"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 && !loadingOptions ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No unlinked vendors available.
                </div>
              ) : (
                options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                    {option.code ? ` (${option.code})` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLinkExisting}
              disabled={loading || !selectedVendorId}
            >
              {loading ? "Linking..." : "Link Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmUnlinkOpen}
        onOpenChange={(open) => {
          if (!loading) setConfirmUnlinkOpen(open)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove vendor link?</DialogTitle>
            <DialogDescription>
              This only disconnects the two records — neither the customer
              nor the vendor themselves are changed or deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmUnlinkOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleUnlink} disabled={loading}>
              {loading ? "Removing..." : "Remove Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
