import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../rng.js'
import { applyCommand } from '../applyCommand.js'
import { listLegalCommands } from '../legalCommands.js'
import { makeMicroLevelPackage } from './fixtures.js'

function buildState(seed = 'apply') {
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

describe('applyCommand — shape validation', () => {
  it('rejects unsupported command types', () => {
    const state = buildState()
    state.rollDice(1)
    const r = applyCommand(state, { type: 'teleport', unitId: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unsupported command type/)
  })

  it('strict: rejects whitespace-padded type without mutating state (round 3 fix)', () => {
    const state = buildState()
    state.rollDice(1)
    const before = state.currentPlayer
    // Previously `applyCommand` trimmed `command.type`, so this would
    // call `gameState.endTurn()` while runMatch still saw the raw
    // ' endTurn ' string and never advanced. Now it must be rejected
    // outright with the raw type echoed back, leaving state intact.
    const r = applyCommand(state, { type: ' endTurn ' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unsupported command type/)
    expect(r.error).toContain(' endTurn ')
    expect(state.currentPlayer).toBe(before)
  })

  it('strict: rejects case-variant type', () => {
    const state = buildState()
    state.rollDice(1)
    const r = applyCommand(state, { type: 'EndTurn' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unsupported command type/)
  })

  it('safe error message for non-stringable command.type — Symbol (round 4 fix)', () => {
    const state = buildState()
    state.rollDice(1)
    // Template interpolation `${Symbol('bad')}` throws TypeError; the
    // rejection path must coerce safely so a malformed strategy is
    // downgraded to an illegal attempt instead of crashing the runner.
    const bad = Symbol('bad')
    let r
    expect(() => { r = applyCommand(state, { type: bad }) }).not.toThrow()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unsupported command type/)
    expect(r.error).toContain('Symbol(bad)')
  })

  it('safe error message for non-stringable command.type — other shapes', () => {
    const state = buildState()
    state.rollDice(1)
    // Each shape would either fail strict equality (number/null/object)
    // or crash interpolation (BigInt with no implicit string coercion
    // historically — kept defensive). None should throw.
    for (const bad of [42, null, undefined, { a: 1 }, [1, 2], true]) {
      let r
      expect(() => { r = applyCommand(state, { type: bad }) }).not.toThrow()
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/unsupported command type/)
    }
  })

  it('safe error message survives a throwing toString on the type field', () => {
    const state = buildState()
    state.rollDice(1)
    const bad = { toString() { throw new Error('toString blew up') } }
    let r
    expect(() => { r = applyCommand(state, { type: bad }) }).not.toThrow()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unsupported command type/)
    // Fallback marker used when even String() throws.
    expect(r.error).toContain('<unstringifiable>')
  })

  it('rejects non-object commands', () => {
    const state = buildState()
    expect(applyCommand(state, null).ok).toBe(false)
    expect(applyCommand(state, 'move').ok).toBe(false)
    expect(applyCommand(state, undefined).ok).toBe(false)
  })

  it('rejects commands missing unitId (non-endTurn)', () => {
    const state = buildState()
    state.rollDice(1)
    const r = applyCommand(state, { type: 'move', payload: { to: { q: 1, r: 1 } } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/requires unitId/)
  })

  it('rejects commands referencing missing or opponent unit', () => {
    const state = buildState()
    state.rollDice(1)
    const p2Unit = state.getActivePlayerUnits('player2')[0]
    const r1 = applyCommand(state, { type: 'move', unitId: 'does-not-exist', payload: { to: { q: 1, r: 1 } } })
    expect(r1.ok).toBe(false)
    expect(r1.error).toMatch(/not found/)
    const r2 = applyCommand(state, { type: 'move', unitId: p2Unit.id, payload: { to: { q: 3, r: 1 } } })
    expect(r2.ok).toBe(false)
    expect(r2.error).toMatch(/not owned by current player/)
  })

  it('rejects move with invalid payload', () => {
    const state = buildState()
    state.rollDice(1)
    const p1 = state.getActivePlayerUnits('player1')[0]
    const r = applyCommand(state, { type: 'move', unitId: p1.id, payload: { to: { q: 'x', r: 0 } } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/payload\.to/)
  })

  it('rejects turn with invalid facing', () => {
    const state = buildState()
    state.rollDice(1)
    const p1 = state.getActivePlayerUnits('player1')[0]
    const r = applyCommand(state, { type: 'turn', unitId: p1.id, payload: { facing: 9 } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/facing/)
  })
})

describe('applyCommand — dispatch into engine', () => {
  it('dispatches move and consumes AP via engine', () => {
    const state = buildState()
    state.rollDice(1)
    const p1 = state.getActivePlayerUnits('player1')[0]
    const apBefore = state.turnState[p1.id].actionsRemaining
    const cmds = listLegalCommands(state, 'player1').filter(c => c.type === 'move')
    expect(cmds.length).toBeGreaterThan(0)
    const r = applyCommand(state, cmds[0])
    expect(r.ok).toBe(true)
    expect(state.turnState[p1.id].actionsRemaining).toBeLessThan(apBefore)
    // engine recorded the action
    const last = state.currentTurnActions[state.currentTurnActions.length - 1]
    expect(last.type).toBe('move')
  })

  it('dispatches turn and advances facing', () => {
    const state = buildState()
    state.rollDice(4) // turn
    const p1 = state.getActivePlayerUnits('player1')[0]
    const oldFacing = p1.facing
    const newFacing = (oldFacing + 2) % 6
    const r = applyCommand(state, { type: 'turn', unitId: p1.id, payload: { facing: newFacing } })
    expect(r.ok).toBe(true)
    expect(p1.facing).toBe(newFacing)
  })

  it('dispatches endTurn and switches player', () => {
    const state = buildState()
    state.rollDice(1)
    const r = applyCommand(state, { type: 'endTurn' })
    expect(r.ok).toBe(true)
    expect(state.currentPlayer).toBe('player2')
    expect(state.hasRolledDice()).toBe(false)
  })

  it('rejects out-of-reach destination with a directional-reachability error', () => {
    const state = buildState()
    state.rollDice(1)
    const p1 = state.getActivePlayerUnits('player1')[0]
    // (99,99) is not in any reachability cache; the dispatcher should
    // reject before invoking the engine, surfacing the simulation-layer
    // boundary error rather than letting `moveUnit` throw.
    const r = applyCommand(state, { type: 'move', unitId: p1.id, payload: { to: { q: 99, r: 99 } } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not reachable via forward motion/)
  })
})

describe('applyCommand — directional reachability gate (P1, round 1 fix)', () => {
  // Two-hex strip. Unit at (1,0), facing east. Movement=1.
  // The hex (0,0) is behind the unit — reachable ONLY via reverse.
  // A `move` command targeting (0,0) must be rejected by the dispatcher
  // even though the engine's union cache contains the hex.
  function buildReverseOnlyDestState() {
    const pkg = {
      id: 'rev',
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 1, r: 0, terrain: 'plains', player1Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        // Both rosters required by the validator; place a token p2 unit
        // off-screen for shape, even though no p2 spawn exists here.
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 1, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 1, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable: {
        // Turntable allows both `move` and `reverse` so this test
        // isolates the directional reachability gate (not the
        // canPerformAction allowed-actions gate).
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    const state = new GameState({
      width: 2,
      height: 1,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      rng: createRng('rev')
    })
    const p1 = state.getActivePlayerUnits('player1')[0]
    // Facing 1 = east on row 0 (per getHexDirections); backward step
    // (facing+3=4) is delta (-1,0), placing (0,0) on the reverse-only
    // path from (1,0) at budget=1. Hardcoded so the test stays
    // independent of placement auto-facing.
    p1.facing = 1
    state.touchReachabilityState()
    return { state, p1 }
  }

  it('rejects move command targeting a reverse-only-reachable hex', () => {
    const { state, p1 } = buildReverseOnlyDestState()
    state.rollDice(1)

    // (0,0) IS in the engine's union cache (reachable via 1 reverse step).
    state.ensureReachabilityCache(p1.id)
    expect(state._reachableHexCosts.has(state.getHexKey(0, 0))).toBe(true)
    // But the simulation boundary must reject `move` to (0,0).
    const r = applyCommand(state, { type: 'move', unitId: p1.id, payload: { to: { q: 0, r: 0 } } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not reachable via forward motion/)
    // And the engine state is unchanged — unit still at (1,0).
    expect(p1.position.q).toBe(1)
    expect(p1.position.r).toBe(0)
  })

  it('accepts a reverse command targeting the same hex', () => {
    const { state, p1 } = buildReverseOnlyDestState()
    state.rollDice(1)
    const r = applyCommand(state, { type: 'reverse', unitId: p1.id, payload: { to: { q: 0, r: 0 } } })
    expect(r.ok).toBe(true)
    expect(p1.position.q).toBe(0)
    expect(r.result.path).toEqual([
      { q: 1, r: 0, facing: 1 },
      { q: 0, r: 0, facing: 1 }
    ])
    const lastMove = state.currentTurnActions[state.currentTurnActions.length - 1]
    expect(lastMove.path).toEqual(r.result.path)
  })

  it('rejects move targets that require a hidden rotate+step path', () => {
    // 5x1 strip; unit at (2,0) facing east (facing=1), movement=5.
    // To reach (1,0), the unit must either reverse or turn around first.
    // A `move` command must not silently include those turns because
    // moveUnit does not mutate facing.
    const pkg = {
      id: 'cost',
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
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 5, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 5, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable: {
        // Both move and reverse allowed so canPerformAction passes
        // and the test isolates the cost-pricing gate.
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse'],['move','reverse']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    const state = new GameState({
      width: 5,
      height: 1,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      rng: createRng('cost')
    })
    const p1 = state.getActivePlayerUnits('player1')[0]
    p1.facing = 1 // east, so (1,0) is the backward neighbour
    state.touchReachabilityState()
    state.rollDice(1)

    // Sanity: union cache still has the cheap reverse path, but the
    // forward-only cache does not expose a hidden rotate+step move.
    state.ensureReachabilityCache(p1.id)
    expect(state._reachableHexCosts.get(state.getHexKey(1, 0))).toBe(1)
    const forwardCosts = state.getDirectionalReachableCosts(p1.id, 'forward')
    expect(forwardCosts.has(state.getHexKey(1, 0))).toBe(false)

    const apBefore = state.turnState[p1.id].actionsRemaining
    expect(apBefore).toBe(5)

    const r = applyCommand(state, {
      type: 'move',
      unitId: p1.id,
      payload: { to: { q: 1, r: 0 } }
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not reachable via forward motion/)
    expect(state.turnState[p1.id].actionsRemaining).toBe(apBefore)
    expect(p1.position).toEqual({ q: 2, r: 0 })
  })
})

describe('applyCommand — fire target identity (P3, round 1 fix)', () => {
  function buildFireState() {
    const pkg = makeMicroLevelPackage()
    const adjacentPkg = {
      ...pkg,
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    const state = new GameState({
      width: 2,
      height: 1,
      currentPlayer: 'player1',
      mapData: adjacentPkg.hexmap,
      terrainTypes: adjacentPkg.terrain.terrainTypes,
      unitsData: adjacentPkg.units,
      turntableData: adjacentPkg.turntable,
      rng: createRng('fire-id')
    })
    const p1 = state.getActivePlayerUnits('player1')[0]
    const p2 = state.getActivePlayerUnits('player2')[0]
    // Face east (facing=1) so p2 at (1,0) lies in the forward arc.
    p1.facing = 1
    state.touchReachabilityState()
    return { state, p1, p2 }
  }

  it('requires payload.target.unitId on fire', () => {
    const { state, p1 } = buildFireState()
    state.rollDice(1)
    const r = applyCommand(state, {
      type: 'fire',
      unitId: p1.id,
      payload: { target: { q: 1, r: 0 } }
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/target\.unitId/)
  })

  it('rejects a fire command whose target.unitId does not match the occupant', () => {
    const { state, p1 } = buildFireState()
    state.rollDice(1)
    const r = applyCommand(state, {
      type: 'fire',
      unitId: p1.id,
      payload: { target: { q: 1, r: 0, unitId: 'ghost_unit_999' } }
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/target unitId mismatch/)
  })

  it('rejects a fire command whose target hex is empty', () => {
    const { state, p1, p2 } = buildFireState()
    // Empty the board cell without turning the scenario into a unit-wipe terminal state.
    state.getHex(p2.position.q, p2.position.r).removeUnit()
    state.rollDice(1)
    const r = applyCommand(state, {
      type: 'fire',
      unitId: p1.id,
      payload: { target: { q: 1, r: 0, unitId: p2.id } }
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/empty/)
  })

  it('reports killed=true in applyResult when the target dies', () => {
    const { state, p1, p2 } = buildFireState()
    // Lower target HP so a single 30-power shot finishes them.
    p2.health = 10
    p2.maxHealth = 60
    state.rollDice(1)
    const r = applyCommand(state, {
      type: 'fire',
      unitId: p1.id,
      payload: { target: { q: 1, r: 0, unitId: p2.id } }
    })
    expect(r.ok).toBe(true)
    expect(r.result.killed).toBe(true)
    expect(r.result.damage).toBeGreaterThan(0)
    // Target no longer in the board map after a kill.
    expect(state.units.has(p2.id)).toBe(false)
  })

  it('reports killed=false when target survives', () => {
    const { state, p1, p2 } = buildFireState()
    p2.health = 100
    p2.maxHealth = 100
    state.rollDice(1)
    const r = applyCommand(state, {
      type: 'fire',
      unitId: p1.id,
      payload: { target: { q: 1, r: 0, unitId: p2.id } }
    })
    expect(r.ok).toBe(true)
    expect(r.result.killed).toBe(false)
  })
})
