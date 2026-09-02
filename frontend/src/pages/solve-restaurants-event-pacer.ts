import type { SolveRestaurantsEvent } from '../lib/people-api'

export const MIN_STEP_DURATION_MS = 2000

export type SolveRestaurantsEventPacer = {
  push: (event: SolveRestaurantsEvent) => void
  dispose: () => void
}

type Phase =
  | 'planning'
  | 'suggestions'
  | 'questioning'
  | 'researching'
  | 'evaluating'
  | 'round-complete'
  | 'final'

type QueuedEvent = {
  event: SolveRestaurantsEvent
  phase: Phase
}

function phaseFor(event: SolveRestaurantsEvent): Phase {
  switch (event.type) {
    case 'planner_started':
      return 'planning'
    case 'planner_suggestions':
      return 'suggestions'
    case 'judge_questioning':
      return 'questioning'
    case 'researcher_started':
    case 'researcher_done':
      return 'researching'
    case 'judge_evaluating':
    case 'judge_verdict':
      return 'evaluating'
    case 'round_complete':
      return 'round-complete'
    case 'final_result':
      return 'final'
    case 'error':
      return 'final'
  }
}

export function createSolveRestaurantsEventPacer(
  onEvent: (event: SolveRestaurantsEvent) => void,
): SolveRestaurantsEventPacer {
  let activePhase: Phase | null = null
  let activePhaseStartedAt = 0
  let latestVerdictAt: number | null = null
  let currentRound: number | null = null
  let queued: QueuedEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let terminalSeen = false
  let pendingFinal: SolveRestaurantsEvent | null = null
  let suggestionsDispatched = false
  let dispatching = false
  let reentrantEvents: SolveRestaurantsEvent[] = []

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const deadlineFor = (nextPhase: Phase): number => {
    let deadline = activePhaseStartedAt + MIN_STEP_DURATION_MS
    if (nextPhase === 'round-complete' && latestVerdictAt !== null) {
      deadline = Math.max(deadline, latestVerdictAt + MIN_STEP_DURATION_MS)
    }
    return deadline
  }

  const dispatch = (event: SolveRestaurantsEvent) => {
    if (event.type === 'planner_started') currentRound = event.round
    if (event.type !== 'planner_started' && event.type !== 'error') suggestionsDispatched = true
    if (event.type === 'judge_verdict') latestVerdictAt = Date.now()
    if (event.type === 'round_complete') {
      currentRound = event.round
      latestVerdictAt = null
    }
    if (event.type === 'final_result') {
      disposed = true
      reset()
    }

    dispatching = true
    try {
      onEvent(event)
    } finally {
      dispatching = false
    }

    const staged = reentrantEvents
    reentrantEvents = []
    for (const reentrantEvent of staged) push(reentrantEvent)
  }

  const flushPendingFinal = () => {
    if (pendingFinal !== null && activePhase === 'round-complete') {
      queued.unshift({ event: pendingFinal, phase: 'final' })
      pendingFinal = null
      scheduleBoundary()
    }
  }

  const scheduleBoundary = () => {
    clearTimer()
    if (disposed || queued.length === 0 || activePhase === null) return

    const delay = deadlineFor(queued[0].phase) - Date.now()
    timer = setTimeout(openBoundary, Math.max(delay, 0))
  }

  function openBoundary() {
    timer = null
    if (disposed || queued.length === 0) return

    const nextPhase = queued[0].phase
    activePhase = nextPhase
    activePhaseStartedAt = Date.now()

    while (queued.length > 0 && queued[0].phase === nextPhase) {
      dispatch(queued.shift()!.event)
    }

    flushPendingFinal()

    scheduleBoundary()
  }

  const reset = () => {
    clearTimer()
    activePhase = null
    activePhaseStartedAt = 0
    latestVerdictAt = null
    currentRound = null
    queued = []
    pendingFinal = null
    suggestionsDispatched = false
    terminalSeen = false
    reentrantEvents = []
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    reset()
  }

  const push = (event: SolveRestaurantsEvent) => {
    if (disposed) return
    if (dispatching) {
      reentrantEvents.push(event)
      return
    }

    if (event.type === 'final_result') {
      if (terminalSeen) return
      terminalSeen = true
    }

    if (event.type === 'error') {
      disposed = true
      reset()
      onEvent(event)
      return
    }

    const phase = phaseFor(event)

    if (
      event.type === 'planner_started' &&
      activePhase === 'planning' &&
      event.round !== currentRound
    ) {
      queued.push({ event, phase })
      if (queued.length === 1) scheduleBoundary()
      return
    }

    if (activePhase === null) {
      if (event.type === 'final_result') {
        if (event.status === 'no_restaurants_found') {
          dispatch(event)
        } else {
          pendingFinal = event
        }
        return
      }
      activePhase = phase
      activePhaseStartedAt = Date.now()
      dispatch(event)
      flushPendingFinal()
      return
    }

    if (phase === activePhase) {
      dispatch(event)
      if (event.type === 'judge_verdict' && queued[0]?.phase === 'round-complete') {
        scheduleBoundary()
      }
      return
    }

    if (event.type === 'final_result') {
      if (event.status === 'no_restaurants_found' && !suggestionsDispatched) {
        reset()
        disposed = true
        onEvent(event)
        return
      }
      if (activePhase === 'round-complete') {
        queued.push({ event, phase })
        if (queued.length === 1) scheduleBoundary()
      } else {
        pendingFinal = event
      }
      return
    }

    if (event.type === 'round_complete') {
      const insertIdx = queued.findIndex((q) => q.phase === 'planning' || q.phase === 'suggestions')
      if (insertIdx === -1) {
        queued.push({ event, phase })
      } else {
        queued.splice(insertIdx, 0, { event, phase })
      }
      if (pendingFinal !== null) {
        const rcIdx = queued.findIndex((q) => q.event === event)
        queued.splice(rcIdx + 1, 0, { event: pendingFinal, phase: 'final' })
        pendingFinal = null
      }
      scheduleBoundary()
    } else {
      queued.push({ event, phase })
      if (queued.length === 1) scheduleBoundary()
    }
  }

  return { push, dispose }
}
