import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import WhatsHappeningHere from './WhatsHappeningHere'

test('renders the trigger button', () => {
  render(<WhatsHappeningHere title="What is happening" docFile="example.md" />)

  expect(screen.getByRole('button', { name: /what's happening here\?/i })).toBeInTheDocument()
})

test('opens the dialog and shows the title and fetched markdown content when clicked', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '**Bold text**\n\n- item one\n- item two\n\nSome `inline code`.',
  }))
  const user = userEvent.setup()
  render(<WhatsHappeningHere title="What is happening" docFile="example.md" />)

  await user.click(screen.getByRole('button', { name: /what's happening here\?/i }))

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('What is happening')).toBeInTheDocument()
  expect(await screen.findByText('Bold text')).toBeInTheDocument()
  expect(screen.getByText('item one')).toBeInTheDocument()
  expect(screen.getByText('inline code')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('/docs/example.md', expect.anything())
})

test('shows an error message when the doc fails to load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const user = userEvent.setup()
  render(<WhatsHappeningHere title="What is happening" docFile="example.md" />)

  await user.click(screen.getByRole('button', { name: /what's happening here\?/i }))

  expect(await screen.findByText('Unable to load documentation.')).toBeInTheDocument()
})
