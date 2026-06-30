import { describe, expect, it } from 'vitest'
import {
  buildDefaultObjectives,
  buildDefaultObjectivesForLevelPackage,
  createEndedOutcome,
  evaluateObjectives,
  formatOutcomeLabel,
  normalizeObjectives,
  OBJECTIVE_REASONS,
  OBJECTIVE_TYPES,
  OUTCOME_STATUS
} from '../objectives.js'

function fakeGameState({ units = [], hexes = [], history = [] } = {}) {
  const byKey = new Map(hexes.map(hex => [`${hex.q},${hex.r}`, hex]))
  return {
    history,
    getActivePlayerUnits(player) {
      return units.filter(unit => unit.player === player && unit.health > 0)
    },
    getHex(q, r) {
      return byKey.get(`${q},${r}`) || null
    },
    getAllHexes() {
      return hexes
    }
  }
}

describe('objectives v2', () => {
  it('builds one default primary Blue eliminate objective', () => {
    const objectives = buildDefaultObjectives([
      { q: 0, r: 0, player1Base: true },
      { q: 1, r: 0 },
      { q: 2, r: 0, player2Base: true }
    ])

    expect(objectives).toEqual({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('does not attach package defaults when either roster has no configured units', () => {
    const objectives = buildDefaultObjectivesForLevelPackage({
      hexmap: { map: [{ q: 0, r: 0, player1Base: true }, { q: 1, r: 0, player2Base: true }] },
      units: {
        player1: { units: [{ type: 'infantry', count: 1 }] },
        player2: { units: [] }
      }
    })

    expect(objectives).toBeNull()
  })

  it('applies the always-on wipe rule even when objectives are null', () => {
    const state = fakeGameState({
      units: [{ id: 'p1', player: 'player1', health: 10, position: { q: 0, r: 0 } }]
    })

    const outcome = evaluateObjectives(state, null, { phase: 'afterAction' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player1')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.UNIT_WIPE)
  })

  it('does not resolve occupyBase before the end-turn phase', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1', player: 'player1', health: 10, position: { q: 1, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 2, r: 0 } }
      ],
      hexes: [
        { q: 1, r: 0, player2Base: true },
        { q: 2, r: 0, player2Spawn: true }
      ]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'p1_base',
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2'
      }
    }, { phase: 'afterAction' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ACTIVE)
  })

  it('ends with baseCaptured at end-turn when all target base hexes are occupied by distinct units', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1a', player: 'player1', health: 10, position: { q: 1, r: 0 } },
        { id: 'p1b', player: 'player1', health: 10, position: { q: 1, r: 1 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 2, r: 0 } }
      ],
      hexes: [
        { q: 1, r: 0, player2Base: true },
        { q: 1, r: 1, player2Base: true },
        { q: 2, r: 0, player2Spawn: true }
      ],
      history: [[]]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'p1_base',
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2'
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player1')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.BASE_CAPTURED)
  })

  it('does not complete a multi-hex base when only part of it is occupied', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1a', player: 'player1', health: 10, position: { q: 1, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 2, r: 0 } }
      ],
      hexes: [
        { q: 1, r: 0, player2Base: true },
        { q: 1, r: 1, player2Base: true },
        { q: 2, r: 0, player2Spawn: true }
      ],
      history: [[]]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'p1_base',
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2'
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ACTIVE)
  })

  it('ends with surviveTurns after the configured deadline', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1', player: 'player1', health: 10, position: { q: 0, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 1, r: 0 } }
      ],
      history: [[], []]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'hold_2',
        type: OBJECTIVE_TYPES.SURVIVE_TURNS,
        player: 'player1',
        deadlineTurns: 2
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player1')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.SURVIVE_TURNS)
  })

  it('ends with baseProtected when protectBase reaches its deadline without Red capture', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1', player: 'player1', health: 10, position: { q: 0, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 2, r: 0 } }
      ],
      hexes: [
        { q: 0, r: 0, player1Base: true },
        { q: 2, r: 0, player2Spawn: true }
      ],
      history: [[], []]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'protect',
        type: OBJECTIVE_TYPES.PROTECT_BASE,
        player: 'player1',
        basePlayer: 'player1',
        deadlineTurns: 2
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player1')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.BASE_PROTECTED)
  })

  it('ends with Red baseCaptured when protectBase base is captured before the deadline', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1', player: 'player1', health: 10, position: { q: 1, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 0, r: 0 } }
      ],
      hexes: [
        { q: 0, r: 0, player1Base: true },
        { q: 1, r: 0, player1Spawn: true }
      ],
      history: [[]]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'protect',
        type: OBJECTIVE_TYPES.PROTECT_BASE,
        player: 'player1',
        basePlayer: 'player1',
        deadlineTurns: 4
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player2')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.BASE_CAPTURED)
  })

  it('gives Red a deadlineMissed outcome when a timed occupy objective is not complete', () => {
    const state = fakeGameState({
      units: [
        { id: 'p1', player: 'player1', health: 10, position: { q: 0, r: 0 } },
        { id: 'p2', player: 'player2', health: 10, position: { q: 2, r: 0 } }
      ],
      hexes: [
        { q: 1, r: 0, player2Base: true },
        { q: 2, r: 0, player2Spawn: true }
      ],
      history: [[], []]
    })

    const outcome = evaluateObjectives(state, {
      mode: 'primaryBlue',
      primary: {
        id: 'p1_base',
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2',
        deadlineTurns: 2
      }
    }, { phase: 'endTurn' })

    expect(outcome.status).toBe(OUTCOME_STATUS.ENDED)
    expect(outcome.winner).toBe('player2')
    expect(outcome.reason).toBe(OBJECTIVE_REASONS.DEADLINE_MISSED)
  })

  it('normalizes legacy conditions to the first Blue primary objective', () => {
    const normalized = normalizeObjectives({
      mode: 'firstSatisfied',
      conditions: [
        { id: 'red_wipe', type: 'eliminateUnits', targetPlayer: 'player1', winner: 'player2' },
        { id: 'blue_hold', type: 'surviveTurns', player: 'player1', turns: 3, winner: 'player1' },
        { id: 'blue_wipe', type: 'eliminateUnits', targetPlayer: 'player2', winner: 'player1' }
      ]
    })

    expect(normalized).toEqual({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_hold',
        type: OBJECTIVE_TYPES.SURVIVE_TURNS,
        player: 'player1',
        deadlineTurns: 3
      }
    })
  })

  it('formats terminal outcomes without a winner as a generic game over', () => {
    expect(formatOutcomeLabel(createEndedOutcome({ reason: 'manualStop' }))).toBe('Game over (manualStop)')
  })
})
