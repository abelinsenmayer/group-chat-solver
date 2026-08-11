import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import LandingPage from './LandingPage'

test('renders the title and description placeholder', () => {
  render(<LandingPage onStart={vi.fn()} />)

  expect(screen.getByText("Abe Linsenmayer's")).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /group chat "solver"/i })).toBeInTheDocument()
  expect(screen.getByText(/description goes here/i)).toBeInTheDocument()
})

test('calls onStart when the button is clicked', async () => {
  const user = userEvent.setup()
  const onStart = vi.fn()
  render(<LandingPage onStart={onStart} />)

  await user.click(screen.getByRole('button', { name: /let's get started/i }))
  expect(onStart).toHaveBeenCalledTimes(1)
})

test('button uses sentence-case label', () => {
  render(<LandingPage onStart={vi.fn()} />)

  expect(screen.getByRole('button', { name: "Let's get started" })).toBeInTheDocument()
})
