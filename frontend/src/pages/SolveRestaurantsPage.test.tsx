import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
})

function renderWithUser(ui: React.ReactElement) {
  const user = userEvent.setup()
  return { user, ...render(ui) }
}
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

test('shows a loading message while the solver is starting', async () => {
  vi.mocked(fetchSolveRestaurants).mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

  expect(screen.getByText('Starting the restaurant solver...')).toBeInTheDocument()
})

test('shows an error message when the solver fails to start', async () => {
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('failed'))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

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
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

  await waitFor(() =>
    expect(subscribeSolveRestaurantsEvents).toHaveBeenCalledWith('run-1', expect.any(Function)),
  )
})

test('renders a suggestion card once the planner proposes suggestions', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
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
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
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
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
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
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'pending-trash')

  act(() => {
    vi.advanceTimersByTime(1600)
  })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'trashed')

  vi.useRealTimers()
})

test('shows a consensus banner when the final result is reached', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
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
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'final_result', status: 'no_consensus', suggestions: [] })

  expect(await screen.findByText('No compromise could be reached.')).toBeInTheDocument()
})

test('shows an error banner when the run reports an error', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'error', message: 'planner exploded' })

  expect(await screen.findByText(/planner exploded/)).toBeInTheDocument()
})

test('renders the simulation area within a viewport-height layout', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(
    <SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const main = container.querySelector('main')
  expect(main).toHaveClass('h-screen')
  expect(main).toHaveClass('flex')
  expect(main).toHaveClass('flex-col')
})

test('renders person icons at 48px size', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(
    <SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  // Person icon SVG should be 48px
  const personIcons = container.querySelectorAll('svg')
  const elenaIcon = Array.from(personIcons).find(
    (svg) => svg.getAttribute('width') === '48' && svg.closest('[class*="absolute"]'),
  )
  expect(elenaIcon).toBeTruthy()
})

test('trash icon is positioned at the right edge of the simulation area', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const trashIcon = screen.getByLabelText('Rejected suggestions')
  const trashContainer = trashIcon.closest('div')!
  expect(trashContainer).toHaveClass('right-0')
  expect(trashContainer).toHaveClass('top-1/2')
})

test('shows a thought bubble for the planner while it is thinking', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })

  expect(screen.getByText(/Brainstorming restaurant ideas/)).toBeInTheDocument()
})

test('hides the planner thought bubble once suggestions arrive', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })
  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })

  expect(screen.queryByText(/Brainstorming restaurant ideas/)).not.toBeInTheDocument()
})

test('shows a thought bubble for a judge while evaluating a suggestion', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' })

  expect(screen.getByText(/Evaluating Veggie Spot/)).toBeInTheDocument()
})

test('hides the judge thought bubble after verdict is received', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
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

  expect(screen.queryByText(/Evaluating Veggie Spot/)).not.toBeInTheDocument()
})

test('shows a Start button on initial render and does not auto-start the simulation', () => {
  vi.mocked(fetchSolveRestaurants).mockClear()
  vi.mocked(fetchSolveRestaurants).mockReturnValue(new Promise(() => {}))

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
  expect(fetchSolveRestaurants).not.toHaveBeenCalled()
})

test('starts the simulation when the Start button is clicked', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()

  const { user } = renderWithUser(
    <SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />,
  )

  await user.click(screen.getByRole('button', { name: /start/i }))

  expect(fetchSolveRestaurants).toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument())
})

test('shows a Retry button after the simulation completes', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'final_result', status: 'consensus', suggestions: [] })

  expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument()
})

test('Retry resets to the idle state showing Start button again', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'final_result', status: 'consensus', suggestions: [] })

  const retryButton = await screen.findByRole('button', { name: /retry/i })
  await user.click(retryButton)

  expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
})

test('cards enter pending-trash phase before being fully trashed', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'pending-trash')

  vi.useRealTimers()
})

test('cards transition from pending-trash to trashed after 1.5 seconds', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'pending-trash')

  act(() => {
    vi.advanceTimersByTime(1600)
  })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'trashed')

  vi.useRealTimers()
})

test('shows trashed cards in a popover when hovering the trash icon', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'rejected',
    short_reason: 'Too far',
    feedback: null,
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  act(() => {
    vi.advanceTimersByTime(1600)
  })

  const trashIcon = screen.getByLabelText('Rejected suggestions')
  fireEvent.mouseEnter(trashIcon.closest('div')!)

  expect(screen.getAllByText('Veggie Spot').length).toBeGreaterThanOrEqual(2)

  vi.useRealTimers()
})

test('shows empty state in trash popover when no cards are trashed', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const trashIcon = screen.getByLabelText('Rejected suggestions')
  fireEvent.mouseEnter(trashIcon.closest('div')!)

  expect(screen.getByText(/No rejected suggestions yet/)).toBeInTheDocument()
})

test('renders an animated SVG ring for the debate zone', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const ring = container.querySelector('[data-testid="debate-zone-ring"]')
  expect(ring).toBeInTheDocument()
  expect(ring).toHaveAttribute('stroke-dasharray')
  expect(ring).toHaveAttribute('stroke-dashoffset')
})

test('thought bubbles use larger text', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })

  const bubble = screen.getByText(/Brainstorming restaurant ideas/).parentElement
  expect(bubble).toHaveClass('text-sm')
})

test('thought bubbles show three animated dots', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })

  const bubble = screen.getByText(/Brainstorming restaurant ideas/).parentElement
  expect(bubble).toBeInTheDocument()
  const dots = bubble!.querySelectorAll('[data-testid="thought-dot"]')
  expect(dots.length).toBe(3)
})

test('wiggly connecting lines are thinner', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(<SolveRestaurantsPage people={[elena, marcus]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: '1 Main St', coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' })

  const line = container.querySelector('svg[preserveAspectRatio="none"] path')
  expect(line).toHaveAttribute('stroke-width', '0.5')
})

test('planner icon matches person icon size', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const plannerIcon = Array.from(container.querySelectorAll('svg')).find(
    (svg) => svg.getAttribute('aria-label') === 'Planner',
  )
  expect(plannerIcon).toBeTruthy()
  expect(plannerIcon).toHaveAttribute('width', '48')
})

test('person icon wrappers sit above the connecting lines', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const personWrapper = container.querySelector('[data-person-wrapper]')
  expect(personWrapper).toHaveClass('z-20')
  const linesSvg = container.querySelector('svg[preserveAspectRatio="none"]')
  expect(linesSvg).toHaveClass('z-0')
})

test('retains trashed cards when the next round starts', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'rejected',
    short_reason: 'Too far',
    feedback: null,
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })
  act(() => {
    vi.advanceTimersByTime(1600)
  })

  emit({
    type: 'planner_suggestions',
    round: 2,
    suggestions: [{ id: 'r2', name: 'Burger Barn', address: null, coordinates: [-73.99, 40.74] }],
  })

  expect(screen.getByText('Veggie Spot').closest('[data-phase]')).toHaveAttribute('data-phase', 'trashed')
  expect(screen.getByText('Burger Barn').closest('[data-phase]')).toHaveAttribute('data-phase', 'active')

  vi.useRealTimers()
})

test('trash popover and its trigger sit above trashed suggestion cards', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'rejected',
    short_reason: 'Too far',
    feedback: null,
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })
  act(() => {
    vi.advanceTimersByTime(1600)
  })
  vi.useRealTimers()

  const trashContainer = screen.getByLabelText('Rejected suggestions').closest('div')!
  expect(trashContainer).toHaveClass('z-30')

  const trashedCard = screen.getByText('Veggie Spot').closest('[data-phase="trashed"]')!
  expect(trashedCard).toHaveClass('z-0')
})

test('trash popover has an opaque background and floats above other elements', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'rejected',
    short_reason: 'Too far',
    feedback: null,
  })

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })
  act(() => {
    vi.advanceTimersByTime(1600)
  })
  vi.useRealTimers()

  const trashIcon = screen.getByLabelText('Rejected suggestions')
  fireEvent.mouseEnter(trashIcon.closest('div')!)

  const popover = screen.getByTestId('trash-popover')
  expect(popover).toHaveTextContent('Too far')
  expect(popover).toHaveClass('bg-background')
  expect(popover).toHaveClass('z-50')
})
