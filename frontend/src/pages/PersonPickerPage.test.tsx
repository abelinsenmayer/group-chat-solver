import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { fetchPeople, type Person } from '../lib/people-api'
import PersonPickerPage from './PersonPickerPage'

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchPeople: vi.fn(),
}))

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

test('does not refetch when initial people are provided', async () => {
  vi.mocked(fetchPeople).mockRejectedValue(new Error('should not be called'))

  render(<PersonPickerPage initialPeople={[elena]} onNext={vi.fn()} />)

  expect(screen.getByRole('button', { name: /elena/i })).toBeInTheDocument()
  expect(screen.queryByText('Loading sample people...')).not.toBeInTheDocument()
  await waitFor(() => expect(fetchPeople).not.toHaveBeenCalled())
})
