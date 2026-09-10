"use client"

import { useState } from "react"
import { ReportFrequency } from "@prisma/client"
import { Mail, Send } from "lucide-react"

import {
  updateReportSettings,
  generateAndSendReportNow,
  type ReportSettingsData,
} from "@/lib/actions/report-settings-actions"
import { formatShortDateTime } from "@/lib/utils"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const FREQUENCY_OPTIONS: { value: ReportFrequency; label: string; description: string }[] = [
  { value: "DAILY", label: "Daily", description: "Every day, covering the previous day's trading." },
  { value: "MONTHLY", label: "Monthly", description: "On the 1st of each month, covering the month before." },
  { value: "QUARTERLY", label: "Quarterly", description: "On the 1st of Jan/Apr/Jul/Oct, covering the quarter before." },
  { value: "ANNUAL", label: "Annual", description: "On Jan 1st, covering the year before." },
]

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
 * Now" works whenever recipients are configured, whether or not the
 * schedule itself is on.
 */
export function ReportSettingsForm({ initial }: { initial: ReportSettingsData }) {
  const toast = useToast()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [frequency, setFrequency] = useState<ReportFrequency>(initial.frequency)
  const [recipientsText, setRecipientsText] = useState(initial.recipientEmails.join("\n"))
  const [lastSentAt, setLastSentAt] = useState(initial.lastSentAt)
  const [saving, setSaving] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)

  const recipients = parseEmails(recipientsText)

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updateReportSettings({ enabled, frequency, recipientEmails: recipients })
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
        setLastSentAt(new Date().toISOString())
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
                Turn off to stop the automatic schedule without losing your frequency or recipient list.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable automated reports" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-frequency">Frequency</Label>
            <Select value={frequency} onValueChange={(value) => setFrequency(value as ReportFrequency)}>
              <SelectTrigger id="report-frequency" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.description}
            </p>
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

          <p className="text-sm text-muted-foreground">
            Last sent: {lastSentAt ? formatShortDateTime(lastSentAt) : "Never"}
          </p>

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
          <p className="text-sm text-muted-foreground">
            Builds and emails a report for the most recently completed {frequency.toLowerCase()} period right now,
            to the recipients above — separate from the automatic schedule.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleSendNow}
              disabled={sendingNow || recipients.length === 0}
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
