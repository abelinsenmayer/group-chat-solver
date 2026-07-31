import { useCallback, useEffect, useState } from 'react'
import PersonCard from '../components/PersonCard'
import { fetchPeople, type Person } from '../lib/people-api'

type PersonPickerPageProps = {
  onNext: (people: Person[]) => void
  initialPeople?: Person[]
  onPeopleLoaded?: (people: Person[]) => void
}

export default function PersonPickerPage({ onNext, initialPeople, onPeopleLoaded }: PersonPickerPageProps) {
  const [people, setPeople] = useState<Person[]>(initialPeople ?? [])
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(initialPeople === undefined)
  const [error, setError] = useState(false)

  const loadPeople = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(false)

    try {
      const fetched = await fetchPeople(signal)
      setPeople(fetched)
      onPeopleLoaded?.(fetched)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [onPeopleLoaded])

  useEffect(() => {
    if (initialPeople !== undefined) return
    const controller = new AbortController()
    void loadPeople(controller.signal)
    return () => controller.abort()
  }, [loadPeople, initialPeople])

  const togglePerson = (name: string) => {
    setSelectedNames((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const selectedPeople = people.filter((person) => selectedNames.has(person.name))

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
      <header className="mx-auto max-w-2xl flex flex-col items-center justify-center">
        <div className="">
          <p className="text-sm text-secondary text-start">Abe Linsenmayer's</p>
          <h1 className="text-3xl font-bold tracking-tight text-secondary sm:text-4xl">Group Chat "Solver"</h1>
        </div>
        <p className="mt-14 text-base text-secondary">Choose the people you want to include in this simulation.</p>
      </header>

      <section className="mt-16" aria-label="Sample people">
        {loading && <p className="text-center text-secondary">Loading sample people...</p>}

        {error && (
          <div className="text-center text-secondary">
            <p>Unable to load sample people.</p>
            <button
              type="button"
              onClick={() => void loadPeople()}
              className="mt-4 rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && people.length === 0 && (
          <p className="text-center text-secondary">No sample people are available.</p>
        )}

        {!loading && !error && people.length > 0 && (
          <div className="flex flex-wrap justify-center gap-5">
            {people.map((person) => (
              <PersonCard
                key={person.name}
                person={person}
                selected={selectedNames.has(person.name)}
                onToggle={() => togglePerson(person.name)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          disabled={selectedPeople.length === 0}
          onClick={() => onNext(selectedPeople)}
          className="rounded-md border-2 border-secondary px-5 py-2 font-bold text-secondary transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-secondary"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  )
}
