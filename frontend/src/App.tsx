import { useCallback, useEffect, useState } from 'react'
import PersonCard from './components/PersonCard'
import { fetchPeople, type Person } from './lib/people-api'

function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadPeople = useCallback(async () => {
    setLoading(true)
    setError(false)

    try {
      setPeople(await fetchPeople())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

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
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-secondary sm:text-4xl">Group Chat "Solver"</h1>
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
          onClick={() => console.log(selectedPeople)}
          className="rounded-md border-2 border-secondary px-5 py-2 font-bold text-secondary transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  )
}

export default App
