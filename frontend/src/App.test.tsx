import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import App from './App'

const elena = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

function mockPeopleRequest(people = [elena]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => people,
  }))
}

test('renders people loaded from the API', async () => {
  mockPeopleRequest()
  render(<App />)

  expect(await screen.findByRole('button', { name: /elena/i })).toBeInTheDocument()
  expect(screen.getByText(/5:30 PM–8:00 PM/)).toBeInTheDocument()
  expect(screen.getByText(/40.7589, -73.9851/)).toBeInTheDocument()
  expect(screen.getByText(/Outdoor seating preferred/)).toBeInTheDocument()
})

test('shows a loading message while people are requested', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
  render(<App />)

  expect(screen.getByText('Loading sample people...')).toBeInTheDocument()
})

test('shows an empty message when the API returns no people', async () => {
  mockPeopleRequest([])
  render(<App />)

  expect(await screen.findByText('No sample people are available.')).toBeInTheDocument()
})

test('shows a retry action when the API request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }))
  render(<App />)

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

test('toggles selected people and logs them when Next is clicked', async () => {
  const user = userEvent.setup()
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  mockPeopleRequest()
  render(<App />)

  const person = await screen.findByRole('button', { name: /elena/i })
  await user.click(person)
  expect(person).toHaveAttribute('aria-pressed', 'true')
  await user.click(person)
  expect(person).toHaveAttribute('aria-pressed', 'false')
  await user.click(person)
  await user.click(screen.getByRole('button', { name: /next/i }))

  expect(log).toHaveBeenCalledWith([elena])
})
