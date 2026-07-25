import { useState } from 'react'
import type { EventTimelineResponse, Person } from './lib/people-api'
import PersonPickerPage from './pages/PersonPickerPage'
import EventTimelinePage from './pages/EventTimelinePage'
import ReachableAreaMapPage from './pages/ReachableAreaMapPage'

function App() {
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([])
  const [timeline, setTimeline] = useState<EventTimelineResponse | null>(null)
  const [page, setPage] = useState<'picker' | 'timeline' | 'map'>('picker')

  if (page === 'map' && timeline) {
    return <ReachableAreaMapPage people={selectedPeople} timeline={timeline} onBack={() => setPage('timeline')} />
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
        setPage('timeline')
      }}
    />
  )
}

export default App
