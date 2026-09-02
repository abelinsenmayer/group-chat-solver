import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { expect, test, vi } from 'vitest'
import type { ActiveLine } from '../pages/solve-restaurants-state'
import { EvaluationConnections } from './EvaluationConnections'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

function renderConnections(activeLines: ActiveLine[], includeSuggestion = true) {
  const containerRef = createRef<HTMLDivElement>()
  const result = render(
    <div ref={containerRef}>
      <div data-person-name="Elena" />
      {includeSuggestion && <div data-suggestion-id="r1" />}
      <EvaluationConnections
        containerRef={containerRef}
        activeLines={activeLines}
        personIndexByName={{ Elena: 0 }}
      />
    </div>,
  )
  const container = containerRef.current!
  const person = container.querySelector<HTMLElement>('[data-person-name="Elena"]')!
  const suggestion = container.querySelector<HTMLElement>('[data-suggestion-id="r1"]')
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 400 })
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 300, 400))
  vi.spyOn(person, 'getBoundingClientRect').mockReturnValue(rect(50, 110, 20, 20))
  if (suggestion) vi.spyOn(suggestion, 'getBoundingClientRect').mockReturnValue(rect(230, 170, 20, 20))
  result.rerender(
    <div ref={containerRef}>
      <div data-person-name="Elena" />
      {includeSuggestion && <div data-suggestion-id="r1" />}
      <EvaluationConnections
        containerRef={containerRef}
        activeLines={[...activeLines]}
        personIndexByName={{ Elena: 0 }}
      />
    </div>,
  )
  return { ...result, container, person, suggestion }
}

const judgeLine: ActiveLine = { person: 'Elena', suggestionId: 'r1', phase: 'evaluating' }

test('draws a measured connection between resolvable judge and suggestion anchors', async () => {
  const { getByTestId } = renderConnections([judgeLine])
  await waitFor(() => expect(getByTestId('evaluation-connections').querySelector('path')).not.toBeNull())
})

test('does not draw a connection when the suggestion anchor is missing', async () => {
  const { getByTestId } = renderConnections([judgeLine], false)
  await waitFor(() => expect(getByTestId('evaluation-connections').querySelectorAll('path')).toHaveLength(0))
})

test('remeasures content coordinates when the scroll container scrolls', async () => {
  const { getByTestId, container, person, suggestion } = renderConnections([judgeLine])
  const path = await waitFor(() => {
    const found = getByTestId('evaluation-connections').querySelector('path')
    expect(found).not.toBeNull()
    return found!
  })
  const initialPath = path.getAttribute('d')
  vi.mocked(person.getBoundingClientRect).mockReturnValue(rect(50, 90, 20, 20))
  vi.mocked(suggestion!.getBoundingClientRect).mockReturnValue(rect(230, 130, 20, 20))
  Object.defineProperty(container, 'scrollTop', { configurable: true, value: 40 })
  act(() => container.dispatchEvent(new Event('scroll')))
  await waitFor(() => expect(path.getAttribute('d')).not.toBe(initialPath))
})

test('uses a pixel coordinate system for consistent line geometry', async () => {
  const { getByTestId } = renderConnections([judgeLine])
  await waitFor(() => expect(getByTestId('evaluation-connections')).toHaveAttribute('viewBox', '0 0 300 400'))
})

test('defensively ignores researching active lines', async () => {
  const researching: ActiveLine = { ...judgeLine, phase: 'researching' }
  const { getByTestId } = renderConnections([researching])
  await waitFor(() => expect(getByTestId('evaluation-connections').querySelectorAll('path')).toHaveLength(0))
})

test('matches quoted and backslashed anchor values exactly', async () => {
  const personName = 'Elena "E" \\'
  const suggestionId = 'r1"\\'
  const containerRef = createRef<HTMLDivElement>()
  const result = render(
    <div ref={containerRef}>
      <div data-person-name={personName} />
      <div data-suggestion-id={suggestionId} />
      <EvaluationConnections
        containerRef={containerRef}
        activeLines={[]}
        personIndexByName={{ [personName]: 0 }}
      />
    </div>,
  )
  const container = containerRef.current!
  const [person, suggestion] = Array.from(container.children) as HTMLElement[]
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 400 })
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 300, 400))
  vi.spyOn(person, 'getBoundingClientRect').mockReturnValue(rect(50, 110, 20, 20))
  vi.spyOn(suggestion, 'getBoundingClientRect').mockReturnValue(rect(230, 170, 20, 20))
  result.rerender(
    <div ref={containerRef}>
      <div data-person-name={personName} />
      <div data-suggestion-id={suggestionId} />
      <EvaluationConnections
        containerRef={containerRef}
        activeLines={[{ person: personName, suggestionId, phase: 'evaluating' }]}
        personIndexByName={{ [personName]: 0 }}
      />
    </div>,
  )
  await waitFor(() => expect(result.getByTestId('evaluation-connections').querySelectorAll('path')).toHaveLength(1))
})

test('coalesces each measurement trigger into one animation-frame measurement', async () => {
  const { getByTestId, container } = renderConnections([judgeLine])
  await waitFor(() => expect(getByTestId('evaluation-connections').querySelector('path')).not.toBeNull())
  const rectSpy = vi.mocked(container.getBoundingClientRect)
  rectSpy.mockClear()

  act(() => container.dispatchEvent(new Event('scroll')))
  await waitFor(() => expect(rectSpy).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(rectSpy).toHaveBeenCalledTimes(1)
})
