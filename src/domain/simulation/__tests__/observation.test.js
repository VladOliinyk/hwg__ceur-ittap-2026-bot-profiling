import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../rng.js'
import { getObservation } from '../observation.js'
import { makeMicroLevelPackage } from './fixtures.js'

/**
 * Contract tests for getObservation against a REAL GameState.
 *
 * Strategy tests build observations by hand, so nothing else pins the
 * engine→observation mapping: if a unitView field went missing or got
 * remapped, heuristics would silently degrade while every integration
 * test kept passing. These tests assert the full shape field-by-field.
 */

const OBJECTIVES = {
  mode: 'primaryBlue',
  primary: {
    id: 'capture_p2_base',
    type: 'occupyBase',
    player: 'player1',
    targetPlayer: 'player2',
    basePlayer: 'player2',
    deadlineTurns: 6
  }
}

function buildState() {
  const pkg = makeMicroLevelPackage({
    units: {
      player1: {
        units: [{ type: 'infantry', name: 'Blue Infantry', health: 45, movement: 4, attackRange: 2, attackAngle: 1, attackPower: 35, maxTerrainDifficulty: 10, facing: 2, count: 1 }]
      },
      player2: {
        units: [{ type: 'infantry', name: 'Red Infantry', health: 60, movement: 3, attackRange: 1, attackAngle: 0, attackPower: 25, maxTerrainDifficulty: 10, facing: 5, count: 1 }]
      }
    }
  })
  // Mark the (single) spawn cells as the players' bases: keeps unit
  // placement deterministic (one spawn candidate per player) while giving
  // the observation real base cells to report.
  for (const cell of pkg.hexmap.map) {
    if (cell.player1Spawn === true) cell.player1Base = true
    if (cell.player2Spawn === true) cell.player2Base = true
  }
  return new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    currentPlayer: 'player1',
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    objectivesData: OBJECTIVES,
    rng: createRng('observation-contract')
  })
}

describe('getObservation contract (real GameState)', () => {
  it('maps own and enemy unitView field-by-field', () => {
    const state = buildState()
    const p1 = state.getActivePlayerUnits('player1')[0]
    // Damage the unit so health and maxHealth differ — a swapped mapping
    // between the two fields could not pass otherwise.
    p1.health = 40

    const obs = getObservation(state, 'player1')

    expect(obs.ownUnits).toHaveLength(1)
    expect(obs.ownUnits[0]).toEqual({
      id: 'p1_inf1',
      type: 'infantry',
      name: 'Blue Infantry',
      losMode: 'direct_fire',
      iconKey: 'infantry',
      player: 'player1',
      position: { q: 0, r: 1 },
      facing: 2,
      health: 40,
      maxHealth: 45,
      isLoaded: true,
      isAlive: true,
      actionsRemaining: 4, // movement budget = 4 from the unit's movement: 4 field in buildState(); resetPlayerTurn seeds turnState[id].actionsRemaining directly from unit.movement (turntable controls action types, not the budget count)
      attackRange: 2,
      attackPower: 35,
      attackAngle: 1,
      movement: 4,
      maxTerrainDifficulty: 10
    })

    expect(obs.enemyUnits).toHaveLength(1)
    expect(obs.enemyUnits[0]).toEqual({
      id: 'p2_inf1',
      type: 'infantry',
      name: 'Red Infantry',
      losMode: 'direct_fire',
      iconKey: 'infantry',
      player: 'player2',
      position: { q: 4, r: 1 },
      facing: 5,
      health: 60,
      maxHealth: 60,
      isLoaded: true, // no turnState row for the inactive player -> unit field fallback
      isAlive: true,
      actionsRemaining: 0, // no turnState row -> zero budget
      attackRange: 1,
      attackPower: 25,
      attackAngle: 0,
      movement: 3,
      maxTerrainDifficulty: 10
    })
  })

  it('exposes match scalars, base cells, and objectives from the engine', () => {
    const state = buildState()
    state.rollDice(2) // populate diceResult so the scalar assertion below is non-null
    const obs = getObservation(state, 'player1')

    expect(obs.turnNumber).toBe(1)
    expect(obs.currentPlayer).toBe('player1')
    expect(obs.perspective).toBe('player1')
    expect(obs.gamePhase).toBe('movement')
    expect(obs.diceResult).toBe(2)
    expect(obs.turnsSinceLastDamage).toBe(0)
    expect(obs.board).toEqual({ width: 5, height: 3 })
    expect(obs.bases).toEqual({
      player1: [{ q: 0, r: 1, terrain: 'plains' }],
      player2: [{ q: 4, r: 1, terrain: 'plains' }]
    })
    expect(obs.objectives).toEqual(OBJECTIVES)
    expect(obs.outcome).toEqual({
      status: 'active',
      winner: null,
      reason: null,
      conditionId: null,
      message: ''
    })
  })

  it('prefers the turnState row over the unit field for isLoaded', () => {
    const state = buildState()
    const p1 = state.getActivePlayerUnits('player1')[0]
    expect(p1.isLoaded).toBe(true)
    // Spent shot recorded in the turn row only — the row must win.
    state.turnState[p1.id].isLoaded = false

    const obs = getObservation(state, 'player1')
    expect(obs.ownUnits[0].isLoaded).toBe(false)
  })

  it('returns objectives as a defensive copy — strategy mutations cannot rewrite engine rules', () => {
    const state = buildState()
    const obs = getObservation(state, 'player1')

    expect(obs.objectives).toEqual(state.objectives)
    expect(obs.objectives).not.toBe(state.objectives)

    // A (mis)behaving strategy — LLM agents receive this object directly —
    // must not be able to move the engine's match deadline.
    obs.objectives.primary.deadlineTurns = 999
    expect(state.objectives.primary.deadlineTurns).toBe(6)
  })
})
