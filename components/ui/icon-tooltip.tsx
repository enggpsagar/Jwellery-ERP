"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The same hover / focus tooltip an icon-size <Button> gets automatically
 * (see button.tsx), for an icon-only control that isn't one: a raw <button>,
 * a <Link>/<a>, or a <Button size="sm"> whose only child is an icon. The
 * child keeps its own aria-label for screen readers — `label` is only what
 * the tooltip shows, so pass the same text. Don't also give the child a
 * `title`, or the browser's own tooltip shows on top of this one.
 */
function IconTooltip({
  label,
  side,
  children,
}: {
  label: React.ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

export { IconTooltip }
