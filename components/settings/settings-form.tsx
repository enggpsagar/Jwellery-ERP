"use client";

import { useActionState } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Landmark,
  MapPinned,
  Receipt,
  ScrollText,
  Wallet,
} from "lucide-react";

import {
  updateBusinessSettings,
  type BusinessSettings,
  type SettingsFormState,
} from "@/lib/actions/settings-actions";
import type { BusinessUnitOption } from "@/lib/business-units.server";
import { getCitiesByStateId, type StateOption } from "@/lib/actions/location-actions";
import { GST_SCHEME_OPTIONS } from "@/lib/gst";
import type { GstScheme } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreLogoUpload } from "@/components/settings/store-logo-upload";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/shared/required-mark"
import { useToast } from "@/components/providers/toast-provider";

type CityItem = { id: string; name: string }

// This one form covers a lot of unrelated ground (branding, tax IDs,
// address, bank details, ...) — stacked as one long scroll it was hard to
// navigate. Split into the same tab-bar pattern as the top-level Settings
// nav (components/settings/settings-tabs.tsx), just scoped to sections of
// this one form/submit instead of separate pages: every field stays
// mounted (so nothing typed is lost switching tabs), only the active
// section's tab panel is visible — same reasoning StockForm's own
// multi-card layout already uses, one Card per concern.
type SettingsSection = "general" | "tax" | "address" | "bank" | "model" | "invoice";

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "general", label: "General", icon: Building2 },
  { id: "tax", label: "Tax & Compliance", icon: Receipt },
  { id: "address", label: "Address", icon: MapPinned },
  { id: "bank", label: "Bank Details", icon: Landmark },
  { id: "model", label: "Business Model", icon: Wallet },
  { id: "invoice", label: "Invoice Preferences", icon: ScrollText },
];

type SettingsFormProps = {
  settings: BusinessSettings;
  canEdit: boolean;
  states?: StateOption[];
  // Money plus every currently-configured metal/gemstone (StoreMetal) this
  // store has in Taxonomy settings — see getAvailableBusinessUnitOptions.
  // Always render the Business Model checkboxes from this, never a fixed list.
  unitOptions: BusinessUnitOption[];
};

const initialState: SettingsFormState = { success: false, message: "" };

export function SettingsForm({ settings, canEdit, states = [], unitOptions }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessSettings,
    initialState,
  );
  const toast = useToast();

  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  const [gstScheme, setGstScheme] = useState<GstScheme>(settings.gstScheme);

  const [businessUnits, setBusinessUnits] = useState<string[]>(
    settings.businessUnits,
  );

  function toggleUnit(unit: string) {
    setBusinessUnits((current) =>
      current.includes(unit)
        ? current.filter((u) => u !== unit)
        : [...current, unit],
    );
  }

  // Selected/keyed by id (to drive the city fetch below), but the form
  // field itself submits the state's name — BusinessSettings.state is a
  // plain text column, same convention as Vendor/Karigar's own state field.
  const initialStateId = useMemo(() => {
    const match = states.find(
      (item) => item.name.toLowerCase() === (settings.state ?? "").toLowerCase(),
    )
    return match?.id ?? ""
  }, [states, settings.state])

  const [selectedStateId, setSelectedStateId] = useState(initialStateId)
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [returnWindowEnabled, setReturnWindowEnabled] = useState(settings.returnWindowEnabled)
  const stateNameMap = useMemo(
    () => new Map(states.map((item) => [item.id, item.name])),
    [states],
  )

  useEffect(() => {
    let cancelled = false

    async function loadCities() {
      if (!selectedStateId) {
        setCities([])
        return
      }

      try {
        setLoadingCities(true)
        const data = await getCitiesByStateId(selectedStateId)
        if (!cancelled) setCities(data || [])
      } catch (error) {
        console.error("Failed to load cities:", error)
        if (!cancelled) setCities([])
      } finally {
        if (!cancelled) setLoadingCities(false)
      }
    }

    loadCities()
    return () => {
      cancelled = true
    }
  }, [selectedStateId])

  useEffect(() => {
    if (state.message && state.success) {
      toast.success(state.message);
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      onSubmit={(event) => {
        // Deliberately not `action={formAction}` directly on the form:
        // React resets a form's uncontrolled fields once an action-bound
        // submission settles, regardless of whether the action's own
        // returned state says success or failure — so a plain validation
        // error wiped every other field the user had already typed.
        // Calling the same dispatcher by hand from a prevented submit
        // sidesteps that auto-reset while keeping identical pending/error-
        // state behavior.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      {!canEdit ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only the Store Owner can edit these settings. You have view-only access.
        </div>
      ) : null}

      <fieldset disabled={!canEdit} className="space-y-6">
      <div className="flex flex-wrap gap-1 border-b">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors",
                isActive
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </button>
          );
        })}
      </div>

      <div className={activeSection === "general" ? "space-y-6" : "hidden"}>
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
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="legalName">Legal / Registered Name</Label>
            <Input
              id="legalName"
              name="legalName"
              defaultValue={settings.legalName}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={settings.phone} />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={settings.email}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" defaultValue={settings.website} />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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
      </div>

      <div className={activeSection === "tax" ? "space-y-6" : "hidden"}>
      <Card>
        <CardHeader>
          <CardTitle>Tax & Compliance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-1.5">
            <Label>
              GST Scheme <RequiredMark />
            </Label>
            <p className="text-xs text-muted-foreground">
              Which GST registration type this business operates under. This decides what's shown and required
              everywhere GST information matters — invoices, quotations, and purchases.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {GST_SCHEME_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition",
                    gstScheme === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="gstScheme"
                      value={option.value}
                      checked={gstScheme === option.value}
                      onChange={() => setGstScheme(option.value)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium">{option.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </label>
              ))}
            </div>
            {state.errors?.gstScheme ? <p className="text-xs text-red-600">{state.errors.gstScheme[0]}</p> : null}
            {gstScheme === "COMPOSITION" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Composition Scheme selected: every invoice, quotation, and purchase bill will print as a "Bill of
                Supply" with the mandatory disclaimer, and will never show or collect GST as a line item — the
                Default GST Rate below no longer applies to outward documents.
              </p>
            ) : null}
          </div>
        </CardContent>
        <CardContent className="grid gap-4 border-t pt-4 md:grid-cols-2">
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="panNumber">PAN Number</Label>
            <Input
              id="panNumber"
              name="panNumber"
              defaultValue={settings.panNumber}
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="cin">CIN</Label>
            <Input
              id="cin"
              name="cin"
              placeholder="Optional — registered companies only"
              defaultValue={settings.cin}
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="stateCode">GST State Code</Label>
            <Input
              id="stateCode"
              name="stateCode"
              placeholder="e.g. 27"
              defaultValue={settings.stateCode}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="defaultGstRate">Default GST Rate (%)</Label>
            <Input
              id="defaultGstRate"
              name="defaultGstRate"
              type="number"
              step="0.1"
              defaultValue={settings.defaultGstRate}
              disabled={gstScheme === "COMPOSITION"}
            />
            {gstScheme === "COMPOSITION" ? (
              <p className="text-xs text-muted-foreground">Not used — Composition Scheme never charges GST.</p>
            ) : null}
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="hallmarkChargePerPiece">Hallmark Charge (per piece)</Label>
            <Input
              id="hallmarkChargePerPiece"
              name="hallmarkChargePerPiece"
              type="number"
              step="0.01"
              min="0"
              defaultValue={settings.hallmarkChargePerPiece}
            />
            <p className="text-xs text-muted-foreground">
              Applied automatically as the HM Charge on every Gold/Silver line item
              when creating an Invoice, Kacha Slip, or Quotation — a flat ₹ amount
              per piece, not a % or per-gram charge. Not used for Platinum, Diamond,
              or Other purities. BIS hallmarking fees change periodically by
              official notification — confirm this matches what your hallmarking
              centre currently charges before relying on it.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Switch
                id="returnWindowEnabled"
                checked={returnWindowEnabled}
                onCheckedChange={setReturnWindowEnabled}
              />
              <input type="hidden" name="returnWindowEnabled" value={returnWindowEnabled ? "on" : ""} />
              <Label htmlFor="returnWindowEnabled">Enable Return Window</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Whether customers can return sold items at all. Turning this off
              hides Return Window/Return Items everywhere in the app without
              losing the day count below — turn it back on later and the same
              number of days applies again.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="returnWindowDays">Return Window (days)</Label>
            <Input
              id="returnWindowDays"
              name="returnWindowDays"
              type="number"
              step="1"
              min="0"
              placeholder="e.g. 7, 15, or 30"
              defaultValue={settings.returnWindowDays}
              disabled={!returnWindowEnabled}
            />
            <p className="text-xs text-muted-foreground">
              How many days after an invoice's date a sold item may still be
              returned via a Credit Note. Counted from the Invoice Date shown
              on each invoice — an invoice past this window shows as return-
              ineligible and can no longer have items returned against it.
            </p>
          </div>
        </CardContent>
      </Card>
      </div>

      <div className={activeSection === "address" ? "space-y-6" : "hidden"}>
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={settings.address} />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="state">State</Label>
            <select
              id="state"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              value={selectedStateId}
              onChange={(event) => setSelectedStateId(event.target.value)}
            >
              <option value="">Select state</option>
              {states.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            {/* Falls back to whatever is already on the record, so a state
                that is not in the list is kept rather than wiped on save. */}
            <input
              type="hidden"
              name="state"
              value={
                selectedStateId
                  ? (stateNameMap.get(selectedStateId) ?? "")
                  : (settings.state ?? "")
              }
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="city">City</Label>
            <select
              id="city"
              name="city"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedStateId || loadingCities}
              defaultValue={settings.city ?? ""}
              key={cities.length}
            >
              <option value="">
                {loadingCities ? "Loading cities..." : "Select city"}
              </option>

              {/* The saved city stays selectable even before the list for
                  its state has loaded, so opening the form and saving
                  without touching this does not clear it. */}
              {settings.city && !cities.some((city) => city.name === settings.city) ? (
                <option value={settings.city}>{settings.city}</option>
              ) : null}

              {cities.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" name="pincode" defaultValue={settings.pincode} />
          </div>
        </CardContent>
      </Card>
      </div>

      <div className={activeSection === "bank" ? "space-y-6" : "hidden"}>
      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {/* The invoice's "Pay To" block shows this section only once
              bankName is set — see the print page's own check. */}
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input id="bankName" name="bankName" defaultValue={settings.bankName} />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="bankAccountHolderName">Account Holder&apos;s Name</Label>
            <Input
              id="bankAccountHolderName"
              name="bankAccountHolderName"
              defaultValue={settings.bankAccountHolderName}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="bankAccountNumber">Account Number</Label>
            <Input
              id="bankAccountNumber"
              name="bankAccountNumber"
              defaultValue={settings.bankAccountNumber}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="bankIfscCode">IFSC Code</Label>
            <Input id="bankIfscCode" name="bankIfscCode" defaultValue={settings.bankIfscCode} />
          </div>
        </CardContent>
      </Card>
      </div>

      <div className={activeSection === "model" ? "space-y-6" : "hidden"}>
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
            {unitOptions.map((option) => {
              const checked = businessUnits.includes(option.value);
              const description =
                option.value === "MONEY"
                  ? "Track customer/artisan dues and payments in rupees."
                  : option.isGemstone
                    ? `Track dues and payments in carats of ${option.label.toLowerCase()} weight.`
                    : `Track dues and payments in grams of fine ${option.label.toLowerCase()}.`;

              return (
                <label
                  key={option.value}
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
                    value={option.value}
                    checked={checked}
                    onChange={() => toggleUnit(option.value)}
                    className="mt-0.5 size-4"
                  />

                  <span>
                    <span className="block font-medium">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {description}
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
      </div>

      <div className={activeSection === "invoice" ? "space-y-6" : "hidden"}>
      <Card>
        <CardHeader>
          <CardTitle>Invoice Preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
            <Input
              id="invoicePrefix"
              name="invoicePrefix"
              defaultValue={settings.invoicePrefix}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="invoiceStartingNo">Next Invoice No.</Label>
            <Input
              id="invoiceStartingNo"
              name="invoiceStartingNo"
              type="number"
              defaultValue={settings.invoiceStartingNo}
            />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
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

          <div className="space-y-1.5 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="invoiceTerms">Invoice Terms & Conditions</Label>
            <Textarea
              id="invoiceTerms"
              name="invoiceTerms"
              defaultValue={settings.invoiceTerms}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="invoiceNotes">Default Invoice Notes</Label>
            <Textarea
              id="invoiceNotes"
              name="invoiceNotes"
              defaultValue={settings.invoiceNotes}
            />
          </div>
        </CardContent>
      </Card>
      </div>

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