"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle } from "lucide-react";
import type { BrandFontFamily, BrandRadius } from "@prisma/client";

import {
  updateStoreBranding,
  resetStoreBranding,
  type StoreBrandingSettings,
  type BrandingFormState,
} from "@/lib/actions/branding-actions";
import {
  BRAND_FONT_LABEL,
  BRAND_FONT_VARIABLE,
  BRAND_RADIUS_LABEL,
  BRAND_RADIUS_VALUE,
} from "@/lib/branding";
import { useToast } from "@/components/providers/toast-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
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
const DEFAULT_ACCENT = "#c4901f";
const DEFAULT_BACKGROUND = "#fbfaf7";
const DEFAULT_CARD = "#fefdfb";
const DEFAULT_FOREGROUND = "#2c2620";

const FONT_FAMILY_OPTIONS = Object.keys(BRAND_FONT_LABEL) as BrandFontFamily[];
const RADIUS_OPTIONS = Object.keys(BRAND_RADIUS_LABEL) as BrandRadius[];

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    // #rgb -> #rrggbb
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function relativeLuminance(hex: string): number | null {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return null;
  const full = normalizeHex(hex);
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;
  const [rl, gl, bl] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

// Standard WCAG contrast ratio, 1-21. 4.5 is the "normal text" AA floor —
// used here only as a soft warning (a store can still save a lower-contrast
// pair if that's genuinely what they want), not a hard block.
function contrastRatio(hexA: string, hexB: string): number | null {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  if (lA === null || lB === null) return null;
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

type ColorFieldProps = {
  id: string;
  name: string;
  label: string;
  helper: string;
  value: string;
  defaultHex: string;
  onChange: (value: string) => void;
  error?: string;
};

function ColorField({ id, name, label, helper, value, defaultHex, onChange, error }: ColorFieldProps) {
  const swatchValue = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : defaultHex;

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
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultHex}
          className="font-mono"
        />
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const initialState: BrandingFormState = { success: false, message: "" };

export function BrandingForm({ settings, canEdit }: { settings: StoreBrandingSettings; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(updateStoreBranding, initialState);
  const [resetting, setResetting] = useState(false);

  const [accentColor, setAccentColor] = useState(settings.accentColor ?? "");
  const [backgroundColor, setBackgroundColor] = useState(settings.backgroundColor ?? "");
  const [cardColor, setCardColor] = useState(settings.cardColor ?? "");
  const [foregroundColor, setForegroundColor] = useState(settings.foregroundColor ?? "");
  const [fontFamily, setFontFamily] = useState<BrandFontFamily>(settings.fontFamily);
  const [radius, setRadius] = useState<BrandRadius>(settings.radius);

  const previewBackground = backgroundColor || DEFAULT_BACKGROUND;
  const previewCard = cardColor || DEFAULT_CARD;
  const previewForeground = foregroundColor || DEFAULT_FOREGROUND;
  const previewAccent = accentColor || DEFAULT_ACCENT;

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
        setAccentColor("");
        setBackgroundColor("");
        setCardColor("");
        setForegroundColor("");
        setFontFamily("INTER");
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
            <CardTitle>Colors</CardTitle>
            <p className="text-sm text-muted-foreground">
              Leave any field blank to keep the app&apos;s own default for it.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ColorField
              id="accentColor"
              name="accentColor"
              label="Brand Accent Color"
              helper="Primary buttons, links, active navigation, focus rings."
              value={accentColor}
              defaultHex={DEFAULT_ACCENT}
              onChange={setAccentColor}
              error={state.errors?.accentColor?.[0]}
            />
            <ColorField
              id="backgroundColor"
              name="backgroundColor"
              label="Page Background"
              helper="The base surface behind every page."
              value={backgroundColor}
              defaultHex={DEFAULT_BACKGROUND}
              onChange={setBackgroundColor}
              error={state.errors?.backgroundColor?.[0]}
            />
            <ColorField
              id="cardColor"
              name="cardColor"
              label="Card / Surface Color"
              helper="Cards, dialogs, dropdowns, and other raised panels."
              value={cardColor}
              defaultHex={DEFAULT_CARD}
              onChange={setCardColor}
              error={state.errors?.cardColor?.[0]}
            />
            <ColorField
              id="foregroundColor"
              name="foregroundColor"
              label="Text Color"
              helper="Body text on both the page and card surfaces."
              value={foregroundColor}
              defaultHex={DEFAULT_FOREGROUND}
              onChange={setForegroundColor}
              error={state.errors?.foregroundColor?.[0]}
            />
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
                <p className="text-sm font-semibold">Classic Gold Ring</p>
                <p className="text-xs opacity-70">PRD-RING-001 · Ornament</p>
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                  style={{ backgroundColor: previewAccent, borderRadius: BRAND_RADIUS_VALUE[radius] }}
                >
                  Save
                </button>
              </div>
              <p className="text-xs opacity-70">
                This card and button preview the colors, font, and corner
                style chosen at left.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </fieldset>
    </form>
  );
}
