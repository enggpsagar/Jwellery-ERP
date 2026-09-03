"use client"

import { useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Bold, Italic, List, ListOrdered } from "lucide-react"

import { cn } from "@/lib/utils"

type RichTextEditorProps = {
  name: string
  id?: string
  defaultValue?: string | null
  placeholder?: string
  required?: boolean
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void
  active: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/**
 * A minimal TipTap rich text editor for admin-authored content (Contact Us
 * message, FAQ answers) — bold/italic/lists only, matching the plain
 * formatting these fields actually need rather than a full document editor.
 *
 * Submits as HTML via a hidden input, same FormData/useActionState
 * convention every other form field in this app already uses — the visible
 * editor itself is never a native form field TipTap could populate on
 * submit. The stored HTML is only ever entered by a SUPER_ADMIN (this is
 * platform-wide content, not user-generated), so it's rendered on the
 * public/read side without sanitization — see ContactContentView/FaqList.
 */
export function RichTextEditor({
  name,
  id,
  defaultValue,
  placeholder,
  required,
}: RichTextEditorProps) {
  // The hidden input below is what actually gets submitted — React doesn't
  // know TipTap's internal content changed unless something re-renders this
  // component, so `html` tracks it explicitly via onUpdate.
  const [html, setHtml] = useState(defaultValue || "")

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: defaultValue || "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm min-h-[120px] max-w-none px-3 py-2 focus:outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
      },
    },
  })

  return (
    <div className="rounded-md border bg-background focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          active={!!editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={!!editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={!!editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={!!editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      {/* The actual form field — TipTap's own content lives in the editor's
          internal state, not in anything a native form submit would pick
          up, so this hidden input is what formAction's FormData reads. */}
      <input type="hidden" name={name} id={id} required={required} value={html} readOnly />
    </div>
  )
}
