import { type ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { Person } from '../lib/people-api'
import AddPersonDialog from './AddPersonDialog'

const elena: Person = {
  name: 'Elena',
  availability: { start: '17:30', end: '20:00' },
  location: { latitude: 40.7589, longitude: -73.9851 },
  preferences: 'Outdoor seating preferred',
}

function renderDialog(props: Partial<ComponentProps<typeof AddPersonDialog>> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    existingNames: [] as string[],
    ...props,
  }
  return { ...render(<AddPersonDialog {...defaults} />), ...defaults }
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Alice')
  await user.type(screen.getByLabelText(/preferences/i), 'Loves sushi')
  await user.type(screen.getByLabelText(/latitude/i), '40.7128')
  await user.type(screen.getByLabelText(/longitude/i), '-74.006')
}

describe('AddPersonDialog', () => {
  test('prefills the form and submits edited values in edit mode', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ initialPerson: elena, existingNames: ['Elena', 'Marcus'] })

    expect(screen.getByRole('heading', { name: /edit elena/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toHaveValue('Elena')
    expect(screen.getByLabelText(/preferences/i)).toHaveValue('Outdoor seating preferred')
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(40.7589)
    expect(screen.getByLabelText(/longitude/i)).toHaveValue(-73.9851)
    expect(screen.getByLabelText(/available from/i)).toHaveValue('17:30')
    expect(screen.getByLabelText(/available until/i)).toHaveValue('20:00')

    await user.clear(screen.getByLabelText(/preferences/i))
    await user.type(screen.getByLabelText(/preferences/i), 'Quiet restaurants')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSubmit).toHaveBeenCalledWith({ ...elena, preferences: 'Quiet restaurants' })
  })

  test('allows an edited person to keep their original name', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ initialPerson: elena, existingNames: ['Elena', 'Marcus'] })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSubmit).toHaveBeenCalledWith(elena)
  })

  test('rejects another existing name while editing', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ initialPerson: elena, existingNames: ['Elena', 'Marcus'] })

    const name = screen.getByLabelText(/name/i)
    await user.clear(name)
    await user.type(name, 'Marcus')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Name already exists.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('renders a form with name, preferences, coordinates, and availability fields', () => {
    renderDialog()

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/available from/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/available until/i)).toBeInTheDocument()
  })

  test('enforces maxLength on name and preferences fields', () => {
    renderDialog()

    expect(screen.getByLabelText(/name/i)).toHaveAttribute('maxLength', '80')
    expect(screen.getByLabelText(/preferences/i)).toHaveAttribute('maxLength', '500')
  })

  test('does not render a color picker', () => {
    renderDialog()

    expect(screen.queryByText(/color/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /color/i })).not.toBeInTheDocument()
  })

  test('calls onSubmit with valid person data when form is submitted', async () => {
    const user = userEvent.setup()
    const { onSubmit, onOpenChange } = renderDialog()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Alice',
      preferences: 'Loves sushi',
      location: { latitude: 40.7128, longitude: -74.006 },
      availability: { start: '17:00', end: '22:00' },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('shows error and prevents submission when name matches an existing person', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ existingNames: ['Alice', 'Bob'] })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('duplicate name check is case-insensitive', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ existingNames: ['alice'] })

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/latitude/i), '40')
    await user.type(screen.getByLabelText(/longitude/i), '-74')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('duplicate name check ignores leading and trailing whitespace', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ existingNames: [' Alice '] })

    await user.type(screen.getByLabelText(/name/i), 'alice')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/latitude/i), '40')
    await user.type(screen.getByLabelText(/longitude/i), '-74')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('shows error when latitude is out of range', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/latitude/i), '91')
    await user.type(screen.getByLabelText(/longitude/i), '-74')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('shows error when longitude is out of range', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/latitude/i), '40')
    await user.type(screen.getByLabelText(/longitude/i), '181')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/longitude must be between/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('shows error when end time is not after start time', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/latitude/i), '40')
    await user.type(screen.getByLabelText(/longitude/i), '-74')

    const startInput = screen.getByLabelText(/available from/i)
    const endInput = screen.getByLabelText(/available until/i)
    await user.clear(startInput)
    await user.type(startInput, '20:00')
    await user.clear(endInput)
    await user.type(endInput, '18:00')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('shows error on blur when a required field is left empty', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByLabelText(/name/i))
    await user.tab()

    expect(screen.getByText(/name is required/i)).toBeInTheDocument()
  })

  test('shows error on blur when latitude is out of range', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText(/latitude/i), '91')
    await user.tab()

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()
  })

  test('shows error on blur when a duplicate name is entered', async () => {
    const user = userEvent.setup()
    renderDialog({ existingNames: ['Alice'] })

    await user.type(screen.getByLabelText(/name/i), 'alice')
    await user.tab()

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
  })

  test('does not show an error on blur when the field is valid', async () => {
    const user = userEvent.setup()
    renderDialog()

    const latInput = screen.getByLabelText(/latitude/i)
    await user.type(latInput, '40.7128')
    await user.tab()

    expect(latInput).toHaveValue(40.7128)
    expect(screen.queryByText(/latitude must be between/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/latitude is required/i)).not.toBeInTheDocument()
  })

  test('shows availability error on blur when end time is not after start time', async () => {
    const user = userEvent.setup()
    renderDialog()

    const startInput = screen.getByLabelText(/available from/i)
    await user.clear(startInput)
    await user.type(startInput, '23:00')
    await user.tab()

    expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument()
  })

  test('keeps the error visible while the edited value is still invalid', async () => {
    const user = userEvent.setup()
    renderDialog()

    const latInput = screen.getByLabelText(/latitude/i)
    await user.type(latInput, '91')
    await user.tab()

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()

    await user.type(latInput, '1')

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()
  })

  test('clears error when user edits the invalid field', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText(/latitude/i), '91')
    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await user.type(screen.getByLabelText(/longitude/i), '-74')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/latitude/i))
    await user.type(screen.getByLabelText(/latitude/i), '40')

    expect(screen.queryByText(/latitude must be between/i)).not.toBeInTheDocument()
  })

  test('resets form when dialog is closed via cancel', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <AddPersonDialog open={true} onOpenChange={onOpenChange} onSubmit={vi.fn()} existingNames={[]} />,
    )

    await user.type(screen.getByLabelText(/name/i), 'Partial')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(
      <AddPersonDialog open={false} onOpenChange={onOpenChange} onSubmit={vi.fn()} existingNames={[]} />,
    )
    rerender(
      <AddPersonDialog open={true} onOpenChange={onOpenChange} onSubmit={vi.fn()} existingNames={[]} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('')
    })
  })

  test('resets form when dialog is closed via overlay/escape (onOpenChange(false))', async () => {
    const { onOpenChange, rerender } = renderDialog()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/name/i), 'Partial')

    rerender(
      <AddPersonDialog open={false} onOpenChange={onOpenChange} onSubmit={vi.fn()} existingNames={[]} />,
    )
    rerender(
      <AddPersonDialog open={true} onOpenChange={onOpenChange} onSubmit={vi.fn()} existingNames={[]} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('')
    })
  })
})
