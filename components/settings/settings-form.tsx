"use client";

import { useActionState } from "react";
import { useEffect, useState } from "react";

import {
  updateBusinessSettings,
  type BusinessSettings,
  type SettingsFormState,
} from "@/lib/actions/settings-actions";
import {
  ALL_BUSINESS_UNITS,
  BUSINESS_UNIT_LABELS,
  BUSINESS_UNIT_DESCRIPTIONS,
  type BusinessUnit,
} from "@/lib/business-units";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreLogoUpload } from "@/components/settings/store-logo-upload";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/shared/required-mark"

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

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>(
    settings.businessUnits,
  );

  function toggleUnit(unit: BusinessUnit) {
    setBusinessUnits((current) =>
      current.includes(unit)
        ? current.filter((u) => u !== unit)
        : [...current, unit],
    );
  }

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
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent>
          <StoreLogoUpload
            logoUrl={settings.logoUrl}
            storeName={settings.businessName}
            canEdit={canEdit}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Shown in the sidebar next to your store name after you log in. PNG or JPG, up to 2MB.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="businessName">Business Name <RequiredMark /></Label>
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

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="backupEmail">Backup email</Label>
            <Input
              id="backupEmail"
              name="backupEmail"
              type="email"
              defaultValue={settings.backupEmail}
              placeholder="owner@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Where backups are sent before any bulk delete. Deleting all Kacha
              slips is blocked until this is set, and again if the backup email
              fails to send.
            </p>
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
            <Label htmlFor="cin">CIN</Label>
            <Input
              id="cin"
              name="cin"
              placeholder="Optional — registered companies only"
              defaultValue={settings.cin}
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
          <CardTitle>Business Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            What does this business transact and settle balances in? This
            drives which totals the Ledger and customer statements show.
            Select one or more.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {ALL_BUSINESS_UNITS.map((unit) => {
              const checked = businessUnits.includes(unit);

              return (
                <label
                  key={unit}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent",
                  )}
                >
                  <input
                    type="checkbox"
                    name="businessUnits"
                    value={unit}
                    checked={checked}
                    onChange={() => toggleUnit(unit)}
                    className="mt-0.5 size-4"
                  />

                  <span>
                    <span className="block font-medium">
                      {BUSINESS_UNIT_LABELS[unit]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {BUSINESS_UNIT_DESCRIPTIONS[unit]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {businessUnits.length === 0 ? (
            <p className="text-xs text-red-600">
              Select at least one unit — Money will be used by default if
              none are selected.
            </p>
          ) : null}

          {state.errors?.businessUnits ? (
            <p className="text-xs text-red-600">
              {state.errors.businessUnits[0]}
            </p>
          ) : null}
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