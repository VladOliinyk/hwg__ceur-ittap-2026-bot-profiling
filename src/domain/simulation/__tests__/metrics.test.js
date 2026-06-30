/**
 * Tests for the per-match metrics collector (metrics.js).
 *
 * Covers:
 *   - overkill pin: damage recorded is nominal attackPower, INCLUDING overkill
 *   - non-fire results are ignored for damage/kills
 *   - non-finite / negative damage is ignored
 *   - kills counted via result.killed, not a separate call
 */
import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../rng.js'
import { applyCommand } from '../applyCommand.js'
import { listLegalCommands } from '../legalCommands.js'
import { createMetrics } from '../metrics.js'
import { makeMicroLevelPackage } from './fixtures.js'

/**
 * Build a GameState where player1 and player2 units are adjacent (2-hex row),
 * with configurable HP and attackPower so overkill scenarios are easy to set up.
 */
function buildAdjacentState({ p1AttackPower = 30, p2Health = 20 } = {}) {
  const base = makeMicroLevelPackage()
  const pkg = {
    ...base,
    hexmap: {
      parameters: { width: 2, height: 1 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
      ]
    },
    units: {
      player1: {
        units: [
          {
            type: 'infantry', name: 'Infantry',
            health: 60, movement: 1,
            attackRange: 1, attackAngle: 1, attackPower: p1AttackPower,
            maxTerrainDifficulty: 10, count: 1
          }
        ]
      },
      player2: {
        units: [
          {
            type: 'infantry', name: 'Infantry',
            health: p2Health, movement: 1,
            attackRange: 1, attackAngle: 1, attackPower: 30,
            maxTerrainDifficulty: 10, count: 1
          }
        ]
      }
    },
    turntable: {
      Our_operations: [
        { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] },
        { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] }
      ],
      Enemy_operations: [
        { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] },
        { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] }
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
    rng: createRng('metrics-test')
  })

  const p1 = state.getActivePlayerUnits('player1')[0]
  const p2 = state.getActivePlayerUnits('player2')[0]
  // Face east so p2 at (1,0) lies in the forward arc.
  p1.facing = 1
  state.touchReachabilityState()
  return { state, p1, p2 }
}

describe('metrics — overkill pin (#23)', () => {
  it('records nominal attackPower (30) even when target HP is 20 — overkill included', () => {
    // This is a pin test: the semantic is intentional and must not silently change.
    // A 30-power shot at a 20 HP target records 30, not 20.
    const { state, p1, p2 } = buildAdjacentState({ p1AttackPower: 30, p2Health: 20 })
    expect(p1.attackPower).toBe(30)
    expect(p2.health).toBeLessThanOrEqual(20) // target has less HP than shot power

    const collector = createMetrics()
    collector.captureInitialUnits(state)

    state.rollDice(1)
    const fireCmd = listLegalCommands(state, 'player1').find(c => c.type === 'fire')
    expect(fireCmd).toBeTruthy()

    const applyResult = applyCommand(state, fireCmd)
    expect(applyResult.ok).toBe(true)
    expect(applyResult.result.damage).toBe(30)       // engine returns full attackPower
    expect(applyResult.result.killed).toBe(true)     // target is dead (20 HP < 30 power)

    collector.record('player1', applyResult.result, applyResult)

    const metrics = collector.finalize(state)
    // Overkill: 30 recorded, not min(30, 20) = 20
    expect(metrics.damageByPlayer.player1).toBe(30)
    expect(metrics.killsByPlayer.player1).toBe(1)
  })

  it('records full attackPower when target survives (no overkill)', () => {
    // Target HP 60 > attackPower 30, so no kill but damage is still 30.
    const { state, p1, p2 } = buildAdjacentState({ p1AttackPower: 30, p2Health: 60 })

    const collector = createMetrics()
    collector.captureInitialUnits(state)

    state.rollDice(1)
    const fireCmd = listLegalCommands(state, 'player1').find(c => c.type === 'fire')
    expect(fireCmd).toBeTruthy()

    const applyResult = applyCommand(state, fireCmd)
    expect(applyResult.ok).toBe(true)
    expect(applyResult.result.killed).toBe(false)

    collector.record('player1', applyResult.result, applyResult)

    const metrics = collector.finalize(state)
    expect(metrics.damageByPlayer.player1).toBe(30)
    expect(metrics.killsByPlayer.player1).toBe(0)
  })
})

describe('metrics — kills counted via result.killed (#53)', () => {
  it('counts a kill when result.killed is true', () => {
    const { state, p1, p2 } = buildAdjacentState({ p1AttackPower: 30, p2Health: 10 })

    const collector = createMetrics()
    collector.captureInitialUnits(state)
    state.rollDice(1)
    const fireCmd = listLegalCommands(state, 'player1').find(c => c.type === 'fire')
    const applyResult = applyCommand(state, fireCmd)
    expect(applyResult.result.killed).toBe(true)

    collector.record('player1', applyResult.result, applyResult)
    const metrics = collector.finalize(state)
    expect(metrics.killsByPlayer.player1).toBe(1)
    expect(metrics.killsByPlayer.player2).toBe(0)
  })

  it('does not count a kill when result.killed is false', () => {
    const { state } = buildAdjacentState({ p1AttackPower: 30, p2Health: 60 })

    const collector = createMetrics()
    collector.captureInitialUnits(state)
    state.rollDice(1)
    const fireCmd = listLegalCommands(state, 'player1').find(c => c.type === 'fire')
    const applyResult = applyCommand(state, fireCmd)
    expect(applyResult.result.killed).toBe(false)

    collector.record('player1', applyResult.result, applyResult)
    const metrics = collector.finalize(state)
    expect(metrics.killsByPlayer.player1).toBe(0)
  })
})

describe('metrics — non-fire and invalid damage ignored', () => {
  it('does not record damage for endTurn commands', () => {
    const base = makeMicroLevelPackage()
    const state = new GameState({
      width: base.hexmap.parameters.width,
      height: base.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: base.hexmap,
      terrainTypes: base.terrain.terrainTypes,
      unitsData: base.units,
      turntableData: base.turntable,
      rng: createRng('metrics-endturn')
    })

    const collector = createMetrics()
    state.rollDice(1)
    // Synthesise an applyResult that looks like a fire result but on an endTurn command.
    // This must not increment damage.
    const fakeApplyResult = { ok: true, result: { type: 'endTurn', damage: 50, killed: true } }
    collector.record('player1', fakeApplyResult.result, fakeApplyResult)

    const metrics = collector.finalize(state)
    expect(metrics.damageByPlayer.player1).toBe(0)
    expect(metrics.killsByPlayer.player1).toBe(0)
  })

  it('ignores non-finite damage values', () => {
    const collector = createMetrics()
    // Simulate record() called with a fire result carrying NaN / Infinity damage.
    for (const badDamage of [NaN, Infinity, -Infinity, null, undefined, 'big']) {
      const fakeApplyResult = {
        ok: true,
        result: { type: 'fire', damage: badDamage, killed: false }
      }
      collector.record('player1', fakeApplyResult.result, fakeApplyResult)
    }
    const base = makeMicroLevelPackage()
    const state = new GameState({
      width: base.hexmap.parameters.width,
      height: base.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: base.hexmap,
      terrainTypes: base.terrain.terrainTypes,
      unitsData: base.units,
      turntableData: base.turntable,
      rng: createRng('metrics-nan')
    })
    const metrics = collector.finalize(state)
    expect(metrics.damageByPlayer.player1).toBe(0)
  })

  it('ignores negative damage values', () => {
    const collector = createMetrics()
    const fakeApplyResult = {
      ok: true,
      result: { type: 'fire', damage: -10, killed: false }
    }
    collector.record('player1', fakeApplyResult.result, fakeApplyResult)

    const base = makeMicroLevelPackage()
    const state = new GameState({
      width: base.hexmap.parameters.width,
      height: base.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: base.hexmap,
      terrainTypes: base.terrain.terrainTypes,
      unitsData: base.units,
      turntableData: base.turntable,
      rng: createRng('metrics-neg')
    })
    const metrics = collector.finalize(state)
    expect(metrics.damageByPlayer.player1).toBe(0)
  })

  it('ignores applyResult with ok:false', () => {
    const collector = createMetrics()
    const fakeApplyResult = {
      ok: false,
      result: { type: 'fire', damage: 30, killed: true }
    }
    collector.record('player1', fakeApplyResult.result, fakeApplyResult)

    const base = makeMicroLevelPackage()
    const state = new GameState({
      width: base.hexmap.parameters.width,
      height: base.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: base.hexmap,
      terrainTypes: base.terrain.terrainTypes,
      unitsData: base.units,
      turntableData: base.turntable,
      rng: createRng('metrics-fail')
    })
    const metrics = collector.finalize(state)
    expect(metrics.damageByPlayer.player1).toBe(0)
    expect(metrics.killsByPlayer.player1).toBe(0)
  })
})

describe('metrics — recordKill removed (#53)', () => {
  it('collector does not expose recordKill', () => {
    const collector = createMetrics()
    expect(collector.recordKill).toBeUndefined()
  })
})
