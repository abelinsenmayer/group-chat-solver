import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getAddressSuggestions, retrieveAddressSuggestion, type AddressSuggestion } from '@/lib/geocode'

export type PickedLocation = {
  latitude: string
  longitude: string
}

export interface LocationPickerProps {
  latitude: string
  longitude: string
  // Latitude and longitude are reported together: a coordinate is only meaningful as a pair, and
  // two separate callbacks would let a parent that derives state from the previous value clobber
  // one half of the update.
  onLocationChange: (location: PickedLocation) => void
}

function coordinateToLngLat(latitude: string, longitude: string): [number, number] {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return [Number.isFinite(lng) ? lng : 0, Number.isFinite(lat) ? lat : 0]
}

type UserLocation = {
  latitude: number
  longitude: number
}

function useUserLocation(): UserLocation | undefined {
  const [location, setLocation] = useState<UserLocation | undefined>()

  useEffect(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        // Ignore errors and denials — existing defaults take over.
        console.log("unable to find the user's location:")
      },
      {
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }, [])

  return location
}

function AddressPicker({
  onLocationChange,
  userLocation,
}: Pick<LocationPickerProps, 'onLocationChange'> & { userLocation?: UserLocation }) {
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [matchedAddress, setMatchedAddress] = useState<string | undefined>()
  const [suggestions, setSuggestions] = useState<AddressSuggestion[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [addressChanged, setAddressChanged] = useState(false);
  // `isSearching` lags behind by a render, so a ref guards against a second lookup being started
  // from the keyboard before the button becomes disabled.
  const inFlightRef = useRef(false)

  async function handleFind() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsSearching(true)
    setError(undefined)
    setMatchedAddress(undefined)
    setSuggestions(null)
    setAddressChanged(false)

    try {
      const results = await getAddressSuggestions(address, undefined, undefined, userLocation)
      if (results.length === 0) {
        setError('No addresses found. Try a more specific address.')
      } else {
        setSuggestions(results)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address search failed. Please try again.')
    } finally {
      inFlightRef.current = false
      setIsSearching(false)
    }
  }

  async function handleSelect(suggestion: AddressSuggestion) {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setError(undefined)

    try {
      const result = await retrieveAddressSuggestion(suggestion)
      onLocationChange({
        latitude: String(result.latitude),
        longitude: String(result.longitude),
      })
      setMatchedAddress(result.address)
      setSuggestions(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address search failed. Please try again.')
    } finally {
      inFlightRef.current = false
    }
  }

  // The picker is rendered inside the Add Person form, so Enter must not bubble up and submit it.
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void handleFind()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="location-address" className="text-sm font-bold text-secondary">
          Address
        </Label>
        <Input
          id="location-address"
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setAddressChanged(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 1 Times Square, New York"
          aria-invalid={!!error}
          aria-describedby={error ? 'location-address-error' : undefined}
          className="border-2 border-secondary/50 bg-background text-secondary focus-visible:border-secondary"
        />
        {error && (
          <p id="location-address-error" role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <p className="text-xs text-secondary/70" aria-live="polite">
          {matchedAddress ? `Using ${matchedAddress}` : ''}
        </p>
      </div>
      <Button
        type="button"
        onClick={handleFind}
        disabled={isSearching || !address.trim() || !addressChanged}
        className="bg-secondary text-background hover:bg-secondary/80 disabled:opacity-50"
      >
        {isSearching ? 'Searching...' : 'Find Address'}
      </Button>
      {suggestions && suggestions.length > 0 && (
        <ul className="flex flex-col gap-1" role="listbox" aria-label="Address suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion.mapbox_id}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSelect(suggestion)}
                disabled={isSearching}
                className="h-auto w-full justify-start py-2 px-3 text-left"
              >
                <div className="flex flex-col gap-0.5 max-w-full">
                  <span className="font-medium">{suggestion.name}</span>
                  {suggestion.full_address && (
                    <span className="text-xs text-secondary/70 text-wrap">{suggestion.full_address}</span>
                  )}
                </div>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MapPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  // The dragend handler is registered once but must always call the latest prop.
  const onLocationChangeRef = useRef(onLocationChange)
  onLocationChangeRef.current = onLocationChange

  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

  // Deliberately runs once per mount: the map and marker are imperative objects that own their own
  // state. Re-running on latitude/longitude changes would tear down the map underneath the user
  // every time dragging the marker reported a new coordinate. Switching tabs remounts this
  // component, which is when the marker picks up coordinates set on the address tab.
  useEffect(() => {
    if (!accessToken || !mapContainerRef.current) return

    const center = coordinateToLngLat(latitude, longitude)

    const map = new mapboxgl.Map({
      accessToken,
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      center,
      zoom: 13,
    })

    const marker = new mapboxgl.Marker({ draggable: true }).setLngLat(center).addTo(map)

    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat()
      onLocationChangeRef.current({ latitude: String(lat), longitude: String(lng) })
    })

    return () => {
      marker.remove()
      map.remove()
    }
  }, [])

  if (!accessToken) {
    return <p className="text-sm text-secondary/70">Map is unavailable: no Mapbox access token is configured.</p>
  }

  return <div ref={mapContainerRef} className="w-full h-96" aria-label="Location picker map" />
}

function Tab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2 rounded-t-md ${
        active ? 'bg-secondary text-background' : 'bg-background text-secondary'
      }`}
    >
      {children}
    </button>
  )
}

export function LocationPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const [activeTab, setActiveTab] = useState<'address' | 'map'>('address')
  const userLocation = useUserLocation()

  const mapLatitude = latitude || (userLocation ? String(userLocation.latitude) : '')
  const mapLongitude = longitude || (userLocation ? String(userLocation.longitude) : '')

  return (
    <section className="w-full">
      <div id="tabs">
        <Tab active={activeTab === 'address'} onClick={() => setActiveTab('address')}>
          Address
        </Tab>
        <Tab active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
          Map
        </Tab>
      </div>
      <div
        id="picker-content"
        className="p-2 border-2 border-secondary/50 bg-background text-secondary focus-visible:border-secondary rounded-b-md rounded-r-md"
      >
        {activeTab === 'address' ? (
          <AddressPicker onLocationChange={onLocationChange} userLocation={userLocation} />
        ) : (
          <MapPicker
            latitude={mapLatitude}
            longitude={mapLongitude}
            onLocationChange={onLocationChange}
          />
        )}
      </div>
    </section>
  )
}
