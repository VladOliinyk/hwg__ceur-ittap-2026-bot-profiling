import { describe, it, expect } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createUnit } from '@/domain/engine/gameUnits.js'
import { createEndedOutcome, normalizeObjectives } from '../../domain/objectives/objectives.js'
import { createRng } from '../../domain/simulation/rng.js'

function makeStartTurn(state) {
  return {
    type: 'startTurn',
    turnNumber: state.turnNumber,
    player: state.currentPlayer,
    turnStateSnapshot: state.cloneTurnStateSnapshot()
  }
}

describe('revertTo', () => {
  it('legacy move без from залишається валідним для isValidHistoryAction', () => {
    const gs = new GameState({ width: 4, height: 4 })
    expect(
      gs.isValidHistoryAction({
        type: 'move',
        unitId: 'u1',
        to: { q: 1, r: 0 },
        cost: 1
      })
    ).toBe(true)
  })

  it('відхиляє actionIndex за межами ходу (стан не змінюється)', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    gs.history = [[st, { type: 'move', unitId: 'u1', to: { q: 1, r: 0 }, cost: 1, turnNumber: 1, player: 'player1' }]]
    gs.currentTurnActions = []
    const before = typeof structuredClone === 'function'
      ? structuredClone(gs.toJSON(true))
      : JSON.parse(JSON.stringify(gs.toJSON(true)))
    expect(gs.revertTo(0, 3)).toBe(false)
    expect(gs.toJSON(true)).toEqual(before)
  })

  // Negative: two friendly units cannot end on the same hex; replay must fail and restore the pre-revert snapshot.
  it('при невдалому replay повертає повний стан до виклику', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    const u2 = createUnit('infantry', {
      id: 'u2',
      player: 'player1',
      movement: 5,
      position: { q: 2, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.addUnit(u2, 2, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const move1 = {
      type: 'move',
      unitId: 'u1',
      to: { q: 1, r: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    const move2 = {
      type: 'move',
      unitId: 'u2',
      to: { q: 1, r: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    gs.history = [[st, move1, move2]]
    gs.currentTurnActions = []

    const before = typeof structuredClone === 'function'
      ? structuredClone(gs.toJSON(true))
      : JSON.parse(JSON.stringify(gs.toJSON(true)))
    expect(gs.revertTo(0, 3)).toBe(false)
    expect(gs.toJSON(true)).toEqual(before)
  })

  it('успішний revert: відтворює стан до обраної дії', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const move1 = {
      type: 'move',
      unitId: 'u1',
      to: { q: 2, r: 0 },
      cost: 2,
      turnNumber: 1,
      player: 'player1'
    }
    gs.history = [[st, move1]]
    gs.currentTurnActions = []

    expect(gs.revertTo(0, 1)).toBe(true)
    expect(gs.history.length).toBe(0)
    expect(gs.currentTurnActions).toHaveLength(1)
    expect(gs.currentTurnActions[0].type).toBe('startTurn')
    expect(gs.units.get('u1').position).toEqual({ q: 0, r: 0 })
  })

  it('revertTo(history.length, 0) залишає startTurn поточного ходу і коректний currentPlayer', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    const u2 = createUnit('infantry', {
      id: 'u2',
      player: 'player2',
      movement: 5,
      position: { q: 4, r: 4 }
    })
    gs.addUnit(u1, 0, 0)
    gs.addUnit(u2, 4, 4)
    gs.resetPlayerTurn('player1')
    const st1 = makeStartTurn(gs)
    const move1 = {
      type: 'move',
      unitId: 'u1',
      to: { q: 1, r: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    const end1 = { type: 'endTurn', turnNumber: 1, player: 'player1' }
    gs.history = [[st1, move1, end1]]
    gs.currentTurnActions = []
    gs.currentPlayer = 'player2'
    gs.turnNumber = 2
    gs.turnState = {
      u2: { actionsRemaining: 5, isLoaded: false }
    }
    const st2 = makeStartTurn(gs)
    gs.currentTurnActions = [
      st2,
      { type: 'move', unitId: 'u2', to: { q: 5, r: 4 }, cost: 1, turnNumber: 2, player: 'player2' }
    ]

    expect(gs.revertTo(1, 0)).toBe(true)
    expect(gs.history).toHaveLength(1)
    expect(gs.currentTurnActions).toHaveLength(1)
    expect(gs.currentTurnActions[0].type).toBe('startTurn')
    expect(gs.currentTurnActions[0].player).toBe('player2')
    expect(gs.currentPlayer).toBe('player2')
    expect(gs.turnNumber).toBe(2)
    expect(gs.turnState.u1).toBeDefined()
  })

  it('replay move: після rotate зберігається facing з запису to (strict from/to)', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 },
      facing: 0
    })
    gs.addUnit(u1, 0, 0)
    gs.turnState = { u1: { actionsRemaining: 5, isLoaded: false } }
    const st = {
      type: 'startTurn',
      turnNumber: 1,
      player: 'player1',
      turnStateSnapshot: gs.cloneTurnStateSnapshot()
    }
    expect(gs.applyAction(st)).toBe(true)
    const rotate = {
      type: 'rotate',
      unitId: 'u1',
      to: { q: 0, r: 0, facing: 3 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    expect(gs.applyAction(rotate)).toBe(true)
    expect(gs.units.get('u1').facing).toBe(3)
    const move = {
      type: 'move',
      unitId: 'u1',
      from: { q: 0, r: 0, facing: 3 },
      to: { q: 2, r: 0, facing: 3 },
      cost: 2,
      turnNumber: 1,
      player: 'player1'
    }
    expect(gs.applyAction(move)).toBe(true)
    expect(gs.units.get('u1').position).toEqual({ q: 2, r: 0 })
    expect(gs.units.get('u1').facing).toBe(3)
  })

  it('replay move: actionsRemaining дорівнює бюджету мінус сума записаних cost', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.turnState = { u1: { actionsRemaining: 5, isLoaded: false } }
    const st = {
      type: 'startTurn',
      turnNumber: 1,
      player: 'player1',
      turnStateSnapshot: gs.cloneTurnStateSnapshot()
    }
    expect(gs.applyAction(st)).toBe(true)
    expect(
      gs.applyAction({
        type: 'move',
        unitId: 'u1',
        to: { q: 2, r: 0 },
        cost: 2,
        turnNumber: 1,
        player: 'player1'
      })
    ).toBe(true)
    expect(
      gs.applyAction({
        type: 'move',
        unitId: 'u1',
        from: { q: 2, r: 0 },
        to: { q: 4, r: 0 },
        cost: 2,
        turnNumber: 1,
        player: 'player1'
      })
    ).toBe(true)
    expect(gs.turnState.u1.actionsRemaining).toBe(1)
  })

  // Option A semantics (Batch 1 Task 1.3): a click on action index N undoes that clicked
  // action AND every action recorded after it within the same turn. Index 0 (startTurn) is
  // preserved because the turn boundary itself is not user-undoable.
  it('current-turn revertTo undoes clicked action and all later actions (option A semantics)', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const move0to1 = {
      type: 'move', unitId: 'u1',
      from: { q: 0, r: 0 },
      to: { q: 1, r: 0 },
      cost: 1, turnNumber: 1, player: 'player1'
    }
    const move1to2 = {
      type: 'move', unitId: 'u1',
      from: { q: 1, r: 0 },
      to: { q: 2, r: 0 },
      cost: 1, turnNumber: 1, player: 'player1'
    }
    const move2to3 = {
      type: 'move', unitId: 'u1',
      from: { q: 2, r: 0 },
      to: { q: 3, r: 0 },
      cost: 1, turnNumber: 1, player: 'player1'
    }
    gs.history = []
    gs.currentTurnActions = [st, move0to1, move1to2, move2to3]

    // Click index 2 (the second move): that action and the one after must disappear.
    expect(gs.revertTo(0, 2)).toBe(true)
    expect(gs.currentTurnActions).toHaveLength(2)
    expect(gs.currentTurnActions[0].type).toBe('startTurn')
    expect(gs.currentTurnActions[1].type).toBe('move')
    expect(gs.currentTurnActions[1].to).toMatchObject({ q: 1, r: 0 })
    expect(gs.units.get('u1').position).toEqual({ q: 1, r: 0 })
  })

  it('current-turn revertTo on the first move undoes every move in the turn (option A semantics)', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const move0to1 = {
      type: 'move', unitId: 'u1',
      from: { q: 0, r: 0 },
      to: { q: 1, r: 0 },
      cost: 1, turnNumber: 1, player: 'player1'
    }
    const move1to2 = {
      type: 'move', unitId: 'u1',
      from: { q: 1, r: 0 },
      to: { q: 2, r: 0 },
      cost: 1, turnNumber: 1, player: 'player1'
    }
    gs.history = []
    gs.currentTurnActions = [st, move0to1, move1to2]

    // Click index 1 (the first user action): undo it and everything after.
    expect(gs.revertTo(0, 1)).toBe(true)
    expect(gs.currentTurnActions).toHaveLength(1)
    expect(gs.currentTurnActions[0].type).toBe('startTurn')
    expect(gs.units.get('u1').position).toEqual({ q: 0, r: 0 })
  })

  it('revertTo restores objectives and outcome from the replay anchor', () => {
    const initialObjectives = {
      mode: 'firstSatisfied',
      conditions: [
        { id: 'p1_hold_3', type: 'surviveTurns', player: 'player1', turns: 3, winner: 'player1' }
      ]
    }
    const mutatedObjectives = {
      mode: 'firstSatisfied',
      conditions: [
        { id: 'p2_hold_1', type: 'surviveTurns', player: 'player2', turns: 1, winner: 'player2' }
      ]
    }
    const gs = new GameState({ width: 4, height: 4, objectivesData: initialObjectives })

    gs.objectives = mutatedObjectives
    gs.outcome = createEndedOutcome({
      winner: 'player2',
      reason: 'surviveTurns',
      conditionId: 'p2_hold_1'
    })

    expect(gs.revertTo(0, 0)).toBe(true)
    expect(gs.objectives).toEqual(normalizeObjectives(initialObjectives, gs))
    expect(gs.outcome.status).toBe('active')
  })

  it('applyAction(move): невідповідний action.from дає false без зміни позиції', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.turnState = { u1: { actionsRemaining: 5, isLoaded: false } }
    const st = {
      type: 'startTurn',
      turnNumber: 1,
      player: 'player1',
      turnStateSnapshot: gs.cloneTurnStateSnapshot()
    }
    expect(gs.applyAction(st)).toBe(true)
    expect(
      gs.applyAction({
        type: 'move',
        unitId: 'u1',
        to: { q: 2, r: 0 },
        cost: 2,
        turnNumber: 1,
        player: 'player1'
      })
    ).toBe(true)
    expect(gs.units.get('u1').position).toEqual({ q: 2, r: 0 })
    const bad = {
      type: 'move',
      unitId: 'u1',
      from: { q: 0, r: 0, facing: 0 },
      to: { q: 3, r: 0, facing: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    expect(gs.applyAction(bad)).toBe(false)
    expect(gs.units.get('u1').position).toEqual({ q: 2, r: 0 })
  })

  it('captureInitialState stores an immutable replay anchor', () => {
    const gs = new GameState({ width: 4, height: 4 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)

    u1.position.q = 2
    u1.position.r = 2

    const anchorUnit = gs.initialState.units.find(([id]) => id === 'u1')[1]
    expect(anchorUnit.position).toEqual({ q: 0, r: 0 })
  })

  it('recordAction snapshots move pose payloads instead of retaining references', () => {
    const gs = new GameState({ width: 4, height: 4 })
    const from = { q: 0, r: 0, facing: 0 }
    const to = { q: 1, r: 0, facing: 0 }

    gs.recordAction({
      type: 'move',
      unitId: 'u1',
      from,
      to,
      cost: 1
    })
    from.q = 9
    to.q = 9

    const action = gs.currentTurnActions[0]
    expect(action.from).toEqual({ q: 0, r: 0, facing: 0 })
    expect(action.to).toEqual({ q: 1, r: 0, facing: 0 })
  })

  it('recordAction rejects non-JSON move pose payloads instead of silently dropping fields', () => {
    const gs = new GameState({ width: 4, height: 4 })

    expect(() => gs.recordAction({
      type: 'move',
      unitId: 'u1',
      from: { q: 0, r: 0, debug: () => {} },
      to: { q: 1, r: 0 },
      cost: 1
    })).toThrow(/action\.from must be JSON-serializable/)

    expect(() => gs.recordAction({
      type: 'move',
      unitId: 'u1',
      from: { q: 0, r: 0 },
      to: { q: Infinity, r: 0 },
      cost: 1
    })).toThrow(/action\.to must be JSON-serializable/)
  })

  it('rejects replay move coordinates that only pass through Number coercion', () => {
    const gs = new GameState({ width: 4, height: 4 })

    expect(gs.isValidHistoryAction({
      type: 'move',
      unitId: 'u1',
      to: { q: '1', r: '0' },
      cost: 1
    })).toBe(true)

    expect(gs.isValidHistoryAction({
      type: 'move',
      unitId: 'u1',
      to: { q: null, r: 0 },
      cost: 1
    })).toBe(false)

    expect(gs.isValidHistoryAction({
      type: 'move',
      unitId: 'u1',
      from: '0,0',
      to: { q: 1, r: 0 },
      cost: 1
    })).toBe(false)

    expect(gs.isValidHistoryAction({
      type: 'move',
      unitId: 'u1',
      from: { q: false, r: 0 },
      to: { q: 1, r: 0 },
      cost: 1
    })).toBe(false)
  })

  it('rejects degenerate legacy move rows when recorded cost does not match current reachability', () => {
    const gs = new GameState({ width: 4, height: 4 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')

    expect(gs.applyAction({
      type: 'move',
      unitId: 'u1',
      from: { q: 1, r: 0, facing: 0 },
      to: { q: 1, r: 0, facing: 0 },
      cost: 99,
      turnNumber: 1,
      player: 'player1'
    })).toBe(false)
    expect(gs.units.get('u1').position).toEqual({ q: 0, r: 0 })
  })

  it('revertTo replays legacy move rows whose from pose was overwritten with to', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st1 = makeStartTurn(gs)
    const legacyMove = {
      type: 'move',
      unitId: 'u1',
      from: { q: 1, r: 0, facing: 0 },
      to: { q: 1, r: 0, facing: 0 },
      cost: 2,
      turnNumber: 1,
      player: 'player1'
    }
    const end1 = {
      type: 'endTurn',
      turnNumber: 1,
      player: 'player1'
    }
    const st2 = {
      type: 'startTurn',
      turnNumber: 1,
      player: 'player2',
      turnStateSnapshot: {}
    }
    gs.history = [[st1, legacyMove, end1]]
    gs.currentTurnActions = [st2]

    expect(gs.revertTo(1, 0)).toBe(true)
    expect(gs.units.get('u1').position).toEqual({ q: 1, r: 0 })
  })

  // Regression: replay inside revertTo runs with history/currentTurnActions temporarily
  // emptied, so a lethal attack (removeUnit → updateInitialState) used to overwrite the
  // replay anchor with a mid-replay snapshot, breaking every later revertTo.
  it('replay летальної атаки не перезаписує initialState; повторний revertTo працює', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 },
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    const foe = createUnit('infantry', {
      id: 'foe',
      player: 'player2',
      health: 50,
      position: { q: 1, r: 0 }
    })
    const foe2 = createUnit('infantry', {
      id: 'foe2',
      player: 'player2',
      position: { q: 5, r: 5 }
    })
    gs.addUnit(atk, 0, 0)
    gs.addUnit(foe, 1, 0)
    gs.addUnit(foe2, 5, 5)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const attack = {
      type: 'attack',
      unitId: 'atk',
      targetUnitId: 'foe',
      from: { q: 0, r: 0, facing: 1 },
      to: { q: 1, r: 0, facing: 4 },
      cost: 1,
      damage: 100,
      turnNumber: 1,
      player: 'player1'
    }
    const moveA = {
      type: 'move',
      unitId: 'atk',
      from: { q: 0, r: 0, facing: 1 },
      to: { q: 0, r: 1, facing: 1 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    const moveB = {
      type: 'move',
      unitId: 'atk',
      from: { q: 0, r: 1, facing: 1 },
      to: { q: 0, r: 2, facing: 1 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    gs.history = []
    gs.currentTurnActions = [st, attack, moveA, moveB]

    const anchorBefore = typeof structuredClone === 'function'
      ? structuredClone(gs.initialState)
      : JSON.parse(JSON.stringify(gs.initialState))

    // Revert to a point AFTER the kill: replay passes through the lethal attack.
    expect(gs.revertTo(0, 3)).toBe(true)
    expect(gs.initialState).toEqual(anchorBefore)

    // User-visible symptom: a second revert replaying the same attack must still succeed.
    expect(gs.revertTo(0, 2)).toBe(true)
    expect(gs.initialState).toEqual(anchorBefore)
    expect(gs.units.get('atk').position).toEqual({ q: 0, r: 0 })
    expect(gs.units.has('foe')).toBe(false)
  })

  it('після revertTo turnsSinceLastDamage відповідає відтвореному таймлайну, а не покинутому', () => {
    const gs = new GameState({ width: 8, height: 8 })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    const u2 = createUnit('infantry', {
      id: 'u2',
      player: 'player2',
      movement: 5,
      position: { q: 4, r: 4 }
    })
    gs.addUnit(u1, 0, 0)
    gs.addUnit(u2, 4, 4)
    gs.resetPlayerTurn('player1')
    const st1 = makeStartTurn(gs)
    const move1 = {
      type: 'move',
      unitId: 'u1',
      to: { q: 1, r: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    const end1 = { type: 'endTurn', turnNumber: 1, player: 'player1' }
    gs.history = [[st1, move1, end1]]
    gs.currentPlayer = 'player2'
    gs.turnNumber = 2
    gs.turnState = {
      u2: { actionsRemaining: 5, isLoaded: false }
    }
    const st2 = makeStartTurn(gs)
    gs.currentTurnActions = [
      st2,
      { type: 'move', unitId: 'u2', to: { q: 5, r: 4 }, cost: 1, turnNumber: 2, player: 'player2' }
    ]
    // Live counter reflects the abandoned continuation, not the replayed timeline.
    gs.turnsSinceLastDamage = 5

    expect(gs.revertTo(1, 0)).toBe(true)
    // Replayed timeline contains exactly one endTurn (turn 1).
    expect(gs.turnsSinceLastDamage).toBe(1)
  })

  it('revertTo re-seeds the RNG stream from the replay anchor', () => {
    const gs = new GameState({ width: 8, height: 8, rng: createRng('revert-anchor-rng') })
    const u1 = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      movement: 5,
      position: { q: 0, r: 0 }
    })
    gs.addUnit(u1, 0, 0)
    gs.resetPlayerTurn('player1')
    const st = makeStartTurn(gs)
    const move1 = {
      type: 'move',
      unitId: 'u1',
      to: { q: 1, r: 0 },
      cost: 1,
      turnNumber: 1,
      player: 'player1'
    }
    gs.history = []
    gs.currentTurnActions = [st, move1]

    const anchor = JSON.parse(JSON.stringify(gs.initialState))
    expect(anchor.rng).toBeDefined()

    // Advance the live stream past the anchor point.
    gs.drawDiceFaceFromRng({ allowReroll: true })
    gs.drawDiceFaceFromRng({ allowReroll: true })

    expect(gs.revertTo(0, 1)).toBe(true)

    // Post-revert stream continues from the anchor's persisted state...
    expect(gs.toJSON(false).rng).toEqual(anchor.rng)
    // ...and produces the same next faces as a fresh restore of the anchor.
    const reference = GameState.fromJSON(anchor)
    const refFaces = [0, 1, 2].map(() => reference.drawDiceFaceFromRng({ allowReroll: true }))
    const liveFaces = [0, 1, 2].map(() => gs.drawDiceFaceFromRng({ allowReroll: true }))
    expect(liveFaces).toEqual(refFaces)
  })
})
