"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, ExternalLink, Link2, Unlink } from "lucide-react"

import {
  createLinkedCustomerFromVendor,
  getLinkableCustomers,
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

type LinkedCustomerInfo = {
  id: string
  name: string
  customerCode: string | null
  isActive: boolean
  pendingAmount: string
}

type VendorCustomerLinkCardProps = {
  vendorId: string
  linkedCustomer: LinkedCustomerInfo | null
  /** Same reason as CustomerVendorLinkCard's own onChanged — the inline
   * master-detail panel on the Vendors list needs an explicit nudge to
   * refetch its client-side-held vendor, beyond router.refresh(). */
  onChanged?: () => void
}

/**
 * "Is this vendor also a customer?" section on the Vendor detail view — the
 * mirror image of CustomerVendorLinkCard, see that component's doc comment.
 * The link itself lives on the Customer row (Customer.linkedVendorId), so
 * linking/unlinking here calls the exact same party-link-actions as there,
 * just addressed from the vendor's side.
 */
export function VendorCustomerLinkCard({
  vendorId,
  linkedCustomer,
  onChanged,
}: VendorCustomerLinkCardProps) {
  const router = useRouter()
  const toast = useToast()

  const [loading, setLoading] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [options, setOptions] = React.useState<LinkableOption[]>([])
  const [loadingOptions, setLoadingOptions] = React.useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("")
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = React.useState(false)

  function afterChange() {
    router.refresh()
    onChanged?.()
  }

  async function handleRegisterAsCustomer() {
    try {
      setLoading(true)
      const result = await createLinkedCustomerFromVendor(vendorId)
      if (result.success) {
        toast.success(result.message)
        afterChange()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to register as party")
    } finally {
      setLoading(false)
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    setLoadingOptions(true)
    try {
      setOptions(await getLinkableCustomers())
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingOptions(false)
    }
  }

  async function handleLinkExisting() {
    if (!selectedCustomerId) return

    try {
      setLoading(true)
      const result = await linkVendorToCustomer(selectedCustomerId, vendorId)
      if (result.success) {
        toast.success(result.message)
        setPickerOpen(false)
        setSelectedCustomerId("")
        afterChange()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to link party")
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlink() {
    if (!linkedCustomer) return

    try {
      setLoading(true)
      const result = await unlinkCustomerVendor(linkedCustomer.id)
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
            Party Relationship
          </CardTitle>
        </CardHeader>
        <CardContent>
          {linkedCustomer ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{linkedCustomer.name}</span>
                  <ActiveBadge isActive={linkedCustomer.isActive} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {linkedCustomer.customerCode ? `${linkedCustomer.customerCode} — ` : ""}
                  Pending receivable: {linkedCustomer.pendingAmount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="info" size="sm" className="gap-2">
                  <Link href={`/customers/${linkedCustomer.id}`}>
                    <ExternalLink className="h-4 w-4" />
                    View Party
                  </Link>
                </Button>
                <Button
                  variant="warning"
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
                Does this vendor also buy from you as a party? Connect them to a party record.
              </p>
              <Button size="sm" className="gap-2" onClick={handleRegisterAsCustomer} disabled={loading}>
                <Link2 className="h-4 w-4" />
                {loading ? "Registering..." : "Register as Party"}
              </Button>
              <Button
                size="sm"
                onClick={openPicker}
                disabled={loading}
                className="bg-[var(--chart-4)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-4)_88%,black)]"
              >
                Link to Existing Party
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
            <DialogTitle>Link to an existing Party</DialogTitle>
            <DialogDescription>
              Pick the Party record for the same person or business.
            </DialogDescription>
          </DialogHeader>

          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={loadingOptions ? "Loading parties..." : "Select a party"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 && !loadingOptions ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No unlinked parties available.
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
              disabled={loading || !selectedCustomerId}
            >
              {loading ? "Linking..." : "Link Party"}
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
            <DialogTitle>Remove party link?</DialogTitle>
            <DialogDescription>
              This only disconnects the two records — neither the vendor
              nor the party themselves are changed or deleted.
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
            <Button type="button" variant="warning" onClick={handleUnlink} disabled={loading}>
              {loading ? "Removing..." : "Remove Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
