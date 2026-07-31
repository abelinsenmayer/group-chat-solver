import { useEffect, useReducer, useState } from 'react'
import { CircleUserRound, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { computeCirclePositions } from '../lib/circle-layout'
import { getPersonAreaColor } from '../lib/person-colors'
import { cn } from '../lib/utils'
import {
  fetchSolveRestaurants,
  subscribeSolveRestaurantsEvents,
  type GeoJsonGeometry,
  type Person,
  type RestaurantSuggestion,
  type SolveRestaurantsEvent,
  type SolveRestaurantsResponse,
} from '../lib/people-api'

const PLANNER_COLOR = '#4A4A4A'
const TRASH_POSITION = { xPercent: 94, yPercent: 50 }

type SolveRestaurantsPageProps = {
  people: Person[]
  overlap: GeoJsonGeometry
  onBack: () => void
  initialStatus?: SolveRestaurantsResponse | null
  onStatusLoaded?: (status: SolveRestaurantsResponse) => void
}

type CardVerdict = { verdict: 'approved' | 'rejected'; shortReason: string | null }

type CardState = {
  suggestion: RestaurantSuggestion
  verdicts: Record<string, CardVerdict>
  phase: 'active' | 'trashed' | 'winner'
}

type ActiveLine = { person: string; suggestionId: string }

type ConversationState = {
  cards: CardState[]
  activeLines: ActiveLine[]
  finalStatus: 'consensus' | 'no_consensus' | null
  errorMessage: string | null
}

const initialConversationState: ConversationState = {
  cards: [],
  activeLines: [],
  finalStatus: null,
  errorMessage: null,
}

function conversationReducer(state: ConversationState, event: SolveRestaurantsEvent): ConversationState {
  switch (event.type) {
    case 'planner_suggestions':
      return {
        ...state,
        activeLines: [],
        cards: event.suggestions.map((suggestion) => ({ suggestion, verdicts: {}, phase: 'active' })),
      }
    case 'judge_evaluating':
      return {
        ...state,
        activeLines: [...state.activeLines, { person: event.person, suggestionId: event.suggestion_id }],
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
            ? { ...card, phase: 'trashed' }
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
      return { ...state, errorMessage: event.message }
    case 'planner_started':
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
  const [conversation, dispatch] = useReducer(conversationReducer, initialConversationState)

  useEffect(() => {
    if (initialStatus) return
    const controller = new AbortController()
    setStatus('loading')

    void fetchSolveRestaurants(people, overlap, controller.signal)
      .then((response) => {
        setStatus('success')
        setRunId(response.run_id)
        onStatusLoaded?.(response)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [people, overlap, initialStatus, onStatusLoaded])

  useEffect(() => {
    if (!runId) return
    return subscribeSolveRestaurantsEvents(runId, dispatch)
  }, [runId])

  const personIndexByName = Object.fromEntries(people.map((person, index) => [person.name, index]))
  const personPositions = computeCirclePositions(people.length, { radius: 46 })
  const nonTrashedCards = conversation.cards.filter((card) => card.phase !== 'trashed')
  const cardPositions = computeCirclePositions(nonTrashedCards.length, { radius: 24 })
  const nonTrashedIndexById = new Map(nonTrashedCards.map((card, index) => [card.suggestion.id, index]))

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-background px-6 py-10 text-secondary sm:px-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">The Conversation</h1>

      {status === 'loading' && <p className="mt-8">Starting the restaurant solver...</p>}
      {status === 'error' && (
        <p className="mt-8 rounded-md border-2 border-secondary px-4 py-3 font-medium">
          Unable to start the restaurant solver.
        </p>
      )}

      {status === 'success' && (
        <div className="relative mx-auto mt-10 aspect-square w-full">
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
            <CircleUserRound size={40} strokeWidth={1.5} color={PLANNER_COLOR} />
            <span className="text-sm font-bold" style={{ color: PLANNER_COLOR }}>
              Planner
            </span>
          </div>

          <div className="absolute left-1/2 top-1/2 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-secondary" />

          {people.map((person, index) => {
            const position = personPositions[index]
            const color = getPersonAreaColor(index)
            return (
              <div
                key={person.name}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
              >
                <CircleUserRound size={32} strokeWidth={1.5} color={color} />
                <span className="text-xs font-bold" style={{ color }}>
                  {person.name}
                </span>
              </div>
            )
          })}

          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${TRASH_POSITION.xPercent}%`, top: `${TRASH_POSITION.yPercent}%` }}
          >
            <Trash2 size={28} strokeWidth={1.5} aria-label="Rejected suggestions" />
          </div>

          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {conversation.activeLines.map((line) => {
              const personIndex = personIndexByName[line.person]
              const cardIndex = nonTrashedIndexById.get(line.suggestionId)
              if (personIndex === undefined || cardIndex === undefined) return null
              const personPosition = personPositions[personIndex]
              const cardPosition = cardPositions[cardIndex]
              return (
                <motion.line
                  key={`${line.person}-${line.suggestionId}`}
                  x1={`${personPosition.xPercent}%`}
                  y1={`${personPosition.yPercent}%`}
                  x2={`${cardPosition.xPercent}%`}
                  y2={`${cardPosition.yPercent}%`}
                  stroke={getPersonAreaColor(personIndex)}
                  strokeWidth={2}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                  opacity: card.phase === 'trashed' ? 0.4 : 1,
                  scale: card.phase === 'trashed' ? 0.5 : 1,
                  left: `${position.xPercent}%`,
                  top: `${position.yPercent}%`,
                }}
                transition={{ duration: 0.6 }}
                className={cn(
                  'absolute w-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-secondary bg-background px-3 py-2 text-center text-xs shadow',
                  card.phase === 'winner' && 'border-4 border-primary',
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
      )}

      {conversation.finalStatus && (
        <p
          role="status"
          className="mx-auto mt-8 max-w-md rounded-md border-2 border-secondary px-4 py-3 text-center font-bold"
        >
          {conversation.finalStatus === 'consensus' ? 'Everyone agrees! 🎉' : 'No compromise could be reached.'}
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

      <div className="mt-10 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
    </main>
  )
}
