import {
  MapboxError,
  SearchBoxCore,
  SessionToken,
  type SearchBoxSuggestion,
} from '@mapbox/search-js-core'

export type GeocodeResult = {
  latitude: number
  longitude: number
  address: string
}

export type AddressSuggestion = SearchBoxSuggestion

// A Search Box API "session" is one or more suggest calls followed by a single retrieve, and is
// billed as a unit. We therefore hold the token across calls and only roll it over once a retrieve
// has actually happened: retrying after a not-found result reuses the session instead of paying
// for a new one.
let sessionToken: SessionToken | null = null

export function resetGeocodeSession() {
  sessionToken = null
}

function messageForError(error: unknown): string {
  if (error instanceof MapboxError) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'Address search is unavailable.'
    if (error.statusCode === 429) return 'Too many searches. Please wait a moment and try again.'
    return 'Address search failed. Please try again.'
  }
  return 'Network error. Please check your connection.'
}

function getAccessToken(): string {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!accessToken) throw new Error('Address search is unavailable.')
  return accessToken
}

function newSearchBoxCore(): SearchBoxCore {
  return new SearchBoxCore({ accessToken: getAccessToken() })
}

export async function getAddressSuggestions(
  address: string,
  signal?: AbortSignal,
  limit = 3,
  proximity?: { latitude: number; longitude: number },
): Promise<AddressSuggestion[]> {
  const query = address.trim()
  if (!query) throw new Error('Please enter an address.')

  const search = newSearchBoxCore()
  sessionToken ??= new SessionToken()

  try {
    const { suggestions } = await search.suggest(query, {
      sessionToken,
      signal,
      limit,
      ...(proximity && {
        proximity: { lng: proximity.longitude, lat: proximity.latitude },
      }),
    })
    return suggestions ?? []
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(messageForError(error))
  }
}

export async function retrieveAddressSuggestion(
  suggestion: AddressSuggestion,
  signal?: AbortSignal,
): Promise<GeocodeResult> {
  const search = newSearchBoxCore()
  if (!sessionToken) throw new Error('Session expired. Please search again.')

  let feature
  try {
    const { features } = await search.retrieve(suggestion, { sessionToken, signal })
    feature = features?.[0]
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(messageForError(error))
  }

  if (!feature) throw new Error('Address not found. Try a more specific address.')

  // The session is complete once a feature has been retrieved, so the next lookup starts a new one.
  sessionToken = null

  const [longitude, latitude] = feature.geometry.coordinates
  return {
    latitude,
    longitude,
    address: feature.properties.full_address || feature.properties.name || suggestion.name,
  }
}

export async function geocodeAddress(address: string, signal?: AbortSignal): Promise<GeocodeResult> {
  const suggestions = await getAddressSuggestions(address, signal, 1)
  const suggestion = suggestions[0]
  if (!suggestion) throw new Error('Address not found. Try a more specific address.')
  return retrieveAddressSuggestion(suggestion, signal)
}
