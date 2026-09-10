import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Printer } from "lucide-react"

import { getCreditNoteById } from "@/lib/actions/credit-note-actions"
import { CreditNoteDetailContent } from "@/components/billing/credit-note-detail-content"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getCreditNote = cache(getCreditNoteById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const creditNote = await getCreditNote(id)
    return { title: creditNote ? `Credit Note ${creditNote.creditNoteNumber}` : "Credit Note" }
  } catch {
    return { title: "Credit Note" }
  }
}

export default async function CreditNoteDetailPage({ params }: Props) {
  const { id } = await params
  const creditNote = await getCreditNote(id)
  if (!creditNote) notFound()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={creditNote.creditNoteNumber}
        description={creditNote.customer?.name ?? ""}
        backHref="/billing/credit-notes"
        backLabel="Back to Credit Notes"
        action={
          <Link
            href={`/billing/credit-notes/${creditNote.id}/print`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
            aria-label="Print credit note"
            title="Print"
          >
            <Printer className="h-4 w-4" />
          </Link>
        }
      />

      <CreditNoteDetailContent creditNote={creditNote} />
    </main>
  )
}
