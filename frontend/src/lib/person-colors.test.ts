import { expect, test } from 'vitest'
import { getPersonAreaColor } from './person-colors'

test('cycles person area colors after the last palette entry', () => {
  expect(getPersonAreaColor(0)).toBe('#77BEF0')
  expect(getPersonAreaColor(7)).toBe('#263B6A')
  expect(getPersonAreaColor(8)).toBe('#77BEF0')
})
