import type { Metadata } from "next"

import { getCalendarEvents } from "@/lib/actions/calendar-actions"
import { CalendarPageContent } from "@/components/calendar/calendar-page-content"

export const metadata: Metadata = {
  title: "Calendar",
}

export const dynamic = "force-dynamic"

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
      <CalendarPageContent
        year={year}
        month={month}
        events={events}
        prevHref={`/calendar?year=${prev.year}&month=${prev.month}`}
        nextHref={`/calendar?year=${next.year}&month=${next.month}`}
      />
    </main>
  )
}
