import * as React from "react"

// 1024, not the usual 768. The nav has ~12 sections plus a store switcher,
// and at tablet widths the full sidebar eats most of the screen — those
// widths get the hamburger drawer too. Matches Tailwind's `lg`, so it lines
// up with the `md:hidden` / `hidden md:block` pairs in components/ui/sidebar
// only where those are intentionally desktop-only.
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
