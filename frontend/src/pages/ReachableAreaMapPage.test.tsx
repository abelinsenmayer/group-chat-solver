import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchReachableAreas, type Person, type ReachableAreaResponse } from '../lib/people-api'
import ReachableAreaMapPage from './ReachableAreaMapPage'

const addSource = vi.fn()
const addLayer = vi.fn()
const addImage = vi.fn()
const fitBounds = vi.fn()
const remove = vi.fn()
const markerSetLngLat = vi.fn().mockReturnThis()
const markerSetPopup = vi.fn().mockReturnThis()
const markerAddTo = vi.fn().mockReturnThis()

vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {
      on(event: string, callback: () => void) {
        if (event === 'load') callback()
      }

      addSource = addSource
      addLayer = addLayer
      addImage = addImage
      fitBounds = fitBounds
      remove = remove
    },
    Marker: class {
      setLngLat = markerSetLngLat
      setPopup = markerSetPopup
      addTo = markerAddTo
    },
    Popup: class {
      setText() {
        return this
      }
    },
    LngLatBounds: class {
      extend() {
        return this
      }
    },
  },
}))

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchReachableAreas: vi.fn(),
}))

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: '',
}

const noah: Person = {
  name: 'Noah',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7489, longitude: -73.9751 },
  preferences: '',
}

const area = {
  type: 'Polygon' as const,
  coordinates: [[[-73.99, 40.75], [-73.98, 40.75], [-73.98, 40.76], [-73.99, 40.75]]],
}

const timeline = {
  status: 'ok' as const,
  common_window: { start: '17:30', end: '20:00' },
  optimal_start_time: '18:00',
  optimal_end_time: '19:00',
}

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
  vi.stubGlobal(
    'ImageData',
    class MockImageData {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('shows selected people and map loading placeholders before reachable areas load', () => {
  vi.mocked(fetchReachableAreas).mockReturnValue(new Promise<ReachableAreaResponse>(() => {}))

  render(<ReachableAreaMapPage people={[elena, noah]} timeline={timeline} onBack={vi.fn()} onNext={vi.fn()} />)

  expect(screen.getByText('Elena')).toBeInTheDocument()
  expect(screen.getByText('Noah')).toBeInTheDocument()
  expect(screen.getAllByText('Loading...')).toHaveLength(3)
  expect(screen.getByLabelText('Reachable area map')).toBeInTheDocument()
})

test('loads and plots individual areas plus overlap', async () => {
  vi.mocked(fetchReachableAreas).mockResolvedValue({
    status: 'ok',
    optimal_start_time: '18:00',
    people: [{ person: elena, travel_time_minutes: 30, area }],
    overlap: area,
  })

  render(<ReachableAreaMapPage people={[elena]} timeline={timeline} onBack={vi.fn()} onNext={vi.fn()} />)

  await waitFor(() => expect(addSource).toHaveBeenCalledWith('person-area-0', expect.any(Object)))
  expect(addSource).toHaveBeenCalledWith('overlap-area', expect.any(Object))
  expect(addImage).toHaveBeenCalledWith('overlap-stripes', expect.any(Object))
  expect(markerSetLngLat).toHaveBeenCalledWith([-73.9851, 40.7589])
  expect(fitBounds).toHaveBeenCalled()
  expect(await screen.findByText('Elena')).toBeInTheDocument()
  expect(screen.getByText('Travel time: 30 min')).toBeInTheDocument()
  expect(screen.getByLabelText('Reachable area map')).toBeInTheDocument()
})

test('explains a valid no-overlap response', async () => {
  vi.mocked(fetchReachableAreas).mockResolvedValue({
    status: 'no_common_reachable_area',
    optimal_start_time: '18:00',
    people: [],
    overlap: null,
  })

  render(<ReachableAreaMapPage people={[elena, noah]} timeline={timeline} onBack={vi.fn()} onNext={vi.fn()} />)

  expect(await screen.findByText('No common reachable area for every selected person.')).toBeInTheDocument()
})

test('does not refetch when an initial result is provided', async () => {
  const cachedResult: ReachableAreaResponse = {
    status: 'ok',
    optimal_start_time: '18:00',
    people: [{ person: elena, travel_time_minutes: 30, area }],
    overlap: area,
  }

  vi.mocked(fetchReachableAreas).mockClear()
  vi.mocked(fetchReachableAreas).mockRejectedValue(new Error('should not be called'))

  render(
    <ReachableAreaMapPage
      people={[elena]}
      timeline={timeline}
      initialResult={cachedResult}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  )

  expect(screen.getByText('Travel time: 30 min')).toBeInTheDocument()
  await waitFor(() => expect(fetchReachableAreas).not.toHaveBeenCalled())
})

test('shows a help button that opens an explanation dialog', async () => {
  vi.mocked(fetchReachableAreas).mockResolvedValue({
    status: 'ok',
    optimal_start_time: '18:00',
    people: [{ person: elena, travel_time_minutes: 30, area }],
    overlap: area,
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'Calls `find_reachable_area` for each person.' }))
  const user = userEvent.setup()

  render(<ReachableAreaMapPage people={[elena]} timeline={timeline} onBack={vi.fn()} onNext={vi.fn()} />)
  await waitFor(() => expect(addSource).toHaveBeenCalled())

  const helpButton = screen.getByRole('button', { name: /what's happening here\?/i })
  expect(helpButton).toBeInTheDocument()

  await user.click(helpButton)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(await screen.findByText(/find_reachable_area/i)).toBeInTheDocument()
})
