import { describe, it, expect } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createEndedOutcome } from '../../domain/objectives/objectives.js'
import { createRng } from '../../domain/simulation/rng.js'

const turntable = {
  Our_operations: [
    {
      title: 'MANOEUVRE',
      moves: [{ dice: [['move', 'turn', 'reverse'], ['move'], ['-'], ['-'], ['turn'], ['reverse']] }],
    },
    {
      title: 'ATTACK',
      moves: [{ dice: [['fire', 'reload'], ['reload'], ['-'], ['-'], ['fire'], ['fire', 'reload']] }],
    },
  ],
  Enemy_operations: [
    {
      title: 'MANOEUVRE',
      moves: [{ dice: [['move', 'turn'], ['move'], ['-'], ['-'], ['turn'], ['reverse']] }],
    },
    {
      title: 'ATTACK',
      moves: [{ dice: [['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']] }],
    },
  ],
}

function buildSeedState(rng) {
  const state = new GameState({
    currentPlayer: 'player1',
    turntableData: turntable,
    rng,
    mapData: {
      parameters: { width: 4, height: 4 },
      map: [
        { q: 0, r: 0, player1Spawn: true },
        { q: 3, r: 3, player2Spawn: true },
      ],
    },
    terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
    unitsData: {
      player1: { units: [{ type: 'armored', count: 1 }] },
      player2: { units: [{ type: 'armored', count: 1 }] },
    },
  })
  return state
}

function snapshot(state) {
  return JSON.parse(JSON.stringify(state.toJSON(true)))
}

describe('GameState.loadHistoryJSON transactional behavior', () => {
  it('valid history import still succeeds and updates state', () => {
    const original = buildSeedState()
    original.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const exported = original.getHistoryJSON()

    const target = buildSeedState()
    expect(target.loadHistoryJSON(exported)).toBe(true)
    expect(target.currentTurnActions.some(a => a.type === 'dice_roll' && a.result === 3)).toBe(true)
  })

  it('returns false and leaves state unchanged when JSON is malformed', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    expect(state.loadHistoryJSON('not valid json {{{')).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when payload is missing initialState', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    const bogus = JSON.stringify({ history: [], currentTurnActions: [] })
    expect(state.loadHistoryJSON(bogus)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when payload contains malformed action shape', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    const malformed = JSON.stringify({
      initialState: state.initialState,
      history: [
        [
          {
            type: 'move',
            unitId: 'p1_arm1',
            to: { q: 'NaN', r: 'NaN' },
            cost: 1,
          },
        ],
      ],
      currentTurnActions: [],
    })
    expect(state.loadHistoryJSON(malformed)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when valid-shape replay action fails to apply', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    // Shape passes validateHistoryPayload but unit does not exist in initialState,
    // so applyAction returns false and the import must abort atomically.
    const payload = JSON.stringify({
      initialState: state.initialState,
      history: [],
      currentTurnActions: [
        {
          type: 'move',
          unitId: 'ghost_nonexistent',
          to: { q: 1, r: 0 },
          cost: 1,
          turnNumber: 1,
          player: 'player1',
        },
      ],
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when payload contains an unknown action type', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    const payload = JSON.stringify({
      initialState: state.initialState,
      history: [],
      currentTurnActions: [
        { type: 'teleport', unitId: 'p1_arm1', to: { q: 1, r: 0 } },
      ],
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when reload action targets a unit that does not exist', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    const payload = JSON.stringify({
      initialState: state.initialState,
      history: [],
      currentTurnActions: [
        { type: 'reload', unitId: 'ghost', cost: 1 },
      ],
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })

  it('returns false and leaves state unchanged when initialState itself is corrupt', () => {
    const state = buildSeedState()
    state.currentTurnActions.push({ type: 'dice_roll', result: 3 })
    const before = snapshot(state)

    const payload = JSON.stringify({
      initialState: null,
      history: [],
      currentTurnActions: [],
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    expect(snapshot(state)).toEqual(before)
  })
})

describe('GameState.loadHistoryJSON adopted state (outcome, idle counter, RNG)', () => {
  it('import into an ended game adopts the replayed outcome and unblocks actions', () => {
    const original = buildSeedState()
    original.rollDice(3)
    const exported = original.getHistoryJSON()

    const target = buildSeedState()
    target.outcome = createEndedOutcome({ winner: 'player2', reason: 'elimination' })
    expect(() => target.endTurn()).toThrow(/already ended/)

    expect(target.loadHistoryJSON(exported)).toBe(true)
    expect(target.outcome.status).toBe('active')
    expect(() => target.endTurn()).not.toThrow()
  })

  it('import reconstructs turnsSinceLastDamage from the replayed timeline', () => {
    const original = buildSeedState()
    original.rollDice(2)
    original.endTurn()
    original.rollDice(5)
    original.endTurn()
    expect(original.turnsSinceLastDamage).toBe(2)
    const exported = original.getHistoryJSON()

    const target = buildSeedState()
    target.turnsSinceLastDamage = 7 // stale pre-import value
    expect(target.loadHistoryJSON(exported)).toBe(true)
    expect(target.turnsSinceLastDamage).toBe(2)
  })

  it('import adopts the seeded RNG stream persisted in the payload anchor', () => {
    const exported = buildSeedState(createRng('import-rng-seed')).getHistoryJSON()
    const anchor = JSON.parse(exported).initialState
    expect(anchor.rng).toBeDefined()

    const target = buildSeedState(createRng('other-live-seed'))
    expect(target.loadHistoryJSON(exported)).toBe(true)

    // Replay does not consume RNG, so the adopted stream sits exactly at the
    // anchor state and that is what toJSON persists from now on.
    expect(target.toJSON(false).rng).toEqual(anchor.rng)

    const reference = GameState.fromJSON(anchor)
    const refFaces = [0, 1, 2].map(() => reference.drawDiceFaceFromRng({ allowReroll: true }))
    const importedFaces = [0, 1, 2].map(() => target.drawDiceFaceFromRng({ allowReroll: true }))
    expect(importedFaces).toEqual(refFaces)
  })

  it('import whose payload anchor has no RNG drops the target\'s live seeded stream', () => {
    const exported = buildSeedState().getHistoryJSON()
    const anchor = JSON.parse(exported).initialState
    expect(anchor.rng).toBeUndefined()

    const target = buildSeedState(createRng('live-seed'))
    expect(target.toJSON(false).rng).toBeDefined()
    expect(target.loadHistoryJSON(exported)).toBe(true)

    // Payload is authoritative: the anchor carries no rng, so the live
    // seeded stream is dropped and exports stop persisting an rng block.
    expect(target.toJSON(false).rng).toBeUndefined()
  })
})
