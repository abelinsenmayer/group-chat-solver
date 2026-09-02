import { expect, test } from 'vitest'
import { conversationReducer, initialConversationState } from './solve-restaurants-state'

const suggestion = {
  id: 'r1',
  name: 'Juniper & Stone',
  address: null,
  coordinates: [0, 0] as [number, number],
}

test('planner suggestions replace active cards but retain trashed history', () => {
  const previous = {
    ...initialConversationState,
    cards: [
      {
        suggestion: { ...suggestion, id: 'old', name: 'Old Cafe' },
        verdicts: {},
        phase: 'trashed' as const,
      },
    ],
  }
  const next = conversationReducer(previous, { type: 'planner_suggestions', round: 2, suggestions: [suggestion] })
  expect(next.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    ['old', 'trashed'],
    ['r1', 'active'],
  ])
})

test('judge verdict clears its active line and records the verdict', () => {
  const questioning = conversationReducer(
    { ...initialConversationState, cards: [{ suggestion, verdicts: {}, phase: 'active' }] },
    { type: 'judge_evaluating', person: 'Elena', suggestion_id: 'r1' },
  )
  const decided = conversationReducer(questioning, {
    type: 'judge_verdict',
    person: 'Elena',
    suggestion_id: 'r1',
    verdict: 'approved',
    short_reason: null,
    feedback: null,
  })
  expect(decided.activeLines).toEqual([])
  expect(decided.cards[0].verdicts.Elena.verdict).toBe('approved')
})

const accepted = { ...suggestion, id: 'accepted', name: 'Accepted Spot' }
const rejected = { ...suggestion, id: 'rejected', name: 'Rejected Spot' }

function stateWithCards(cards: typeof initialConversationState.cards) {
  return { ...initialConversationState, cards }
}

test('round_complete marks unaccepted active cards as pending-trash and keeps accepted cards active', () => {
  const state = stateWithCards([
    { suggestion: accepted, verdicts: {}, phase: 'active' },
    { suggestion: rejected, verdicts: {}, phase: 'active' },
  ])
  const next = conversationReducer(state, { type: 'round_complete', round: 1, accepted_ids: [accepted.id] })
  expect(next.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    [accepted.id, 'active'],
    [rejected.id, 'pending-trash'],
  ])
})

test('flush-pending-trash moves pending-trash cards to trashed', () => {
  const state = stateWithCards([
    { suggestion: accepted, verdicts: {}, phase: 'active' },
    { suggestion: rejected, verdicts: {}, phase: 'pending-trash' },
  ])
  const next = conversationReducer(state, { type: 'flush-pending-trash' })
  expect(next.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    [accepted.id, 'active'],
    [rejected.id, 'trashed'],
  ])
})

test('final_result consensus marks matching suggestions as winner and trashes the rest', () => {
  const state = stateWithCards([
    { suggestion: accepted, verdicts: {}, phase: 'active' },
    { suggestion: rejected, verdicts: {}, phase: 'pending-trash' },
  ])
  const next = conversationReducer(state, {
    type: 'final_result',
    status: 'consensus',
    suggestions: [accepted],
  })
  expect(next.finalStatus).toBe('consensus')
  expect(next.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    [accepted.id, 'winner'],
    [rejected.id, 'trashed'],
  ])
})

test('final_result no_consensus trashes every card', () => {
  const state = stateWithCards([
    { suggestion: accepted, verdicts: {}, phase: 'active' },
    { suggestion: rejected, verdicts: {}, phase: 'active' },
  ])
  const next = conversationReducer(state, {
    type: 'final_result',
    status: 'no_consensus',
    suggestions: [],
  })
  expect(next.finalStatus).toBe('no_consensus')
  expect(next.cards.every((card) => card.phase === 'trashed')).toBe(true)
})

test('planner_suggestions retains pending-trash cards so flush-pending-trash can transition them', () => {
  const pendingTrashCard = { ...suggestion, id: 'rejected', name: 'Old Place' }
  const newSuggestion = { ...suggestion, id: 'new1', name: 'New Place' }
  const state = stateWithCards([
    { suggestion: accepted, verdicts: {}, phase: 'active' },
    { suggestion: pendingTrashCard, verdicts: {}, phase: 'pending-trash' },
  ])

  // planner_suggestions arrives before flush-pending-trash
  const afterSuggestions = conversationReducer(state, {
    type: 'planner_suggestions',
    round: 2,
    suggestions: [newSuggestion],
  })

  // pending-trash card must be retained
  expect(afterSuggestions.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    ['rejected', 'pending-trash'],
    ['new1', 'active'],
  ])

  // flush-pending-trash now transitions them to trashed
  const afterFlush = conversationReducer(afterSuggestions, { type: 'flush-pending-trash' })
  expect(afterFlush.cards.map((card) => [card.suggestion.id, card.phase])).toEqual([
    ['rejected', 'trashed'],
    ['new1', 'active'],
  ])
})

test('error records the message and clears active lines and researcher state', () => {
  const state: typeof initialConversationState = {
    ...initialConversationState,
    cards: [{ suggestion, verdicts: {}, phase: 'active' }],
    activeLines: [{ person: 'Elena', suggestionId: suggestion.id, phase: 'evaluating' }],
    researcherActiveSuggestions: new Set([suggestion.id]),
  }
  const next = conversationReducer(state, { type: 'error', message: 'planner exploded' })
  expect(next.errorMessage).toBe('planner exploded')
  expect(next.activeLines).toEqual([])
  expect(next.researcherActiveSuggestions).toEqual(new Set())
})
