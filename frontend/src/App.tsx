import { useState } from 'react'
import type { EventTimelineResponse, Person } from './lib/people-api'
import PersonPickerPage from './pages/PersonPickerPage'
import EventTimelinePage from './pages/EventTimelinePage'
import ReachableAreaMapPage from './pages/ReachableAreaMapPage'
import MeetTheAgentsPage from './pages/MeetTheAgentsPage'

function App() {
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([])
  const [timeline, setTimeline] = useState<EventTimelineResponse | null>(null)
  const [page, setPage] = useState<'picker' | 'timeline' | 'map' | 'agents'>('picker')

  if (page === 'agents') {
    return <MeetTheAgentsPage people={selectedPeople} onBack={() => setPage('map')} onNext={() => {}} />
  }

  if (page === 'map' && timeline) {
    return <ReachableAreaMapPage people={selectedPeople} timeline={timeline} onBack={() => setPage('timeline')} onNext={() => setPage('agents')} />
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
