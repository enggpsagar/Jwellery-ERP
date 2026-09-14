import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // Solid fill, reserved for a permanent/irreversible action (Delete).
        // A reversible action (Archive, Disable, a non-destructive Cancel
        // confirm) belongs on `warning` instead — see its own comment below.
        // Reads from --btn-delete-bg/-text (Branding's Delete color, see
        // lib/branding.ts) rather than --destructive directly, defaulted to
        // exactly --destructive's own value so an un-customized store is
        // unaffected — --destructive itself stays the fixed token every
        // *non*-Branding-aware destructive UI (aria-invalid rings, etc.)
        // still keys off.
        destructive:
          "bg-[var(--btn-delete-bg)] text-[var(--btn-delete-text)] hover:brightness-90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        // Pay Now / Record Payment / Mark Paid / Approve — an explicit
        // positive-outcome confirmation, not every form's Save/Submit
        // (those stay on `default`, the brand primary color).
        success:
          "bg-success text-success-foreground hover:bg-success/90 focus-visible:border-success/40 focus-visible:ring-success/20",
        // Edit actions (Pencil icon). Reads from --btn-edit-bg/-text
        // (Branding's Edit color), defaulted to the same light-blue chip
        // this app already used ad-hoc everywhere for Edit before either
        // this variant or Branding existed.
        edit: "bg-[var(--btn-edit-bg)] text-[var(--btn-edit-text)] hover:brightness-95",
        // View/Details/informational actions (Eye icon) — a distinct hue
        // from `edit` so the two no longer render identically.
        info: "bg-info/10 text-info hover:bg-info/20 focus-visible:border-info/40 focus-visible:ring-info/20",
        // Archive/Disable/Restore-adjacent reversible toggles, and any
        // "confirm this non-destructive change" dialog button that used to
        // share `destructive`'s old light-tint look under the same name.
        warning:
          "bg-warning/10 text-warning hover:bg-warning/20 focus-visible:border-warning/40 focus-visible:ring-warning/20",
        // Cancel — reads from --btn-cancel-bg/-text/-border (Branding's
        // Cancel color). Defaults to transparent/border-only (identical to
        // `outline`, which every Cancel button used before this variant
        // existed); once a store customizes Cancel, it renders as a solid
        // fill instead, same rule every other action color here follows.
        // hover:bg-muted covers the un-customized (transparent-bg,
        // outline-like) look; hover:brightness-95 is what actually shows
        // once a store customizes Cancel to a solid fill — the two don't
        // conflict since a `transparent` background is unaffected by a
        // brightness filter, so only whichever is actually visible reacts.
        cancel:
          "border-[var(--btn-cancel-border)] bg-[var(--btn-cancel-bg)] text-[var(--btn-cancel-text)] hover:bg-muted hover:brightness-95",
        // Export — reads from --btn-export-bg/-text, defaulted to this
        // app's existing --chart-1 (sapphire) Export convention.
        export:
          "bg-[var(--btn-export-bg)] text-[var(--btn-export-text)] hover:brightness-90",
        // Import — reads from --btn-import-bg/-text. Standardizes what was,
        // before this variant existed, an inconsistent mix of secondary/
        // info/warning across different import dialogs, onto one look
        // (defaulted to --chart-4/amethyst — a distinct hue from Export's
        // sapphire).
        import:
          "bg-[var(--btn-import-bg)] text-[var(--btn-import-text)] hover:brightness-90",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
