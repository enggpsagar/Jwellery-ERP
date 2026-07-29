"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Karigar } from "@/lib/actions/karigar-actions"

type Props = {
  pending?: boolean
  karigar?: Karigar | null
}

export function KarigarForm({
  pending = false,
  karigar = null,
}: Props) {

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2">
          <Label>Karigar Code</Label>
          <Input
            name="code"
            placeholder="KAR001"
            defaultValue={karigar?.code}
          />
        </div>

        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            name="name"
            placeholder="Karigar name"
            defaultValue={karigar?.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Mobile</Label>
          <Input
            name="mobile"
            placeholder="Mobile number"
            defaultValue={karigar?.mobile}
          />
        </div>

        <div className="space-y-2">
          <Label>WhatsApp</Label>
          <Input
            name="whatsapp"
            placeholder="WhatsApp number"
            defaultValue={karigar?.whatsapp}
          />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            defaultValue={karigar?.email}
          />
        </div>

        <div className="space-y-2">
          <Label>City</Label>
          <Input
            name="city"
            defaultValue={karigar?.city}
          />
        </div>

        <div className="space-y-2">
          <Label>Pincode</Label>
          <Input
            name="pincode"
            defaultValue={karigar?.pincode}
          />
        </div>

        <div className="space-y-2">
          <Label>Specialization</Label>
          <Input
            name="specialization"
            placeholder="e.g. Chain making, Stone setting"
            defaultValue={karigar?.specialization}
          />
        </div>

        <div className="space-y-2">
          <Label>GST Number</Label>
          <Input
            name="gstNumber"
            defaultValue={karigar?.gstNumber}
          />
        </div>

        <div className="space-y-2">
          <Label>PAN Number</Label>
          <Input
            name="panNumber"
            defaultValue={karigar?.panNumber}
          />
        </div>

        <div className="space-y-2">
          <Label>Aadhaar Number</Label>
          <Input
            name="aadhaarNumber"
            defaultValue={karigar?.aadhaarNumber}
          />
        </div>

      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <Textarea
          name="address"
          rows={3}
          defaultValue={karigar?.address}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          name="notes"
          rows={2}
          defaultValue={karigar?.notes}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2">
          <Label>Opening Gold (grams)</Label>
          <Input
            name="openingGold"
            type="number"
            step="0.001"
            defaultValue={karigar?.openingGold ?? 0}
          />
        </div>

        <div className="space-y-2">
          <Label>Opening Cash</Label>
          <Input
            name="openingCash"
            type="number"
            step="0.01"
            defaultValue={karigar?.openingCash ?? 0}
          />
        </div>

      </div>

      {karigar ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            defaultChecked={karigar.isActive}
            className="h-4 w-4"
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2 rounded-md bg-primary text-primary-foreground"
      >
        {pending ? "Saving..." : karigar ? "Update Karigar" : "Save Karigar"}
      </button>

    </div>
  )
}
