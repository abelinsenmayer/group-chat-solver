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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchPeople(): Promise<Person[]> {
  const response = await fetch(`${apiBaseUrl}/api/people`)

  if (!response.ok) {
    throw new Error('Unable to load sample people.')
  }

  return response.json() as Promise<Person[]>
}
