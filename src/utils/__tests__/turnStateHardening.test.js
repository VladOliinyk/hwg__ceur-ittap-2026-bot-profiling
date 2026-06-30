import { describe, expect, it } from 'vitest'
import { computeReachableHexes } from '@/domain/engine/actionEconomy.js'
import { GameState } from '@/domain/engine/gameState.js'
import { GameUnit } from '@/domain/engine/gameUnits.js'

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

describe('GameUnit isLoaded normalization', () => {
  it('parses string booleans safely', () => {
    const loaded = new GameUnit({ isLoaded: 'true' })
    const unloaded = new GameUnit({ isLoaded: 'false' })

    expect(loaded.isLoaded).toBe(true)
    expect(unloaded.isLoaded).toBe(false)
  })
})

describe('GameState turnState hardening', () => {
  it('resetPlayerTurn clamps and normalizes action budget', () => {
    const state = new GameState()
    const unitA = new GameUnit({ id: 'u1', player: 'player1', movement: -2, isLoaded: true })
    const unitB = new GameUnit({ id: 'u2', player: 'player1', movement: '3', isLoaded: false })

    state.units.set(unitA.id, unitA)
    state.units.set(unitB.id, unitB)

    state.resetPlayerTurn('player1')

    expect(state.turnState.u1.actionsRemaining).toBe(0)
    expect(state.turnState.u2.actionsRemaining).toBe(3)
    expect(state.turnState.u2.isLoaded).toBe(false)
  })

  it('stores turnState rows in a null-prototype table', () => {
    const state = new GameState()
    const unit = new GameUnit({ id: '__proto__', player: 'player1', movement: 3, isLoaded: true })
    state.units.set(unit.id, unit)

    state.resetPlayerTurn('player1')

    expect(Object.getPrototypeOf(state.turnState)).toBe(null)
    expect(state.turnState['__proto__'].actionsRemaining).toBe(3)
    expect({}.actionsRemaining).toBeUndefined()
  })

  it('fromJSON sanitizes malformed turnState entries', () => {
    const raw = {
      width: 3,
      height: 3,
      hexes: [],
      units: [
        ['u1', { id: 'u1', player: 'player1', movement: 2, isLoaded: true, position: { q: 0, r: 0 } }],
        ['u2', { id: 'u2', player: 'player1', movement: 4, isLoaded: false, position: { q: 1, r: 0 } }],
      ],
      currentPlayer: 'player1',
      turnNumber: 1,
      gamePhase: 'movement',
      turnState: {
        u1: { actionsRemaining: 'abc', isLoaded: 'false' },
        u2: { actionsRemaining: -99, isLoaded: true },
      },
    }

    const state = GameState.fromJSON(raw)

    expect(state.turnState.u1.actionsRemaining).toBe(2)
    expect(state.turnState.u1.isLoaded).toBe(true)
    expect(state.turnState.u2.actionsRemaining).toBe(0)
    expect(state.turnState.u2.isLoaded).toBe(true)
  })
})

describe('GameState turntable and action validation', () => {
  it('recordAction persists dice_roll result for timeline/UI', () => {
    const state = new GameState()
    state.recordAction({ type: 'dice_roll', result: 4, unitName: 'D6' })
    const last = state.currentTurnActions[state.currentTurnActions.length - 1]
    expect(last.type).toBe('dice_roll')
    expect(last.result).toBe(4)
    expect(last.unitName).toBe('D6')
  })

  it('returns allowed actions by dice and phase', () => {
    const state = new GameState({ turntableData: turntable })
    const allowed = state.getAllowedActions(1, 'ATTACK', 'player1')
    expect(allowed).toEqual(['fire', 'reload'])
  })

  it('getCurrentDiceResult() is null when no dice_roll in current turn', () => {
    const state = new GameState({ turntableData: turntable })
    expect(state.getCurrentDiceResult()).toBeNull()
  })

  it('getAllowedActions returns [] when diceResult is null', () => {
    const state = new GameState({ turntableData: turntable })
    expect(state.getAllowedActions(null, 'ATTACK', 'player1')).toEqual([])
  })

  it('Новий хід: після кидка та endTurn getCurrentDiceResult знову null, кидок лишається в історії', () => {
    const state = new GameState({ turntableData: turntable })
    state.recordAction({ type: 'dice_roll', result: 4 })
    expect(state.getCurrentDiceResult()).toBe(4)

    state.endTurn()

    expect(state.getCurrentDiceResult()).toBeNull()
    const lastTurn = state.history[state.history.length - 1]
    expect(Array.isArray(lastTurn)).toBe(true)
    expect(lastTurn.some(a => a && a.type === 'dice_roll' && a.result === 4)).toBe(true)
  })

  it('blocks fire when weapon is empty and allows reload', () => {
    const state = new GameState({ turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, isLoaded: false })
    state.units.set(unit.id, unit)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: false }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(state.canPerformAction('u1', 'fire', 1, 'ATTACK')).toBe(false)
    expect(state.canPerformAction('u1', 'reload', 1, 'ATTACK')).toBe(true)
  })

  it('mutates isLoaded and budget when applying fire/reload', () => {
    const state = new GameState({ turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, isLoaded: true })
    state.units.set(unit.id, unit)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    state.applyActionStateMutation('u1', 'fire', 1)
    expect(state.turnState.u1.actionsRemaining).toBe(1)
    expect(state.turnState.u1.isLoaded).toBe(false)
    expect(unit.isLoaded).toBe(false)

    state.applyActionStateMutation('u1', 'reload', 1)
    expect(state.turnState.u1.actionsRemaining).toBe(0)
    expect(state.turnState.u1.isLoaded).toBe(true)
    expect(unit.isLoaded).toBe(true)
  })

  it('rejects fractional action cost', () => {
    const state = new GameState({ turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, isLoaded: true })
    state.units.set(unit.id, unit)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(state.canPerformAction('u1', 'fire', 0.5, 'ATTACK')).toBe(false)
    state.applyActionStateMutation('u1', 'fire', 0.5)
    expect(state.turnState.u1.actionsRemaining).toBe(2)
    expect(state.turnState.u1.isLoaded).toBe(true)
  })
})

describe('GameState applyAction(attack) LOS hardening', () => {
  it('returns false when replay attack target is not authorized (LOS / arc)', () => {
    const state = new GameState({ turntableData: turntable, width: 3, height: 1 })
    const attacker = new GameUnit({
      id: 'a1',
      type: 'artillery',
      player: 'player1',
      attackPower: 50,
      attackRange: 3,
      attackAngle: 0,
      facing: 3,
      movement: 3,
      isLoaded: true,
    })
    const target = new GameUnit({
      id: 't1',
      player: 'player2',
      health: 100,
      maxHealth: 100,
      movement: 3,
      isLoaded: true,
    })
    state.addUnit(attacker, 0, 0)
    state.addUnit(target, 1, 0)
    state.turnState.a1 = { actionsRemaining: 2, isLoaded: true }

    const badAttack = {
      type: 'attack',
      unitId: 'a1',
      targetUnitId: 't1',
      damage: 50,
      cost: 1,
      actionType: 'fire',
    }
    expect(state.applyAction(badAttack)).toBe(false)
    expect(state.units.get('t1').health).toBe(100)
  })
})

describe('GameState replay hardening', () => {
  it('bootstraps turnState on init when units are placed from level', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 2, height: 1 },
        map: [{ q: 0, r: 0, player1Spawn: true }, { q: 1, r: 0, player2Spawn: true }],
      },
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
      unitsData: {
        player1: { units: [{ type: 'armored', count: 1 }] },
        player2: { units: [{ type: 'armored', count: 1 }] },
      },
    })

    const p1Units = state.getActivePlayerUnits('player1')
    expect(p1Units.length).toBe(1)
    expect(p1Units[0].id).toBe('p1_arm1')
    expect(state.turnState[p1Units[0].id]).toBeDefined()
    expect(typeof state.turnState[p1Units[0].id].actionsRemaining).toBe('number')
  })

  it('fromJSON keeps hex.unit identical to units map (move consistency after revert/load)', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 2, height: 1 },
        map: [{ q: 0, r: 0, player1Spawn: true }, { q: 1, r: 0, player2Spawn: true }],
      },
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
      unitsData: {
        player1: { units: [{ type: 'armored', count: 1 }] },
        player2: { units: [{ type: 'armored', count: 1 }] },
      },
    })

    const loaded = GameState.fromJSON(state.toJSON(false))
    loaded.units.forEach(unit => {
      const hex = loaded.getHex(unit.position.q, unit.position.r)
      expect(hex).toBeTruthy()
      expect(hex.unit).toBe(unit)
    })
  })

  it('replay applyAction(attack) re-applies damage to target', () => {
    const state = new GameState({ turntableData: turntable })
    const attacker = new GameUnit({ id: 'a1', player: 'player1', attackPower: 50, attackRange: 3, movement: 3, isLoaded: true })
    const target = new GameUnit({ id: 't1', player: 'player2', health: 100, maxHealth: 100, movement: 3, isLoaded: true })
    state.addUnit(attacker, 0, 0)
    state.addUnit(target, 1, 0)
    state.turnState.a1 = { actionsRemaining: 3, isLoaded: true }

    state.performAttack('a1', 1, 0, { actionType: 'fire', cost: 1, phase: 'ATTACK', diceResult: 1 })
    const attackAction = state.currentTurnActions[state.currentTurnActions.length - 1]

    const replayState = GameState.fromJSON(state.initialState)
    replayState.applyAction(attackAction)

    const replayTarget = replayState.units.get('t1')
    expect(replayTarget.health).toBe(50)
    expect(replayState.turnState.a1.isLoaded).toBe(false)
    expect(replayState.turnState.a1.actionsRemaining).toBe(2)
  })
})

describe('exploit attempts from client actionMeta', () => {
  it('performAttack: fake actionType (reload) and client cost:0 — reject exploit or apply authoritative fire', () => {
    const state = new GameState({ turntableData: turntable })
    const attacker = new GameUnit({
      id: 'a1',
      player: 'player1',
      attackPower: 50,
      attackRange: 3,
      movement: 3,
      isLoaded: true,
    })
    const target = new GameUnit({
      id: 't1',
      player: 'player2',
      health: 100,
      maxHealth: 100,
      movement: 3,
      isLoaded: true,
    })
    state.addUnit(attacker, 0, 0)
    state.addUnit(target, 1, 0)
    state.turnState.a1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    const actionsBefore = state.currentTurnActions.length

    // UI-style exploit: wrong actionType + zero cost (must not grant a free "reload" path or free shot)
    let attackError
    try {
      state.performAttack('a1', 1, 0, {
        actionType: 'reload',
        cost: 0,
        phase: 'ATTACK',
        diceResult: 1,
      })
    } catch (e) {
      attackError = e
    }

    if (attackError) {
      expect(attackError).toBeInstanceOf(Error)
      expect(String(attackError.message)).toMatch(/not allowed/i)
      expect(state.currentTurnActions.length).toBe(actionsBefore)
      expect(state.turnState.a1.actionsRemaining).toBe(2)
      expect(state.turnState.a1.isLoaded).toBe(true)
      expect(state.units.get('t1').health).toBe(100)
    } else {
      expect(state.turnState.a1.isLoaded).toBe(false)
      expect(state.turnState.a1.actionsRemaining).toBe(1)
      expect(state.units.get('t1').health).toBe(50)
      const last = state.currentTurnActions[state.currentTurnActions.length - 1]
      expect(last.type).toBe('attack')
      expect(last.actionType).toBe('fire')
      expect(last.cost).toBe(1)
    }
  })

  it('performAttack: rejects hex outside LOS — blocked by impassable terrain (direct fire)', () => {
    const state = new GameState({ turntableData: turntable, width: 4, height: 1 })
    const attacker = new GameUnit({
      id: 'a1',
      type: 'infantry',
      player: 'player1',
      attackPower: 50,
      attackRange: 3,
      attackAngle: 1,
      facing: 1,
      movement: 3,
      isLoaded: true,
    })
    const target = new GameUnit({
      id: 't1',
      player: 'player2',
      health: 100,
      maxHealth: 100,
      movement: 3,
      isLoaded: true,
    })
    state.addUnit(attacker, 0, 0)
    state.addUnit(target, 2, 0)
    const wall = state.getHex(1, 0)
    expect(wall).toBeTruthy()
    wall.passable = false
    state.turnState.a1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(() => state.performAttack('a1', 2, 0, { diceResult: 1 })).toThrow(/valid line-of-fire|line-of-fire target/i)
    expect(state.units.get('t1').health).toBe(100)
    expect(state.turnState.a1.isLoaded).toBe(true)
  })

  it('performAttack: rejects hex outside allowed attack arc (attackAngle / facing)', () => {
    const state = new GameState({ turntableData: turntable, width: 3, height: 1 })
    const attacker = new GameUnit({
      id: 'a1',
      type: 'artillery',
      player: 'player1',
      attackPower: 50,
      attackRange: 3,
      attackAngle: 0,
      facing: 3,
      movement: 3,
      isLoaded: true,
    })
    const target = new GameUnit({
      id: 't1',
      player: 'player2',
      health: 100,
      maxHealth: 100,
      movement: 3,
      isLoaded: true,
    })
    state.addUnit(attacker, 0, 0)
    state.addUnit(target, 1, 0)
    state.turnState.a1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(() => state.performAttack('a1', 1, 0, { diceResult: 1 })).toThrow(/valid line-of-fire|line-of-fire target/i)
    expect(state.units.get('t1').health).toBe(100)
    expect(state.turnState.a1.isLoaded).toBe(true)
  })

  it('moveUnit: client cost:1 is rejected when authoritative path cost is higher (e.g. 3)', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, player1Spawn: true },
          { q: 1, r: 0, terrain: 'water' },
          { q: 2, r: 0, player2Spawn: true },
        ],
      },
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'water', name: 'Water', color: '#2196F3', terrainDifficulty: 2 },
      ],
    })

    const unit = new GameUnit({
      id: 'u1',
      player: 'player1',
      movement: 5,
      facing: 1,
      maxTerrainDifficulty: 3,
      isLoaded: true,
    })
    state.addUnit(unit, 0, 0)
    state.turnState.u1 = { actionsRemaining: 5, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    const boardState = state.createBoardSnapshot('u1')
    const reachable = new Set()
    const costs = new Map()
    computeReachableHexes({
      unit: state.units.get('u1'),
      boardState,
      actionsRemaining: 5,
      targetSet: reachable,
      costMap: costs,
    })
    expect(reachable.has('1,0')).toBe(true)
    expect(costs.get('1,0')).toBe(3)

    // Same shape as GameMapBlock / UI: client sends fake low cost; engine must charge authoritative path cost (3).
    state.moveUnit('u1', 1, 0, {
      actionType: 'move',
      cost: 1,
      phase: 'MANOEUVRE',
      diceResult: 1,
    })
    expect(state.turnState.u1.actionsRemaining).toBe(2)
    const lastMove = state.currentTurnActions.filter(a => a.type === 'move').pop()
    expect(lastMove.cost).toBe(3)
  })

  it('moveUnit: throws when target hex is outside authoritative reachability', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, player1Spawn: true },
          { q: 1, r: 0, terrain: 'water' },
          { q: 2, r: 0, player2Spawn: true },
        ],
      },
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'water', name: 'Water', color: '#2196F3', terrainDifficulty: 2 },
      ],
    })

    const unit = new GameUnit({
      id: 'u1',
      player: 'player1',
      movement: 5,
      facing: 1,
      maxTerrainDifficulty: 3,
      isLoaded: true,
    })
    state.addUnit(unit, 0, 0)
    state.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(() =>
      state.moveUnit('u1', 1, 0, {
        actionType: 'move',
        cost: 1,
        phase: 'MANOEUVRE',
        diceResult: 1,
      })
    ).toThrow(/not reachable/i)
  })

  it('moveUnit: motionKind reverse checks turntable "reverse" (distinct from "move")', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains' },
          { q: 2, r: 0, terrain: 'plains' },
        ],
      },
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
      ],
    })

    const unit = new GameUnit({
      id: 'u1',
      player: 'player1',
      movement: 5,
      facing: 1,
      maxTerrainDifficulty: 3,
      isLoaded: true,
    })
    state.addUnit(unit, 1, 0)
    state.turnState.u1 = { actionsRemaining: 5, isLoaded: true }
    // Roll 2: MANOEUVRE row is only ["move"] — no "reverse"
    state.currentTurnActions.push({ type: 'dice_roll', result: 2 })

    expect(() =>
      state.moveUnit('u1', 0, 0, {
        motionKind: 'reverse',
        phase: 'MANOEUVRE',
        diceResult: 2,
      })
    ).toThrow(/not allowed/i)

    state.currentTurnActions = [{ type: 'dice_roll', result: 1 }]
    state.turnState.u1 = { actionsRemaining: 5, isLoaded: true }

    state.moveUnit('u1', 0, 0, {
      motionKind: 'reverse',
      phase: 'MANOEUVRE',
      diceResult: 1,
    })
    expect(state.units.get('u1').position).toEqual({ q: 0, r: 0 })
    const lastMove = state.currentTurnActions.filter(a => a.type === 'move').pop()
    expect(lastMove.actionType).toBe('reverse')
  })
})

describe('GameState current player guard', () => {
  it('canPerformAction rejects unit owned by inactive player when turnState has entries for both', () => {
    const state = new GameState({ currentPlayer: 'player1', turntableData: turntable })
    const p1Unit = new GameUnit({ id: 'p1u', player: 'player1', movement: 3, isLoaded: true })
    const p2Unit = new GameUnit({ id: 'p2u', player: 'player2', movement: 3, isLoaded: true })
    state.addUnit(p1Unit, 0, 0)
    state.addUnit(p2Unit, 4, 4)
    state.turnState.p1u = { actionsRemaining: 3, isLoaded: true }
    state.turnState.p2u = { actionsRemaining: 3, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(state.canPerformAction('p1u', 'move', 1, 'MANOEUVRE')).toBe(true)
    expect(state.canPerformAction('p2u', 'move', 1, 'MANOEUVRE')).toBe(false)
  })

  it('canPerformAction inactive-player rejection survives toJSON/fromJSON round-trip', () => {
    const seedState = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 6, height: 6 },
        map: [
          { q: 0, r: 0, player1Spawn: true },
          { q: 5, r: 5, player2Spawn: true },
        ],
      },
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
      unitsData: {
        player1: { units: [{ type: 'armored', count: 1 }] },
        player2: { units: [{ type: 'armored', count: 1 }] },
      },
    })
    seedState.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    const loaded = GameState.fromJSON(seedState.toJSON(true))
    const p1Id = loaded.getActivePlayerUnits('player1')[0].id
    const p2Id = loaded.getActivePlayerUnits('player2')[0].id

    expect(loaded.turnState[p1Id]).toBeDefined()
    expect(loaded.turnState[p2Id]).toBeDefined()
    expect(loaded.canPerformAction(p1Id, 'move', 1, 'MANOEUVRE')).toBe(true)
    expect(loaded.canPerformAction(p2Id, 'move', 1, 'MANOEUVRE')).toBe(false)
  })

  it('moveUnit rejects unit owned by inactive player', () => {
    const state = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 1, r: 0, terrain: 'plains' },
          { q: 2, r: 0, terrain: 'plains' },
        ],
      },
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
    })
    const p2Unit = new GameUnit({ id: 'p2u', player: 'player2', movement: 3, facing: 4, isLoaded: true })
    state.addUnit(p2Unit, 2, 0)
    state.turnState.p2u = { actionsRemaining: 3, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(() => state.moveUnit('p2u', 1, 0, { phase: 'MANOEUVRE', diceResult: 1 })).toThrow(/not allowed/i)
    expect(state.units.get('p2u').position).toEqual({ q: 2, r: 0 })
  })

  it('performAttack rejects when attacker belongs to inactive player', () => {
    const state = new GameState({ currentPlayer: 'player1', turntableData: turntable })
    const p2Attacker = new GameUnit({
      id: 'enemyA',
      player: 'player2',
      attackPower: 50,
      attackRange: 3,
      movement: 3,
      isLoaded: true,
    })
    const p1Target = new GameUnit({
      id: 'myT',
      player: 'player1',
      health: 100,
      maxHealth: 100,
      movement: 3,
      isLoaded: true,
    })
    state.addUnit(p2Attacker, 0, 0)
    state.addUnit(p1Target, 1, 0)
    state.turnState.enemyA = { actionsRemaining: 3, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(() => state.performAttack('enemyA', 1, 0, { diceResult: 1 })).toThrow(/not allowed/i)
    expect(state.units.get('myT').health).toBe(100)
  })

  it('canPerformAction tolerates whitespace/case variants in player ids', () => {
    const state = new GameState({ currentPlayer: 'player1', turntableData: turntable })
    const unit = new GameUnit({ id: 'u1', player: ' player1 ', movement: 3, isLoaded: true })
    state.addUnit(unit, 0, 0)
    state.turnState.u1 = { actionsRemaining: 3, isLoaded: true }
    state.currentTurnActions.push({ type: 'dice_roll', result: 1 })

    expect(state.canPerformAction('u1', 'move', 1, 'MANOEUVRE')).toBe(true)
  })
})

describe('GameState reachability cache pooling', () => {
  it('keeps the same Set and Map instances and clears them on invalidation', () => {
    const state = new GameState()
    const unit = new GameUnit({ id: 'u1', player: 'player1', movement: 3, facing: 1 })
    state.addUnit(unit, 1, 1)
    state.resetPlayerTurn('player1')

    const costMapRef = state._reachableHexCosts
    const first = state.ensureReachabilityCache('u1')
    expect(first).toBe(state.reachableHexesCache)
    expect(first.size).toBeGreaterThan(0)
    expect(state._reachableHexCosts).toBe(costMapRef)
    expect(costMapRef.size).toBeGreaterThan(0)

    state.invalidateReachabilityCache()
    expect(state.reachableHexesCache).toBe(first)
    expect(first.size).toBe(0)
    expect(state._reachableHexCosts).toBe(costMapRef)
    expect(costMapRef.size).toBe(0)

    const second = state.ensureReachabilityCache('u1')
    expect(second).toBe(first)
    expect(second.size).toBeGreaterThan(0)
    expect(state._reachableHexCosts).toBe(costMapRef)
    expect(costMapRef.size).toBeGreaterThan(0)
  })
})
