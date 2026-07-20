import { expect, test, vi } from 'vitest'
import { fetchPeople } from './people-api'

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
