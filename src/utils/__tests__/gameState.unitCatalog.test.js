import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'

function mapData() {
  return {
    parameters: { width: 2, height: 2 },
    map: [
      { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
      { q: 1, r: 0, terrain: 'plains' },
      { q: 0, r: 1, terrain: 'plains' },
      { q: 1, r: 1, terrain: 'plains', player2Spawn: true }
    ]
  }
}

const terrainTypes = [
  { id: 'plains', name: 'Plains', color: '#4caf50', terrainDifficulty: 0 }
]

function rocketTeam(overrides = {}) {
  return {
    id: 'rocket_team',
    name: 'Rocket Team',
    health: 45,
    movement: 2,
    attackRange: 4,
    attackAngle: 0,
    attackPower: 80,
    maxTerrainDifficulty: 5,
    losMode: 'artillery',
    iconKey: 'unknown',
    ...overrides
  }
}

function firstUnitFor(gs, player) {
  return Array.from(gs.units.values()).find(unit => unit.player === player)
}

describe('GameState unit catalog placement', () => {
  it('places custom catalog units and applies catalog stats', () => {
    const gs = new GameState({
      width: 2,
      height: 2,
      mapData: mapData(),
      terrainTypes,
      unitsData: {
        unitTypes: [rocketTeam()],
        player1: { units: [{ type: 'rocket_team', count: 1 }] },
        player2: { units: [] }
      }
    })

    const unit = firstUnitFor(gs, 'player1')
    expect(unit).toMatchObject({
      type: 'rocket_team',
      name: 'Rocket Team',
      health: 45,
      maxHealth: 45,
      movement: 2,
      attackRange: 4,
      attackAngle: 0,
      attackPower: 80,
      maxTerrainDifficulty: 5,
      losMode: 'artillery',
      iconKey: 'unknown'
    })
  })

  it('applies row-level overrides over catalog defaults for legacy compatibility', () => {
    const gs = new GameState({
      width: 2,
      height: 2,
      mapData: mapData(),
      terrainTypes,
      unitsData: {
        unitTypes: [rocketTeam()],
        player1: {
          units: [{
            type: 'rocket_team',
            count: 1,
            health: 30,
            movement: 1,
            attackRange: 2,
            attackAngle: 4,
            attackPower: 25,
            maxTerrainDifficulty: 1,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }]
        },
        player2: { units: [] }
      }
    })

    const unit = firstUnitFor(gs, 'player1')
    expect(unit).toMatchObject({
      health: 30,
      maxHealth: 30,
      movement: 1,
      attackRange: 2,
      attackAngle: 4,
      attackPower: 25,
      maxTerrainDifficulty: 1,
      losMode: 'direct_fire',
      iconKey: 'infantry'
    })
  })

  it('still places legacy units when units.unitTypes is absent', () => {
    const gs = new GameState({
      width: 2,
      height: 2,
      mapData: mapData(),
      terrainTypes,
      unitsData: {
        player1: { units: [{ type: 'infantry', count: 1, attackAngle: 1 }] },
        player2: { units: [] }
      }
    })

    const unit = firstUnitFor(gs, 'player1')
    expect(unit.type).toBe('infantry')
    expect(unit.attackAngle).toBe(1)
  })
})
