"use client";

import { useActionState } from "react";
import { useEffect } from "react";

import {
  updateBusinessSettings,
  type BusinessSettings,
  type SettingsFormState,
} from "@/lib/actions/settings-actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SettingsFormProps = {
  settings: BusinessSettings;
  canEdit: boolean;
};

const initialState: SettingsFormState = { success: false, message: "" };

export function SettingsForm({ settings, canEdit }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessSettings,
    initialState,
  );

  useEffect(() => {
    if (state.message && state.success) {
      // Hook into your toast provider here if desired
      console.log(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {!canEdit ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only the Store Owner can edit these settings. You have view-only access.
        </div>
      ) : null}

      {state.message ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.success
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <fieldset disabled={!canEdit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              name="businessName"
              defaultValue={settings.businessName}
              required
            />
            {state.errors?.businessName ? (
              <p className="text-xs text-red-600">
                {state.errors.businessName[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="legalName">Legal / Registered Name</Label>
            <Input
              id="legalName"
              name="legalName"
              defaultValue={settings.legalName}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={settings.phone} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={settings.email}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" defaultValue={settings.website} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax & Compliance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gstNumber">GSTIN</Label>
            <Input
              id="gstNumber"
              name="gstNumber"
              placeholder="27ABCDE1234F1Z5"
              defaultValue={settings.gstNumber}
              maxLength={15}
              className="uppercase"
            />
            {state.errors?.gstNumber ? (
              <p className="text-xs text-red-600">{state.errors.gstNumber[0]}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="panNumber">PAN Number</Label>
            <Input
              id="panNumber"
              name="panNumber"
              defaultValue={settings.panNumber}
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stateCode">GST State Code</Label>
            <Input
              id="stateCode"
              name="stateCode"
              placeholder="e.g. 27"
              defaultValue={settings.stateCode}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defaultGstRate">Default GST Rate (%)</Label>
            <Input
              id="defaultGstRate"
              name="defaultGstRate"
              type="number"
              step="0.1"
              defaultValue={settings.defaultGstRate}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={settings.address} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={settings.city} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" defaultValue={settings.state} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" name="pincode" defaultValue={settings.pincode} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              defaultValue={settings.invoicePrefix}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoiceStartingNo">Next Invoice No.</Label>
            <Input
              id="invoiceStartingNo"
              name="invoiceStartingNo"
              type="number"
              defaultValue={settings.invoiceStartingNo}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="financialYearStartMonth">
              Financial Year Start Month
            </Label>
            <Input
              id="financialYearStartMonth"
              name="financialYearStartMonth"
              type="number"
              min={1}
              max={12}
              defaultValue={settings.financialYearStartMonth}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="invoiceTerms">Invoice Terms & Conditions</Label>
            <Textarea
              id="invoiceTerms"
              name="invoiceTerms"
              defaultValue={settings.invoiceTerms}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="invoiceNotes">Default Invoice Notes</Label>
            <Textarea
              id="invoiceNotes"
              name="invoiceNotes"
              defaultValue={settings.invoiceNotes}
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}
      </fieldset>
    </form>
  );
}