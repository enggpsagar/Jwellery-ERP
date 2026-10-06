"use client"

import { Lightbulb } from "lucide-react"

import { IMPORT_SUGGESTION_MARK } from "@/lib/import-suggest"

/**
 * The row errors an Excel import returns, shared by every import dialog.
 * An error may carry a hint from the store's existing records (see
 * lib/import-suggest.ts) after IMPORT_SUGGESTION_MARK — shown on its own
 * line so the fix is readable at a glance.
 */
export function ImportErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null

  const withHints = errors.filter((error) => error.includes(IMPORT_SUGGESTION_MARK)).length

  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">
        Nothing was imported. Fix these and try again:
      </p>
      {withHints > 0 && (
        <p className="text-xs text-muted-foreground">
          Suggestions come from records already saved in your store.
        </p>
      )}
      <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
        {errors.map((error, index) => {
          const at = error.indexOf(IMPORT_SUGGESTION_MARK)
          const message = at === -1 ? error : error.slice(0, at)
          const hint = at === -1 ? "" : error.slice(at + IMPORT_SUGGESTION_MARK.length)
          return (
            <li key={index}>
              {message}
              {hint && (
                <span className="mt-0.5 flex items-start gap-1 font-medium text-amber-700 dark:text-amber-400">
                  <Lightbulb className="mt-px h-3 w-3 shrink-0" />
                  <span className="select-all">{hint}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
