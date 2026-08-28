"use client"

import { useState, useTransition } from "react"
import { Mail, MessageCircle } from "lucide-react"

import { setStoreReminderChannels } from "@/lib/actions/store-plan-actions"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

/**
 * Which channels this store's owner accepts renewal reminders on.
 *
 * Saves on toggle rather than behind a button: there are two switches and no
 * partial state worth confirming. The switch moves immediately and rolls back
 * if the write fails, so it never shows a setting the server did not take.
 */
export function StoreReminderChannels({
  storeId,
  emailEnabled,
  whatsappEnabled,
}: {
  storeId: string
  emailEnabled: boolean
  whatsappEnabled: boolean
}) {
  const [email, setEmail] = useState(emailEnabled)
  const [whatsapp, setWhatsapp] = useState(whatsappEnabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: { email: boolean; whatsapp: boolean }) {
    const previous = { email, whatsapp }

    setEmail(next.email)
    setWhatsapp(next.whatsapp)
    setError(null)

    startTransition(async () => {
      const result = await setStoreReminderChannels(storeId, next)

      if (!result.success) {
        // Put the switches back — leaving them where the user dropped them
        // would claim a change that was never saved.
        setEmail(previous.email)
        setWhatsapp(previous.whatsapp)
        setError(result.message)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="reminder-email"
          className="flex items-center gap-2 font-normal"
        >
          <Mail className="size-4 text-muted-foreground" />
          Email
        </Label>
        <Switch
          id="reminder-email"
          checked={email}
          disabled={pending}
          onCheckedChange={(checked) => save({ email: checked, whatsapp })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="reminder-whatsapp"
          className="flex items-center gap-2 font-normal"
        >
          <MessageCircle className="size-4 text-muted-foreground" />
          WhatsApp
        </Label>
        <Switch
          id="reminder-whatsapp"
          checked={whatsapp}
          disabled={pending}
          onCheckedChange={(checked) => save({ email, whatsapp: checked })}
        />
      </div>

      {/* Said plainly rather than left implied: WhatsApp is stored as a
          preference but nothing sends on it yet, and a switch that looks
          live but does nothing is worse than one that admits it. */}
      {whatsapp ? (
        <p className="text-xs text-muted-foreground">
          WhatsApp reminders are recorded as a preference; only email
          reminders are sent at present.
        </p>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
