import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { fetchSolveRestaurants, type Person } from '../lib/people-api'
import SolveRestaurantsPage from './SolveRestaurantsPage'

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchSolveRestaurants: vi.fn(),
}))

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: '',
}

const overlap = {
  type: 'Polygon' as const,
  coordinates: [[[-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76], [-73.99, 40.75]]],
}

test('shows a loading message while the solver is starting', () => {
  vi.mocked(fetchSolveRestaurants).mockReturnValue(new Promise(() => {}))

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(screen.getByText('Starting the restaurant solver...')).toBeInTheDocument()
})

test('shows a success message when the solver starts', async () => {
  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(await screen.findByText('The restaurant solver has started successfully.')).toBeInTheDocument()
})

test('shows an error message when the solver fails to start', async () => {
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('failed'))

  render(<SolveRestaurantsPage people={[elena]} overlap={overlap} onBack={vi.fn()} />)

  expect(await screen.findByText('Unable to start the restaurant solver.')).toBeInTheDocument()
})

test('does not refetch when an initial status is provided', async () => {
  vi.mocked(fetchSolveRestaurants).mockClear()
  vi.mocked(fetchSolveRestaurants).mockRejectedValue(new Error('should not be called'))

  render(
    <SolveRestaurantsPage
      people={[elena]}
      overlap={overlap}
      initialStatus={{ run_id: 'run-1', status: 'started' }}
      onBack={vi.fn()}
    />,
  )

  expect(screen.getByText('The restaurant solver has started successfully.')).toBeInTheDocument()
  await waitFor(() => expect(fetchSolveRestaurants).not.toHaveBeenCalled())
})
