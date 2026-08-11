import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { fetchSolveRestaurants, subscribeSolveRestaurantsEvents } from './lib/people-api'

vi.mock('./lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/people-api')>()),
  fetchSolveRestaurants: vi.fn(),
  subscribeSolveRestaurantsEvents: vi.fn(),
}))

const elena = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function mockPeopleRequest(people = [elena]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => people,
  }))
}

test('renders people loaded from the API', async () => {
  mockPeopleRequest()
  render(<App />)

  expect(await screen.findByRole('button', { name: /elena/i })).toBeInTheDocument()
  expect(screen.getByText(/5:30 PM–8:00 PM/)).toBeInTheDocument()
  expect(screen.getByText(/40.7589, -73.9851/)).toBeInTheDocument()
  expect(screen.getByText(/Outdoor seating preferred/)).toBeInTheDocument()
})

test('shows a loading message while people are requested', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
  render(<App />)

  expect(screen.getByText('Loading sample people...')).toBeInTheDocument()
})

test('shows an empty message when the API returns no people', async () => {
  mockPeopleRequest([])
  render(<App />)

  expect(await screen.findByText('No sample people are available.')).toBeInTheDocument()
})

test('shows a retry action when the API request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }))
  render(<App />)

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

test('disables Next until a person is selected', async () => {
  mockPeopleRequest()
  render(<App />)

  expect(await screen.findByRole('button', { name: /next/i })).toBeDisabled()
})

test('shows the event timeline after selecting a person', async () => {
  const user = userEvent.setup()
  mockPeopleRequest()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: /elena/i }))
  await user.click(screen.getByRole('button', { name: /next/i }))

  expect(await screen.findByRole('heading', { name: /event timeline optimizer/i })).toBeInTheDocument()
})

test('does not refetch the timeline when navigating back from the map', async () => {
  const user = userEvent.setup()
  let eventTimelineCalls = 0
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/people')) {
      return Promise.resolve({ ok: true, json: async () => [elena] })
    }
    if (url.includes('/api/event-timeline')) {
      eventTimelineCalls++
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          common_window: { start: '17:30', end: '20:00' },
          optimal_start_time: '18:00',
          optimal_end_time: '19:00',
        }),
      })
    }
    if (url.includes('/api/reachable-areas')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          optimal_start_time: '18:00',
          people: [],
          overlap: null,
        }),
      })
    }
    return Promise.resolve({ ok: false, json: async () => [] })
  }))

  render(<App />)

  await user.click(await screen.findByRole('button', { name: /elena/i }))
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /event timeline optimizer/i })
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /reachable area map/i })

  await user.click(screen.getByRole('button', { name: /back/i }))
  await screen.findByRole('heading', { name: /event timeline optimizer/i })

  expect(eventTimelineCalls).toBe(1)
})

test('resets the restaurant solver to its initial state when navigating back then forward', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/people')) {
      return Promise.resolve({ ok: true, json: async () => [elena] })
    }
    if (url.includes('/api/event-timeline')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          common_window: { start: '17:30', end: '20:00' },
          optimal_start_time: '18:00',
          optimal_end_time: '19:00',
        }),
      })
    }
    if (url.includes('/api/reachable-areas')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          optimal_start_time: '18:00',
          people: [elena],
          overlap: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        }),
      })
    }
    return Promise.resolve({ ok: false, json: async () => [] })
  }))

  vi.mocked(fetchSolveRestaurants).mockResolvedValue({ run_id: 'run-1', status: 'started' })
  vi.mocked(subscribeSolveRestaurantsEvents).mockReturnValue(() => {})

  render(<App />)

  await user.click(await screen.findByRole('button', { name: /elena/i }))
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /event timeline optimizer/i })
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /reachable area map/i })
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /meet the agents/i })
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /the conversation/i })

  await user.click(screen.getByRole('button', { name: /start simulation/i }))
  await act(async () => {})

  await user.click(screen.getByRole('button', { name: /back/i }))
  await screen.findByRole('heading', { name: /meet the agents/i })
  await user.click(screen.getByRole('button', { name: /next/i }))
  await screen.findByRole('heading', { name: /the conversation/i })

  expect(await screen.findByRole('button', { name: /start simulation/i })).toBeInTheDocument()
})
