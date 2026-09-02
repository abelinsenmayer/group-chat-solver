import { useLayoutEffect, useState, type RefObject } from 'react'
import { getPersonAreaColor } from '../lib/person-colors'
import type { ActiveLine } from '../pages/solve-restaurants-state'
import { WigglyLine } from './WigglyLine'

type EvaluationConnectionsProps = {
  containerRef: RefObject<HTMLElement | null>
  activeLines: ActiveLine[]
  personIndexByName: Record<string, number>
}

type MeasuredLine = ActiveLine & {
  x1: number
  y1: number
  x2: number
  y2: number
}

function findAnchor(container: HTMLElement, attribute: 'data-person-name' | 'data-suggestion-id', value: string) {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
    (element) => element.getAttribute(attribute) === value,
  )
}

export function EvaluationConnections({
  containerRef,
  activeLines,
  personIndexByName,
}: EvaluationConnectionsProps) {
  const [lines, setLines] = useState<MeasuredLine[]>([])
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame: number | null = null

    const measure = () => {
      frame = null
      const containerRect = container.getBoundingClientRect()
      const width = Math.max(container.scrollWidth, containerRect.width)
      // const height = Math.max(container.scrollHeight, containerRect.height)
      const height = containerRect.height
      if (!container.isConnected || containerRect.width <= 0 || width <= 0 || height <= 0) {
        setLines([])
        return
      }

      const measured = activeLines.flatMap((line): MeasuredLine[] => {
        if (line.phase === 'researching') return []
        const person = findAnchor(container, 'data-person-name', line.person)
        const suggestion = findAnchor(container, 'data-suggestion-id', line.suggestionId)
        if (!person?.isConnected || !suggestion?.isConnected || suggestion.dataset.phase === 'trashed') return []
        const personRect = person.getBoundingClientRect()
        const suggestionRect = suggestion.getBoundingClientRect()
        if (personRect.width <= 0 || personRect.height <= 0 || suggestionRect.width <= 0 || suggestionRect.height <= 0) {
          return []
        }
        const x = (rect: DOMRect) => rect.left + rect.width / 2 - containerRect.left + container.scrollLeft
        const y = (rect: DOMRect) => rect.top + rect.height / 2 - containerRect.top + container.scrollTop
        return [{ ...line, x1: x(personRect), y1: y(personRect), x2: x(suggestionRect), y2: y(suggestionRect) }]
      })
      setContentSize({ width, height })
      setLines(measured)
    }

    const scheduleMeasure = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(measure)
    }
    scheduleMeasure()
    container.addEventListener('scroll', scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)
    observer?.observe(container)

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      container.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [activeLines, containerRef])

  return (
    <svg
      data-testid="evaluation-connections"
      className="pointer-events-none absolute left-0 top-0 z-0"
      style={{ width: contentSize.width, height: contentSize.height }}
      viewBox={`0 0 ${contentSize.width} ${contentSize.height}`}
      aria-hidden="true"
    >
      {lines.map((line) => (
        <WigglyLine
          key={`${line.person}-${line.suggestionId}-${line.phase}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          color={getPersonAreaColor(personIndexByName[line.person] ?? 0)}
          iconRadius={24}
        />
      ))}
    </svg>
  )
}
