"use client"

import { useState } from "react"
import { ReportFrequency } from "@prisma/client"
import { Mail, Send } from "lucide-react"

import {
  updateReportSettings,
  generateAndSendReportNow,
  type ReportSettingsData,
} from "@/lib/actions/report-settings-actions"
import { ALL_FREQUENCIES, FREQUENCY_LABELS } from "@/lib/report-builder"
import { formatShortDateTime } from "@/lib/utils"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

const FREQUENCY_DESCRIPTIONS: Record<ReportFrequency, string> = {
  DAILY: "Every day, covering the previous day's trading.",
  MONTHLY: "On the 1st of each month, covering the month before.",
  QUARTERLY: "On the 1st of Jan/Apr/Jul/Oct, covering the quarter before.",
  ANNUAL: "On Jan 1st, covering the year before.",
}

function parseEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]/)
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  ]
}

/**
 * Settings > Reports & Notifications — the enable toggle only gates the
 * automatic schedule (app/api/cron/scheduled-reports); "Generate & Email
 * Now" works whenever a frequency + recipients are configured, whether or
 * not the schedule itself is on. Frequencies are independent checkboxes,
 * not a single choice — a store can get both a Monthly and an Annual
 * report, each on its own cadence.
 */
export function ReportSettingsForm({ initial }: { initial: ReportSettingsData }) {
  const toast = useToast()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [frequencies, setFrequencies] = useState<ReportFrequency[]>(initial.frequencies)
  const [recipientsText, setRecipientsText] = useState(initial.recipientEmails.join("\n"))
  const [lastSentAt, setLastSentAt] = useState(initial.lastSentAt)
  const [saving, setSaving] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)

  const recipients = parseEmails(recipientsText)

  const toggleFrequency = (frequency: ReportFrequency, checked: boolean) => {
    setFrequencies((prev) =>
      checked ? [...new Set([...prev, frequency])] : prev.filter((f) => f !== frequency),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updateReportSettings({ enabled, frequencies, recipientEmails: recipients })
      if (result.success) {
        toast.success(result.message)
        setRecipientsText(recipients.join("\n"))
      } else {
        toast.error(result.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSendNow = async () => {
    setSendingNow(true)
    try {
      const result = await generateAndSendReportNow()
      if (result.success) {
        toast.success(result.message)
        const now = new Date().toISOString()
        setLastSentAt((prev) => {
          const next = { ...prev }
          for (const frequency of frequencies) next[frequency] = now
          return next
        })
      } else {
        toast.error(result.message)
      }
    } finally {
      setSendingNow(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Automated schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Send reports automatically</p>
              <p className="text-sm text-muted-foreground">
                Turn off to stop the automatic schedule without losing your frequencies or recipient list.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable automated reports" />
          </div>

          <div className="space-y-3">
            <Label>Frequencies</Label>
            <div className="space-y-3">
              {ALL_FREQUENCIES.map((frequency) => {
                const checked = frequencies.includes(frequency)
                const sentAt = lastSentAt[frequency]
                return (
                  <div key={frequency} className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox
                      id={`frequency-${frequency}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleFrequency(frequency, value === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`frequency-${frequency}`} className="font-medium">
                        {FREQUENCY_LABELS[frequency]}
                      </Label>
                      <p className="text-sm text-muted-foreground">{FREQUENCY_DESCRIPTIONS[frequency]}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last sent: {sentAt ? formatShortDateTime(sentAt) : "Never"}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-recipients">Recipient emails</Label>
            <Textarea
              id="report-recipients"
              rows={4}
              placeholder="owner@yourstore.com, accountant@yourstore.com"
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              One per line or comma-separated. {recipients.length === 0 ? "No recipients yet." : `${recipients.length} recipient${recipients.length === 1 ? "" : "s"} configured.`}
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving && <Loader className="mr-1.5 h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate a report now</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleSendNow}
              disabled={sendingNow || recipients.length === 0 || frequencies.length === 0}
              className="gap-1.5"
            >
              {sendingNow ? <Loader className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              Generate & Email Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
