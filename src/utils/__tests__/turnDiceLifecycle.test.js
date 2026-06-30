import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { GameUnit } from '@/domain/engine/gameUnits.js'
import { ACTION_TYPES } from '../../domain/rules/actionTypes.js'

const turntable = {
  Our_operations: [
    {
      title: 'MANOEUVRE',
      moves: [
        {
          dice: [
            ['move', 'turn', 'reverse'],
            ['move'],
            ['-'],
            ['-'],
            ['turn'],
            ['reverse']
          ]
        }
      ]
    },
    {
      title: 'ATTACK',
      moves: [
        {
          dice: [
            ['fire', 'reload'],
            ['reload'],
            ['-'],
            ['-'],
            ['fire'],
            ['fire', 'reload']
          ]
        }
      ]
    }
  ],
  Enemy_operations: [
    {
      title: 'MANOEUVRE',
      moves: [{ dice: [['move'], ['move'], ['-'], ['-'], ['turn'], ['reverse']] }]
    },
    {
      title: 'ATTACK',
      moves: [{ dice: [['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']] }]
    }
  ]
}

function buildPairedLevelState({ p1Loaded = true, p2Loaded = true } = {}) {
  const state = new GameState({
    currentPlayer: 'player1',
    turntableData: turntable,
    mapData: {
      parameters: { width: 4, height: 1 },
      map: [
        { q: 0, r: 0, player1Spawn: true, terrain: 'plains' },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 2, r: 0, terrain: 'plains' },
        { q: 3, r: 0, player2Spawn: true, terrain: 'plains' }
      ]
    },
    terrainTypes: [
      { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    ],
    unitsData: {
      player1: { units: [{ type: 'armored', count: 1, isLoaded: p1Loaded }] },
      player2: { units: [{ type: 'armored', count: 1, isLoaded: p2Loaded }] }
    }
  })
  return state
}

describe('GameState dice lifecycle', () => {
  it('new turn starts with no dice result and hasRolledDice() === false', () => {
    const state = new GameState({ turntableData: turntable })
    expect(state.getCurrentDiceResult()).toBeNull()
    expect(state.hasRolledDice()).toBe(false)
    expect(state.turnNumber).toBe(1)
    expect(state.currentPlayer).toBe('player1')
  })

  it('rollDice() records and exposes the dice face', () => {
    const state = new GameState({ turntableData: turntable })
    const face = state.rollDice(4)
    expect(face).toBe(4)
    expect(state.getCurrentDiceResult()).toBe(4)
    expect(state.hasRolledDice()).toBe(true)
    const last = state.currentTurnActions[state.currentTurnActions.length - 1]
    expect(last.type).toBe('dice_roll')
    expect(last.result).toBe(4)
  })

  it('rollDice() rejects a second roll in the same turn (default: no reroll)', () => {
    const state = new GameState({ turntableData: turntable })
    state.rollDice(2)
    const actionsLen = state.currentTurnActions.length
    expect(() => state.rollDice(5)).toThrow(/already rolled/i)
    // No mutation when rejected
    expect(state.currentTurnActions.length).toBe(actionsLen)
    expect(state.getCurrentDiceResult()).toBe(2)
  })

  it('rollDice({ allowReroll: true }) permits explicit reroll for future rules/replays', () => {
    const state = new GameState({ turntableData: turntable })
    state.rollDice(2)
    expect(state.rollDice(6, { allowReroll: true })).toBe(6)
    expect(state.getCurrentDiceResult()).toBe(6)
  })

  it('rollDice() rejects invalid faces', () => {
    const state = new GameState({ turntableData: turntable })
    expect(() => state.rollDice(0)).toThrow(/invalid dice face/i)
    expect(() => state.rollDice(7)).toThrow(/invalid dice face/i)
    expect(() => state.rollDice('not a number')).toThrow(/invalid dice face/i)
    expect(state.hasRolledDice()).toBe(false)
  })

  it('endTurn() clears dice and rolling is unlocked for next player', () => {
    const state = new GameState({ turntableData: turntable })
    state.rollDice(3)
    expect(state.hasRolledDice()).toBe(true)
    state.endTurn()

    // Next player's turn starts fresh: dice cleared, ready to roll.
    expect(state.hasRolledDice()).toBe(false)
    expect(state.getCurrentDiceResult()).toBeNull()
    expect(state.currentPlayer).toBe('player2')

    // The roll from the prior turn is preserved in history.
    const lastTurn = state.history[state.history.length - 1]
    expect(lastTurn.some(a => a.type === 'dice_roll' && a.result === 3)).toBe(true)

    // New player can roll without reroll-error.
    expect(() => state.rollDice(5)).not.toThrow()
    expect(state.getCurrentDiceResult()).toBe(5)
  })
})

describe('GameState allowed actions depend on stored dice result', () => {
  it('getAllowedActionsForUnit returns [] before any dice roll', () => {
    const state = buildPairedLevelState()
    const unit = state.getActivePlayerUnits('player1')[0]
    expect(state.hasRolledDice()).toBe(false)
    expect(state.getAllowedActionsForUnit(unit.id)).toEqual([])
  })

  it('getAllowedActionsForUnit reflects current dice + isLoaded + budget', () => {
    const state = buildPairedLevelState({ p1Loaded: true })
    const unit = state.getActivePlayerUnits('player1')[0]

    state.rollDice(1)
    const allowed = state.getAllowedActionsForUnit(unit.id)
    // d1 row: MANOEUVRE { move, turn, reverse }, ATTACK { fire, reload }.
    // Unit is loaded → fire allowed, reload excluded.
    expect(allowed).toContain(ACTION_TYPES.MOVE)
    expect(allowed).toContain(ACTION_TYPES.TURN)
    expect(allowed).toContain(ACTION_TYPES.FIRE)
    expect(allowed).not.toContain(ACTION_TYPES.RELOAD)
  })

  it('getAllowedActionsForUnit excludes fire when weapon is empty and includes reload', () => {
    const state = buildPairedLevelState()
    const unit = state.getActivePlayerUnits('player1')[0]
    // `placeUnitsFromLevel` doesn't forward unit definition `isLoaded`; mutate
    // turnState directly to model an empty weapon for this test.
    unit.isLoaded = false
    state.turnState[unit.id].isLoaded = false

    state.rollDice(1)
    const allowed = state.getAllowedActionsForUnit(unit.id)
    expect(allowed).not.toContain(ACTION_TYPES.FIRE)
    expect(allowed).toContain(ACTION_TYPES.RELOAD)
  })

  it('getAllowedActionsForUnit returns [] for units owned by inactive player', () => {
    const state = buildPairedLevelState()
    const p2Unit = state.getActivePlayerUnits('player2')[0]
    state.rollDice(1)
    expect(state.getAllowedActionsForUnit(p2Unit.id)).toEqual([])
  })

  it('getAllowedActionsForUnit returns [] when no AP remain', () => {
    const state = buildPairedLevelState()
    const unit = state.getActivePlayerUnits('player1')[0]
    state.turnState[unit.id].actionsRemaining = 0
    state.rollDice(1)
    expect(state.getAllowedActionsForUnit(unit.id)).toEqual([])
  })
})

describe('GameState dice-roll invariant cannot be bypassed', () => {
  it('recordAction({type:"dice_roll"}) throws on a second roll in the same turn', () => {
    const state = new GameState({ turntableData: turntable })
    state.recordAction({ type: 'dice_roll', result: 2 })
    expect(state.getCurrentDiceResult()).toBe(2)
    expect(() => state.recordAction({ type: 'dice_roll', result: 5 })).toThrow(
      /already rolled/i
    )
    // First roll preserved; second roll discarded.
    expect(state.getCurrentDiceResult()).toBe(2)
    const diceCount = state.currentTurnActions.filter(a => a.type === 'dice_roll').length
    expect(diceCount).toBe(1)
  })

  it('recordAction({type:"dice_roll"}) throws on missing or invalid face', () => {
    const state = new GameState({ turntableData: turntable })
    expect(() => state.recordAction({ type: 'dice_roll' })).toThrow(
      /D6 face/i
    )
    expect(() => state.recordAction({ type: 'dice_roll', result: 7 })).toThrow(
      /D6 face/i
    )
    expect(state.hasRolledDice()).toBe(false)
  })

  it('isValidHistoryAction rejects dice_roll without a valid D6 face', () => {
    const state = new GameState({ turntableData: turntable })
    expect(state.isValidHistoryAction({ type: 'dice_roll' })).toBe(false)
    expect(state.isValidHistoryAction({ type: 'dice_roll', result: 0 })).toBe(false)
    expect(state.isValidHistoryAction({ type: 'dice_roll', result: 7 })).toBe(false)
    expect(state.isValidHistoryAction({ type: 'dice_roll', result: 'bad' })).toBe(false)
    expect(state.isValidHistoryAction({ type: 'dice_roll', result: 3 })).toBe(true)
  })

  it('rollDice({ allowReroll: true }) still bypasses the recordAction guard intentionally', () => {
    // This documents that the only sanctioned reroll path goes through `rollDice`
    // and that callers using `recordAction` cannot opt into reroll behavior.
    const state = new GameState({ turntableData: turntable })
    state.rollDice(2)
    expect(() => state.rollDice(5, { allowReroll: true })).not.toThrow()
    expect(state.getCurrentDiceResult()).toBe(5)
    // recordAction still refuses to add another beyond what rollDice produced.
    expect(() => state.recordAction({ type: 'dice_roll', result: 6 })).toThrow(
      /already rolled/i
    )
  })

  it('no public dice-append helper exists outside rollDice / recordAction', () => {
    // Earlier iterations exposed `_appendDiceRoll` as a "conventionally private"
    // method that any caller could invoke to skip the guard. The fix inlines
    // the push into `rollDice`; this test asserts no such helper survives.
    const state = new GameState({ turntableData: turntable })
    expect(typeof state._appendDiceRoll).toBe('undefined')
  })

  it('loadHistoryJSON rejects payloads with duplicate dice_roll in the same turn (history)', () => {
    const state = buildPairedLevelState()
    const before = JSON.stringify(state.toJSON(true))
    const initial = state.toJSON(false)
    const payload = JSON.stringify({
      initialState: initial,
      history: [
        [
          { type: 'startTurn', player: 'player1', turnNumber: 1, turnStateSnapshot: {} },
          { type: 'dice_roll', result: 2 },
          { type: 'dice_roll', result: 5 },
          { type: 'endTurn', player: 'player1', turnNumber: 1 }
        ]
      ],
      currentTurnActions: []
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    // Failed import is atomic: state is not mutated.
    expect(JSON.stringify(state.toJSON(true))).toBe(before)
  })

  it('loadHistoryJSON rejects payloads with duplicate dice_roll in currentTurnActions', () => {
    const state = buildPairedLevelState()
    const before = JSON.stringify(state.toJSON(true))
    const initial = state.toJSON(false)
    const payload = JSON.stringify({
      initialState: initial,
      history: [],
      currentTurnActions: [
        { type: 'dice_roll', result: 1 },
        { type: 'dice_roll', result: 4 }
      ]
    })
    expect(state.loadHistoryJSON(payload)).toBe(false)
    expect(JSON.stringify(state.toJSON(true))).toBe(before)
  })

  it('validateHistoryPayload accepts at most one dice_roll per turn segment', () => {
    const state = new GameState({ turntableData: turntable })
    const initial = state.toJSON(false)
    const okPayload = {
      initialState: initial,
      history: [
        [
          { type: 'startTurn', player: 'player1', turnNumber: 1, turnStateSnapshot: {} },
          { type: 'dice_roll', result: 3 },
          { type: 'endTurn', player: 'player1', turnNumber: 1 }
        ]
      ],
      currentTurnActions: [{ type: 'dice_roll', result: 2 }]
    }
    expect(state.validateHistoryPayload(okPayload).ok).toBe(true)

    const badHistory = {
      ...okPayload,
      history: [[{ type: 'dice_roll', result: 1 }, { type: 'dice_roll', result: 2 }]]
    }
    const badHistoryResult = state.validateHistoryPayload(badHistory)
    expect(badHistoryResult.ok).toBe(false)
    expect(badHistoryResult.error).toMatch(/multiple dice_roll/i)

    const badCurrent = {
      ...okPayload,
      currentTurnActions: [
        { type: 'dice_roll', result: 1 },
        { type: 'dice_roll', result: 2 }
      ]
    }
    const badCurrentResult = state.validateHistoryPayload(badCurrent)
    expect(badCurrentResult.ok).toBe(false)
    expect(badCurrentResult.error).toMatch(/multiple dice_roll/i)
  })
})

describe('GameState action APIs cannot bypass dice lifecycle', () => {
  it('moveUnit throws when no dice has been rolled', () => {
    const state = buildPairedLevelState()
    const unit = state.getActivePlayerUnits('player1')[0]
    // Unit is at (0,0) facing the map center. Pick a neighbouring hex with cost 1.
    const target = { q: unit.position.q + 1, r: unit.position.r }
    expect(state.hasRolledDice()).toBe(false)
    expect(() => state.moveUnit(unit.id, target.q, target.r, { phase: 'MANOEUVRE' })).toThrow(
      /not allowed/i
    )
  })
})

describe('GameState existing action economy still passes through canPerformAction', () => {
  it('keeps fractional / negative cost rejection in canPerformAction', () => {
    const state = new GameState({ turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, isLoaded: true })
    state.units.set(unit.id, unit)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    state.rollDice(1)
    expect(state.canPerformAction('u1', ACTION_TYPES.FIRE, 0.5, 'ATTACK')).toBe(false)
    expect(state.canPerformAction('u1', ACTION_TYPES.FIRE, -1, 'ATTACK')).toBe(false)
    expect(state.canPerformAction('u1', ACTION_TYPES.FIRE, 1, 'ATTACK')).toBe(true)
  })

  it('uses ACTION_TYPES constants internally without changing fire/reload behavior', () => {
    const state = new GameState({ turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, isLoaded: true })
    state.units.set(unit.id, unit)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    state.rollDice(1)

    state.applyActionStateMutation('u1', ACTION_TYPES.FIRE, 1)
    expect(state.turnState.u1.actionsRemaining).toBe(1)
    expect(state.turnState.u1.isLoaded).toBe(false)
    state.applyActionStateMutation('u1', ACTION_TYPES.RELOAD, 1)
    expect(state.turnState.u1.isLoaded).toBe(true)
  })
})
