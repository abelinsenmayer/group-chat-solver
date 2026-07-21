import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getPersonAreaColor } from '../lib/person-colors'
import { fetchReachableAreas, type GeoJsonGeometry, type Person, type ReachableAreaResponse } from '../lib/people-api'

type ReachableAreaMapPageProps = {
  people: Person[]
  onBack: () => void
}

function featureCollection(geometry: GeoJsonGeometry) {
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry }],
  }
}

export default function ReachableAreaMapPage({ people, onBack }: ReachableAreaMapPageProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [result, setResult] = useState<ReachableAreaResponse | null>(null)
  const [error, setError] = useState(false)
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

  useEffect(() => {
    let active = true
    setResult(null)
    setError(false)

    void fetchReachableAreas(people)
      .then((response) => {
        if (active) setResult(response)
      })
      .catch(() => {
        if (active) setError(true)
      })

    return () => {
      active = false
    }
  }, [people])

  useEffect(() => {
    if (!accessToken || !mapContainer.current || map.current) return

    mapboxgl.accessToken = accessToken
    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [people[0]?.location.longitude ?? 0, people[0]?.location.latitude ?? 0],
      zoom: 10,
    })
    map.current = instance
    instance.on('load', () => setMapLoaded(true))

    return () => {
      instance.remove()
      map.current = null
    }
  }, [accessToken, people])

  useEffect(() => {
    const instance = map.current
    if (!instance || !mapLoaded || !result) return

    result.people.forEach(({ person, travel_time_minutes: travelTimeMinutes, area }, index) => {
      const color = getPersonAreaColor(index)
      const sourceId = `person-area-${index}`
      instance.addSource(sourceId, { type: 'geojson', data: featureCollection(area) })
      instance.addLayer({
        id: `person-area-fill-${index}`,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': color, 'fill-opacity': 0.28 },
      })
      instance.addLayer({
        id: `person-area-line-${index}`,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': color, 'line-width': 2 },
      })
      new mapboxgl.Marker({ color })
        .setLngLat([person.location.longitude, person.location.latitude])
        .setPopup(new mapboxgl.Popup().setText(`${person.name}: ${travelTimeMinutes} minutes`))
        .addTo(instance)
    })

    if (result.overlap) {
      instance.addSource('overlap-area', { type: 'geojson', data: featureCollection(result.overlap) })
      instance.addLayer({
        id: 'overlap-fill',
        type: 'fill',
        source: 'overlap-area',
        paint: { 'fill-color': '#303841', 'fill-opacity': 0.36 },
      })
      instance.addLayer({
        id: 'overlap-line',
        type: 'line',
        source: 'overlap-area',
        paint: { 'line-color': '#303841', 'line-width': 3 },
      })
    }

    const bounds = new mapboxgl.LngLatBounds()
    people.forEach((person) => bounds.extend([person.location.longitude, person.location.latitude]))
    instance.fitBounds(bounds, { padding: 80, maxZoom: 12 })
  }, [mapLoaded, people, result])

  const statusMessage = result?.status === 'no_common_availability'
    ? 'No common availability for every selected person.'
    : result?.status === 'no_common_reachable_area'
      ? 'No common reachable area for every selected person.'
      : null

  return (
    <main className="flex min-h-screen flex-col bg-background text-secondary">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-12">
        <div>
          <h1 className="text-3xl font-bold">Reachable Area Map</h1>
          {result?.optimal_start_time && <p className="mt-1">Suggested start time: {result.optimal_start_time}</p>}
        </div>
        <button type="button" onClick={onBack} className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary">Back</button>
      </header>
      <section className="px-6 pb-4 sm:px-12" aria-live="polite">
        {!accessToken && <p>Mapbox access token is not configured.</p>}
        {error && <p>Unable to load reachable areas.</p>}
        {statusMessage && <p>{statusMessage}</p>}
      </section>
      {accessToken && <div ref={mapContainer} className="min-h-125 flex-1" aria-label="Reachable area map" />}
    </main>
  )
}
