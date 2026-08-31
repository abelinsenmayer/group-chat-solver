import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import mapboxgl from 'mapbox-gl'
import {
  getAddressSuggestions,
  retrieveAddressSuggestion,
  type AddressSuggestion,
} from '@/lib/geocode'
import { LocationPicker } from './LocationPicker'

vi.mock('@/lib/geocode', () => ({
  getAddressSuggestions: vi.fn(),
  retrieveAddressSuggestion: vi.fn(),
}))

vi.mock('mapbox-gl', () => ({
  default: {
    Map: vi.fn(function (this: any, options: unknown) {
      this.options = options
      this.on = vi.fn()
      this.remove = vi.fn()
      this.addControl = vi.fn()
    }),
    Marker: vi.fn(function (this: any, options: { draggable?: boolean }) {
      let lngLat: [number, number] = [0, 0]
      this.options = options
      this.setLngLat = vi.fn((coord: [number, number]) => {
        lngLat = coord
        return this
      })
      this.addTo = vi.fn(() => this)
      this.on = vi.fn((_event: string, _callback: () => void) => this)
      this.getLngLat = vi.fn(() => ({ lng: lngLat[0], lat: lngLat[1] }))
      this.remove = vi.fn()
    }),
    GeolocateControl: vi.fn(function () {}),
  },
}))

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  vi.mocked(getAddressSuggestions).mockReset()
  vi.mocked(retrieveAddressSuggestion).mockReset()
  vi.mocked(mapboxgl.Map).mockClear()
  vi.mocked(mapboxgl.Marker).mockClear()
  Object.defineProperty(navigator, 'geolocation', {
    value: undefined,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function renderPicker(props: Partial<React.ComponentProps<typeof LocationPicker>> = {}) {
  const defaults = {
    latitude: '',
    longitude: '',
    onLocationChange: vi.fn(),
    ...props,
  }
  return { ...render(<LocationPicker {...defaults} />), ...defaults }
}

function lastMarker() {
  const results = vi.mocked(mapboxgl.Marker).mock.results
  return results[results.length - 1]?.value
}

function lastMapOptions() {
  const calls = vi.mocked(mapboxgl.Map).mock.calls
  return calls[calls.length - 1]?.[0]
}

function mockGeolocation(position?: { coords: { latitude: number; longitude: number } }) {
  const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
    setTimeout(() => {
      if (position) {
        success(position as unknown as GeolocationPosition)
      } else if (error) {
        error({ code: 1, message: 'User denied geolocation' } as GeolocationPositionError)
      }
    }, 0)
  })
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    writable: true,
    configurable: true,
  })
  return getCurrentPosition
}

const userLocation = {
  latitude: 40.7128,
  longitude: -74.006,
}

const timesSquare = {
  latitude: 40.7589,
  longitude: -73.9851,
  address: 'Times Square, New York, NY',
}

const timesSquareSuggestion = {
  mapbox_id: 'abc',
  name: 'Times Square',
  full_address: 'Times Square, New York, NY',
} as unknown as AddressSuggestion

describe('LocationPicker address tab', () => {
  test('shows an address input and a find button', () => {
    renderPicker()

    expect(screen.getByLabelText(/address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /find/i })).toBeInTheDocument()
  })

  test('disables Find Address when the input is empty and enables it after typing', async () => {
    const user = userEvent.setup()
    renderPicker()

    const button = screen.getByRole('button', { name: /find/i })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    expect(button).toBeEnabled()
  })

  test('shows suggestions and reports coordinates after the user selects one', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    vi.mocked(retrieveAddressSuggestion).mockResolvedValue(timesSquare)
    const { onLocationChange } = renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /times square/i }))

    await waitFor(() => {
      expect(onLocationChange).toHaveBeenCalledWith({
        latitude: '40.7589',
        longitude: '-73.9851',
      })
    })
    expect(onLocationChange).toHaveBeenCalledTimes(1)
    expect(getAddressSuggestions).toHaveBeenCalledWith('Times Square', undefined, undefined, undefined)
    expect(retrieveAddressSuggestion).toHaveBeenCalledWith(timesSquareSuggestion)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('confirms which address was matched', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    vi.mocked(retrieveAddressSuggestion).mockResolvedValue(timesSquare)
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))
    await user.click(await screen.findByRole('button', { name: /times square/i }))

    expect(await screen.findByText(/times square, new york, ny/i)).toBeInTheDocument()
  })

  test('shows an error when no addresses are found', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([])
    const { onLocationChange } = renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'nowhere abc')
    await user.click(screen.getByRole('button', { name: /find/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no addresses found/i)
    expect(onLocationChange).not.toHaveBeenCalled()
  })

  test('surfaces a network failure distinctly from a missing address', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockRejectedValue(new Error('Network error. Please check your connection.'))
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i)
  })

  test('shows a busy state and blocks repeat lookups while searching', async () => {
    const user = userEvent.setup()
    let resolveLookup: (result: typeof timesSquareSuggestion[]) => void = () => {}
    vi.mocked(getAddressSuggestions).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve
      }),
    )
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))

    const button = screen.getByRole('button', { name: /searching/i })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(getAddressSuggestions).toHaveBeenCalledTimes(1)

    resolveLookup([timesSquareSuggestion])
    await waitFor(() => expect(screen.getByRole('button', { name: /find/i })).toBeDisabled())

    await user.type(screen.getByLabelText('Address'), ' updated')
    await waitFor(() => expect(screen.getByRole('button', { name: /find/i })).toBeEnabled())
  })

  test('looks up the address when Enter is pressed without submitting a surrounding form', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    vi.mocked(retrieveAddressSuggestion).mockResolvedValue(timesSquare)
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <LocationPicker latitude="" longitude="" onLocationChange={vi.fn()} />
      </form>,
    )

    await user.type(screen.getByLabelText(/address/i), 'Times Square{Enter}')

    await waitFor(() =>
      expect(getAddressSuggestions).toHaveBeenCalledWith('Times Square', undefined, undefined, undefined),
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('clears a previous error after a successful lookup', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockRejectedValueOnce(new Error('Network error. Please check your connection.'))
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'nowhere abc')
    await user.click(screen.getByRole('button', { name: /find/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    vi.mocked(retrieveAddressSuggestion).mockResolvedValue(timesSquare)

    await user.clear(screen.getByLabelText(/address/i))
    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))
    await user.click(await screen.findByRole('button', { name: /times square/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  test('shows an error when retrieving the selected suggestion fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    vi.mocked(retrieveAddressSuggestion).mockRejectedValue(new Error('Address search failed. Please try again.'))
    const { onLocationChange } = renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))
    await user.click(await screen.findByRole('button', { name: /times square/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/address search failed/i)
    expect(onLocationChange).not.toHaveBeenCalled()
  })

  test('passes the detected user location as proximity to address suggestions', async () => {
    mockGeolocation({ coords: userLocation })
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))

    await waitFor(() => {
      expect(getAddressSuggestions).toHaveBeenCalledWith(
        'Times Square',
        undefined,
        undefined,
        { latitude: 40.7128, longitude: -74.006 },
      )
    })
  })

  test('does not pass proximity when geolocation is unavailable', async () => {
    mockGeolocation(undefined)
    const user = userEvent.setup()
    vi.mocked(getAddressSuggestions).mockResolvedValue([timesSquareSuggestion])
    renderPicker()

    await user.type(screen.getByLabelText(/address/i), 'Times Square')
    await user.click(screen.getByRole('button', { name: /find/i }))

    await waitFor(() => {
      expect(getAddressSuggestions).toHaveBeenCalledWith('Times Square', undefined, undefined, undefined)
    })
  })
})

describe('LocationPicker map tab', () => {
  test('centers the map and marker on the current coordinates', async () => {
    const user = userEvent.setup()
    renderPicker({ latitude: '40.7589', longitude: '-73.9851' })

    await user.click(screen.getByRole('button', { name: /map/i }))

    await waitFor(() => {
      expect(lastMapOptions()?.center).toEqual([-73.9851, 40.7589])
      const marker = lastMarker()
      expect(marker).toBeDefined()
      expect(marker.setLngLat).toHaveBeenCalledWith([-73.9851, 40.7589])
      expect(marker.options.draggable).toBe(true)
    })
  })

  test('updates coordinates when the marker is dragged', async () => {
    const user = userEvent.setup()
    const { onLocationChange } = renderPicker({
      latitude: '40.7589',
      longitude: '-73.9851',
    })

    await user.click(screen.getByRole('button', { name: /map/i }))
    await waitFor(() => expect(lastMarker()).toBeDefined())

    const marker = lastMarker()
    marker.setLngLat([-74.006, 40.7128])

    const dragend = marker.on.mock.calls.find(([event]: [string]) => event === 'dragend')
    expect(dragend).toBeDefined()
    dragend[1]()

    await waitFor(() => {
      expect(onLocationChange).toHaveBeenCalledWith({
        latitude: '40.7128',
        longitude: '-74.006',
      })
    })
  })

  test('explains when the map cannot be shown without an access token', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')
    const user = userEvent.setup()
    renderPicker({ latitude: '40.7589', longitude: '-73.9851' })

    await user.click(screen.getByRole('button', { name: /map/i }))

    expect(screen.getByText(/map is unavailable/i)).toBeInTheDocument()
    expect(mapboxgl.Map).not.toHaveBeenCalled()
  })

  test('centers the map on the detected user location when no coordinates are provided', async () => {
    mockGeolocation({ coords: userLocation })
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /map/i }))

    await waitFor(() => {
      expect(lastMapOptions()?.center).toEqual([-74.006, 40.7128])
      const marker = lastMarker()
      expect(marker).toBeDefined()
      expect(marker.setLngLat).toHaveBeenCalledWith([-74.006, 40.7128])
    })
  })

  test('prefers parent coordinates over the detected user location for the map center', async () => {
    mockGeolocation({ coords: userLocation })
    const user = userEvent.setup()
    renderPicker({ latitude: '40.7589', longitude: '-73.9851' })

    await user.click(screen.getByRole('button', { name: /map/i }))

    await waitFor(() => {
      expect(lastMapOptions()?.center).toEqual([-73.9851, 40.7589])
      const marker = lastMarker()
      expect(marker.setLngLat).toHaveBeenCalledWith([-73.9851, 40.7589])
    })
  })
})
