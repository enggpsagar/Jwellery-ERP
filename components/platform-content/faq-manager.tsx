"use client"

import * as React from "react"
import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"

import {
  createPlatformFaq,
  deletePlatformFaq,
  movePlatformFaq,
  setPlatformFaqPublished,
  updatePlatformFaq,
  type PlatformContentFormState,
  type PlatformFaqRow,
} from "@/lib/actions/platform-content-actions"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

const initialState: PlatformContentFormState = { success: false, message: "" }

/** faq.answer is TipTap HTML — this admin list row is a plain-text preview,
 *  not a rendered view, so tags are stripped rather than shown raw. */
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * SUPER_ADMIN editor for the FAQ list. Mirrors components/plans/plans-client.tsx's
 * shape (row list, inline add/edit form, useActionState) — the same
 * "occasionally-touched admin list" pattern already established there.
 */
export function FaqManager({ faqs }: { faqs: PlatformFaqRow[] }) {
  const router = useRouter()
  const toast = useToast()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleTogglePublished(id: string, isPublished: boolean) {
    try {
      setBusyId(id)
      const result = await setPlatformFaqPublished(id, isPublished)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to update FAQ")
    } finally {
      setBusyId(null)
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    try {
      setBusyId(id)
      const result = await movePlatformFaq(id, direction)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to reorder FAQ")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(faq: PlatformFaqRow) {
    if (!window.confirm(`Delete the FAQ "${faq.question}"? This cannot be undone.`)) {
      return
    }

    try {
      setBusyId(faq.id)
      const result = await deletePlatformFaq(faq.id)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete FAQ")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {faqs.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground">No FAQs added yet.</p>
      ) : null}

      {faqs.map((faq, index) =>
        editingId === faq.id ? (
          <FaqFormRow key={faq.id} faq={faq} onDone={() => setEditingId(null)} />
        ) : (
          <div key={faq.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={faq.isPublished ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                  {faq.question}
                </span>
                {!faq.isPublished ? <Badge variant="outline">Draft</Badge> : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{stripHtml(faq.answer)}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(faq.id, "up")}
                  disabled={busyId === faq.id || index === 0}
                  className="inline-flex h-5 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move "${faq.question}" up`}
                  title="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(faq.id, "down")}
                  disabled={busyId === faq.id || index === faqs.length - 1}
                  className="inline-flex h-5 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move "${faq.question}" down`}
                  title="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <Switch
                checked={faq.isPublished}
                disabled={busyId === faq.id}
                onCheckedChange={(checked) => handleTogglePublished(faq.id, checked)}
                aria-label={faq.isPublished ? "Published" : "Draft"}
              />

              <button
                type="button"
                onClick={() => setEditingId(faq.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted"
                aria-label={`Edit ${faq.question}`}
                title="Edit FAQ"
              >
                <Pencil className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => handleDelete(faq)}
                disabled={busyId === faq.id}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                aria-label={`Delete ${faq.question}`}
                title="Delete FAQ"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ),
      )}

      {showAdd ? (
        <FaqFormRow onDone={() => setShowAdd(false)} />
      ) : (
        <Button type="button" variant="outline" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add FAQ
        </Button>
      )}
    </div>
  )
}

function FaqFormRow({ faq, onDone }: { faq?: PlatformFaqRow; onDone: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [state, formAction, pending] = useActionState(
    faq ? updatePlatformFaq : createPlatformFaq,
    initialState,
  )

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      router.refresh()
      onDone()
    } else if (state.message && !state.success) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-3 rounded-md border border-dashed p-3"
    >
      <input type="hidden" name="id" value={faq?.id ?? ""} />

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="question" required>Question</Label>
        <Input
          id="question"
          name="question"
          defaultValue={faq?.question ?? ""}
          placeholder="e.g. How do I add a new branch?"
          required
        />
        {state.errors?.question?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.question[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="answer" required>Answer</Label>
        <RichTextEditor
          id="answer"
          name="answer"
          defaultValue={faq?.answer ?? ""}
          required
        />
        {state.errors?.answer?.[0] ? (
          <p className="text-sm text-red-600">{state.errors.answer[0]}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader className="h-4 w-4" /> : "Save"}
        </Button>
      </div>
    </form>
  )
}
