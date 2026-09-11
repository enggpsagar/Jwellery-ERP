"use client"

import { useState } from "react"
import { Check, Copy, RefreshCw, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react"

import {
  generateCollaborationCode,
  getCollaborationCodeSettings,
  respondToAccessRequest,
  type CollaborationCodeSettings,
  type PendingAccessRequestRow,
} from "@/lib/actions/store-collaboration-actions"
import { formatShortDateTime } from "@/lib/utils"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader } from "@/components/ui/loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Store Owner's side of Store Owner Authorization — the code shown here is
 * persistent plaintext (unlike an API key's reveal-once secret), since the
 * owner needs to keep re-reading/re-sharing it, not just copy it once at
 * creation. "Generate" always confirms first: it immediately invalidates
 * the current code and every Super Admin's access redeemed under it, with
 * no undo.
 */
export function CollaborationCodeSettingsForm({
  initial,
  initialPendingRequests,
}: {
  initial: CollaborationCodeSettings
  initialPendingRequests: PendingAccessRequestRow[]
}) {
  const toast = useToast()
  const [settings, setSettings] = useState(initial)
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const handleRespond = async (requestId: string, approve: boolean) => {
    setRespondingId(requestId)
    try {
      const result = await respondToAccessRequest(requestId, approve)
      if (result.success) {
        toast.success(result.message)
        setPendingRequests((rows) => rows.filter((row) => row.id !== requestId))
        if (approve) {
          // Approving grants access the same way redeeming a code does —
          // refresh so "Currently authorized" reflects the new grant too.
          setSettings(await getCollaborationCodeSettings())
        }
      } else {
        toast.error(result.message)
      }
    } finally {
      setRespondingId(null)
    }
  }

  const handleCopy = async () => {
    if (!settings.code) return
    try {
      await navigator.clipboard.writeText(settings.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await generateCollaborationCode()
      if (result.success && result.code) {
        setSettings({ code: result.code, generatedAt: new Date().toISOString(), activeGrants: [] })
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } finally {
      setGenerating(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Collaboration Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A Super Admin has no access to this store&apos;s data by default.
            Share this code with them only when you want to authorize
            access — they enter it once from the Platform Stores console to
            unlock this store. Generating a new code immediately revokes
            access for everyone who used the old one.
          </p>

          {settings.code ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="flex-1 font-mono text-lg font-semibold tracking-wider">
                {settings.code}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                onClick={handleCopy}
                aria-label="Copy code"
                title="Copy code"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No code generated yet — a Super Admin cannot reach this store
              until you generate one and share it with them.
            </p>
          )}

          {settings.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Last generated {formatShortDateTime(settings.generatedAt)}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)} disabled={generating}>
              {generating ? (
                <Loader className="mr-1.5 h-4 w-4" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              {settings.code ? "Generate new code" : "Generate code"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending access requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendingRequests.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              No Super Admin has asked to access this store right now.
            </p>
          ) : (
            <ul className="divide-y">
              {pendingRequests.map((request) => {
                const isResponding = respondingId === request.id
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{request.superAdminName ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{request.superAdminEmail ?? "-"}</p>
                      {request.message && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          &ldquo;{request.message}&rdquo;
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requested {formatShortDateTime(request.requestedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRespond(request.id, false)}
                        disabled={isResponding}
                        className="gap-1.5"
                      >
                        <ShieldX className="h-4 w-4" />
                        Deny
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRespond(request.id, true)}
                        disabled={isResponding}
                        className="gap-1.5"
                      >
                        {isResponding ? (
                          <Loader className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currently authorized</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Super Admin</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Access granted</th>
                </tr>
              </thead>
              <tbody>
                {settings.activeGrants.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No Super Admin currently has access to this store.
                    </td>
                  </tr>
                ) : (
                  settings.activeGrants.map((grant) => (
                    <tr key={grant.superAdminUserId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{grant.name ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{grant.email ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatShortDateTime(grant.grantedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(open) => !generating && setConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate a new collaboration code?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {settings.code
                  ? "This immediately replaces the current code and revokes access for every Super Admin who redeemed it — including anyone currently working in this store."
                  : "Only the store owner should share this code — anyone who has it can access this store's data until you regenerate it."}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Generate code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
