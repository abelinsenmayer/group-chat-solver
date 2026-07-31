import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  fetchSolveRestaurants,
  subscribeSolveRestaurantsEvents,
  type Person,
  type SolveRestaurantsEvent,
} from '../lib/people-api'
import SolveRestaurantsPage from './SolveRestaurantsPage'

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchSolveRestaurants: vi.fn(),
  subscribeSolveRestaurantsEvents: vi.fn(),
}))

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: '',
}

const marcus: Person = {
  name: 'Marcus',
  availability: { start: '18:00', end: '21:00' },
  location: { latitude: 40.75, longitude: -73.98 },
  preferences: '',
}

const overlap = {
  type: 'Polygon' as const,
  coordinates: [[[-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76], [-73.99, 40.75]]],
}

function mockEventSubscription() {
  let emitEvent: (event: SolveRestaurantsEvent) => void = () => {}
  vi.mocked(subscribeSolveRestaurantsEvents).mockImplementation((_runId, onEvent) => {
    emitEvent = onEvent
    return () => {}
  })
  return (event: SolveRestaurantsEvent) => act(() => emitEvent(event))
}

test('shows a loading message while the solver is starting', () => {
  vi.mocked(fetchSolveRestaurants).mockReturnValue(new Promise(() => {}))

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(screen.getByText('Starting the restaurant solver...')).toBeInTheDocument()
})

test('shows an error message when the solver fails to start', async () => {
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('failed'))

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(await screen.findByText('Unable to start the restaurant solver.')).toBeInTheDocument()
})

test('does not refetch when an initial status is provided', async () => {
  vi.mocked(fetchSolveRestaurants).mockClear()
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('should not be called'))
  mockEventSubscription()

  render(
    <SolveRestaurantsPage
      people={[elena]}
      overlap={overlap}
      initialStatus={{ run_id: 'run-1', status: 'started' }}
      onBack={vi.fn()}
    />,
  )

  await waitFor(() => expect(fetchSolveRestaurants).not.toHaveBeenCalled())
})

test('subscribes to run events once the solver has started', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  await waitFor(() =>
    expect(subscribeSolveRestaurantsEvents).toHaveBeenCalledWith('run-1', expect.any(Function)),
  )
})

test('renders a suggestion card once the planner proposes suggestions', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: '1 Main St', coordinates: [-73.98, 40.75] }],
  })

  expect(screen.getByText('Veggie Spot')).toBeInTheDocument()
})

test('shows a check mark when a judge approves a suggestion', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: '1 Main St', coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' })
  emit({
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'approved',
    short_reason: null,
    feedback: null,
  })

  expect(screen.getByText('✓')).toBeInTheDocument()
})

test('shows a rejection tag when a judge rejects a suggestion', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: '1 Main St', coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'judge_verdict',
    person: 'Marcus',
    suggestion_id: 'r1',
    verdict: 'rejected',
    short_reason: 'Too expensive!',
    feedback: 'Way over budget.',
  })

  expect(screen.getByText('Too expensive!')).toBeInTheDocument()
})

test('marks a card as trashed once its round completes without unanimous approval', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'trashed')
})

test('shows a consensus banner when the final result is reached', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'final_result',
    status: 'consensus',
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })

  expect(await screen.findByText('Everyone agrees! 🎉')).toBeInTheDocument()
})

test('shows a no-compromise banner when the final result has no consensus', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'final_result', status: 'no_consensus', suggestions: [] })

  expect(await screen.findByText('No compromise could be reached.')).toBeInTheDocument()
})

test('shows an error banner when the run reports an error', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'error', message: 'planner exploded' })

  expect(await screen.findByText(/planner exploded/)).toBeInTheDocument()
})
