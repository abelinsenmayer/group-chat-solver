import { expect, test } from 'vitest'
import { computeCirclePositions } from './circle-layout'

test('returns an empty array for zero points', () => {
  expect(computeCirclePositions(0)).toEqual([])
})

test('evenly spaces four points around the circle centered at (50, 50)', () => {
  const points = computeCirclePositions(4, { radius: 40, startAngleDeg: 0 })

  expect(points).toHaveLength(4)
  expect(points[0].xPercent).toBeCloseTo(90)
  expect(points[0].yPercent).toBeCloseTo(50)
  expect(points[1].xPercent).toBeCloseTo(50)
  expect(points[1].yPercent).toBeCloseTo(90)
  expect(points[2].xPercent).toBeCloseTo(10)
  expect(points[2].yPercent).toBeCloseTo(50)
  expect(points[3].xPercent).toBeCloseTo(50)
  expect(points[3].yPercent).toBeCloseTo(10)
})

test('offsets the default start angle so the first point is not at the very top', () => {
  const points = computeCirclePositions(4)

  // Default start angle is -90 + 360/4/2 = -45deg, so the first point should
  // be offset diagonally rather than sitting exactly above center (50, y<50).
  expect(points[0].xPercent).not.toBeCloseTo(50)
})
