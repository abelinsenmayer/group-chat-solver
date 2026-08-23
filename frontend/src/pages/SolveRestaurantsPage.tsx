import { useEffect, useReducer, useRef, useState } from 'react'
import { CircleUserRound, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { computeCirclePositions } from '../lib/circle-layout'
import { getPersonAreaColor } from '../lib/person-colors'
import { cn } from '../lib/utils'
import { PersonPreferencesPopover } from '../components/PersonPreferencesPopover'
import { ThoughtBubble } from '../components/ThoughtBubble'
import { TrashPopover } from '../components/TrashPopover'
import WhatsHappeningHere from '../components/WhatsHappeningHere'
import { WigglyLine } from '../components/WigglyLine'
import {
  fetchSolveRestaurants,
  subscribeSolveRestaurantsEvents,
  type GeoJsonGeometry,
  type Person,
  type RestaurantSuggestion,
  type SolveRestaurantsEvent,
  type SolveRestaurantsResponse,
} from '../lib/people-api'

const PLANNER_COLOR = 'var(--color-planner)'
const RESEARCHER_COLOR = 'var(--color-researcher)'
const PLANNER_POSITION = { xPercent: 42, yPercent: 4 }
const RESEARCHER_POSITION = { xPercent: 58, yPercent: 4 }
const TRASH_POSITION = { xPercent: 104, yPercent: 50 }

type SolveRestaurantsPageProps = {
  people: Person[]
  overlap: GeoJsonGeometry
  onBack: () => void
  initialStatus?: SolveRestaurantsResponse | null
  onStatusLoaded?: (status: SolveRestaurantsResponse | null) => void
}

type CardVerdict = { verdict: 'approved' | 'rejected'; shortReason: string | null }

type CardState = {
  suggestion: RestaurantSuggestion
  verdicts: Record<string, CardVerdict>
  phase: 'active' | 'pending-trash' | 'trashed' | 'winner'
}

type ActiveLine = { person: string; suggestionId: string; phase: 'questioning' | 'researching' | 'evaluating' }

type ConversationState = {
  cards: CardState[]
  activeLines: ActiveLine[]
  researcherActiveSuggestions: Set<string>
  plannerThinking: boolean
  finalStatus: 'consensus' | 'no_consensus' | 'no_restaurants_found' | null
  errorMessage: string | null
}

const initialConversationState: ConversationState = {
  cards: [],
  activeLines: [],
  researcherActiveSuggestions: new Set(),
  plannerThinking: false,
  finalStatus: null,
  errorMessage: null,
}

type ConversationAction = SolveRestaurantsEvent | { type: 'reset' } | { type: 'flush-pending-trash' }

function conversationReducer(state: ConversationState, event: ConversationAction): ConversationState {
  if (event.type === 'reset') return initialConversationState
  if (event.type === 'flush-pending-trash') {
    return {
      ...state,
      cards: state.cards.map((card) => (card.phase === 'pending-trash' ? { ...card, phase: 'trashed' } : card)),
    }
  }
  switch (event.type) {
    case 'planner_started':
      return { ...state, plannerThinking: true }
    case 'planner_suggestions': {
      const keptCards = state.cards.filter((card) => card.phase === 'trashed')
      return {
        ...state,
        plannerThinking: false,
        activeLines: [],
        researcherActiveSuggestions: new Set(),
        cards: [
          ...keptCards,
          ...event.suggestions.map((suggestion) => ({ suggestion, verdicts: {}, phase: 'active' as const })),
        ],
      }
    }
    case 'judge_questioning':
      return {
        ...state,
        activeLines: [
          ...state.activeLines,
          { person: event.person, suggestionId: event.suggestion_id, phase: 'questioning' },
        ],
      }
    case 'researcher_started':
      return {
        ...state,
        researcherActiveSuggestions: new Set(state.researcherActiveSuggestions).add(event.suggestion_id),
        activeLines: state.activeLines.filter(
          (line) => line.suggestionId !== event.suggestion_id || line.phase !== 'questioning',
        ),
      }
    case 'researcher_done':
      return {
        ...state,
        researcherActiveSuggestions: new Set(
          [...state.researcherActiveSuggestions].filter((id) => id !== event.suggestion_id),
        ),
      }
    case 'judge_evaluating':
      return {
        ...state,
        activeLines: [
          ...state.activeLines,
          { person: event.person, suggestionId: event.suggestion_id, phase: 'evaluating' },
        ],
      }
    case 'judge_verdict':
      return {
        ...state,
        activeLines: state.activeLines.filter(
          (line) => !(line.person === event.person && line.suggestionId === event.suggestion_id),
        ),
        cards: state.cards.map((card) =>
          card.suggestion.id === event.suggestion_id
            ? {
                ...card,
                verdicts: {
                  ...card.verdicts,
                  [event.person]: { verdict: event.verdict, shortReason: event.short_reason },
                },
              }
            : card,
        ),
      }
    case 'round_complete':
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.phase === 'active' && !event.accepted_ids.includes(card.suggestion.id)
            ? { ...card, phase: 'pending-trash' }
            : card,
        ),
      }
    case 'final_result': {
      const winningIds = new Set(event.suggestions.map((suggestion) => suggestion.id))
      return {
        ...state,
        finalStatus: event.status,
        cards: state.cards.map((card) =>
          winningIds.has(card.suggestion.id) ? { ...card, phase: 'winner' } : { ...card, phase: 'trashed' },
        ),
      }
    }
    case 'error':
      return { ...state, errorMessage: event.message, activeLines: [], researcherActiveSuggestions: new Set() }
    default:
      return state
  }
}

export default function SolveRestaurantsPage({
  people,
  overlap,
  onBack,
  initialStatus = null,
  onStatusLoaded,
}: SolveRestaurantsPageProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(initialStatus ? 'success' : 'loading')
  const [runId, setRunId] = useState<string | null>(initialStatus?.run_id ?? null)
  const [simulationPhase, setSimulationPhase] = useState<'idle' | 'running' | 'finished'>(
    initialStatus ? 'running' : 'idle',
  )
  const [trashHovered, setTrashHovered] = useState(false)
  const trashHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null)
  const personHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [conversation, dispatch] = useReducer(conversationReducer, initialConversationState)

  const startSimulation = () => {
    if (initialStatus) return
    setSimulationPhase('running')
    setStatus('loading')
    const controller = new AbortController()

    void fetchSolveRestaurants(people, overlap, controller.signal)
      .then((response) => {
        setStatus('success')
        setRunId(response.run_id)
        onStatusLoaded?.(response)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setStatus('error')
        setSimulationPhase('finished')
      })

    return controller
  }

  const resetSimulation = () => {
    setSimulationPhase('idle')
    setStatus('loading')
    setRunId(null)
    dispatch({ type: 'reset' })
    onStatusLoaded?.(null)
  }

  useEffect(() => {
    if (initialStatus) {
      setSimulationPhase('running')
    }
  }, [initialStatus])

  useEffect(() => {
    if (!runId) return
    return subscribeSolveRestaurantsEvents(runId, dispatch)
  }, [runId])

  useEffect(() => {
    const hasPendingTrash = conversation.cards.some((card) => card.phase === 'pending-trash')
    if (!hasPendingTrash) return

    const timer = setTimeout(() => {
      dispatch({ type: 'flush-pending-trash' })
    }, 1500)

    return () => clearTimeout(timer)
  }, [conversation.cards])

  useEffect(() => {
    if (conversation.finalStatus || conversation.errorMessage) {
      setSimulationPhase('finished')
    }
  }, [conversation.finalStatus, conversation.errorMessage])

  const personIndexByName = Object.fromEntries(people.map((person, index) => [person.name, index]))
  const personPositions = computeCirclePositions(people.length, { radius: 46 })
  const nonTrashedCards = conversation.cards.filter((card) => card.phase !== 'trashed')
  const cardPositions = computeCirclePositions(nonTrashedCards.length, { radius: 20 })
  const nonTrashedIndexById = new Map(nonTrashedCards.map((card, index) => [card.suggestion.id, index]))
  const trashedCards = conversation.cards
    .filter((card) => card.phase === 'trashed')
    .map((card) => ({ name: card.suggestion.name, verdicts: card.verdicts }))

  const getActiveResearchLabel = () => {
    const count = conversation.researcherActiveSuggestions.size
    if (count === 1) {
      const firstId = conversation.researcherActiveSuggestions.values().next().value
      const name = conversation.cards.find((c) => c.suggestion.id === firstId)?.suggestion.name
      return name ? `Researching ${name}` : 'Researching restaurants'
    }
    return `Researching ${count} restaurants`
  }

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col bg-background px-6 py-4 text-secondary sm:px-12 sm:py-6">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Let's find a restaurant!</h1>
      </header>
      <section className="w-full flex justify-end">
        <WhatsHappeningHere title="Finding a restaurant" docFile="solve-restaurants.md" />
      </section>

      {status === 'loading' && simulationPhase === 'running' && (
        <p className="mt-8">Starting the restaurant solver...</p>
      )}
      {status === 'error' && (
        <p className="mt-8 rounded-md border-2 border-secondary px-4 py-3 font-medium">
          Unable to start the restaurant solver.
        </p>
      )}

      {simulationPhase === 'idle' && (
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={startSimulation}
            className="rounded-md border-2 border-secondary px-8 py-3 text-lg font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
          >
            Start Simulation
          </button>
        </div>
      )}

      {(simulationPhase === 'running' || simulationPhase === 'finished') && status === 'success' && (
        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          <div
            className="relative aspect-square w-full max-h-full max-w-full"
            style={{ maxHeight: '100%', maxWidth: '100%' }}
          >
            <div
              data-agent-wrapper="planner"
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${PLANNER_POSITION.xPercent}%`, top: `${PLANNER_POSITION.yPercent}%` }}
            >
              {conversation.plannerThinking && (
                <ThoughtBubble text="Brainstorming restaurant ideas" placement="below" />
              )}
              <CircleUserRound size={48} strokeWidth={1.5} color={PLANNER_COLOR} aria-label="Planner" />
              <span className="text-sm font-bold" style={{ color: PLANNER_COLOR }}>
                Planner
              </span>
            </div>
            <div
              data-agent-wrapper="researcher"
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${RESEARCHER_POSITION.xPercent}%`, top: `${RESEARCHER_POSITION.yPercent}%` }}
            >
              {conversation.researcherActiveSuggestions.size > 0 && (
                <ThoughtBubble text={getActiveResearchLabel()} placement="below" />
              )}
              <CircleUserRound size={48} strokeWidth={1.5} color={RESEARCHER_COLOR} aria-label="Researcher" />
              <span className="text-sm font-bold" style={{ color: RESEARCHER_COLOR }}>
                Researcher
              </span>
            </div>

            <svg
              className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <defs>
                <style>{`
                  @keyframes march {
                    to { stroke-dashoffset: -50; }
                  }
                `}</style>
              </defs>
              <circle
                data-testid="debate-zone-ring"
                cx="50"
                cy="50"
                r="49.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeDashoffset="0"
                className="text-secondary"
                style={{ animation: 'march 20s linear infinite' }}
              />
            </svg>

            {people.map((person, index) => {
              const position = personPositions[index]
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
                  className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
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
                  <CircleUserRound size={48} strokeWidth={1.5} color={color} />
                  <span className="text-sm font-bold" style={{ color }}>
                    {person.name}
                  </span>
                </div>
              )
            })}

            <div
              className="absolute right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center"
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

            <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {conversation.activeLines.map((line) => {
                const personIndex = personIndexByName[line.person]
                const cardIndex = nonTrashedIndexById.get(line.suggestionId)
                if (personIndex === undefined || cardIndex === undefined) return null
                const personPosition = personPositions[personIndex]
                const cardPosition = cardPositions[cardIndex]
                return (
                  <WigglyLine
                    key={`${line.person}-${line.suggestionId}`}
                    x1Pct={personPosition.xPercent}
                    y1Pct={personPosition.yPercent}
                    x2Pct={cardPosition.xPercent}
                    y2Pct={cardPosition.yPercent}
                    color={getPersonAreaColor(personIndex)}
                    iconRadiusPct={6}
                  />
                )
              })}
              {[...conversation.researcherActiveSuggestions].map((suggestionId) => {
                const cardIndex = nonTrashedIndexById.get(suggestionId)
                if (cardIndex === undefined) return null
                const cardPosition = cardPositions[cardIndex]
                return (
                  <WigglyLine
                    key={`researcher-${suggestionId}`}
                    x1Pct={RESEARCHER_POSITION.xPercent}
                    y1Pct={RESEARCHER_POSITION.yPercent}
                    x2Pct={cardPosition.xPercent}
                    y2Pct={cardPosition.yPercent}
                    color={RESEARCHER_COLOR}
                    iconRadiusPct={6}
                  />
                )
              })}
            </svg>

            {conversation.cards.map((card) => {
              const position =
                card.phase === 'trashed'
                  ? TRASH_POSITION
                  : cardPositions[nonTrashedIndexById.get(card.suggestion.id) ?? 0]
              return (
                <motion.div
                  key={card.suggestion.id}
                  layout
                  data-phase={card.phase}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{
                    opacity: card.phase === 'trashed' ? 0.4 : card.phase === 'pending-trash' ? 0.7 : 1,
                    scale: card.phase === 'trashed' ? 0.5 : 1,
                    left: `${position.xPercent}%`,
                    top: `${position.yPercent}%`,
                  }}
                  transition={{ duration: 0.6 }}
                  className={cn(
                    'absolute w-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-secondary bg-background px-3 py-2 text-center text-xs shadow',
                    card.phase === 'winner' && 'border-4 border-primary',
                    card.phase === 'pending-trash' && 'border-red-300',
                    card.phase === 'trashed' && 'z-0',
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
              )
            })}
          </div>
        </div>
      )}

      {conversation.finalStatus && (
        <p
          role="status"
          className="mx-auto mt-8 max-w-md rounded-md border-2 border-secondary px-4 py-3 text-center font-bold"
        >
          {conversation.finalStatus === 'consensus'
            ? 'Everyone agrees! 🎉'
            : conversation.finalStatus === 'no_consensus'
              ? 'No compromise could be reached.'
              : 'No restaurants found in this area. Try broadening your search or moving the meeting area.'}
        </p>
      )}

      {conversation.errorMessage && (
        <p
          role="alert"
          className="mx-auto mt-8 max-w-md rounded-md border-2 border-secondary px-4 py-3 text-center font-medium"
        >
          Something went wrong: {conversation.errorMessage}
        </p>
      )}

      <div className="mt-auto shrink-0 flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←</span> Back
        </button>
        {simulationPhase === 'finished' && (
          <button
            type="button"
            onClick={resetSimulation}
            className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
          >
            Retry
          </button>
        )}
      </div>
    </main>
  )
}
