import { useEffect, useReducer, useState } from 'react'
import { RestaurantSolverBoard } from '../components/RestaurantSolverBoard'
import WhatsHappeningHere from '../components/WhatsHappeningHere'
import {
  fetchSolveRestaurants,
  subscribeSolveRestaurantsEvents,
  type GeoJsonGeometry,
  type Person,
  type SolveRestaurantsResponse,
} from '../lib/people-api'
import { conversationReducer, initialConversationState } from './solve-restaurants-state'

type SolveRestaurantsPageProps = {
  people: Person[]
  overlap: GeoJsonGeometry
  onBack: () => void
  initialStatus?: SolveRestaurantsResponse | null
  onStatusLoaded?: (status: SolveRestaurantsResponse | null) => void
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
  const [initError, setInitError] = useState<string | null>(null)
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
        setInitError(err instanceof Error ? err.message : 'Unable to start the restaurant solver.')
        setStatus('error')
        setSimulationPhase('finished')
      })

    return controller
  }

  const resetSimulation = () => {
    setSimulationPhase('idle')
    setStatus('loading')
    setRunId(null)
    setInitError(null)
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
  const trashedCards = conversation.cards
    .filter((card) => card.phase === 'trashed')
    .map((card) => ({ name: card.suggestion.name, verdicts: card.verdicts }))

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
      {status === 'error' && initError && (
        <p className="mt-8 rounded-md border-2 border-secondary px-4 py-3 font-medium">{initError}</p>
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
        <div data-testid="responsive-solver-page" className="flex min-h-0 flex-1 flex-col">
          <RestaurantSolverBoard
            people={people}
            conversation={conversation}
            personIndexByName={personIndexByName}
            trashedCards={trashedCards}
          />
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
