import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import {
  getAddressSuggestions,
  retrieveAddressSuggestion,
  type AddressSuggestion,
} from '@/lib/geocode'
import { fetchPeople, type Person } from '../lib/people-api'
import PersonPickerPage from './PersonPickerPage'

vi.mock('../lib/people-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/people-api')>()),
  fetchPeople: vi.fn(),
}))

vi.mock('@/lib/geocode', () => ({
  getAddressSuggestions: vi.fn(),
  retrieveAddressSuggestion: vi.fn(),
}))

const somewhereSuggestion = {
  mapbox_id: 'somewhere-id',
  name: 'Somewhere',
  full_address: 'Somewhere, New York, NY',
} as unknown as AddressSuggestion

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

const marcus: Person = {
  name: 'Marcus',
  availability: { start: '18:00', end: '21:00' },
  location: { latitude: 40.7128, longitude: -74.006 },
  preferences: 'Likes live music',
}

test('does not refetch when initial people are provided', async () => {
  vi.mocked(fetchPeople).mockRejectedValue(new Error('should not be called'))

  render(<PersonPickerPage initialPeople={[elena]} onNext={vi.fn()} onBack={vi.fn()} />)

  expect(screen.getByRole('heading', { name: /who's in the chat/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Select Elena' })).toBeInTheDocument()
  expect(screen.queryByText('Loading sample people...')).not.toBeInTheDocument()
  await waitFor(() => expect(fetchPeople).not.toHaveBeenCalled())
})

test('calls onBack when Back is clicked', async () => {
  const user = userEvent.setup()
  const onBack = vi.fn()
  render(<PersonPickerPage initialPeople={[elena]} onNext={vi.fn()} onBack={onBack} />)

  await user.click(screen.getByRole('button', { name: /back/i }))
  expect(onBack).toHaveBeenCalledTimes(1)
})

test('calls onPeopleLoaded with updated list when a custom person is added', async () => {
  const user = userEvent.setup()
  const onPeopleLoaded = vi.fn()
  render(
    <PersonPickerPage
      initialPeople={[elena]}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onPeopleLoaded={onPeopleLoaded}
    />,
  )

  await user.click(screen.getByRole('button', { name: /add a person/i }))

  await user.type(screen.getByLabelText(/name/i), 'Custom')
  await user.type(screen.getByLabelText(/preferences/i), 'Likes pizza')

  vi.mocked(getAddressSuggestions).mockResolvedValue([somewhereSuggestion])
  vi.mocked(retrieveAddressSuggestion).mockResolvedValue({ latitude: 40, longitude: -74, address: 'Somewhere' })
  await user.type(screen.getByLabelText(/address/i), 'Somewhere')
  await user.click(screen.getByRole('button', { name: /find address/i }))
  await user.click(await screen.findByRole('button', { name: /somewhere/i }))
  await waitFor(() => expect(screen.getByText(/using somewhere/i)).toBeInTheDocument())

  await user.click(screen.getByRole('button', { name: /add person/i }))

  await waitFor(() => {
    expect(onPeopleLoaded).toHaveBeenCalledWith(
      expect.arrayContaining([
        elena,
        expect.objectContaining({ name: 'Custom' }),
      ]),
    )
  })
})

test('edits a person and reports the updated list', async () => {
  const user = userEvent.setup()
  const onPeopleLoaded = vi.fn()
  render(
    <PersonPickerPage
      initialPeople={[elena, marcus]}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onPeopleLoaded={onPeopleLoaded}
    />,
  )

  await user.click(screen.getByRole('button', { name: /edit elena/i }))
  const preferences = screen.getByLabelText(/preferences/i)
  await user.clear(preferences)
  await user.type(preferences, 'Quiet restaurants')
  await user.click(screen.getByRole('button', { name: /save changes/i }))

  expect(onPeopleLoaded).toHaveBeenLastCalledWith([
    { ...elena, preferences: 'Quiet restaurants' },
    marcus,
  ])
  expect(screen.getByText('“Quiet restaurants”')).toBeInTheDocument()
})

test('keeps an edited person unselected when they were not selected', async () => {
  const user = userEvent.setup()
  render(<PersonPickerPage initialPeople={[elena]} onNext={vi.fn()} onBack={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: /edit elena/i }))
  const preferences = screen.getByLabelText(/preferences/i)
  await user.clear(preferences)
  await user.type(preferences, 'Quiet restaurants')
  await user.click(screen.getByRole('button', { name: /save changes/i }))

  expect(screen.getByRole('button', { name: 'Select Elena' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
})

test('preserves selection when an edited person is renamed', async () => {
  const user = userEvent.setup()
  const onNext = vi.fn()
  render(<PersonPickerPage initialPeople={[elena]} onNext={onNext} onBack={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: 'Select Elena' }))
  await user.click(screen.getByRole('button', { name: /edit elena/i }))
  const name = screen.getByLabelText(/name/i)
  await user.clear(name)
  await user.type(name, 'Elena Updated')
  await user.click(screen.getByRole('button', { name: /save changes/i }))
  await user.click(screen.getByRole('button', { name: /next/i }))

  expect(onNext).toHaveBeenCalledWith([
    expect.objectContaining({ name: 'Elena Updated' }),
  ])
})

test('cancels editing without changing the person', async () => {
  const user = userEvent.setup()
  const onPeopleLoaded = vi.fn()
  render(
    <PersonPickerPage
      initialPeople={[elena]}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onPeopleLoaded={onPeopleLoaded}
    />,
  )

  await user.click(screen.getByRole('button', { name: /edit elena/i }))
  const preferences = screen.getByLabelText(/preferences/i)
  await user.clear(preferences)
  await user.type(preferences, 'Changed preference')
  await user.click(screen.getByRole('button', { name: /cancel/i }))

  expect(screen.getByText('“Outdoor seating preferred”')).toBeInTheDocument()
  expect(onPeopleLoaded).not.toHaveBeenCalled()
})

test('renders error and prevents Next when too many people are selected', async () => {
  const user = userEvent.setup()
  const onPeopleLoaded = vi.fn()

  const mockedPeople: Person[] = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    name: `Person ${i}`,
    preferences: `Preference ${i}`,
    location: {
      latitude: 0,
      longitude: 0,
    },
    availability: {
      start: '09:00',
      end: '17:00',
    },
  }))

  render(
    <PersonPickerPage
      initialPeople={mockedPeople}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onPeopleLoaded={onPeopleLoaded}
    />,
  )
  
  // Select all people
  for (let i = 0; i < 9; i++) {
    await user.click(screen.getByRole('button', { name: `Select Person ${i}` }))
  }

  // Verify error message and disabled Next button
  expect(screen.getByTestId('too-many-people-error')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
})
