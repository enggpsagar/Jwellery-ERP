import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  // Safari (unlike Chrome/Firefox) only opens the file picker when the click
  // lands on the native ::-webkit-file-upload-button itself, not anywhere
  // else in the input's box — and file:bg-transparent file:border-0 below
  // makes that button invisible, so a click on the "no file chosen" text
  // next to it (which looks like part of the same clickable field) silently
  // does nothing. Every other file input in this codebase already dodges
  // this by hiding the native input and using an explicit clickable trigger
  // (see components/settings/store-logo-upload.tsx); FileInput applies that
  // same pattern here so type="file" is reliable everywhere it's used.
  if (type === "file") {
    return <FileInput className={className} {...props} />
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 read-only:pointer-events-none read-only:cursor-not-allowed read-only:bg-input/50 read-only:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:read-only:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function FileInput({
  className,
  id,
  disabled,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const [fileName, setFileName] = React.useState("")

  return (
    <div className="relative">
      <input
        id={inputId}
        type="file"
        disabled={disabled}
        data-slot="input"
        // Kept in the tab order and functionally real (so the surrounding
        // <Label htmlFor> and form submission/validation all still work) —
        // only visually hidden, in favour of the label below as the actual
        // click target.
        className="peer sr-only"
        onChange={(event) => {
          setFileName(event.target.files?.[0]?.name ?? "")
          onChange?.(event)
        }}
        {...props}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-base text-muted-foreground transition-colors outline-none peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
          disabled
            ? "pointer-events-none cursor-not-allowed bg-input/50 opacity-50 dark:bg-input/80"
            : "cursor-pointer",
          className
        )}
      >
        <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-accent px-2 text-sm font-medium text-foreground">
          Choose file
        </span>
        <span className="truncate">{fileName || "No file chosen"}</span>
      </label>
    </div>
  )
}

export { Input }
