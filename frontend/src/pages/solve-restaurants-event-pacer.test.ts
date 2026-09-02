import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RestaurantSuggestion, SolveRestaurantsEvent } from '../lib/people-api'
import { MIN_STEP_DURATION_MS, createSolveRestaurantsEventPacer } from './solve-restaurants-event-pacer'

const suggestion: RestaurantSuggestion = {
  id: 'r1',
  name: 'Restaurant One',
  address: null,
  coordinates: [0, 0],
}

const verdict = (person: string, suggestionId = 'r1'): SolveRestaurantsEvent => ({
  type: 'judge_verdict',
  person,
  suggestion_id: suggestionId,
  verdict: 'approved',
  short_reason: null,
  feedback: null,
})

describe('createSolveRestaurantsEventPacer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('holds each phase for a minimum duration and releases parallel questioning together', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))
    const types = () => events.map((event) => event.type)

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })

    expect(types()).toEqual(['planner_started'])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS - 1)
    expect(types()).toEqual(['planner_started'])
    vi.advanceTimersByTime(1)
    expect(types()).toEqual(['planner_started', 'planner_suggestions'])

    pacer.push({ type: 'judge_questioning', person: 'Ada', suggestion_id: 'r1' })
    pacer.push({ type: 'judge_questioning', person: 'Lin', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)

    expect(types()).toEqual([
      'planner_started',
      'planner_suggestions',
      'judge_questioning',
      'judge_questioning',
    ])
  })

  test('interleaves research and evaluation phases without spacing parallel work', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'researcher_started', suggestion_id: 'r1' })
    pacer.push({ type: 'researcher_done', suggestion_id: 'r1' })
    pacer.push({ type: 'researcher_started', suggestion_id: 'r2' })
    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    pacer.push(verdict('Ada'))
    pacer.push({ type: 'judge_evaluating', person: 'Lin', suggestion_id: 'r2' })
    pacer.push(verdict('Lin', 'r2'))

    expect(events.map((event) => event.type)).toEqual([
      'researcher_started',
      'researcher_done',
      'researcher_started',
    ])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual([
      'researcher_started',
      'researcher_done',
      'researcher_started',
      'judge_evaluating',
      'judge_verdict',
      'judge_evaluating',
      'judge_verdict',
    ])
  })

  test('holds round completion for two seconds after the latest verdict and keeps final result behind it', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(1500)
    pacer.push(verdict('Ada'))
    vi.advanceTimersByTime(400)
    pacer.push(verdict('Lin'))
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })
    pacer.push({ type: 'final_result', status: 'consensus', suggestions: [suggestion] })

    vi.advanceTimersByTime(1999)
    expect(events.map((event) => event.type)).toEqual(['judge_evaluating', 'judge_verdict', 'judge_verdict'])
    vi.advanceTimersByTime(1)
    expect(events.map((event) => event.type)).toEqual([
      'judge_evaluating',
      'judge_verdict',
      'judge_verdict',
      'round_complete',
    ])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events[events.length - 1]?.type).toBe('final_result')
  })

  test('starts planning for a new round after round completion', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'round_complete', round: 1, accepted_ids: [] })
    pacer.push({ type: 'planner_started', round: 2 })
    pacer.push({ type: 'planner_suggestions', round: 2, suggestions: [suggestion] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual(['round_complete', 'planner_started'])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual(['round_complete', 'planner_started', 'planner_suggestions'])
  })

  test('dispatches no-restaurants terminal result immediately before any visual phase', () => {
    const onEvent = vi.fn()
    const pacer = createSolveRestaurantsEventPacer(onEvent)
    const event: SolveRestaurantsEvent = {
      type: 'final_result',
      status: 'no_restaurants_found',
      suggestions: [],
    }

    pacer.push(event)

    expect(onEvent).toHaveBeenCalledWith(event)
  })

  test('no_restaurants_found follows round_complete when a phase is already active', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push(verdict('Ada'))
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })
    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 3)

    expect(events.map((event) => event.type)).toEqual([
      'judge_evaluating',
      'judge_verdict',
      'round_complete',
      'final_result',
    ])
  })

  test('an error dispatches immediately, clears queued work, and disposes the pacer', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    pacer.push({ type: 'error', message: 'failed' })
    pacer.push({ type: 'planner_started', round: 2 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)

    expect(events.map((event) => event.type)).toEqual(['planner_started', 'error'])
  })

  test('final_result arriving before round_complete is still emitted after it', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push(verdict('Ada'))
    pacer.push({ type: 'final_result', status: 'consensus', suggestions: [suggestion] })
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 3)

    expect(events.map((event) => event.type)).toEqual([
      'judge_evaluating',
      'judge_verdict',
      'round_complete',
      'final_result',
    ])
  })

  test('no_restaurants_found arriving before round_complete is held pending and emitted after it', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push(verdict('Ada'))

    // After suggestions are visible, no_restaurants_found must be pending just like
    // consensus/no_consensus so round_complete emits first.
    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: [] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 3)

    expect(events.map((event) => event.type)).toEqual([
      'planner_started',
      'planner_suggestions',
      'judge_evaluating',
      'judge_verdict',
      'round_complete',
      'final_result',
    ])
  })

  test('planner_started for a different round while planning is active is a new delayed boundary', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_started', round: 2 })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS - 1)
    expect(events.map((event) => event.type)).toEqual(['planner_started'])
    vi.advanceTimersByTime(1)
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'planner_started'])
  })

  test('error callback reentrant push is ignored', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => {
      events.push(event)
      if (event.type === 'error') {
        pacer.push({ type: 'planner_started', round: 99 })
      }
    })

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    pacer.push({ type: 'error', message: 'failed' })

    expect(events.map((event) => event.type)).toEqual(['planner_started', 'error'])
  })

  test('only no_restaurants_found immediately terminates with no phase', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })
    pacer.push({ type: 'planner_started', round: 1 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)

    expect(events.map((event) => event.type)).toEqual(['final_result'])
  })

  test('keeps the first pending final and ignores duplicate terminal events', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))
    const firstFinal: SolveRestaurantsEvent = {
      type: 'final_result',
      status: 'consensus',
      suggestions: [suggestion],
    }

    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    pacer.push(firstFinal)
    pacer.push({ type: 'final_result', status: 'no_consensus', suggestions: [] })
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)
    pacer.push({ type: 'final_result', status: 'no_consensus', suggestions: [] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)

    expect(events.filter((event) => event.type === 'final_result')).toEqual([firstFinal])
  })

  test('starts the verdict hold when a queued verdict becomes visible', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'researcher_started', suggestion_id: 'r1' })
    pacer.push(verdict('Ada'))
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual(['researcher_started', 'judge_verdict'])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS - 1)
    expect(events[events.length - 1]?.type).toBe('judge_verdict')
    vi.advanceTimersByTime(1)
    expect(events[events.length - 1]?.type).toBe('round_complete')
  })

  test('keeps planner boundaries ordered across rounds', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_started', round: 2 })
    pacer.push({ type: 'planner_suggestions', round: 2, suggestions: [suggestion] })
    pacer.push({ type: 'planner_started', round: 3 })
    pacer.push({ type: 'planner_suggestions', round: 3, suggestions: [suggestion] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 4)

    expect(events.map((event) => {
      if (event.type !== 'planner_started' && event.type !== 'planner_suggestions') throw new Error('unexpected event')
      return `${event.type}:${event.round}`
    })).toEqual([
      'planner_started:1',
      'planner_started:2',
      'planner_suggestions:2',
      'planner_started:3',
      'planner_suggestions:3',
    ])
  })

  test('stages pushes made reentrantly by a normal event callback', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => {
      events.push(event)
      if (event.type === 'planner_started' && event.round === 1) {
        pacer.push({ type: 'planner_started', round: 2 })
        pacer.push({ type: 'planner_suggestions', round: 2, suggestions: [suggestion] })
      }
    })

    pacer.push({ type: 'planner_started', round: 1 })
    expect(events.map((event) => event.type)).toEqual(['planner_started'])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'planner_started'])
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    expect(events.map((event) => event.type)).toEqual([
      'planner_started',
      'planner_started',
      'planner_suggestions',
    ])
  })

  test('no_restaurants_found dispatches immediately during planning when suggestions were never shown', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })

    // Design: immediate when no suggestions were visibly dispatched
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'final_result'])
    // Pacer is disposed
    pacer.push({ type: 'planner_started', round: 2 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'final_result'])
  })

  test.each(['consensus', 'no_consensus'])(
    'holds initial %s final_result pending until round_complete',
    (status) => {
      const events: SolveRestaurantsEvent[] = []
      const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

      pacer.push({
        type: 'final_result',
        status: status as 'consensus' | 'no_consensus',
        suggestions: status === 'consensus' ? [suggestion] : [],
      })
      expect(events.map((event) => event.type)).toEqual([])

      pacer.push({ type: 'round_complete', round: 1, accepted_ids: ['r1'] })
      expect(events.map((event) => event.type)).toEqual(['round_complete'])

      vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
      expect(events.map((event) => event.type)).toEqual(['round_complete', 'final_result'])
    },
  )

  test('no_restaurants_found dispatches immediately during planning when no suggestions were shown', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })

    // Should dispatch immediately without waiting for planning phase to end
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'final_result'])

    // Pacer should be disposed — later pushes are no-ops
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)
    expect(events.map((event) => event.type)).toEqual(['planner_started', 'final_result'])
  })

  test('no_restaurants_found follows normal ordering when suggestions were already shown', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push(verdict('Ada'))
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: [] })
    pacer.push({ type: 'final_result', status: 'no_restaurants_found', suggestions: [] })

    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 3)

    expect(events.map((event) => event.type)).toEqual([
      'planner_started',
      'planner_suggestions',
      'judge_evaluating',
      'judge_verdict',
      'round_complete',
      'final_result',
    ])
  })

  test('pending final is the immediate next phase after round_complete, ahead of queued next-round planner events', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push({ type: 'judge_evaluating', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS)
    pacer.push(verdict('Ada'))

    // final arrives before round_complete — held as pendingFinal
    pacer.push({ type: 'final_result', status: 'no_consensus', suggestions: [] })
    // next-round planner events arrive before round_complete
    pacer.push({ type: 'planner_started', round: 2 })
    pacer.push({ type: 'round_complete', round: 1, accepted_ids: [] })

    // After enough time, final_result must come right after round_complete,
    // not after planner_started for round 2
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 5)

    const types = events.map((event) => event.type)
    const rcIdx = types.indexOf('round_complete')
    const frIdx = types.indexOf('final_result')
    const psIdx = types.lastIndexOf('planner_started')

    expect(rcIdx).toBeGreaterThan(-1)
    expect(frIdx).toBeGreaterThan(-1)
    expect(frIdx).toBe(rcIdx + 1) // final_result is the immediate next event after round_complete
    // planner_started for round 2 should NOT appear (pacer disposed after final_result)
    // or if it did, it should be after final_result
    if (psIdx > 0) {
      expect(psIdx).toBeGreaterThan(frIdx)
    }
  })

  test('dispose cancels queued work and makes later pushes no-ops', () => {
    const events: SolveRestaurantsEvent[] = []
    const pacer = createSolveRestaurantsEventPacer((event) => events.push(event))

    pacer.push({ type: 'planner_started', round: 1 })
    pacer.push({ type: 'planner_suggestions', round: 1, suggestions: [suggestion] })
    pacer.dispose()
    pacer.push({ type: 'judge_questioning', person: 'Ada', suggestion_id: 'r1' })
    vi.advanceTimersByTime(MIN_STEP_DURATION_MS * 2)

    expect(events.map((event) => event.type)).toEqual(['planner_started'])
  })
})
