import type { Metadata } from "next"
import { Palette } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export const metadata: Metadata = {
  title: "Brand Guide",
}

/**
 * Super-Admin-only design-system reference (see middleware.ts's
 * /brand-guide gate and app-sidebar.tsx's SUPER_ADMIN-only nav entry).
 *
 * This documents conventions that already exist in the codebase — every
 * color below reads its value from the same CSS custom properties the rest
 * of the app uses (app/globals.css), so it can never drift out of sync the
 * way a page of hand-copied hex codes would. When a convention changes,
 * update the code first, and this page reflects it automatically; when a
 * *new* pattern is needed, add it here only once it's actually in use
 * somewhere real, not before.
 */

function Swatch({
  var: cssVar,
  name,
  note,
}: {
  var: string
  name: string
  note?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div
        className="size-10 shrink-0 rounded-md border"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{cssVar}</p>
        {note ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        ) : null}
      </div>
    </div>
  )
}

type SemanticTint = "emerald" | "red" | "amber" | "blue" | "destructive"

const SEMANTIC_PREVIEW_CLASSES: Record<SemanticTint, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-red-200 bg-red-50 text-red-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  destructive: "border-destructive/40 bg-destructive/5 text-destructive",
}

function SemanticSwatch({
  tint,
  name,
  classes,
  usage,
}: {
  tint: SemanticTint
  name: string
  classes: string
  usage: string
}) {
  const previewClass = SEMANTIC_PREVIEW_CLASSES[tint]

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{name}</p>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${previewClass}`}>
          Sample
        </span>
      </div>
      <p className="mt-2 font-mono text-xs break-words text-muted-foreground">
        {classes}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{usage}</p>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function BrandGuidePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand Guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The visual conventions already established across the app — a
          reference to match against, not a new design language. Colors below
          are read live from{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            app/globals.css
          </code>
          , so they stay accurate as the theme evolves.
        </p>
      </div>

      <Section
        title="Theme tokens"
        description="The base palette every component is built from (shadcn/ui convention). Light mode shown — the app also defines a full dark-mode set for each of these."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Swatch var="--background" name="Background" note="Warm ivory, not pure white — the whole app's ground color." />
          <Swatch var="--foreground" name="Foreground" note="Default text color." />
          <Swatch var="--card" name="Card" note="Card/Popover surface — slightly lighter than background." />
          <Swatch var="--primary" name="Primary" note="Deep burgundy — the nominal shadcn 'primary'. In practice, most CTAs use the gold accent (--chart-2) directly instead; see note below." />
          <Swatch var="--secondary" name="Secondary" />
          <Swatch var="--muted" name="Muted" note="Subdued backgrounds (hover states, quiet panels)." />
          <Swatch var="--accent" name="Accent" note="Hover/focus fill for menu items, ghost buttons." />
          <Swatch var="--destructive" name="Destructive" note="Errors, delete actions." />
          <Swatch var="--border" name="Border" />
        </div>
        <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Known inconsistency:</strong>{" "}
          the shadcn default Button/Badge <code>variant=&quot;default&quot;</code>{" "}
          renders <code>bg-primary</code> (burgundy), but almost every actual
          primary action in the app (Login, Sale, Save, Register) is styled
          explicitly with <code>bg-[var(--chart-2)]</code> (gold) instead.
          When adding a new primary action, match the gold convention below —
          not the shadcn default.
        </p>
      </Section>

      <Section
        title="Brand accent & chart palette"
        description="Five hues used both for data visualization (bar/pie charts) and as a fixed per-feature tint rotation on icons and badges — see MODULES in app/page.tsx and the role/module tint assignments across the dashboard."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Swatch var="--chart-2" name="Gold — brand accent" note="The actual primary-action color: Login, Sale, Save, Register buttons, active nav state, focus ring." />
          <Swatch var="--chart-1" name="Chart 1 — sapphire" note="Parties, Artisan jobs" />
          <Swatch var="--chart-3" name="Chart 3 — emerald" note="Products & Stock, Ledger" />
          <Swatch var="--chart-4" name="Chart 4 — amethyst" note="Purchases, Reports" />
          <Swatch var="--chart-5" name="Chart 5 — ruby" note="Quotations, Multi-location" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Order is deliberate, not decorative — validated for color-blind
          safety (see the comment above these tokens in globals.css). Don&apos;t
          reorder or substitute a hue without re-running{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">
            scripts/validate_palette.js
          </code>
          .
        </p>
      </Section>

      <Section
        title="Semantic status colors"
        description="The four meanings used consistently for badges, banners, toasts and notices. Pick by meaning, not by which one looks nice — these exact class combinations, not new shades."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SemanticSwatch
            tint="emerald"
            name="Success / Active / On"
            classes="border-emerald-200 bg-emerald-50 text-emerald-700 (badges) · bg-emerald-500 (Switch checked, Includes-a-Stone toggle)"
            usage="Active plan/store status, a Switch turned on, a positive yes/no toggle."
          />
          <SemanticSwatch
            tint="red"
            name="Danger / Off / No"
            classes="border-red-200 bg-red-50 text-red-800 (toasts) · bg-red-500 (toggle off) · text-destructive (inline errors)"
            usage="Errors, a negative yes/no toggle, destructive confirmations."
          />
          <SemanticSwatch
            tint="amber"
            name="Warning"
            classes="border-amber-200 bg-amber-50 text-amber-700/800"
            usage="Archive actions, 'expiring soon' plan status, cautionary notices."
          />
          <SemanticSwatch
            tint="blue"
            name="Info"
            classes="border-blue-200 bg-blue-50 text-blue-700/800"
            usage="Neutral notices, info toasts, icon-tinted action buttons (Export, Change Plan)."
          />
        </div>
      </Section>

      <Section
        title="Components"
        description="Live previews using the app's real components — not mockups."
      >
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium">Buttons</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]">
                Primary action
              </Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Icon-tinted action buttons
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                className="border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
              >
                <Palette className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100
                </code>{" "}
                — the standard treatment for a secondary icon action (Export,
                Change Plan, Extend Plan). Not{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  bg-primary/10
                </code>{" "}
                — that reads as invisible against this theme&apos;s pale
                surfaces.
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Switch</p>
            <div className="flex items-center gap-4">
              <Switch checked aria-label="On example" />
              <Switch checked={false} aria-label="Off example" />
              <span className="text-xs text-muted-foreground">
                Checked = emerald (fixed 2026-09-11 — previously matched no
                Tailwind selector at all and rendered neither state&apos;s
                color; see the doc comment in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  components/ui/switch.tsx
                </code>
                ).
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Badges</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Active
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Typography & data tables"
        description="One plain sans everywhere, headings included — a deliberate move away from an earlier serif-heading pairing, to read closer to a utilitarian business app than a boutique jewellery site."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Font: Inter (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              --font-sans
            </code>
            ), loaded once in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              app/layout.tsx
            </code>
            .
          </li>
          <li>
            Every data table (24 across the app) shares one global style in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              globals.css
            </code>{" "}
            rather than per-component classes: small tracked uppercase
            headers, a gold hairline under the header row, a subtle gold-tint
            row hover, and{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              tabular-nums
            </code>{" "}
            on every cell so figures line up.
          </li>
          <li>
            Radius scale is derived from one{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              --radius
            </code>{" "}
            token (0.5rem) — use{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              rounded-lg/xl/2xl
            </code>{" "}
            etc. rather than an arbitrary pixel value.
          </li>
        </ul>
      </Section>
    </main>
  )
}
