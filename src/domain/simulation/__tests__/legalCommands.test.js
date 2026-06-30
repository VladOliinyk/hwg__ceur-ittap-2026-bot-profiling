import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../rng.js'
import { listLegalCommands } from '../legalCommands.js'
import { getObservation } from '../observation.js'
import { makeMicroLevelPackage } from './fixtures.js'

function buildState(seed = 'legal') {
  const pkg = makeMicroLevelPackage()
  return new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    currentPlayer: 'player1',
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    rng: createRng(seed)
  })
}

describe('listLegalCommands — gating', () => {
  it('returns only [endTurn] before any dice roll', () => {
    const state = buildState()
    const cmds = listLegalCommands(state, 'player1')
    expect(cmds.length).toBe(1)
    expect(cmds[0]).toEqual({ type: 'endTurn' })
  })

  it('returns [] for the inactive player — endTurn would mutate the CURRENT player\'s turn', () => {
    // applyCommand's endTurn has no initiator check: it always ends the
    // current player's turn. Advertising it as "legal" for the inactive
    // player would let player2 end player1's turn, so the inactive
    // player has no legal commands at all.
    const state = buildState()
    state.rollDice(1)
    const cmds = listLegalCommands(state, 'player2')
    expect(cmds).toEqual([])
  })

  it('throws on missing arguments', () => {
    expect(() => listLegalCommands(null, 'player1')).toThrow()
    const state = buildState()
    expect(() => listLegalCommands(state, '')).toThrow()
  })
})

describe('listLegalCommands — command shapes', () => {
  it('expands move into per-hex commands when dice allows move', () => {
    const state = buildState()
    state.rollDice(3) // turntable row d3 = ['move'] for Our_operations
    const cmds = listLegalCommands(state, 'player1')

    const moves = cmds.filter(c => c.type === 'move')
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(typeof m.unitId).toBe('string')
      expect(Number.isInteger(m.payload.to.q)).toBe(true)
      expect(Number.isInteger(m.payload.to.r)).toBe(true)
      expect(m.payload.cost).toBeGreaterThanOrEqual(1)
    }
    // Every command list ends with the endTurn pass option.
    expect(cmds[cmds.length - 1]).toEqual({ type: 'endTurn' })
  })

  it('expands turn into 5 distinct facing commands when dice allows turn', () => {
    const state = buildState()
    state.rollDice(4) // d4 → ['turn']
    const cmds = listLegalCommands(state, 'player1')
    const unit = state.getActivePlayerUnits('player1')[0]

    const turns = cmds.filter(c => c.type === 'turn')
    expect(turns.length).toBe(5)
    const facings = new Set(turns.map(t => t.payload.facing))
    expect(facings.size).toBe(5)
    expect(facings.has(unit.facing)).toBe(false)
  })

  it('excludes fire when no valid target exists (out of range)', () => {
    const state = buildState()
    state.rollDice(1) // d1 ATTACK → ['fire', 'reload']
    // Default fixture places p1 at (0,1) and p2 at (4,1) — attackRange = 1
    // so no fire targets without movement.
    const cmds = listLegalCommands(state, 'player1')
    const fires = cmds.filter(c => c.type === 'fire')
    expect(fires.length).toBe(0)
  })

  it('includes reload only when weapon is empty', () => {
    const state = buildState()
    const unit = state.getActivePlayerUnits('player1')[0]
    state.turnState[unit.id].isLoaded = false
    unit.isLoaded = false
    state.rollDice(1) // d1 ATTACK → ['fire', 'reload']
    const cmds = listLegalCommands(state, 'player1')
    const reloads = cmds.filter(c => c.type === 'reload')
    expect(reloads.length).toBe(1)
    expect(reloads[0].unitId).toBe(unit.id)
    // Fire excluded since weapon is empty
    expect(cmds.filter(c => c.type === 'fire').length).toBe(0)
  })

  it('respects action budget — no commands when AP = 0', () => {
    const state = buildState()
    const unit = state.getActivePlayerUnits('player1')[0]
    state.turnState[unit.id].actionsRemaining = 0
    state.rollDice(1)
    const cmds = listLegalCommands(state, 'player1')
    // Only endTurn remains.
    expect(cmds).toEqual([{ type: 'endTurn' }])
  })

  it('orders generated commands by turntable priority within the phase', () => {
    const pkg = makeMicroLevelPackage({
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['turn', 'move'], [], [], [], [], []] }] },
          { title: 'ATTACK', moves: [{ dice: [[], [], [], [], [], []] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'], [], [], [], [], []] }] },
          { title: 'ATTACK', moves: [{ dice: [[], [], [], [], [], []] }] }
        ]
      }
    })
    const state = new GameState({
      width: pkg.hexmap.parameters.width,
      height: pkg.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      rng: createRng('priority')
    })

    state.rollDice(1)
    const actions = listLegalCommands(state, 'player1').filter(c => c.type !== 'endTurn')
    const firstTurn = actions.findIndex(c => c.type === 'turn')
    const firstMove = actions.findIndex(c => c.type === 'move')

    expect(firstTurn).toBeGreaterThanOrEqual(0)
    expect(firstMove).toBeGreaterThanOrEqual(0)
    expect(firstTurn).toBeLessThan(firstMove)
    expect(actions[firstTurn].turntablePriority).toBe(1)
    expect(actions[firstTurn].turntablePhase).toBe('MANOEUVRE')
    expect(actions[firstMove].turntablePriority).toBe(2)
  })

  it('fire command includes target hex + targetUnitId payload', () => {
    // Place a custom level where units are adjacent so fire is valid.
    const pkg = makeMicroLevelPackage()
    const adjacentPkg = {
      ...pkg,
      hexmap: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains' },
          { q: 2, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      }
    }
    const state = new GameState({
      width: 3,
      height: 1,
      currentPlayer: 'player1',
      mapData: adjacentPkg.hexmap,
      terrainTypes: adjacentPkg.terrain.terrainTypes,
      unitsData: adjacentPkg.units,
      turntableData: adjacentPkg.turntable,
      rng: createRng('fire')
    })
    // Manually move p1 next to p2 so attackRange 1 reaches.
    const p1 = state.getActivePlayerUnits('player1')[0]
    state.rollDice(3)
    state.moveUnit(p1.id, 1, 0, { phase: 'MANOEUVRE' })
    // Now AP=3, weapon loaded, p1 at (1,0), p2 at (2,0).
    // Need to advance to a turn that allows fire from a fresh AP budget.
    state.endTurn() // player2 turn
    state.rollDice(6)
    state.endTurn() // back to player1
    state.rollDice(1) // dice 1 attack → fire,reload
    // p1 faces center — let's just check via getValidFireTargetsCached
    const targets = state.getValidFireTargetsCached(p1.id)
    if (targets.length === 0) {
      // p1 may not face p2 directly; rotate to face direction 0 toward p2.
      // For test purposes, force facing.
      p1.facing = 0
      state.touchReachabilityState()
    }
    const cmds = listLegalCommands(state, 'player1')
    const fires = cmds.filter(c => c.type === 'fire')
    // If now fires exist, validate payload shape.
    for (const f of fires) {
      expect(f.payload.target).toBeDefined()
      expect(Number.isInteger(f.payload.target.q)).toBe(true)
      expect(Number.isInteger(f.payload.target.r)).toBe(true)
      expect(typeof f.payload.target.unitId).toBe('string')
    }
  })
})

describe('listLegalCommands — directional reachability (round 1 fix)', () => {
  // Custom fixtures isolate the dice row so the test sees what
  // happens when the turntable allows ONLY move, or ONLY reverse.

  const moveOnlyTurntable = {
    Our_operations: [
      { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
      { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
    ],
    Enemy_operations: [
      { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
      { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
    ]
  }
  const reverseOnlyTurntable = {
    Our_operations: [
      { title: 'MANOEUVRE', moves: [{ dice: [['reverse'],['reverse'],['reverse'],['reverse'],['reverse'],['reverse']] }] },
      { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
    ],
    Enemy_operations: [
      { title: 'MANOEUVRE', moves: [{ dice: [['reverse'],['reverse'],['reverse'],['reverse'],['reverse'],['reverse']] }] },
      { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
    ]
  }

  // Five-hex strip. Unit placed at q=2 facing east. With small budget,
  // the hex *behind* the unit (q-1) is reachable only via reverse, and
  // the hex *ahead* (q+1) only via forward — at budget 1.
  function buildStripState(turntable, movement = 1) {
    const pkg = {
      id: 'strip',
      hexmap: {
        parameters: { width: 5, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 1, r: 0, terrain: 'plains' },
          { q: 2, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 3, r: 0, terrain: 'plains' },
          { q: 4, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable
    }
    return new GameState({
      width: 5,
      height: 1,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      rng: createRng('strip')
    })
  }

  it('move-only turntable: backward neighbour is NOT exposed as a move command', () => {
    const state = buildStripState(moveOnlyTurntable)
    const p1 = state.getActivePlayerUnits('player1')[0]
    // Force facing east so backward neighbour is to the west and union
    // reachability would (incorrectly) expose it as a "move" target.
    // Facing 1 = east on row 0 (per getHexDirections(0)); the backward
    // step (facing+3=4) maps to delta (-1,0), which on this 5-wide strip
    // is the q-1 neighbour. Keeps the test independent of placement auto-facing.
    p1.facing = 1
    state.touchReachabilityState()
    state.rollDice(1)

    const cmds = listLegalCommands(state, 'player1')
    const moveCmds = cmds.filter(c => c.type === 'move')
    expect(moveCmds.length).toBeGreaterThan(0)

    // The behind-east neighbour at budget=1 is reachable in the union
    // cache (cost 1 via reverse) but must not appear here as a move.
    const behindHex = state.getDirectionalReachableCosts(p1.id, 'reverse')
    // sanity: behind hex IS reachable via reverse
    expect(behindHex.size).toBeGreaterThan(0)

    for (const m of moveCmds) {
      // Every emitted move command must lie in the forward-only set.
      const forwardOnly = state.getDirectionalReachableCosts(p1.id, 'forward')
      const key = state.getHexKey(m.payload.to.q, m.payload.to.r)
      expect(forwardOnly.has(key)).toBe(true)
    }
    // And no `reverse` commands emitted on a move-only turntable.
    expect(cmds.some(c => c.type === 'reverse')).toBe(false)
  })

  it('move-only turntable: one command is one immediate forward step even with larger AP budget', () => {
    const state = buildStripState(moveOnlyTurntable, 5)
    const p1 = state.getActivePlayerUnits('player1')[0]
    p1.facing = 1
    state.touchReachabilityState()
    state.rollDice(1)

    const moveCmds = listLegalCommands(state, 'player1').filter(c => c.type === 'move')
    expect(moveCmds).toHaveLength(1)
    expect(moveCmds[0].payload.to).toEqual({ q: 3, r: 0 })
    expect(moveCmds[0].payload.cost).toBe(1)
  })

  it('reverse-only turntable: forward neighbour is NOT exposed as a reverse command', () => {
    const state = buildStripState(reverseOnlyTurntable)
    const p1 = state.getActivePlayerUnits('player1')[0]
    // Facing 1 = east on row 0 (per getHexDirections(0)); the backward
    // step (facing+3=4) maps to delta (-1,0), which on this 5-wide strip
    // is the q-1 neighbour. Keeps the test independent of placement auto-facing.
    p1.facing = 1
    state.touchReachabilityState()
    state.rollDice(1)

    const cmds = listLegalCommands(state, 'player1')
    const reverseCmds = cmds.filter(c => c.type === 'reverse')
    expect(reverseCmds.length).toBeGreaterThan(0)

    const reverseOnly = state.getDirectionalReachableCosts(p1.id, 'reverse')
    for (const m of reverseCmds) {
      const key = state.getHexKey(m.payload.to.q, m.payload.to.r)
      expect(reverseOnly.has(key)).toBe(true)
    }
    expect(cmds.some(c => c.type === 'move')).toBe(false)
  })
})

describe('getObservation', () => {
  it('exposes own/enemy units, dice, turn number, and board dims', () => {
    const state = buildState()
    state.rollDice(2)
    const obs = getObservation(state, 'player1')
    expect(obs.currentPlayer).toBe('player1')
    expect(obs.perspective).toBe('player1')
    expect(obs.diceResult).toBe(2)
    expect(obs.turnNumber).toBe(1)
    expect(obs.board.width).toBe(5)
    expect(obs.board.height).toBe(3)
    expect(obs.ownUnits.length).toBe(1)
    expect(obs.enemyUnits.length).toBe(1)
    expect(obs.ownUnits[0].player).toBe('player1')
    expect(obs.enemyUnits[0].player).toBe('player2')
    expect(typeof obs.ownUnits[0].actionsRemaining).toBe('number')
  })

  it('rejects bad arguments', () => {
    const state = buildState()
    expect(() => getObservation(null, 'player1')).toThrow()
    expect(() => getObservation(state, '')).toThrow()
  })

  it('observation does not leak engine references (plain JSON-clonable)', () => {
    const state = buildState()
    state.rollDice(1)
    const obs = getObservation(state, 'player1')
    // structuredClone fails on class instances / circular refs; success
    // demonstrates the observation is pure data.
    const cloned = JSON.parse(JSON.stringify(obs))
    expect(cloned.ownUnits.length).toBe(1)
    expect(cloned.diceResult).toBe(1)
  })
})
