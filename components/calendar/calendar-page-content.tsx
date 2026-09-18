"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { CalendarView } from "@/components/calendar/calendar-view"
import { AddReminderDialog } from "@/components/calendar/add-reminder-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"
import type { CalendarEvent } from "@/lib/actions/calendar-actions"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** Same UTC date-only key CalendarView itself keys events by. */
function dateKey(isoOrDate: string | Date): string {
  return (typeof isoOrDate === "string" ? isoOrDate : isoOrDate.toISOString()).slice(0, 10)
}

type CalendarPageContentProps = {
  year: number
  month: number
  events: CalendarEvent[]
  prevHref: string
  nextHref: string
}

/**
 * Owns the selected-day state so the header's Add Reminder dialog and the
 * grid below it agree on which day is selected — a plain server component
 * page can't hold that itself, and splitting the header action and the grid
 * into two separate client components left them with no way to share it.
 */
export function CalendarPageContent({ year, month, events, prevHref, nextHref }: CalendarPageContentProps) {
  const todayKey = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(
    events.find((event) => dateKey(event.date) === todayKey) ? todayKey : null,
  )

  return (
    <>
      <PageBackHeader
        title="Calendar"
        description="Reminders and upcoming activities in one place."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={<AddReminderDialog defaultDate={selectedDate ?? undefined} />}
      />

      <div className="flex items-center justify-between">
        <Link
          href={prevHref}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Link>

        <p className="text-lg font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </p>

        <Link
          href={nextHref}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <CalendarView
        year={year}
        month={month}
        events={events}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </>
  )
}
