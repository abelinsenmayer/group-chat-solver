import { useState } from 'react'
import type { Person } from './lib/people-api'
import PersonPickerPage from './pages/PersonPickerPage'
import ReachableAreaMapPage from './pages/ReachableAreaMapPage'

function App() {
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([])
  const [page, setPage] = useState<'picker' | 'map'>('picker')

  if (page === 'map') {
    return <ReachableAreaMapPage people={selectedPeople} onBack={() => setPage('picker')} />
  }

  return (
    <PersonPickerPage
      onNext={(people) => {
        setSelectedPeople(people)
        setPage('map')
      }}
    />
  )
}

export default App
