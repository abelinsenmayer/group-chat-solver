import type { RestaurantSuggestion, SolveRestaurantsEvent } from '../lib/people-api'

export type CardVerdict = { verdict: 'approved' | 'rejected'; shortReason: string | null }

export type CardState = {
  suggestion: RestaurantSuggestion
  verdicts: Record<string, CardVerdict>
  phase: 'active' | 'pending-trash' | 'trashed' | 'winner'
}

export type ActiveLine = {
  person: string
  suggestionId: string
  phase: 'questioning' | 'researching' | 'evaluating'
}

export type ConversationState = {
  cards: CardState[]
  activeLines: ActiveLine[]
  researcherActiveSuggestions: Set<string>
  plannerThinking: boolean
  finalStatus: 'consensus' | 'no_consensus' | 'no_restaurants_found' | null
  errorMessage: string | null
}

export const initialConversationState: ConversationState = {
  cards: [],
  activeLines: [],
  researcherActiveSuggestions: new Set(),
  plannerThinking: false,
  finalStatus: null,
  errorMessage: null,
}

export type ConversationAction = SolveRestaurantsEvent | { type: 'reset' } | { type: 'flush-pending-trash' }

export function conversationReducer(state: ConversationState, event: ConversationAction): ConversationState {
  if (event.type === 'reset') return initialConversationState
  if (event.type === 'flush-pending-trash') {
    return {
      ...state,
      cards: state.cards.map((card) => (card.phase === 'pending-trash' ? { ...card, phase: 'trashed' } : card)),
    }
  }
  switch (event.type) {
    case 'planner_started':
      return { ...state, plannerThinking: true }
    case 'planner_suggestions': {
      const keptCards = state.cards.filter((card) => card.phase === 'trashed')
      return {
        ...state,
        plannerThinking: false,
        activeLines: [],
        researcherActiveSuggestions: new Set(),
        cards: [
          ...keptCards,
          ...event.suggestions.map((suggestion) => ({ suggestion, verdicts: {}, phase: 'active' as const })),
        ],
      }
    }
    case 'judge_questioning':
      return {
        ...state,
        activeLines: [
          ...state.activeLines,
          { person: event.person, suggestionId: event.suggestion_id, phase: 'questioning' },
        ],
      }
    case 'researcher_started':
      return {
        ...state,
        researcherActiveSuggestions: new Set(state.researcherActiveSuggestions).add(event.suggestion_id),
        activeLines: state.activeLines.filter(
          (line) => line.suggestionId !== event.suggestion_id || line.phase !== 'questioning',
        ),
      }
    case 'researcher_done':
      return {
        ...state,
        researcherActiveSuggestions: new Set(
          [...state.researcherActiveSuggestions].filter((id) => id !== event.suggestion_id),
        ),
      }
    case 'judge_evaluating':
      return {
        ...state,
        activeLines: [
          ...state.activeLines,
          { person: event.person, suggestionId: event.suggestion_id, phase: 'evaluating' },
        ],
      }
    case 'judge_verdict':
      return {
        ...state,
        activeLines: state.activeLines.filter(
          (line) => !(line.person === event.person && line.suggestionId === event.suggestion_id),
        ),
        cards: state.cards.map((card) =>
          card.suggestion.id === event.suggestion_id
            ? {
                ...card,
                verdicts: {
                  ...card.verdicts,
                  [event.person]: { verdict: event.verdict, shortReason: event.short_reason },
                },
              }
            : card,
        ),
      }
    case 'round_complete':
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.phase === 'active' && !event.accepted_ids.includes(card.suggestion.id)
            ? { ...card, phase: 'pending-trash' }
            : card,
        ),
      }
    case 'final_result': {
      const winningIds = new Set(event.suggestions.map((suggestion) => suggestion.id))
      return {
        ...state,
        finalStatus: event.status,
        cards: state.cards.map((card) =>
          winningIds.has(card.suggestion.id) ? { ...card, phase: 'winner' } : { ...card, phase: 'trashed' },
        ),
      }
    }
    case 'error':
      return { ...state, errorMessage: event.message, activeLines: [], researcherActiveSuggestions: new Set() }
    default:
      return state
  }
}
