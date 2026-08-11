import { useEffect, useMemo, useState } from 'react'
import { CircleUserRound } from 'lucide-react'
import { getPersonAreaColor } from '../lib/person-colors'
import { fetchEventTimeline, type EventTimelineResponse, type Person } from '../lib/people-api'

type EventTimelinePageProps = {
  people: Person[]
  onBack: () => void
  onNext: (timeline: EventTimelineResponse) => void
  initialTimeline?: EventTimelineResponse | null
}

type TimelineRangeProps = {
  start: string
  end: string
  domainStart: number
  domainEnd: number
  color: string
  label: string
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatRange(start: string, end: string) {
  return `${formatTime(start)}–${formatTime(end)}`
}

function TimelineRange({ start, end, domainStart, domainEnd, color, label }: TimelineRangeProps) {
  const startMinutes = toMinutes(start)
  const left = ((startMinutes - domainStart) / (domainEnd - domainStart)) * 100
  const width = ((toMinutes(end) - startMinutes) / (domainEnd - domainStart)) * 100

  return (
    <div className="relative h-15" aria-label={label}>
      <div className="absolute top-5 h-0.5" style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }} />
      <div className="absolute top-4 h-3 w-0.5" style={{ left: `${left}%`, backgroundColor: color }} />
      <div className="absolute top-4 h-3 w-0.5" style={{ left: `${left + width}%`, backgroundColor: color }} />
      <span className="absolute top-8 text-xs whitespace-nowrap" style={{ left: `${left}%` }}>{formatTime(start)}</span>
      <span className="absolute top-8 -translate-x-full text-xs whitespace-nowrap" style={{ left: `${left + width}%` }}>{formatTime(end)}</span>
    </div>
  )
}

export default function EventTimelinePage({ people, onBack, onNext, initialTimeline = null }: EventTimelinePageProps) {
  const [timeline, setTimeline] = useState<EventTimelineResponse | null>(initialTimeline)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (timeline) return
    const controller = new AbortController()
    setTimeline(null)
    setError(false)
    void fetchEventTimeline(people, controller.signal)
      .then((response) => {
        setTimeline(response)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(true)
      })
    return () => {
      controller.abort()
    }
  }, [people, timeline])

  const domain = useMemo(() => {
    const times = people.flatMap((person) => [toMinutes(person.availability.start), toMinutes(person.availability.end)])
    return { start: Math.max(0, Math.min(...times) - 30), end: Math.min(24 * 60, Math.max(...times) + 30) }
  }, [people])

  const canContinue = timeline?.status === 'ok' && timeline.optimal_start_time && timeline.optimal_end_time

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 text-secondary sm:px-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="text-sm">Plan the group&apos;s</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Event Timeline Optimizer</h1>
        <p className="mt-6 text-base">We found the event time that gives everyone the most time to reach a place they can enjoy.</p>
      </header>

      <section className="mt-14" aria-live="polite">
        {!timeline && !error && <p>Finding the best event time...</p>}
        {error && <p>Unable to load the event timeline.</p>}
        {timeline?.status === 'no_common_availability' && <p className="rounded-md border-2 border-secondary px-4 py-3 font-medium">No time works for every selected person.</p>}

        {timeline?.status === 'ok' && timeline.optimal_start_time && timeline.optimal_end_time && (
          <div className="grid gap-4 border-b-2 border-secondary pb-8 sm:grid-cols-[12rem_1fr] sm:items-center">
            <div>
              <p className="font-bold">Event Timeline</p>
              <p className="mt-1 text-sm">{formatRange(timeline.optimal_start_time, timeline.optimal_end_time)}</p>
            </div>
            <TimelineRange
              start={timeline.optimal_start_time}
              end={timeline.optimal_end_time}
              domainStart={domain.start}
              domainEnd={domain.end}
              color="currentColor"
              label={`Event timeline ${formatRange(timeline.optimal_start_time, timeline.optimal_end_time)}`}
            />
          </div>
        )}

        <div className="mt-8 space-y-8">
          {people.map((person, index) => {
            const color = getPersonAreaColor(index)
            return (
              <div key={person.name} className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-center">
                <div className="flex items-center gap-3">
                  <CircleUserRound className="rounded-full bg-background" color={color} size={34} strokeWidth={2} />
                  <div>
                    <p className="font-bold">{person.name}</p>
                    <p className="text-sm">{formatRange(person.availability.start, person.availability.end)}</p>
                  </div>
                </div>
                <TimelineRange
                  start={person.availability.start}
                  end={person.availability.end}
                  domainStart={domain.start}
                  domainEnd={domain.end}
                  color={color}
                  label={`${person.name} availability ${formatRange(person.availability.start, person.availability.end)}`}
                />
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-12 flex justify-between">
        <button type="button" onClick={onBack} className="rounded-md border-2 border-secondary px-5 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary">Back</button>
        <button type="button" disabled={!canContinue} onClick={() => timeline && onNext(timeline)} className="rounded-md border-2 border-secondary px-5 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-secondary">Next <span aria-hidden="true">→</span></button>
      </div>
    </main>
  )
}
