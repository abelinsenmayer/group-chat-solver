import { useEffect, useRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { CircleUserRound } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import WhatsHappeningHere from '../components/WhatsHappeningHere'
import { getPersonAreaColor } from '../lib/person-colors'
import { fetchReachableAreas, type EventTimelineResponse, type GeoJsonGeometry, type Person, type ReachableAreaResponse } from '../lib/people-api'

type ReachableAreaMapPageProps = {
  people: Person[]
  timeline: EventTimelineResponse
  onBack: () => void
  onNext: (overlap: GeoJsonGeometry) => void
  initialResult?: ReachableAreaResponse | null
  onResultLoaded?: (result: ReachableAreaResponse) => void
}

function featureCollection(geometry: GeoJsonGeometry) {
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry }],
  }
}

function extendBoundsWithGeometry(bounds: mapboxgl.LngLatBounds, geometry: GeoJsonGeometry) {
  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring) => {
      ring.forEach((coord) => bounds.extend(coord as [number, number]))
    })
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coord) => bounds.extend(coord as [number, number]))
      })
    })
  }
}

function createStripePattern(size = 16): ImageData | null {
  if (typeof ImageData === 'undefined') return null

  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isBackground = (x + y) % 8 < 4
      const offset = (y * size + x) * 4
      data[offset] = isBackground ? 255 : 221
      data[offset + 1] = isBackground ? 255 : 221
      data[offset + 2] = isBackground ? 255 : 221
      data[offset + 3] = 255
    }
  }
  return new ImageData(data, size, size)
}

function createPersonMarkerElement(name: string, color: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = 'column'
  wrapper.style.alignItems = 'center'
  wrapper.style.pointerEvents = 'auto'
  wrapper.setAttribute('aria-label', `${name} location`)

  const personSvg = renderToString(<CircleUserRound className="bg-background rounded-full" color={color} size={28} strokeWidth={2} />)
  wrapper.innerHTML = `
    <div style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25)); line-height: 0;">
      ${personSvg}
    </div>
    <span style="color:${color}; font-size:12px; font-weight:700; text-shadow: -1px 0 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, 0 1px 0 #fff; white-space: nowrap; margin-top: -2px;">${name}</span>
  `
  return wrapper
}

export default function ReachableAreaMapPage({ people, timeline, onBack, onNext, initialResult = null, onResultLoaded }: ReachableAreaMapPageProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [result, setResult] = useState<ReachableAreaResponse | null>(initialResult)
  const [error, setError] = useState(false)
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

  useEffect(() => {
    if (result) return
    const controller = new AbortController()
    setResult(null)
    setError(false)

    void fetchReachableAreas(people, timeline.optimal_start_time ?? undefined, controller.signal)
      .then((response) => {
        setResult(response)
        onResultLoaded?.(response)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(true)
      })

    return () => {
      controller.abort()
    }
  }, [people, timeline.optimal_start_time, result, onResultLoaded])

  useEffect(() => {
    if (!accessToken || !mapContainer.current || map.current || !result) return

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
  }, [accessToken, people, result])

  useEffect(() => {
    const instance = map.current
    if (!instance || !mapLoaded || !result) return

    const overlapPattern = createStripePattern()
    if (overlapPattern) {
      instance.addImage('overlap-stripes', overlapPattern)
    }

    result.people.forEach(({ person, area }, index) => {
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
      const markerElement = createPersonMarkerElement(person.name, color)
      new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([person.location.longitude, person.location.latitude])
        .addTo(instance)
    })

    if (result.overlap) {
      instance.addSource('overlap-area', { type: 'geojson', data: featureCollection(result.overlap) })
      const overlapFillPaint = overlapPattern
        ? { 'fill-pattern': 'overlap-stripes', 'fill-opacity': 0.4 }
        : { 'fill-color': '#FFFFFF', 'fill-opacity': 0.45 }
      instance.addLayer({
        id: 'overlap-fill',
        type: 'fill',
        source: 'overlap-area',
        paint: overlapFillPaint,
      })
      instance.addLayer({
        id: 'overlap-line',
        type: 'line',
        source: 'overlap-area',
        paint: { 'line-color': '#FFFFFF', 'line-width': 2 },
      })
    }

    const bounds = new mapboxgl.LngLatBounds()
    let hasCoordinate = false
    const extend = (coord: [number, number]) => {
      bounds.extend(coord)
      hasCoordinate = true
    }

    people.forEach((person) => {
      extend([person.location.longitude, person.location.latitude])
    })
    result.people.forEach(({ area }) => extendBoundsWithGeometry(bounds, area))
    if (result.overlap) extendBoundsWithGeometry(bounds, result.overlap)

    if (hasCoordinate) {
      instance.fitBounds(bounds, { padding: 80, maxZoom: 15 })
    }
  }, [mapLoaded, people, result])

  const statusMessage = people.length <= 1 
    ? null 
    : result?.status === 'no_common_availability'
      ? 'No common availability for every selected person.'
      : result?.status === 'no_common_reachable_area'
        ? 'No common reachable area for every selected person.'
        : null
  const legendPeople = result
    ? result.people.map(({ person, travel_time_minutes }) => ({ person, travelTimeMinutes: travel_time_minutes }))
    : people.map((person) => ({ person, travelTimeMinutes: null }))

  return (
    <main className="flex min-h-screen flex-col bg-background text-secondary">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-12">
        <div>
          <h1 className="text-3xl font-bold">Where can everyone meet?</h1>
          {/* {timeline.optimal_start_time && timeline.optimal_end_time && <p className="mt-1">Suggested event time: {timeline.optimal_start_time}–{timeline.optimal_end_time}</p>} */}
          <p>Here we show the areas reachable by each person in their available travel time. The area in white is the overlapping area reachable by all participants -- this is where we'll search for a meeting spot.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full">
          <WhatsHappeningHere title="Reachable Area Map" docFile="reachable-area-map.md" />
          <button type="button" onClick={onBack} className="ml-auto rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary">Back</button>
          <button
            type="button"
            disabled={!result?.overlap}
            onClick={() => result?.overlap && onNext(result.overlap)}
            className="rounded-md border-2 border-secondary px-4 py-2 font-bold transition hover:bg-secondary hover:text-background focus-visible:outline-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-secondary"
          >
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>
      <section className="px-6 pb-4 sm:px-12" aria-live="polite">
        {!accessToken && <p>Mapbox access token is not configured.</p>}
        {error && <p>Unable to load reachable areas.</p>}
        {statusMessage && <p>{statusMessage}</p>}
      </section>
      {accessToken && (
        <section className="mx-auto grid w-full max-w-5xl items-center gap-8 px-6 pb-10 sm:grid-cols-[12rem_minmax(0,1fr)] sm:px-12" aria-label="Reachable area details">
          <div className="space-y-8">
            {legendPeople.map(({ person, travelTimeMinutes }, index) => {
              const color = getPersonAreaColor(index)
              return (
                <div key={person.name} className="flex items-center gap-3">
                  <CircleUserRound className="shrink-0 rounded-full bg-background" color={color} size={34} strokeWidth={2} />
                  <div>
                    <p className="font-bold">{person.name}</p>
                    <p className="text-sm">{travelTimeMinutes === null ? 'Loading...' : `Travel time: ${travelTimeMinutes} min`}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-secondary">
            <div ref={mapContainer} className="h-full w-full" aria-label="Reachable area map" />
            {!mapLoaded && <p className="absolute inset-0 grid place-items-center bg-background">Loading...</p>}
          </div>
        </section>
      )}
    </main>
  )
}
