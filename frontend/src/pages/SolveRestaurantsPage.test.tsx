import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

async function renderStartedPage(people: Person[] = [elena, marcus]) {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()
  render(<SolveRestaurantsPage people={people} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())
  return emit
}

test('uses the responsive solver page instead of the legacy circular board', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  const { user } = renderWithUser(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  expect(await screen.findByTestId('responsive-solver-page')).toBeInTheDocument()
  expect(screen.queryByTestId('debate-zone-ring')).not.toBeInTheDocument()
})

test('stacks system agents above a separately scrollable two-column activity board', async () => {
  await renderStartedPage()

  const page = await screen.findByTestId('responsive-solver-page')
  const header = screen.getByTestId('solver-agent-header')
  const divider = screen.getByTestId('solver-divider')
  const board = screen.getByRole('region', { name: 'Restaurant evaluation activity' })
  expect(page.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy()
  expect(header.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(divider.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(board).toHaveClass('overflow-y-auto')
  expect(screen.getByTestId('people-column')).toBeInTheDocument()
  expect(screen.getByTestId('suggestions-column')).toBeInTheDocument()
})

test('places the evaluation overlay inside the scrolling content layer', async () => {
  await renderStartedPage()

  const board = screen.getByRole('region', { name: 'Restaurant evaluation activity' })
  const overlay = screen.getByTestId('evaluation-connections')
  const peopleColumn = screen.getByTestId('people-column')
  expect(overlay.parentElement?.parentElement).toBe(board)
  expect(overlay.parentElement).toContainElement(peopleColumn)
})

test('places rejected suggestions below the activity board', async () => {
  await renderStartedPage()
  const board = await screen.findByRole('region', { name: 'Restaurant evaluation activity' })
  const trash = screen.getByTestId('solver-trash')
  expect(board.compareDocumentPosition(trash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('shows a loading message while the solver is starting', async () => {
  vi.mocked(fetchSolveRestaurants).mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

  expect(screen.getByText('Starting the restaurant solver...')).toBeInTheDocument()
})

test('shows an error message when the solver fails to start', async () => {
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('Unable to start the restaurant solver.'))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

  expect(await screen.findByText('Unable to start the restaurant solver.')).toBeInTheDocument()
})

test('shows a user-friendly message when the solver rejects input as invalid', async () => {
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('The input could not be processed or contained a security risk. Try rephrasing custom inputs.'))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))

  expect(await screen.findByText('The input could not be processed or contained a security risk. Try rephrasing custom inputs.')).toBeInTheDocument()
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

  const card = within(screen.getByTestId('suggestions-column')).getByText('Veggie Spot').closest('[data-phase]')
  expect(card).toHaveAttribute('data-suggestion-id', 'r1')
  expect(card).toHaveAttribute('data-phase', 'active')
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

  expect(within(screen.getByTestId('suggestions-column')).queryByText('Veggie Spot')).not.toBeInTheDocument()

  vi.useRealTimers()
  fireEvent.mouseEnter(screen.getByLabelText('Rejected suggestions').closest('div')!)
  expect(screen.getByTestId('trash-popover')).toHaveTextContent('Veggie Spot')
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

test('shows a friendly message and retry button when no restaurants are found', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })

  expect(await screen.findByText(/No restaurants found in this area/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
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

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  const personIcon = screen.getByTestId('people-column').querySelector('svg[width="48"]')
  expect(personIcon).toBeTruthy()
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

test('shows a help button that opens an explanation dialog', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  mockEventSubscription()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'Researcher reads all the questions' }))
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  const helpButton = screen.getByRole('button', { name: /what's happening here\?/i })
  expect(helpButton).toBeInTheDocument()

  await user.click(helpButton)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(await screen.findByText(/Researcher reads all the questions/)).toBeInTheDocument()
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

test('preserves the suggestion card DOM node when it enters pending-trash', async () => {
  const emit = await renderStartedPage([elena])

  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  const activeCard = screen.getByText('Veggie Spot').closest('[data-phase]')
  expect(activeCard).toHaveAttribute('data-phase', 'active')

  vi.useFakeTimers()
  emit({ type: 'round_complete', round: 1, accepted_ids: [] })

  const pendingTrashCard = screen.getByText('Veggie Spot').closest('[data-phase]')
  expect(pendingTrashCard).toHaveAttribute('data-phase', 'pending-trash')
  expect(pendingTrashCard).toBe(activeCard)
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

  expect(within(screen.getByTestId('suggestions-column')).queryByText('Veggie Spot')).not.toBeInTheDocument()

  vi.useRealTimers()
  fireEvent.mouseEnter(screen.getByLabelText('Rejected suggestions').closest('div')!)
  expect(screen.getByTestId('trash-popover')).toHaveTextContent('Veggie Spot')
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

  vi.useRealTimers()
  const trashIcon = screen.getByLabelText('Rejected suggestions')
  fireEvent.mouseEnter(trashIcon.closest('div')!)

  expect(screen.getByTestId('trash-popover')).toHaveTextContent('Veggie Spot')
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

  const suggestions = within(screen.getByTestId('suggestions-column'))
  expect(suggestions.queryByText('Veggie Spot')).not.toBeInTheDocument()
  expect(suggestions.getByText('Burger Barn').closest('[data-phase]')).toHaveAttribute('data-phase', 'active')

  vi.useRealTimers()
  fireEvent.mouseEnter(screen.getByLabelText('Rejected suggestions').closest('div')!)
  expect(screen.getByTestId('trash-popover')).toHaveTextContent('Veggie Spot')
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

test('Retry clears the loaded status so a new simulation can be started', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-2', status: 'started' })
  const emit = mockEventSubscription()
  const onStatusLoaded = vi.fn()
  const user = userEvent.setup()

  const { rerender } = render(
    <SolveRestaurantsPage
      people={[elena]}
      overlap={overlap}
      initialStatus={{ run_id: 'run-1', status: 'started' }}
      onBack={vi.fn()}
      onStatusLoaded={onStatusLoaded}
    />,
  )

  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalledWith('run-1', expect.any(Function)))

  emit({ type: 'final_result', status: 'consensus', suggestions: [] })

  const retryButton = await screen.findByRole('button', { name: /retry/i })
  await user.click(retryButton)

  expect(onStatusLoaded).toHaveBeenCalledWith(null)

  rerender(
    <SolveRestaurantsPage
      people={[elena]}
      overlap={overlap}
      initialStatus={null}
      onBack={vi.fn()}
      onStatusLoaded={onStatusLoaded}
    />,
  )

  await user.click(screen.getByRole('button', { name: /start/i }))

  await waitFor(() => expect(fetchSolveRestaurants).toHaveBeenCalledWith([elena], overlap, expect.any(AbortSignal)))
})

test('shows a question-gathering thought bubble for a judge', async () => {
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
  emit({ type: 'judge_questioning', person: 'Elena', suggestion_id: 'r1' })

  expect(screen.getByText(/Deciding what to research about Veggie Spot/)).toBeInTheDocument()
})

test('does not draw researcher-to-suggestion connections', async () => {
  const emit = await renderStartedPage([elena])
  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'researcher_started', suggestion_id: 'r1' })
  expect(screen.getByTestId('evaluation-connections').querySelectorAll('path')).toHaveLength(0)
})

test('draws a judge connection to the suggestion being evaluated', async () => {
  const rectangle = (left: number, top: number, width: number, height: number) => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  }) as DOMRect
  const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('aria-label') === 'Restaurant evaluation activity') return rectangle(10, 20, 300, 400)
    if (this.hasAttribute('data-person-name')) return rectangle(50, 110, 20, 20)
    if (this.hasAttribute('data-suggestion-id')) return rectangle(230, 170, 20, 20)
    return rectangle(0, 0, 0, 0)
  })
  const emit = await renderStartedPage([elena])
  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' })
  await waitFor(() => expect(screen.getByTestId('evaluation-connections').querySelectorAll('path')).toHaveLength(1))
  rectSpy.mockRestore()
})

test('shows a researcher thought bubble while researching', async () => {
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
  emit({ type: 'researcher_started', suggestion_id: 'r1' })

  expect(screen.getByText(/Researching Veggie Spot/)).toBeInTheDocument()
})

test('hides the researcher thought bubble after research is done', async () => {
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
  emit({ type: 'researcher_started', suggestion_id: 'r1' })
  emit({ type: 'researcher_done', suggestion_id: 'r1' })

  expect(screen.queryByText(/Researching Veggie Spot/)).not.toBeInTheDocument()
})

test('agent thought bubbles are anchored to their own icon wrapper', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  const { container } = render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })
  emit({
    type: 'planner_suggestions',
    round: 1,
    suggestions: [{ id: 'r1', name: 'Veggie Spot', address: null, coordinates: [-73.98, 40.75] }],
  })
  emit({ type: 'researcher_started', suggestion_id: 'r1' })

  const researcherWrapper = container.querySelector('[data-agent-wrapper="researcher"]')
  const bubble = screen.getByText(/Researching Veggie Spot/).closest('div')
  expect(researcherWrapper).toContainElement(bubble)
})

test('planner thought bubbles hang below their icon so they stay inside the board', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  const emit = mockEventSubscription()
  const user = userEvent.setup()

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /start/i }))
  await waitFor(() => expect(subscribeSolveRestaurantsEvents).toHaveBeenCalled())

  emit({ type: 'planner_started', round: 1 })
  expect(screen.getByText(/Brainstorming restaurant ideas/).closest('[data-placement]')).toHaveAttribute(
    'data-placement',
    'below',
  )
})

test('judge thought bubbles still sit above their icon', async () => {
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
  emit({ type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' })

  expect(screen.getByText(/Evaluating Veggie Spot/).closest('[data-placement]')).toHaveAttribute(
    'data-placement',
    'above',
  )
})

test('renders the researcher icon with the correct color', async () => {
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
  emit({ type: 'researcher_started', suggestion_id: 'r1' })

  const researcherLabel = screen.getByText('Researcher')
  expect(researcherLabel).toBeInTheDocument()
  expect(researcherLabel).toHaveStyle({ color: 'var(--color-researcher)' })
})
