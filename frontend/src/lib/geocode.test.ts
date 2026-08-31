import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SearchBoxCore } from '@mapbox/search-js-core'
import {
  geocodeAddress,
  getAddressSuggestions,
  retrieveAddressSuggestion,
  resetGeocodeSession,
  type AddressSuggestion,
} from './geocode'

const suggest = vi.fn()
const retrieve = vi.fn()

vi.mock('@mapbox/search-js-core', () => {
  class MockMapboxError extends Error {
    statusCode: number
    constructor(statusCode: number) {
      super(`status ${statusCode}`)
      this.statusCode = statusCode
    }
  }
  let tokenCounter = 0
  return {
    SearchBoxCore: vi.fn(function (this: any, options: { accessToken: string }) {
      this.accessToken = options.accessToken
      this.suggest = suggest
      this.retrieve = retrieve
    }),
    SessionToken: vi.fn(function (this: any) {
      tokenCounter += 1
      this.id = `session-${tokenCounter}`
      this.toString = () => this.id
    }),
    MapboxError: MockMapboxError,
  }
})

const timesSquare = {
  name: 'Times Square',
  mapbox_id: 'abc',
} as unknown as AddressSuggestion

function retrieveResponse(coordinates: [number, number], fullAddress: string) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: { full_address: fullAddress, name: 'Times Square' },
      },
    ],
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  suggest.mockReset()
  retrieve.mockReset()
  vi.mocked(SearchBoxCore).mockClear()
  resetGeocodeSession()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('returns the coordinates and formatted address of the top suggestion', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue(retrieveResponse([-73.9851, 40.7589], 'Times Square, New York, NY'))

  const result = await geocodeAddress('Times Square')

  expect(result).toEqual({
    latitude: 40.7589,
    longitude: -73.9851,
    address: 'Times Square, New York, NY',
  })
  expect(suggest).toHaveBeenCalledWith('Times Square', expect.objectContaining({ limit: 1 }))
})

test('uses one session token for both the suggest and retrieve call', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue(retrieveResponse([-73.9851, 40.7589], 'Times Square'))

  await geocodeAddress('Times Square')

  const suggestToken = String(suggest.mock.calls[0][1].sessionToken)
  const retrieveToken = String(retrieve.mock.calls[0][1].sessionToken)
  expect(suggestToken).toBe(retrieveToken)
})

test('starts a new session token for the next lookup after a successful retrieve', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue(retrieveResponse([-73.9851, 40.7589], 'Times Square'))

  await geocodeAddress('Times Square')
  await geocodeAddress('Central Park')

  const firstToken = String(suggest.mock.calls[0][1].sessionToken)
  const secondToken = String(suggest.mock.calls[1][1].sessionToken)
  expect(secondToken).not.toBe(firstToken)
})

test('keeps the session token when no suggestion was retrieved', async () => {
  suggest.mockResolvedValue({ suggestions: [] })

  await expect(geocodeAddress('nowhere abc')).rejects.toThrow(/address not found/i)
  await expect(geocodeAddress('nowhere abcd')).rejects.toThrow(/address not found/i)

  const firstToken = String(suggest.mock.calls[0][1].sessionToken)
  const secondToken = String(suggest.mock.calls[1][1].sessionToken)
  expect(secondToken).toBe(firstToken)
})

test('throws an address-not-found error when there are no suggestions', async () => {
  suggest.mockResolvedValue({ suggestions: [] })

  await expect(geocodeAddress('nowhere abc')).rejects.toThrow(/address not found/i)
  expect(retrieve).not.toHaveBeenCalled()
})

test('throws an address-not-found error when retrieve returns no features', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue({ type: 'FeatureCollection', features: [] })

  await expect(geocodeAddress('Times Square')).rejects.toThrow(/address not found/i)
})

test('reports a rate limit error distinctly', async () => {
  const { MapboxError } = await import('@mapbox/search-js-core')
  suggest.mockRejectedValue(new (MapboxError as any)(429))

  await expect(geocodeAddress('Times Square')).rejects.toThrow(/too many/i)
})

test('reports a configuration error when the token is rejected', async () => {
  const { MapboxError } = await import('@mapbox/search-js-core')
  suggest.mockRejectedValue(new (MapboxError as any)(401))

  await expect(geocodeAddress('Times Square')).rejects.toThrow(/unavailable/i)
})

test('reports a network error when the request fails to reach mapbox', async () => {
  suggest.mockRejectedValue(new TypeError('Failed to fetch'))

  await expect(geocodeAddress('Times Square')).rejects.toThrow(/network/i)
})

test('reports an unavailable error when no access token is configured', async () => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')

  await expect(geocodeAddress('Times Square')).rejects.toThrow(/unavailable/i)
  expect(suggest).not.toHaveBeenCalled()
})

test('rejects a blank address without calling mapbox', async () => {
  await expect(geocodeAddress('   ')).rejects.toThrow(/enter an address/i)
  expect(suggest).not.toHaveBeenCalled()
})

test('forwards an abort signal to the suggest request', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue(retrieveResponse([-73.9851, 40.7589], 'Times Square'))
  const controller = new AbortController()

  await geocodeAddress('Times Square', controller.signal)

  expect(suggest).toHaveBeenCalledWith(
    'Times Square',
    expect.objectContaining({ signal: controller.signal }),
  )
})

test('getAddressSuggestions returns suggestions without calling retrieve', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })

  const result = await getAddressSuggestions('Times Square')

  expect(result).toEqual([timesSquare])
  expect(suggest).toHaveBeenCalledWith(
    'Times Square',
    expect.objectContaining({ limit: 3 }),
  )
  expect(retrieve).not.toHaveBeenCalled()
})

test('getAddressSuggestions forwards a proximity location to suggest as { lng, lat }', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })

  await getAddressSuggestions('Times Square', undefined, 3, {
    latitude: 40.7128,
    longitude: -74.006,
  })

  expect(suggest).toHaveBeenCalledWith(
    'Times Square',
    expect.objectContaining({
      proximity: { lng: -74.006, lat: 40.7128 },
    }),
  )
})

test('getAddressSuggestions does not include proximity when none is supplied', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })

  await getAddressSuggestions('Times Square')

  expect(suggest).toHaveBeenCalledWith(
    'Times Square',
    expect.not.objectContaining({ proximity: expect.anything() }),
  )
})

test('retrieveAddressSuggestion uses the same session token and resets the session', async () => {
  suggest.mockResolvedValue({ suggestions: [timesSquare] })
  retrieve.mockResolvedValue(retrieveResponse([-73.9851, 40.7589], 'Times Square, New York, NY'))

  await getAddressSuggestions('Times Square')
  const suggestToken = String(suggest.mock.calls[0][1].sessionToken)

  const result = await retrieveAddressSuggestion(timesSquare)

  expect(result).toEqual({
    latitude: 40.7589,
    longitude: -73.9851,
    address: 'Times Square, New York, NY',
  })
  expect(retrieve).toHaveBeenCalledWith(
    timesSquare,
    expect.objectContaining({ sessionToken: expect.objectContaining({ id: suggestToken }) }),
  )

  await getAddressSuggestions('Central Park')
  const secondToken = String(suggest.mock.calls[1][1].sessionToken)
  expect(secondToken).not.toBe(suggestToken)
})

test('retrieveAddressSuggestion requires an active session token', async () => {
  resetGeocodeSession()

  await expect(retrieveAddressSuggestion(timesSquare)).rejects.toThrow(/session expired/i)
})
