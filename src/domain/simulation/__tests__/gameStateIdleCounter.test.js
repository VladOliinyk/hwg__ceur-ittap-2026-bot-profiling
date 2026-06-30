import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createUnit } from '@/domain/engine/gameUnits.js'
import { makeMicroLevelPackage } from './fixtures.js'

function makeState() {
  const pkg = makeMicroLevelPackage()
  return new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    currentPlayer: 'player1',
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable
  })
}

describe('GameState.turnsSinceLastDamage', () => {
  it('starts at 0 and increments once per endTurn', () => {
    const state = makeState()
    expect(state.turnsSinceLastDamage).toBe(0)
    state.rollDice(1)
    state.endTurn()
    expect(state.turnsSinceLastDamage).toBe(1)
    state.rollDice(1)
    state.endTurn()
    expect(state.turnsSinceLastDamage).toBe(2)
  })

  it('honours an explicit constructor seed value', () => {
    const pkg = makeMicroLevelPackage()
    const state = new GameState({
      width: pkg.hexmap.parameters.width,
      height: pkg.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      turnsSinceLastDamage: 5
    })
    expect(state.turnsSinceLastDamage).toBe(5)
  })

  it('survives a toJSON/fromJSON round trip', () => {
    const state = makeState()
    state.turnsSinceLastDamage = 4
    const restored = GameState.fromJSON(state.toJSON(true))
    expect(restored.turnsSinceLastDamage).toBe(4)
  })

  it('defaults to 0 when restoring a legacy snapshot without the field', () => {
    const state = makeState()
    const snapshot = state.toJSON(true)
    delete snapshot.turnsSinceLastDamage
    const restored = GameState.fromJSON(snapshot)
    expect(restored.turnsSinceLastDamage).toBe(0)
  })
})

describe('GameState.turnsSinceLastDamage — applyAction replay', () => {
  function makeReplayAttackState() {
    const state = new GameState({ width: 8, height: 8 })
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
      health: 60,
      position: { q: 1, r: 0 }
    })
    state.addUnit(atk, 0, 0)
    state.addUnit(foe, 1, 0)
    state.resetPlayerTurn('player1')
    return state
  }

  it('replayed endTurn increments the counter like live endTurn()', () => {
    const state = makeState()
    expect(state.turnsSinceLastDamage).toBe(0)
    expect(state.applyAction({ type: 'endTurn', turnNumber: 1, player: 'player1' })).toBe(true)
    expect(state.turnsSinceLastDamage).toBe(1)
    expect(state.applyAction({ type: 'endTurn', turnNumber: 1, player: 'player2' })).toBe(true)
    expect(state.turnsSinceLastDamage).toBe(2)
  })

  it('replayed attack with recorded damage > 0 resets the counter', () => {
    const state = makeReplayAttackState()
    state.turnsSinceLastDamage = 5
    expect(state.applyAction({
      type: 'attack',
      unitId: 'atk',
      targetUnitId: 'foe',
      from: { q: 0, r: 0, facing: 1 },
      to: { q: 1, r: 0, facing: 4 },
      cost: 1,
      damage: 30,
      turnNumber: 1,
      player: 'player1'
    })).toBe(true)
    expect(state.units.get('foe').health).toBe(30)
    expect(state.turnsSinceLastDamage).toBe(0)
  })

  it('replayed attack with zero recorded damage leaves the counter untouched', () => {
    const state = makeReplayAttackState()
    state.turnsSinceLastDamage = 5
    expect(state.applyAction({
      type: 'attack',
      unitId: 'atk',
      targetUnitId: 'foe',
      from: { q: 0, r: 0, facing: 1 },
      to: { q: 1, r: 0, facing: 4 },
      cost: 1,
      damage: 0,
      turnNumber: 1,
      player: 'player1'
    })).toBe(true)
    expect(state.turnsSinceLastDamage).toBe(5)
  })
})
