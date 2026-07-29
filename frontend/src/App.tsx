import { useState } from 'react'
import type { EventTimelineResponse, GeoJsonGeometry, Person } from './lib/people-api'
import PersonPickerPage from './pages/PersonPickerPage'
import EventTimelinePage from './pages/EventTimelinePage'
import ReachableAreaMapPage from './pages/ReachableAreaMapPage'
import MeetTheAgentsPage from './pages/MeetTheAgentsPage'
import SolveRestaurantsPage from './pages/SolveRestaurantsPage'

function App() {
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([])
  const [timeline, setTimeline] = useState<EventTimelineResponse | null>(null)
  const [overlap, setOverlap] = useState<GeoJsonGeometry | null>(null)
  const [page, setPage] = useState<'picker' | 'timeline' | 'map' | 'agents' | 'solve-restaurants'>('picker')

  if (page === 'solve-restaurants' && overlap) {
    return <SolveRestaurantsPage people={selectedPeople} overlap={overlap} onBack={() => setPage('agents')} />
  }

  if (page === 'agents') {
    return <MeetTheAgentsPage people={selectedPeople} onBack={() => setPage('map')} onNext={() => setPage('solve-restaurants')} />
  }

  if (page === 'map' && timeline) {
    return (
      <ReachableAreaMapPage
        people={selectedPeople}
        timeline={timeline}
        onBack={() => setPage('timeline')}
        onNext={(nextOverlap) => {
          setOverlap(nextOverlap)
          setPage('agents')
        }}
      />
    )
  }

  if (page === 'timeline') {
    return (
      <EventTimelinePage
        people={selectedPeople}
        onBack={() => setPage('picker')}
        onNext={(result) => {
          setTimeline(result)
          setPage('map')
        }}
      />
    )
  }

  return (
    <PersonPickerPage
      onNext={(people) => {
        setSelectedPeople(people)
        setTimeline(null)
        setOverlap(null)
        setPage('timeline')
      }}
    />
  )
}

export default App
