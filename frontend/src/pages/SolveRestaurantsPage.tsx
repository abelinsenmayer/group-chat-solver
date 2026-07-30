import { useEffect, useState } from 'react'
import { fetchSolveRestaurants, type GeoJsonGeometry, type Person } from '../lib/people-api'

type SolveRestaurantsPageProps = {
  people: Person[]
  overlap: GeoJsonGeometry
  onBack: () => void
}

export default function SolveRestaurantsPage({ people, overlap, onBack }: SolveRestaurantsPageProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')

    void fetchSolveRestaurants(people, overlap, controller.signal)
      .then(() => {
        setStatus('success')
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [people, overlap])

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background px-6 py-10 text-secondary sm:px-12 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Restaurant Solver</h1>

      <section className="mt-8" aria-live="polite">
        {status === 'loading' && <p>Starting the restaurant solver...</p>}
        {status === 'success' && (
          <p className="rounded-md border-2 border-secondary px-4 py-3 font-medium">
            The restaurant solver has started successfully.
          </p>
        )}
        {status === 'error' && (
          <p className="rounded-md border-2 border-secondary px-4 py-3 font-medium">
            Unable to start the restaurant solver.
          </p>
        )}
      </section>

      <div className="mt-10 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
    </main>
  )
}
