import { expect, test, vi } from 'vitest'
import { fetchEventTimeline, fetchPeople, fetchReachableAreas, type Person } from './people-api'

test('requests people from the configured API endpoint', async () => {
  const people = [{
    name: 'Elena',
    availability: { start: '17:30', end: '20:00' },
    location: { latitude: 40.7589, longitude: -73.9851 },
    preferences: 'Outdoor seating preferred',
  }]
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => people })
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchPeople()).resolves.toEqual(people)
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/api/people')
})

test('forwards an abort signal to the people endpoint request', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()

  await fetchPeople(controller.signal)

  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/api/people', { signal: controller.signal })
})

test('posts selected people to the event timeline endpoint', async () => {
  const people: Person[] = [{
    name: 'Elena',
    availability: { start: '17:30', end: '20:00' },
    location: { latitude: 40.7589, longitude: -73.9851 },
    preferences: '',
  }]
  const response = {
    status: 'ok',
    common_window: { start: '17:30', end: '20:00' },
    optimal_start_time: '18:00',
    optimal_end_time: '19:00',
  }
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchEventTimeline(people)).resolves.toEqual(response)
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/api/event-timeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people }),
    signal: undefined,
  })
})

test('posts selected people to the reachable areas endpoint', async () => {
  const people: Person[] = [{
    name: 'Elena',
    availability: { start: '17:30', end: '20:00' },
    location: { latitude: 40.7589, longitude: -73.9851 },
    preferences: 'Outdoor seating preferred',
  }]
  const response = { status: 'ok', optimal_start_time: '18:00', people: [], overlap: null }
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchReachableAreas(people)).resolves.toEqual(response)
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/api/reachable-areas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people }),
    signal: undefined,
  })
})
