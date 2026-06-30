import { describe, expect, it } from 'vitest'
import {
  applyActionEffects,
  canPerformAction,
  computeReachableHexes,
  stepCostToEnter,
} from '@/domain/engine/actionEconomy.js'
import { getHexDirections } from '@/domain/engine/hexUtils.js'

const makeHex = (q, r) => ({ q, r })

const baseBoardState = () => ({
  terrainByHex: {
    '0,0': { type: 'plains', terrainDifficulty: 0, passable: true },
    '1,0': { type: 'forest', terrainDifficulty: 1, passable: true },
    '2,0': { type: 'water', terrainDifficulty: 2, passable: true },
    '3,0': { type: 'wall', terrainDifficulty: 0, passable: false },
  },
  occupiedHexes: new Set(),
})

describe('stepCostToEnter(unit, toHex, boardState)', () => {
  it('returns 1 for plains', () => {
    const unit = { type: 'infantry', maxTerrainDifficulty: 3 }
    const boardState = baseBoardState()

    expect(stepCostToEnter(unit, makeHex(0, 0), boardState)).toBe(1)
  })

  it('returns 2 for forest', () => {
    const unit = { type: 'infantry', maxTerrainDifficulty: 3 }
    const boardState = baseBoardState()

    expect(stepCostToEnter(unit, makeHex(1, 0), boardState)).toBe(2)
  })

  it('returns 3 for water', () => {
    const unit = { type: 'infantry', maxTerrainDifficulty: 3 }
    const boardState = baseBoardState()

    expect(stepCostToEnter(unit, makeHex(2, 0), boardState)).toBe(3)
  })

  it('returns Infinity for unreachable terrain (artillery into water)', () => {
    const unit = {
      type: 'artillery',
      maxTerrainDifficulty: 3,
      blockedTerrainTypes: ['water'],
    }
    const boardState = baseBoardState()

    expect(stepCostToEnter(unit, makeHex(2, 0), boardState)).toBe(Infinity)
  })

  it('returns Infinity for impassable hex', () => {
    const unit = { type: 'infantry', maxTerrainDifficulty: 3 }
    const boardState = baseBoardState()

    expect(stepCostToEnter(unit, makeHex(3, 0), boardState)).toBe(Infinity)
  })

  it('returns Infinity for occupied hex', () => {
    const unit = { type: 'infantry', maxTerrainDifficulty: 3 }
    const boardState = baseBoardState()
    boardState.occupiedHexes.add('1,0')

    expect(stepCostToEnter(unit, makeHex(1, 0), boardState)).toBe(Infinity)
  })
})

describe('weapon cycle (fire/reload)', () => {
  it('rejects fire when isLoaded === false', () => {
    const unit = { id: 'u1' }
    const turnStateEntry = { actionsRemaining: 2, isLoaded: false }

    expect(
      canPerformAction({
        action: { type: 'fire', cost: 1, phase: 'ATTACK' },
        unit,
        turnStateEntry,
        allowedActionTypes: ['fire', 'reload'],
      })
    ).toBe(false)
  })

  it('allows fire after reload', () => {
    const unit = { id: 'u1' }
    const turnStateEntry = { actionsRemaining: 2, isLoaded: false }

    const afterReload = applyActionEffects({
      action: { type: 'reload', cost: 1, phase: 'ATTACK' },
      unit,
      turnStateEntry,
    })

    expect(
      canPerformAction({
        action: { type: 'fire', cost: 1, phase: 'ATTACK' },
        unit,
        turnStateEntry: afterReload.turnStateEntry,
        allowedActionTypes: ['fire', 'reload'],
      })
    ).toBe(true)
  })

  it('accepts numeric string cost and spends budget', () => {
    const unit = { id: 'u1' }
    const turnStateEntry = { actionsRemaining: 2, isLoaded: true }
    const action = { type: 'fire', cost: '1', phase: 'ATTACK' }

    expect(
      canPerformAction({
        action,
        unit,
        turnStateEntry,
        allowedActionTypes: ['fire', 'reload'],
      })
    ).toBe(true)

    const next = applyActionEffects({ action, turnStateEntry }).turnStateEntry
    expect(next.actionsRemaining).toBe(1)
    expect(next.isLoaded).toBe(false)
  })

  it('rejects invalid string cost and keeps state unchanged', () => {
    const unit = { id: 'u1' }
    const turnStateEntry = { actionsRemaining: 2, isLoaded: true }
    const action = { type: 'fire', cost: 'abc', phase: 'ATTACK' }

    expect(
      canPerformAction({
        action,
        unit,
        turnStateEntry,
        allowedActionTypes: ['fire', 'reload'],
      })
    ).toBe(false)

    const next = applyActionEffects({ action, turnStateEntry }).turnStateEntry
    expect(next).toEqual(turnStateEntry)
  })
})

describe('computeReachableHexes (Dijkstra with facing)', () => {
  it('uses facing + terrain cost + actionsRemaining budget', () => {
    const unit = {
      id: 'u1',
      position: { q: 1, r: 1 },
      facing: 1,
      maxTerrainDifficulty: 3,
    }

    const boardState = {
      width: 4,
      height: 3,
      terrainByHex: {
        '0,0': { terrainDifficulty: 0, passable: true },
        '1,0': { terrainDifficulty: 0, passable: true },
        '2,0': { terrainDifficulty: 0, passable: true },
        '3,0': { terrainDifficulty: 0, passable: true },
        '0,1': { terrainDifficulty: 0, passable: true },
        '1,1': { terrainDifficulty: 0, passable: true },
        '2,1': { terrainDifficulty: 2, passable: true },
        '3,1': { terrainDifficulty: 0, passable: true },
        '0,2': { terrainDifficulty: 0, passable: true },
        '1,2': { terrainDifficulty: 0, passable: true },
        '2,2': { terrainDifficulty: 0, passable: true },
        '3,2': { terrainDifficulty: 0, passable: true },
      },
      occupiedHexes: new Set(),
      getDirectionsForRow: r => getHexDirections(r),
    }

    const { keysSet } = computeReachableHexes({
      unit,
      boardState,
      actionsRemaining: 2,
      targetSet: new Set(),
    })

    expect(keysSet.has('1,1')).toBe(true)
    expect(keysSet.has('2,1')).toBe(false)
  })

  it('uses string facing from JSON the same as numeric (pathfinder start orientation)', () => {
    const boardState = {
      width: 4,
      height: 3,
      terrainByHex: {
        '0,0': { terrainDifficulty: 0, passable: true },
        '1,0': { terrainDifficulty: 0, passable: true },
        '2,0': { terrainDifficulty: 0, passable: true },
        '3,0': { terrainDifficulty: 0, passable: true },
        '0,1': { terrainDifficulty: 0, passable: true },
        '1,1': { terrainDifficulty: 0, passable: true },
        '2,1': { terrainDifficulty: 2, passable: true },
        '3,1': { terrainDifficulty: 0, passable: true },
        '0,2': { terrainDifficulty: 0, passable: true },
        '1,2': { terrainDifficulty: 0, passable: true },
        '2,2': { terrainDifficulty: 0, passable: true },
        '3,2': { terrainDifficulty: 0, passable: true },
      },
      occupiedHexes: new Set(),
      getDirectionsForRow: r => getHexDirections(r),
    }

    const base = {
      id: 'u1',
      position: { q: 1, r: 1 },
      maxTerrainDifficulty: 3,
    }

    const { keysSet: numericFacing } = computeReachableHexes({
      unit: { ...base, facing: 1 },
      boardState,
      actionsRemaining: 2,
      targetSet: new Set(),
    })
    const { keysSet: stringFacing } = computeReachableHexes({
      unit: { ...base, facing: '1' },
      boardState,
      actionsRemaining: 2,
      targetSet: new Set(),
    })

    expect([...stringFacing].sort()).toEqual([...numericFacing].sort())
  })

  it('fills hexMinCostMap with minimal totalCost per destination hex (authoritative path cost)', () => {
    const unit = {
      id: 'u1',
      position: { q: 0, r: 0 },
      facing: 1,
      maxTerrainDifficulty: 3,
    }

    const boardState = {
      width: 3,
      height: 1,
      terrainByHex: {
        '0,0': { terrainDifficulty: 0, passable: true },
        '1,0': { terrainDifficulty: 2, passable: true },
        '2,0': { terrainDifficulty: 0, passable: true },
      },
      occupiedHexes: new Set(),
      getDirectionsForRow: r => getHexDirections(r),
    }

    const targetSet = new Set()
    const pooledCostMap = new Map()

    const { keysSet, costMap } = computeReachableHexes({
      unit,
      boardState,
      actionsRemaining: 10,
      targetSet,
      costMap: pooledCostMap,
    })

    expect(keysSet).toBe(targetSet)
    expect(costMap).toBe(pooledCostMap)
    expect(keysSet.has('1,0')).toBe(true)
    expect(costMap.get('0,0')).toBe(0)
    // One forward step into forest (difficulty 2): MINIMAL_MOVE_COST (1) + 2 = 3
    expect(costMap.get('1,0')).toBe(3)
  })

  it('directional reachability keeps move/reverse fixed to the current facing', () => {
    const unit = {
      id: 'u1',
      position: { q: 2, r: 0 },
      facing: 1,
      maxTerrainDifficulty: 3,
    }
    const boardState = {
      width: 5,
      height: 1,
      terrainByHex: {
        '0,0': { terrainDifficulty: 0, passable: true },
        '1,0': { terrainDifficulty: 0, passable: true },
        '2,0': { terrainDifficulty: 0, passable: true },
        '3,0': { terrainDifficulty: 0, passable: true },
        '4,0': { terrainDifficulty: 0, passable: true },
      },
      occupiedHexes: new Set(),
      getDirectionsForRow: r => getHexDirections(r),
    }

    const forward = computeReachableHexes({
      unit,
      boardState,
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'forward',
    }).costMap
    const reverse = computeReachableHexes({
      unit,
      boardState,
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'reverse',
    }).costMap

    expect(forward.has('3,0')).toBe(true)
    expect(forward.has('4,0')).toBe(true)
    expect(forward.has('1,0')).toBe(false)
    expect(reverse.has('1,0')).toBe(true)
    expect(reverse.has('0,0')).toBe(true)
    expect(reverse.has('3,0')).toBe(false)
  })
})

describe('computeReachableHexes — maneuver mode (rotation-inclusive)', () => {
  // 3×3 open board, all plains; unit centered at (1,1) facing 1 (east).
  // Row 1 is even-parity in getHexDirections terms, so facing 1 → {q:1,r:0}.
  const openBoard = () => ({
    width: 3,
    height: 3,
    terrainByHex: {
      '0,0': { terrainDifficulty: 0, passable: true },
      '1,0': { terrainDifficulty: 0, passable: true },
      '2,0': { terrainDifficulty: 0, passable: true },
      '0,1': { terrainDifficulty: 0, passable: true },
      '1,1': { terrainDifficulty: 0, passable: true },
      '2,1': { terrainDifficulty: 0, passable: true },
      '0,2': { terrainDifficulty: 0, passable: true },
      '1,2': { terrainDifficulty: 0, passable: true },
      '2,2': { terrainDifficulty: 0, passable: true }
    },
    occupiedHexes: new Set(),
    getDirectionsForRow: r => getHexDirections(r)
  })

  const centerUnit = () => ({
    id: 'u1',
    position: { q: 1, r: 1 },
    facing: 1, // east → {q:1,r:0}
    maxTerrainDifficulty: 3
  })

  it('(a) reaches the hex straight ahead at enter-cost with no turn (+0)', () => {
    const { costMap } = computeReachableHexes({
      unit: centerUnit(),
      boardState: openBoard(),
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'maneuver'
    })
    // facing 1 at (1,1) → forward neighbour (2,1): one plains step, no turn.
    expect(costMap.get('2,1')).toBe(1)
    // backward neighbour (0,1) is also free of a turn in maneuver's both-union.
    expect(costMap.get('0,1')).toBe(1)
  })

  it('(b) includes a hex off the forward/backward axis, reachable only after one turn', () => {
    const { keysSet, costMap } = computeReachableHexes({
      unit: centerUnit(),
      boardState: openBoard(),
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'maneuver'
    })
    // (1,0) = start(1,1) + facing-5 delta(+0,-1) on an even row; off the
    // east/west axis, so a directional both-set misses it. With maneuver it
    // costs 1 (turn to facing 5) + 1 (enter plains) = 2.
    expect(keysSet.has('1,0')).toBe(true)
    expect(costMap.get('1,0')).toBe(2)
    // Sanity: the same hex is absent from the directional both-set.
    const both = computeReachableHexes({
      unit: centerUnit(),
      boardState: openBoard(),
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'both'
    }).keysSet
    expect(both.has('1,0')).toBe(false)
  })

  it('(c) budget too small for turn+move excludes the turn-only hexes but keeps straight-ahead', () => {
    const { keysSet } = computeReachableHexes({
      unit: centerUnit(),
      boardState: openBoard(),
      actionsRemaining: 1, // enough for one plains step, NOT for turn(1)+move(1)
      targetSet: new Set(),
      motionMode: 'maneuver'
    })
    // Straight-ahead/backward still reachable at cost 1.
    expect(keysSet.has('2,1')).toBe(true)
    expect(keysSet.has('0,1')).toBe(true)
    // Turn-only hex needs cost 2 → excluded under budget 1.
    expect(keysSet.has('1,0')).toBe(false)
  })

  it('(d) forward/reverse/both outputs are UNCHANGED by the maneuver edges', () => {
    const unit = {
      id: 'u1',
      position: { q: 2, r: 0 },
      facing: 1,
      maxTerrainDifficulty: 3
    }
    const boardState = {
      width: 5,
      height: 1,
      terrainByHex: {
        '0,0': { terrainDifficulty: 0, passable: true },
        '1,0': { terrainDifficulty: 0, passable: true },
        '2,0': { terrainDifficulty: 0, passable: true },
        '3,0': { terrainDifficulty: 0, passable: true },
        '4,0': { terrainDifficulty: 0, passable: true }
      },
      occupiedHexes: new Set(),
      getDirectionsForRow: r => getHexDirections(r)
    }

    const forward = computeReachableHexes({
      unit, boardState, actionsRemaining: 5, targetSet: new Set(), motionMode: 'forward'
    }).costMap
    const reverse = computeReachableHexes({
      unit, boardState, actionsRemaining: 5, targetSet: new Set(), motionMode: 'reverse'
    }).costMap
    const both = computeReachableHexes({
      unit, boardState, actionsRemaining: 5, targetSet: new Set(), motionMode: 'both'
    }).costMap

    // On a single east/west row, forward reaches only east, reverse only west,
    // both their union — exactly as before maneuver existed.
    expect([...forward.entries()].sort()).toEqual([
      ['2,0', 0], ['3,0', 1], ['4,0', 2]
    ])
    expect([...reverse.entries()].sort()).toEqual([
      ['0,0', 2], ['1,0', 1], ['2,0', 0]
    ])
    expect([...both.entries()].sort()).toEqual([
      ['0,0', 2], ['1,0', 1], ['2,0', 0], ['3,0', 1], ['4,0', 2]
    ])
  })

  it('(e) sums the flat turn cost with the terrain-difficulty enter cost', () => {
    const board = openBoard()
    // Make the turn-only hex (1,0) difficult terrain (difficulty 1).
    board.terrainByHex['1,0'] = { terrainDifficulty: 1, passable: true }
    const { costMap } = computeReachableHexes({
      unit: centerUnit(),
      boardState: board,
      actionsRemaining: 5,
      targetSet: new Set(),
      motionMode: 'maneuver'
    })
    // turn(1) + enter(MINIMAL_MOVE_COST 1 + terrainDifficulty 1 = 2) = 3.
    expect(costMap.get('1,0')).toBe(3)
  })
})
