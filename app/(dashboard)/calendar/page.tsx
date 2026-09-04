import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { getCalendarEvents } from "@/lib/actions/calendar-actions"
import { CalendarView } from "@/components/calendar/calendar-view"
import { AddReminderDialog } from "@/components/calendar/add-reminder-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Calendar",
}

export const dynamic = "force-dynamic"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type CalendarPageProps = {
  searchParams?: Promise<{ year?: string; month?: string }>
}

function clampMonth(year: number, month: number) {
  if (month < 1) return { year: year - 1, month: 12 }
  if (month > 12) return { year: year + 1, month: 1 }
  return { year, month }
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = (await searchParams) ?? {}
  const now = new Date()
  const year = Number(params.year) || now.getFullYear()
  const month = Number(params.month) || now.getMonth() + 1

  const events = await getCalendarEvents(year, month)

  const prev = clampMonth(year, month - 1)
  const next = clampMonth(year, month + 1)

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Calendar"
        description="Reminders and upcoming activities in one place."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={<AddReminderDialog />}
      />

      <div className="flex items-center justify-between">
        <Link
          href={`/calendar?year=${prev.year}&month=${prev.month}`}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Link>

        <p className="text-lg font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </p>

        <Link
          href={`/calendar?year=${next.year}&month=${next.month}`}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <CalendarView year={year} month={month} events={events} />
    </main>
  )
}
