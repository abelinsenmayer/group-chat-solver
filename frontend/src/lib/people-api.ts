export type Person = {
  name: string
  availability: {
    start: string
    end: string
  }
  location: {
    latitude: number
    longitude: number
  }
  preferences: string
}

export type GeoJsonGeometry =
  | {
    type: 'Polygon'
    coordinates: number[][][]
  }
  | {
    type: 'MultiPolygon'
    coordinates: number[][][][]
  }

export type EventTimelineResponse = {
  status: 'ok' | 'no_common_availability'
  common_window: { start: string; end: string } | null
  optimal_start_time: string | null
  optimal_end_time: string | null
}

export type ReachableAreaResult = {
  person: Person
  travel_time_minutes: number
  area: GeoJsonGeometry
}

export type ReachableAreaResponse = {
  status: 'ok' | 'no_common_availability' | 'no_common_reachable_area'
  optimal_start_time: string | null
  people: ReachableAreaResult[]
  overlap: GeoJsonGeometry | null
}

export type SolveRestaurantsResponse = {
  run_id: string
  status: string
}

export type RestaurantSuggestion = {
  id: string
  name: string
  address: string | null
  coordinates: [number, number]
}

export type SolveRestaurantsEvent =
  | { type: 'planner_started'; round: number }
  | { type: 'planner_suggestions'; round: number; suggestions: RestaurantSuggestion[] }
  | { type: 'judge_evaluating'; person: string; suggestion_id: string }
  | {
      type: 'judge_verdict'
      person: string
      suggestion_id: string
      verdict: 'approved' | 'rejected'
      short_reason: string | null
      feedback: string | null
    }
  | { type: 'round_complete'; round: number; accepted_ids: string[] }
  | { type: 'final_result'; status: 'consensus' | 'no_consensus' | 'no_restaurants_found'; suggestions: RestaurantSuggestion[] }
  | { type: 'error'; message: string }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchPeople(signal?: AbortSignal): Promise<Person[]> {
  const response = signal
    ? await fetch(`${apiBaseUrl}/api/people`, { signal })
    : await fetch(`${apiBaseUrl}/api/people`)

  if (!response.ok) {
    throw new Error('Unable to load sample people.')
  }

  return response.json() as Promise<Person[]>
}

export async function fetchEventTimeline(people: Person[], signal?: AbortSignal): Promise<EventTimelineResponse> {
  const response = await fetch(`${apiBaseUrl}/api/event-timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Unable to load event timeline.')
  }

  return response.json() as Promise<EventTimelineResponse>
}

export async function fetchReachableAreas(
  people: Person[],
  eventStartTime?: string,
  signal?: AbortSignal,
): Promise<ReachableAreaResponse> {
  const response = await fetch(`${apiBaseUrl}/api/reachable-areas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people, ...(eventStartTime ? { event_start_time: eventStartTime } : {}) }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Unable to load reachable areas.')
  }

  return response.json() as Promise<ReachableAreaResponse>
}

export async function fetchSolveRestaurants(
  people: Person[],
  overlap: GeoJsonGeometry,
  signal?: AbortSignal,
): Promise<SolveRestaurantsResponse> {
  const response = await fetch(`${apiBaseUrl}/api/solve-restaurants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people, overlap }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Unable to start restaurant solver.')
  }

  return response.json() as Promise<SolveRestaurantsResponse>
}

export function subscribeSolveRestaurantsEvents(
  runId: string,
  onEvent: (event: SolveRestaurantsEvent) => void,
): () => void {
  const source = new EventSource(`${apiBaseUrl}/api/solve-restaurants/${runId}/events`)
  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as SolveRestaurantsEvent)
  }
  return () => source.close()
}
