import { useEffect, useRef, useState } from 'react'
import { CircleUserRound, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { EvaluationConnections } from './EvaluationConnections'
import { PersonPreferencesPopover } from './PersonPreferencesPopover'
import { Separator } from './ui/separator'
import { ThoughtBubble } from './ThoughtBubble'
import { TrashPopover } from './TrashPopover'
import { getPersonAreaColor } from '../lib/person-colors'
import type { Person } from '../lib/people-api'
import { cn } from '../lib/utils'
import type { CardVerdict, ConversationState } from '../pages/solve-restaurants-state'

const PLANNER_COLOR = 'var(--color-planner)'
const RESEARCHER_COLOR = 'var(--color-researcher)'

type RestaurantSolverBoardProps = {
  people: Person[]
  conversation: ConversationState
  personIndexByName: Record<string, number>
  trashedCards: { name: string; verdicts: Record<string, CardVerdict> }[]
}

export function RestaurantSolverBoard({
  people,
  conversation,
  personIndexByName,
  trashedCards,
}: RestaurantSolverBoardProps) {
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null)
  const personHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [trashHovered, setTrashHovered] = useState(false)
  const trashHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activityRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    if (personHoverTimeout.current) clearTimeout(personHoverTimeout.current)
    if (trashHoverTimeout.current) clearTimeout(trashHoverTimeout.current)
  }, [])

  const getActiveResearchLabel = () => {
    const count = conversation.researcherActiveSuggestions.size
    if (count === 1) {
      const firstId = [...conversation.researcherActiveSuggestions][0]
      const name = conversation.cards.find((c) => c.suggestion.id === firstId)?.suggestion.name
      return name ? `Researching ${name}` : 'Researching restaurants'
    }
    return `Researching ${count} restaurants`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 mt-5">
      <div data-testid="solver-agent-header" className="flex gap-18 justify-center">
        <div data-agent-wrapper="planner" className="relative flex flex-col items-center">
          {conversation.plannerThinking && (
            <ThoughtBubble text="Brainstorming restaurant ideas" placement="below" />
          )}
          <CircleUserRound size={48} strokeWidth={1.5} color={PLANNER_COLOR} aria-label="Planner" />
          <span className="text-sm font-bold" style={{ color: PLANNER_COLOR }}>
            Planner
          </span>
        </div>
        <div data-agent-wrapper="researcher" className="relative flex flex-col items-center">
          {conversation.researcherActiveSuggestions.size > 0 && (
            <ThoughtBubble text={getActiveResearchLabel()} placement="below" />
          )}
          <CircleUserRound size={48} strokeWidth={1.5} color={RESEARCHER_COLOR} aria-label="Researcher" />
          <span className="text-sm font-bold" style={{ color: RESEARCHER_COLOR }}>
            Researcher
          </span>
        </div>
      </div>

      <div className='flex justify-center'>
        <Separator data-testid="solver-divider" className='w-3/4!' />
      </div>

    <div
        ref={activityRef}
        role="region"
        aria-label="Restaurant evaluation activity"
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="relative min-h-full">
          <EvaluationConnections
            containerRef={activityRef}
            activeLines={conversation.activeLines}
            personIndexByName={personIndexByName}
          />
          <div className="relative z-10 grid min-h-full grid-cols-[minmax(4.5rem,0.8fr)_minmax(8rem,1.6fr)] gap-3 px-1 py-3 sm:grid-cols-[minmax(7rem,0.8fr)_minmax(14rem,1.8fr)] sm:gap-8 sm:px-4">
          <div data-testid="people-column" className="flex flex-col items-center gap-10">
            {people.map((person, index) => {
              const color = getPersonAreaColor(index)
              const activeLine = conversation.activeLines.find((l) => l.person === person.name)
              const thinkingSuggestionName = activeLine
                ? conversation.cards.find((c) => c.suggestion.id === activeLine.suggestionId)?.suggestion.name
                : null
              const bubbleText = activeLine?.phase === 'questioning'
                ? `Deciding what to research about ${thinkingSuggestionName}`
                : `Evaluating ${thinkingSuggestionName}`
              return (
                <div
                  key={person.name}
                  data-person-wrapper
                  className="relative flex flex-col items-center"
                  onMouseEnter={() => {
                    if (personHoverTimeout.current) clearTimeout(personHoverTimeout.current)
                    setHoveredPerson(person.name)
                  }}
                  onMouseLeave={() => {
                    personHoverTimeout.current = setTimeout(() => setHoveredPerson(null), 150)
                  }}
                >
                  {thinkingSuggestionName && <ThoughtBubble text={bubbleText} />}
                  {hoveredPerson === person.name && (
                    <PersonPreferencesPopover name={person.name} preferences={person.preferences} color={color} />
                  )}
                  <CircleUserRound data-person-name={person.name} size={48} strokeWidth={1.5} color={color} />
                  <span className="text-sm font-bold" style={{ color }}>
                    {person.name}
                  </span>
                </div>
              )
            })}
          </div>
          <div data-testid="suggestions-column" className="flex flex-col items-stretch gap-5">
            {conversation.cards
              .filter((card) => card.phase !== 'trashed')
              .map((card) => (
                <motion.div
                  key={card.suggestion.id}
                  layout
                  data-suggestion-id={card.suggestion.id}
                  data-phase={card.phase}
                  initial={{ opacity: 0, x: 32, scale: 0.96 }}
                  animate={{
                    opacity: card.phase === 'pending-trash' ? 0.7 : 1,
                    x: 0,
                    scale: card.phase === 'winner' ? 1.03 : card.phase === 'pending-trash' ? 0.98 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                  className={cn(
                    'rounded-xl border-2 border-secondary bg-background px-3 py-3 text-center text-xs shadow',
                    card.phase === 'pending-trash' && 'border-red-300',
                    card.phase === 'winner' && 'border-4 border-primary shadow-lg',
                  )}
                >
                  <p className="font-bold">{card.suggestion.name}</p>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {Object.entries(card.verdicts).map(([personName, verdict]) => {
                      const color = getPersonAreaColor(personIndexByName[personName] ?? 0)
                      return (
                        <span
                          key={personName}
                          className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
                          style={{ borderColor: color, color }}
                        >
                          {verdict.verdict === 'approved' ? '✓' : verdict.shortReason ?? 'Rejected'}
                        </span>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
          </div>
        </div>
        </div>
      </div>

      <div data-testid="solver-trash" className="relative flex shrink-0 justify-center">
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => {
            if (trashHoverTimeout.current) clearTimeout(trashHoverTimeout.current)
            setTrashHovered(true)
          }}
          onMouseLeave={() => {
            trashHoverTimeout.current = setTimeout(() => setTrashHovered(false), 150)
          }}
        >
          <Trash2 size={40} strokeWidth={1.5} aria-label="Rejected suggestions" />
          {trashHovered && <TrashPopover cards={trashedCards} personIndexByName={personIndexByName} />}
        </div>
      </div>
    </div>
  )
}
