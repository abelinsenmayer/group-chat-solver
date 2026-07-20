import type { Person } from '../lib/people-api'
import { cn } from '../lib/utils'

type PersonCardProps = {
  person: Person
  selected: boolean
  onToggle: () => void
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12

  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

export default function PersonCard({ person, selected, onToggle }: PersonCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'w-70 rounded-3xl border-2 border-primary bg-background px-5 pb-3 text-center text-text transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary',
        selected && 'outline-4 outline-secondary outline-offset-2',
      )}
    >
      <span className="block text-lg font-bold">{person.name}</span>
      <span className="mt-1 block text-sm">{`Available ${formatTime(person.availability.start)}–${formatTime(person.availability.end)}`}</span>
      <span className="block text-sm">{`Located at ${person.location.latitude}, ${person.location.longitude}`}</span>
      <span className="block text-sm">“{person.preferences}”</span>
    </button>
  )
}
