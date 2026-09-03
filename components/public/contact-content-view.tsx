import { Mail, MapPin, Phone } from "lucide-react"

import type { PlatformContactContentRow } from "@/lib/actions/platform-content-actions"

type ContactContentViewProps = {
  content: PlatformContactContentRow
}

/**
 * Renders the SUPER_ADMIN-edited Contact Us content. Shared by the public
 * /contact page and the authenticated app's /help page so both read the
 * same markup instead of drifting apart — see
 * lib/actions/platform-content-actions.ts for where the data comes from.
 */
export function ContactContentView({ content }: ContactContentViewProps) {
  const details = [
    { icon: Mail, label: content.email, href: `mailto:${content.email}` },
    { icon: Phone, label: content.phone, href: `tel:${content.phone}` },
    { icon: MapPin, label: content.address, href: undefined },
  ].filter((detail) => detail.label)

  return (
    <div className="grid gap-8 sm:grid-cols-2 sm:items-start">
      <div>
        {/* Plain text, not HTML — whitespace-pre-line preserves the line
            breaks a store owner types without needing a rich text editor. */}
        <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
          {content.message}
        </p>

        {details.length > 0 ? (
          <dl className="mt-6 space-y-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_12%,transparent)] text-[var(--chart-2)]">
                  <detail.icon className="size-4" />
                </span>
                {detail.href ? (
                  <a href={detail.href} className="hover:underline">
                    {detail.label}
                  </a>
                ) : (
                  <span>{detail.label}</span>
                )}
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.imageUrl}
          alt="Contact us"
          className="w-full rounded-xl border object-cover"
        />
      ) : null}
    </div>
  )
}
