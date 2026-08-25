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
  const { rerender } = render(
    <PersonCard person={person} selected={false} onToggle={onToggle} onEdit={vi.fn()} />,
  )

  const card = screen.getByRole('button', { name: 'Select Elena' })
  expect(card).toHaveAttribute('aria-pressed', 'false')

  await user.click(card)
  expect(onToggle).toHaveBeenCalledOnce()

  rerender(<PersonCard person={person} selected onToggle={onToggle} onEdit={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Deselect Elena' })).toBe(card)
  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(card).toHaveClass('outline-secondary')
})

test('describes the selection control with the person details', () => {
  render(<PersonCard person={person} selected={false} onToggle={vi.fn()} onEdit={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Select Elena' })).toHaveAccessibleDescription(
    'Available 5:30 PM–8:00 PMLocated at 40.7589, -73.9851“Outdoor seating preferred”',
  )
})

test('uses the compact pencil style and follows the card hover text color', () => {
  const { container } = render(
    <PersonCard person={person} selected={false} onToggle={vi.fn()} onEdit={vi.fn()} />,
  )

  const selectButton = screen.getByRole('button', { name: 'Select Elena' })
  const editButton = screen.getByRole('button', { name: 'Edit Elena' })
  expect(container.firstElementChild).toHaveClass('relative')
  expect(selectButton).toHaveClass('peer')
  expect(editButton).toHaveAttribute('data-size', 'icon-s')
  expect(editButton).toHaveClass('size-7', 'text-secondary', 'peer-hover:text-background')
})

test('invokes edit without toggling selection', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  render(<PersonCard person={person} selected={false} onToggle={onToggle} onEdit={onEdit} />)

  await user.click(screen.getByRole('button', { name: /edit elena/i }))

  expect(onEdit).toHaveBeenCalledOnce()
  expect(onToggle).not.toHaveBeenCalled()
})
