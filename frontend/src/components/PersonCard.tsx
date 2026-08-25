import { Pencil } from 'lucide-react'
import type { Person } from '../lib/people-api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

type PersonCardProps = {
  person: Person
  selected: boolean
  onToggle: () => void
  onEdit: () => void
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12

  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

export default function PersonCard({ person, selected, onToggle, onEdit }: PersonCardProps) {
  const detailsId = `person-card-details-${person.name}`

  return (
    <div className="relative w-70">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${person.name}`}
        aria-describedby={detailsId}
        onClick={onToggle}
        className={cn(
          'peer w-full rounded-3xl border-2 border-primary bg-background px-5 pt-3 pb-3 text-center text-text transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary',
          selected && 'outline-4 outline-secondary outline-offset-2',
        )}
      >
        <span className="block px-4 text-lg font-bold">{person.name}</span>
        <span id={detailsId}>
          <span className="mt-1 block text-sm">{`Available ${formatTime(person.availability.start)}–${formatTime(person.availability.end)}`}</span>
          <span className="block text-sm">{`Located at ${person.location.latitude}, ${person.location.longitude}`}</span>
          <span className="block text-sm">“{person.preferences}”</span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-s"
        aria-label={`Edit ${person.name}`}
        onClick={onEdit}
        className="absolute right-3 top-3 text-secondary peer-hover:text-background hover:bg-secondary/10 hover:text-secondary"
      >
        <Pencil />
      </Button>
    </div>
  )
}
