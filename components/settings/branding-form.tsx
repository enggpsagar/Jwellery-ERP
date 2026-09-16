"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle } from "lucide-react";
import type { BrandFontFamily, BrandFontStyle, BrandFontWeight, BrandRadius } from "@prisma/client";

import {
  updateStoreBranding,
  resetStoreBranding,
  type StoreBrandingSettings,
  type BrandingFormState,
} from "@/lib/actions/branding-actions";
import {
  BRAND_ACTION_DEFAULT,
  BRAND_ACTION_KEYS,
  BRAND_ACTION_LABEL,
  BRAND_FONT_LABEL,
  BRAND_FONT_STYLE_LABEL,
  BRAND_FONT_STYLE_VALUE,
  BRAND_FONT_VARIABLE,
  BRAND_FONT_WEIGHT_LABEL,
  BRAND_FONT_WEIGHT_VALUE,
  BRAND_RADIUS_LABEL,
  BRAND_RADIUS_VALUE,
  BRAND_STATUS_DEFAULT,
  BRAND_STATUS_KEYS,
  BRAND_STATUS_LABEL,
  contrastRatio,
  type BrandActionKey,
  type BrandStatusKey,
} from "@/lib/branding";
import { useToast } from "@/components/providers/toast-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// This app's own real defaults (app/globals.css :root) — shown as the
// placeholder/reset-to value for each picker, never hardcoded as the
// initial form value (a store that hasn't customized a field submits it
// as empty/null, not this hex, so a future default-palette change is
// inherited automatically — see StoreBranding's own schema doc comment).
const SURFACE_DEFAULTS = {
  accentColor: "#c4901f",
  backgroundColor: "#fbfaf7",
  cardColor: "#fefdfb",
  foregroundColor: "#2c2620",
  sidebarColor: "#291f14",
  headerColor: "#fbfaf7",
} as const;
type SurfaceKey = keyof typeof SURFACE_DEFAULTS;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const FONT_FAMILY_OPTIONS = Object.keys(BRAND_FONT_LABEL) as BrandFontFamily[];
const FONT_WEIGHT_OPTIONS = Object.keys(BRAND_FONT_WEIGHT_LABEL) as BrandFontWeight[];
const FONT_STYLE_OPTIONS = Object.keys(BRAND_FONT_STYLE_LABEL) as BrandFontStyle[];
const RADIUS_OPTIONS = Object.keys(BRAND_RADIUS_LABEL) as BrandRadius[];

function ColorField({
  id,
  label,
  helper,
  value,
  defaultHex,
  onChange,
  error,
}: {
  id: string;
  label: string;
  helper?: string;
  value: string;
  defaultHex: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const swatchValue = HEX_RE.test(value) ? value : defaultHex;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border p-0.5"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultHex}
          className="font-mono"
        />
      </div>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const SURFACE_META: Record<SurfaceKey, { label: string; helper: string }> = {
  accentColor: {
    label: "Brand Accent Color",
    helper: "Primary/Save/Add buttons, links, active navigation, focus rings.",
  },
  backgroundColor: { label: "Page Background", helper: "The base surface behind every page." },
  cardColor: { label: "Card / Surface Color", helper: "Cards, dialogs, dropdowns, and other raised panels." },
  foregroundColor: { label: "Text Color", helper: "Body text on both the page and card surfaces." },
  sidebarColor: { label: "Sidebar Background", helper: "The left navigation panel." },
  headerColor: { label: "Header Background", helper: "The top bar, independent of the page background." },
};

const initialState: BrandingFormState = { success: false, message: "" };

export function BrandingForm({ settings, canEdit }: { settings: StoreBrandingSettings; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(updateStoreBranding, initialState);
  const [resetting, setResetting] = useState(false);

  const [surface, setSurface] = useState<Record<SurfaceKey, string>>({
    accentColor: settings.accentColor ?? "",
    backgroundColor: settings.backgroundColor ?? "",
    cardColor: settings.cardColor ?? "",
    foregroundColor: settings.foregroundColor ?? "",
    sidebarColor: settings.sidebarColor ?? "",
    headerColor: settings.headerColor ?? "",
  });
  const [actionColors, setActionColors] = useState<Record<BrandActionKey, string>>({
    editColor: settings.editColor ?? "",
    deleteColor: settings.deleteColor ?? "",
    cancelColor: settings.cancelColor ?? "",
    exportColor: settings.exportColor ?? "",
    importColor: settings.importColor ?? "",
  });
  const [statusColors, setStatusColors] = useState<Record<BrandStatusKey, string>>({
    statusDraftColor: settings.statusDraftColor ?? "",
    statusPendingColor: settings.statusPendingColor ?? "",
    statusCompletedColor: settings.statusCompletedColor ?? "",
    statusActiveColor: settings.statusActiveColor ?? "",
    statusInactiveColor: settings.statusInactiveColor ?? "",
  });
  const [showIcons, setShowIcons] = useState(settings.showIcons);
  const [fontFamily, setFontFamily] = useState<BrandFontFamily>(settings.fontFamily);
  const [fontWeight, setFontWeight] = useState<BrandFontWeight>(settings.fontWeight);
  const [fontStyle, setFontStyle] = useState<BrandFontStyle>(settings.fontStyle);
  const [radius, setRadius] = useState<BrandRadius>(settings.radius);

  function setSurfaceField(key: SurfaceKey, value: string) {
    setSurface((prev) => ({ ...prev, [key]: value }));
  }
  function setActionField(key: BrandActionKey, value: string) {
    setActionColors((prev) => ({ ...prev, [key]: value }));
  }
  function setStatusField(key: BrandStatusKey, value: string) {
    setStatusColors((prev) => ({ ...prev, [key]: value }));
  }

  const previewBackground = surface.backgroundColor || SURFACE_DEFAULTS.backgroundColor;
  const previewCard = surface.cardColor || SURFACE_DEFAULTS.cardColor;
  const previewForeground = surface.foregroundColor || SURFACE_DEFAULTS.foregroundColor;
  const previewAccent = surface.accentColor || SURFACE_DEFAULTS.accentColor;

  const bodyContrast = useMemo(
    () => contrastRatio(previewBackground, previewForeground),
    [previewBackground, previewForeground],
  );
  const cardContrast = useMemo(
    () => contrastRatio(previewCard, previewForeground),
    [previewCard, previewForeground],
  );
  const lowContrast = (bodyContrast !== null && bodyContrast < 4.5) || (cardContrast !== null && cardContrast < 4.5);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleReset() {
    setResetting(true);
    try {
      const result = await resetStoreBranding();
      if (result.success) {
        setSurface({
          accentColor: "",
          backgroundColor: "",
          cardColor: "",
          foregroundColor: "",
          sidebarColor: "",
          headerColor: "",
        });
        setActionColors({ editColor: "", deleteColor: "", cancelColor: "", exportColor: "", importColor: "" });
        setStatusColors({
          statusDraftColor: "",
          statusPendingColor: "",
          statusCompletedColor: "",
          statusActiveColor: "",
          statusInactiveColor: "",
        });
        setShowIcons(true);
        setFontFamily("INTER");
        setFontWeight("NORMAL");
        setFontStyle("NORMAL");
        setRadius("DEFAULT");
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setResetting(false);
    }
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <fieldset disabled={!canEdit} className="contents">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Page Colors</CardTitle>
            <p className="text-sm text-muted-foreground">
              Leave any field blank to keep the app&apos;s own default for it.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(SURFACE_DEFAULTS) as SurfaceKey[]).map((key) => (
              <ColorField
                key={key}
                id={key}
                label={SURFACE_META[key].label}
                helper={SURFACE_META[key].helper}
                value={surface[key]}
                defaultHex={SURFACE_DEFAULTS[key]}
                onChange={(v) => setSurfaceField(key, v)}
                error={state.errors?.[key]?.[0]}
              />
            ))}
            {Object.keys(SURFACE_DEFAULTS).map((key) => (
              <input key={key} type="hidden" name={key} value={surface[key as SurfaceKey]} />
            ))}
          </CardContent>
          {lowContrast && (
            <CardContent className="pt-0">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This text color is hard to read against the background or card
                  color chosen above. You can still save it, but consider
                  picking colors further apart in lightness.
                </span>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button Colors</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add and Save both use the Brand Accent Color above — these five
              have their own existing look today, so each gets its own field.
              Border and hover shade are worked out automatically from
              whichever color is chosen.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {BRAND_ACTION_KEYS.map((key) => (
              <ColorField
                key={key}
                id={key}
                label={BRAND_ACTION_LABEL[key]}
                value={actionColors[key]}
                defaultHex={BRAND_ACTION_DEFAULT[key]}
                onChange={(v) => setActionField(key, v)}
                error={state.errors?.[key]?.[0]}
              />
            ))}
            {BRAND_ACTION_KEYS.map((key) => (
              <input key={key} type="hidden" name={key} value={actionColors[key]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Colors</CardTitle>
            <p className="text-sm text-muted-foreground">
              Every status across every module (invoices, purchases, draft
              orders, quotations, users, support tickets, ...) maps onto
              whichever of these five it means, so one change here moves
              every kind of &quot;pending&quot; (or Draft/Completed/Active/
              Inactive) state together.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {BRAND_STATUS_KEYS.map((key) => (
              <ColorField
                key={key}
                id={key}
                label={BRAND_STATUS_LABEL[key]}
                value={statusColors[key]}
                defaultHex={BRAND_STATUS_DEFAULT[key]}
                onChange={(v) => setStatusField(key, v)}
                error={state.errors?.[key]?.[0]}
              />
            ))}
            {BRAND_STATUS_KEYS.map((key) => (
              <input key={key} type="hidden" name={key} value={statusColors[key]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Icons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Show icons on buttons</p>
                <p className="text-xs text-muted-foreground">
                  Hides the small icon beside a button&apos;s text (Export,
                  Import, Save, ...). Icon-only controls, like a row&apos;s
                  Edit/View/Delete buttons, always keep their icon — it&apos;s
                  their only content.
                </p>
              </div>
              <Switch checked={showIcons} onCheckedChange={setShowIcons} />
            </div>
            <input type="hidden" name="showIcons" value={showIcons ? "true" : "false"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typography &amp; shape</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fontFamily">Font</Label>
              <Select
                value={fontFamily}
                onValueChange={(v) => setFontFamily(v as BrandFontFamily)}
              >
                <SelectTrigger id="fontFamily" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_FAMILY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {BRAND_FONT_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="fontFamily" value={fontFamily} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fontWeight">Font Weight</Label>
              <Select
                value={fontWeight}
                onValueChange={(v) => setFontWeight(v as BrandFontWeight)}
              >
                <SelectTrigger id="fontWeight" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_WEIGHT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {BRAND_FONT_WEIGHT_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="fontWeight" value={fontWeight} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fontStyle">Font Style</Label>
              <Select
                value={fontStyle}
                onValueChange={(v) => setFontStyle(v as BrandFontStyle)}
              >
                <SelectTrigger id="fontStyle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {BRAND_FONT_STYLE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="fontStyle" value={fontStyle} />
              <p className="text-xs text-muted-foreground">
                Combine with Font Weight above for e.g. Bold Italic.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="radius">Corner Style</Label>
              <Select value={radius} onValueChange={(v) => setRadius(v as BrandRadius)}>
                <SelectTrigger id="radius" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {BRAND_RADIUS_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="radius" value={radius} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={!canEdit || isPending || resetting}
            className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          >
            {isPending && <Loader className="mr-1 h-4 w-4" />}
            Save branding
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!canEdit || isPending || resetting}
          >
            {resetting ? <Loader className="mr-1 h-4 w-4" /> : <RotateCcw className="mr-1 h-4 w-4" />}
            Reset to defaults
          </Button>
        </div>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only the Store Owner can change branding — you can preview it here,
            but Save is disabled.
          </p>
        )}
      </div>

      {/* Live preview — reflects fields as they're typed, not yet saved, using
          the exact literal colors rather than CSS variables so it stays
          accurate even before Save writes them anywhere. */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="space-y-3 rounded-lg border p-4"
              style={{
                backgroundColor: previewBackground,
                color: previewForeground,
                fontFamily: fontFamily === "INTER" ? undefined : BRAND_FONT_VARIABLE[fontFamily],
                fontWeight: BRAND_FONT_WEIGHT_VALUE[fontWeight],
                fontStyle: BRAND_FONT_STYLE_VALUE[fontStyle],
              }}
            >
              <div
                className="space-y-2 rounded-md border p-3 shadow-sm"
                style={{
                  backgroundColor: previewCard,
                  color: previewForeground,
                  borderRadius: BRAND_RADIUS_VALUE[radius],
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Classic Gold Ring</p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: statusColors.statusActiveColor || BRAND_STATUS_DEFAULT.statusActiveColor,
                      color: "#fff",
                    }}
                  >
                    Active
                  </span>
                </div>
                <p className="text-xs opacity-70">PRD-RING-001 · Ornament</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                    style={{ backgroundColor: previewAccent, borderRadius: BRAND_RADIUS_VALUE[radius] }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                    style={{
                      backgroundColor: actionColors.editColor || BRAND_ACTION_DEFAULT.editColor,
                      borderRadius: BRAND_RADIUS_VALUE[radius],
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                    style={{
                      backgroundColor: actionColors.deleteColor || BRAND_ACTION_DEFAULT.deleteColor,
                      borderRadius: BRAND_RADIUS_VALUE[radius],
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="border px-3 py-1.5 text-xs font-medium shadow-sm"
                    style={{
                      backgroundColor: HEX_RE.test(actionColors.cancelColor) ? actionColors.cancelColor : "transparent",
                      color: HEX_RE.test(actionColors.cancelColor) ? "#fff" : previewForeground,
                      borderRadius: BRAND_RADIUS_VALUE[radius],
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p className="text-xs opacity-70">
                This preview reflects colors, font, weight, style, and corner
                style as they&apos;re chosen at left, before Save.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </fieldset>
    </form>
  );
}
