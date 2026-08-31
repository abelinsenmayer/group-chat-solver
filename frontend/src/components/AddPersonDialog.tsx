import { useEffect, useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Person } from '@/lib/people-api'
import { LocationPicker } from './LocationPicker'

const MAX_NAME_LENGTH = 80
const MAX_PREFERENCES_LENGTH = 500

const DEFAULT_AVAIL_START = '17:00'
const DEFAULT_AVAIL_END = '22:00'

type FormValues = {
  name: string
  preferences: string
  latitude: string
  longitude: string
  availStart: string
  availEnd: string
}

type FieldName = keyof FormValues

const EMPTY_VALUES: FormValues = {
  name: '',
  preferences: '',
  latitude: '',
  longitude: '',
  availStart: DEFAULT_AVAIL_START,
  availEnd: DEFAULT_AVAIL_END,
}

function valuesForPerson(person?: Person): FormValues {
  if (!person) return EMPTY_VALUES
  return {
    name: person.name,
    preferences: person.preferences,
    latitude: String(person.location.latitude),
    longitude: String(person.location.longitude),
    availStart: person.availability.start,
    availEnd: person.availability.end,
  }
}

function normalizeName(value: string) {
  return value.trim().toLowerCase()
}

// Coordinates are set by the LocationPicker rather than typed, so an empty value means the user
// never picked a location. Out-of-range values are still possible: dragging the map marker across
// world copies reports an unwrapped longitude.
function validateCoordinate(raw: string, label: string, limit: number) {
  const trimmed = raw.trim()
  const parsed = Number(trimmed)
  if (!trimmed || !Number.isFinite(parsed)) return 'Choose a location using the address or map picker.'
  if (parsed < -limit || parsed > limit) return `${label} must be between -${limit} and ${limit}.`
  return undefined
}

function validateField(field: FieldName, values: FormValues, existingNames: string[], ignoredName?: string) {
  switch (field) {
    case 'name': {
      const trimmed = values.name.trim()
      if (!trimmed) return 'Name is required.'
      if (trimmed.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
      const ignoredIndex = ignoredName === undefined
        ? -1
        : existingNames.findIndex((name) => normalizeName(name) === normalizeName(ignoredName))
      if (existingNames.some((name, index) => index !== ignoredIndex && normalizeName(name) === normalizeName(trimmed))) {
        return 'Name already exists.'
      }
      return undefined
    }
    case 'preferences': {
      const trimmed = values.preferences.trim()
      if (!trimmed) return 'Preferences are required.'
      if (trimmed.length > MAX_PREFERENCES_LENGTH) {
        return `Preferences must be ${MAX_PREFERENCES_LENGTH} characters or fewer.`
      }
      return undefined
    }
    case 'latitude':
      return validateCoordinate(values.latitude, 'Latitude', 90)
    case 'longitude':
      return validateCoordinate(values.longitude, 'Longitude', 180)
    case 'availStart':
      return values.availStart ? undefined : 'Start time is required.'
    case 'availEnd': {
      if (!values.availEnd) return 'End time is required.'
      if (values.availStart && values.availEnd <= values.availStart) {
        return 'End time must be after start time.'
      }
      
      const toHours = (time: String) => {
        const [hours, minutes] = time.split(':').map(Number)
        return hours + minutes / 60
      }

      if (toHours(values.availEnd) - toHours(values.availStart) < 2) {
        return 'Availability window must be at least 2 hours long'
      }
      return undefined
    }
  }
}

const FIELD_NAMES: FieldName[] = [
  'name',
  'preferences',
  'latitude',
  'longitude',
  'availStart',
  'availEnd',
]

type AddPersonDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (person: Person) => void
  existingNames: string[]
  initialPerson?: Person
}

export default function AddPersonDialog({
  open,
  onOpenChange,
  onSubmit,
  existingNames,
  initialPerson,
}: AddPersonDialogProps) {
  const [values, setValues] = useState<FormValues>(() => valuesForPerson(initialPerson))
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})

  useEffect(() => {
    setValues(valuesForPerson(open ? initialPerson : undefined))
    setErrors({})
  }, [open, initialPerson])

  function setFieldError(field: FieldName, error: string | undefined) {
    setErrors((current) => {
      if (error) return { ...current, [field]: error }
      if (!(field in current)) return current
      const { [field]: _removed, ...rest } = current
      return rest
    })
  }

  function revalidate(field: FieldName, nextValues: FormValues) {
    setFieldError(field, validateField(field, nextValues, existingNames, initialPerson?.name))
    if (field === 'availStart') {
      setFieldError('availEnd', validateField('availEnd', nextValues, existingNames, initialPerson?.name))
    }
  }

  // Takes a partial update rather than a single field so that related fields (latitude and
  // longitude) are applied in one state transition. Updating them through two successive calls
  // would have each call derive its next state from the same stale `values`, dropping one of them.
  function applyChanges(updates: Partial<FormValues>) {
    const nextValues = { ...values, ...updates }
    setValues(nextValues)
    for (const field of Object.keys(updates) as FieldName[]) {
      if (errors[field]) revalidate(field, nextValues)
      else if (field === 'availStart' && errors.availEnd) revalidate(field, nextValues)
    }
  }

  function handleChange(field: FieldName, value: string) {
    applyChanges({ [field]: value })
  }

  function handleBlur(field: FieldName) {
    revalidate(field, values)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const validationErrors: Partial<Record<FieldName, string>> = {}
    for (const field of FIELD_NAMES) {
      const error = validateField(field, values, existingNames, initialPerson?.name)
      if (error) validationErrors[field] = error
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    onSubmit({
      name: values.name.trim(),
      preferences: values.preferences.trim(),
      location: {
        latitude: Number(values.latitude.trim()),
        longitude: Number(values.longitude.trim()),
      },
      availability: {
        start: values.availStart,
        end: values.availEnd,
      },
    })
    onOpenChange(false)
  }

  const fieldClassName =
    'border-2 border-secondary/50 bg-background text-sm text-secondary focus-visible:border-secondary focus-visible:ring-0'
  const editing = initialPerson !== undefined
  // Both halves of an unset coordinate report the same "pick a location" message, so only one is
  // shown.
  const locationError = errors.latitude ?? errors.longitude

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-primary text-secondary font-inherit sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-secondary">
            {editing ? `Edit ${initialPerson.name}` : 'Add a Person'}
          </DialogTitle>
          <DialogDescription className="text-secondary/70">
            {editing
              ? 'Update this person’s details for the simulation.'
              : 'Create a custom person to include in the simulation.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-person-name" className="text-sm font-bold text-secondary">
              Name
            </Label>
            <Input
              id="add-person-name"
              type="text"
              maxLength={MAX_NAME_LENGTH}
              value={values.name}
              onChange={(e) => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              placeholder="e.g. Alice"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'add-person-name-error' : undefined}
              className={fieldClassName}
            />
            {errors.name && (
              <p id="add-person-name-error" role="alert" className="text-xs text-red-600">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="add-person-preferences" className="text-sm font-bold text-secondary">
              Preferences
            </Label>
            <Textarea
              id="add-person-preferences"
              maxLength={MAX_PREFERENCES_LENGTH}
              value={values.preferences}
              onChange={(e) => handleChange('preferences', e.target.value)}
              onBlur={() => handleBlur('preferences')}
              placeholder="e.g. Loves sushi, hates loud places, prefers outdoor seating"
              aria-invalid={!!errors.preferences}
              aria-describedby={
                errors.preferences
                  ? 'add-person-preferences-count add-person-preferences-error'
                  : 'add-person-preferences-count'
              }
              className={fieldClassName}
            />
            <p id="add-person-preferences-count" className="text-xs text-secondary/60">
              {values.preferences.length}/{MAX_PREFERENCES_LENGTH}
            </p>
            {errors.preferences && (
              <p id="add-person-preferences-error" role="alert" className="text-xs text-red-600">
                {errors.preferences}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <LocationPicker
              latitude={values.latitude}
              longitude={values.longitude}
              onLocationChange={applyChanges}
            />
            {locationError && (
              <p id="add-person-location-error" role="alert" className="text-xs text-red-600">
                {locationError}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="add-person-avail-start" className="text-sm font-bold text-secondary">
                Available from
              </Label>
              <Input
                id="add-person-avail-start"
                type="time"
                value={values.availStart}
                onChange={(e) => handleChange('availStart', e.target.value)}
                onBlur={() => handleBlur('availStart')}
                aria-invalid={!!errors.availStart || !!errors.availEnd}
                aria-describedby={errors.availEnd ? 'add-person-avail-error' : errors.availStart ? 'add-person-avail-start-error' : undefined}
                className={fieldClassName}
              />
              {errors.availStart && (
                <p id="add-person-avail-start-error" role="alert" className="text-xs text-red-600">
                  {errors.availStart}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="add-person-avail-end" className="text-sm font-bold text-secondary">
                Available until
              </Label>
              <Input
                id="add-person-avail-end"
                type="time"
                value={values.availEnd}
                onChange={(e) => handleChange('availEnd', e.target.value)}
                onBlur={() => handleBlur('availEnd')}
                aria-invalid={!!errors.availEnd}
                aria-describedby={errors.availEnd ? 'add-person-avail-error' : undefined}
                className={fieldClassName}
              />
              {errors.availEnd && (
                <p id="add-person-avail-error" role="alert" className="text-xs text-red-600">
                  {errors.availEnd}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-secondary text-secondary hover:bg-secondary hover:text-background"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-secondary text-background hover:bg-secondary/80 disabled:opacity-50"
            >
              {editing ? 'Save Changes' : 'Add Person'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
