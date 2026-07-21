import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import PersonCard from './PersonCard'

const person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

test('announces selection state and toggles when clicked', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const { rerender } = render(<PersonCard person={person} selected={false} onToggle={onToggle} />)

  const card = screen.getByRole('button', { name: /elena/i })
  expect(card).toHaveAttribute('aria-pressed', 'false')

  await user.click(card)
  expect(onToggle).toHaveBeenCalledOnce()

  rerender(<PersonCard person={person} selected onToggle={onToggle} />)
  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(card).toHaveClass('outline-secondary')
})
