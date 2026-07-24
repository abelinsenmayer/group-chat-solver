import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchReachableAreas, type Person } from '../lib/people-api'
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

test('loads and plots individual areas plus overlap', async () => {
  vi.mocked(fetchReachableAreas).mockResolvedValue({
    status: 'ok',
    optimal_start_time: '18:00',
    people: [{ person: elena, travel_time_minutes: 30, area }],
    overlap: area,
  })

  render(<ReachableAreaMapPage people={[elena]} onBack={vi.fn()} />)

  await waitFor(() => expect(addSource).toHaveBeenCalledWith('person-area-0', expect.any(Object)))
  expect(addSource).toHaveBeenCalledWith('overlap-area', expect.any(Object))
  expect(addImage).toHaveBeenCalledWith('overlap-stripes', expect.any(Object))
  expect(markerSetLngLat).toHaveBeenCalledWith([-73.9851, 40.7589])
  expect(fitBounds).toHaveBeenCalled()
})

test('explains a valid no-overlap response', async () => {
  vi.mocked(fetchReachableAreas).mockResolvedValue({
    status: 'no_common_reachable_area',
    optimal_start_time: '18:00',
    people: [],
    overlap: null,
  })

  render(<ReachableAreaMapPage people={[elena, noah]} onBack={vi.fn()} />)

  expect(await screen.findByText('No common reachable area for every selected person.')).toBeInTheDocument()
})
