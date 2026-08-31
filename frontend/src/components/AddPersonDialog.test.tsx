import { type ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getAddressSuggestions,
  retrieveAddressSuggestion,
  type AddressSuggestion,
} from '@/lib/geocode'
import type { Person } from '../lib/people-api'
import AddPersonDialog from './AddPersonDialog'

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

beforeEach(() => {
  vi.mocked(getAddressSuggestions).mockReset()
  vi.mocked(retrieveAddressSuggestion).mockReset()
})

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

// Coordinates are only reachable through the LocationPicker now, so tests drive the real picker UI
// with a stubbed geocode lookup.
async function pickLocation(
  user: ReturnType<typeof userEvent.setup>,
  latitude = 40.7128,
  longitude = -74.006,
) {
  vi.mocked(getAddressSuggestions).mockResolvedValue([somewhereSuggestion])
  vi.mocked(retrieveAddressSuggestion).mockResolvedValue({ latitude, longitude, address: 'Somewhere' })
  await user.type(screen.getByLabelText(/address/i), 'Somewhere')
  await user.click(screen.getByRole('button', { name: /find address/i }))
  await user.click(await screen.findByRole('button', { name: /somewhere/i }))
  await waitFor(() => expect(screen.getByText(/using somewhere/i)).toBeInTheDocument())
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Alice')
  await user.type(screen.getByLabelText(/preferences/i), 'Loves sushi')
  await pickLocation(user)
}

describe('AddPersonDialog', () => {
  test('prefills the form and submits edited values in edit mode', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ initialPerson: elena, existingNames: ['Elena', 'Marcus'] })

    expect(screen.getByRole('heading', { name: /edit elena/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toHaveValue('Elena')
    expect(screen.getByLabelText(/preferences/i)).toHaveValue('Outdoor seating preferred')
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

  test('renders a form with name, preferences, a location picker, and availability fields', () => {
    renderDialog()

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/available from/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/available until/i)).toBeInTheDocument()
  })

  test('blocks submission until a location has been chosen', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/preferences/i), 'Loves sushi')
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/choose a location/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('submits once a location has been chosen', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/preferences/i), 'Loves sushi')
    await user.click(screen.getByRole('button', { name: /add person/i }))
    expect(screen.getByText(/choose a location/i)).toBeInTheDocument()

    await pickLocation(user, 40.7128, -74.006)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ location: { latitude: 40.7128, longitude: -74.006 } }),
    )
  })

  test('rejects an out-of-range longitude produced by dragging across world copies', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/preferences/i), 'Loves sushi')
    await pickLocation(user, 40.7128, -184.5)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/longitude must be between/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
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
    await pickLocation(user)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('duplicate name check ignores leading and trailing whitespace', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog({ existingNames: [' Alice '] })

    await user.type(screen.getByLabelText(/name/i), 'alice')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await pickLocation(user)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('rejects an out-of-range latitude', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await pickLocation(user, 91, -74)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('shows error when end time is not after start time', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await pickLocation(user)

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

    const nameInput = screen.getByLabelText(/name/i)
    await user.type(nameInput, 'Alice')
    await user.tab()

    expect(nameInput).toHaveValue('Alice')
    expect(screen.queryByText(/name is required/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/name already exists/i)).not.toBeInTheDocument()
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

  test('keeps an error visible while the edited value is still invalid', async () => {
    const user = userEvent.setup()
    renderDialog({ existingNames: ['Alice'] })

    const nameInput = screen.getByLabelText(/name/i)
    await user.type(nameInput, 'Alice')
    await user.tab()

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()

    // Editing to another invalid value re-reports rather than silently dropping the error.
    await user.clear(nameInput)

    expect(screen.getByText(/name is required/i)).toBeInTheDocument()
  })

  test('clears error when user edits the invalid field', async () => {
    const user = userEvent.setup()
    renderDialog({ existingNames: ['Alice'] })

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/preferences/i), 'test')
    await pickLocation(user)
    await user.click(screen.getByRole('button', { name: /add person/i }))

    expect(screen.getByText(/name already exists/i)).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/name/i))
    await user.type(screen.getByLabelText(/name/i), 'Bob')

    expect(screen.queryByText(/name already exists/i)).not.toBeInTheDocument()
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
