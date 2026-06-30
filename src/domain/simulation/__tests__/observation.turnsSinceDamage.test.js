import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { getObservation } from '../observation.js'
import { makeMicroLevelPackage } from './fixtures.js'

describe('observation turnsSinceLastDamage', () => {
  it('surfaces the engine idle counter', () => {
    const pkg = makeMicroLevelPackage()
    const state = new GameState({
      width: pkg.hexmap.parameters.width,
      height: pkg.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable
    })
    state.turnsSinceLastDamage = 7
    const obs = getObservation(state, 'player1')
    expect(obs.turnsSinceLastDamage).toBe(7)
  })

  it('defaults to 0 when the field is absent', () => {
    const pkg = makeMicroLevelPackage()
    const state = new GameState({
      width: pkg.hexmap.parameters.width,
      height: pkg.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable
    })
    delete state.turnsSinceLastDamage
    const obs = getObservation(state, 'player1')
    expect(obs.turnsSinceLastDamage).toBe(0)
  })
})
