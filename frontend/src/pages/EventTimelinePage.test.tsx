import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { fetchEventTimeline, type Person } from '../lib/people-api'
import EventTimelinePage from './EventTimelinePage'

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchEventTimeline: vi.fn(),
}))

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: '',
}

test('renders the optimized event and person availability timelines', async () => {
  vi.mocked(fetchEventTimeline).mockResolvedValue({
    status: 'ok',
    common_window: { start: '17:30', end: '20:00' },
    optimal_start_time: '18:00',
    optimal_end_time: '19:00',
  })

  render(<EventTimelinePage people={[elena]} onBack={vi.fn()} onNext={vi.fn()} />)

  expect(await screen.findByRole('heading', { name: 'Event Timeline Optimizer' })).toBeInTheDocument()
  expect(screen.getByText('6:00 PM–7:00 PM')).toBeInTheDocument()
  expect(screen.getByText('Elena')).toBeInTheDocument()
  expect(screen.getByText('5:30 PM–8:00 PM')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
})

test('explains unavailable schedules and disables Next', async () => {
  vi.mocked(fetchEventTimeline).mockResolvedValue({
    status: 'no_common_availability',
    common_window: null,
    optimal_start_time: null,
    optimal_end_time: null,
  })

  render(<EventTimelinePage people={[elena]} onBack={vi.fn()} onNext={vi.fn()} />)

  expect(await screen.findByText('No time works for every selected person.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
})

test('does not refetch when an initial timeline is provided', async () => {
  const cachedTimeline = {
    status: 'ok' as const,
    common_window: { start: '17:30', end: '20:00' },
    optimal_start_time: '18:00',
    optimal_end_time: '19:00',
  }

  vi.mocked(fetchEventTimeline).mockClear()
  vi.mocked(fetchEventTimeline).mockRejectedValue(new Error('should not be called'))

  render(
    <EventTimelinePage
      people={[elena]}
      initialTimeline={cachedTimeline}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  )

  expect(screen.getByText('6:00 PM–7:00 PM')).toBeInTheDocument()
  await waitFor(() => expect(fetchEventTimeline).not.toHaveBeenCalled())
})
