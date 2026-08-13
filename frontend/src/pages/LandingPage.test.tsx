import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi, beforeEach } from 'vitest'
import LandingPage from './LandingPage'
import * as peopleApi from '../lib/people-api'

beforeEach(() => {
  vi.spyOn(peopleApi, 'wakeUpBackend').mockResolvedValue(undefined)
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
