import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi, beforeEach } from 'vitest'
import LandingPage from './LandingPage'
import * as peopleApi from '../lib/people-api'

beforeEach(() => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockResolvedValue(undefined)
})

test('shows horizontal bubble tracks on mobile with opposite directions', () => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockImplementation(() => new Promise(() => {}))
  const { container } = render(<LandingPage onStart={vi.fn()} />)

  const topTrack = container.querySelector('[data-bubble-track="top"]')
  const bottomTrack = container.querySelector('[data-bubble-track="bottom"]')

  expect(topTrack).toHaveClass('flex', 'lg:hidden')
  expect(bottomTrack).toHaveClass('flex', 'lg:hidden')
  expect(topTrack?.firstElementChild).toHaveClass('animate-bubble-scroll-right')
  expect(bottomTrack?.firstElementChild).toHaveClass('animate-bubble-scroll-left')
  expect(topTrack?.querySelector('.bubble-top')).toBeInTheDocument()
  expect(bottomTrack?.querySelector('.bubble-bottom')).toBeInTheDocument()
})

test('keeps vertical bubble columns visible only on desktop', () => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockImplementation(() => new Promise(() => {}))
  const { container } = render(<LandingPage onStart={vi.fn()} />)
  const columns = container.querySelectorAll('[data-bubble-column]')

  expect(columns).toHaveLength(2)
  columns.forEach((column) => expect(column).toHaveClass('hidden', 'lg:block'))
})

test('shows a disabled warming button while the backend is waking up', () => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockImplementation(() => new Promise(() => {}))
  render(<LandingPage onStart={vi.fn()} />)

  const button = screen.getByRole('button', { name: /waking up the servers/i })
  expect(button).toBeInTheDocument()
  expect(button).toBeDisabled()
})

test('enables the start button after the backend wakes up', async () => {
  render(<LandingPage onStart={vi.fn()} />)

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /let's get started/i })).toBeEnabled()
  })
})

test('calls onStart when the button is clicked', async () => {
  const user = userEvent.setup()
  const onStart = vi.fn()
  render(<LandingPage onStart={onStart} />)

  const button = await screen.findByRole('button', { name: /let's get started/i })
  await user.click(button)
  expect(onStart).toHaveBeenCalledTimes(1)
})

test('shows an error and retry button when the backend fails to wake up', async () => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockRejectedValueOnce(new Error('Backend is not ready.'))

  render(<LandingPage onStart={vi.fn()} />)

  await waitFor(() => {
    expect(screen.getByText(/unable to wake up the servers/i)).toBeInTheDocument()
  })
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
})
