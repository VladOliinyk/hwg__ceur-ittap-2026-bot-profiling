import { describe, it, expect } from 'vitest'
import { GameHex } from '@/domain/engine/gameHex.js'
import { GameUnit } from '@/domain/engine/gameUnits.js'

describe('GameHex.clone()', () => {
  it('preserves all four spawn/base flags', () => {
    const hex = new GameHex({
      q: 2, r: 3,
      player1Spawn: true,
      player1Base: false,
      player2Spawn: false,
      player2Base: true
    })
    const cloned = hex.clone()
    expect(cloned.player1Spawn).toBe(true)
    expect(cloned.player1Base).toBe(false)
    expect(cloned.player2Spawn).toBe(false)
    expect(cloned.player2Base).toBe(true)
  })

  it('preserves terrain', () => {
    const hex = new GameHex({
      q: 1, r: 1,
      terrain: { id: 'forest', name: 'Forest', color: '#228B22', terrainDifficulty: 2 }
    })
    const cloned = hex.clone()
    expect(cloned.terrain).toEqual(hex.terrain)
    expect(cloned.terrain).not.toBe(hex.terrain)
  })

  it('preserves unit via unit.clone()', () => {
    const unit = new GameUnit({ id: 'u1', player: 'player1', health: 40, maxHealth: 60 })
    const hex = new GameHex({ q: 0, r: 0, unit })
    const cloned = hex.clone()
    expect(cloned.unit).not.toBeNull()
    expect(cloned.unit).not.toBe(unit)
    expect(cloned.unit.id).toBe('u1')
    expect(cloned.unit.health).toBe(40)
  })

  it('produces an independent copy — mutating flags on clone does not affect original', () => {
    const hex = new GameHex({ q: 0, r: 0, player1Spawn: true, player2Base: true })
    const cloned = hex.clone()
    cloned.player1Spawn = false
    cloned.player2Base = false
    expect(hex.player1Spawn).toBe(true)
    expect(hex.player2Base).toBe(true)
  })
})

describe('GameHex toJSON() / fromJSON() round-trip', () => {
  it('preserves all four spawn/base flags', () => {
    const hex = new GameHex({
      q: 4, r: 5,
      player1Spawn: true,
      player1Base: true,
      player2Spawn: false,
      player2Base: false
    })
    const restored = GameHex.fromJSON(hex.toJSON())
    expect(restored.player1Spawn).toBe(true)
    expect(restored.player1Base).toBe(true)
    expect(restored.player2Spawn).toBe(false)
    expect(restored.player2Base).toBe(false)
  })

  it('preserves terrain through serialization', () => {
    const terrain = { id: 'mud', name: 'Mud', color: '#8B4513', terrainDifficulty: 3 }
    const hex = new GameHex({ q: 1, r: 2, terrain })
    const restored = GameHex.fromJSON(hex.toJSON())
    expect(restored.terrain).toEqual(terrain)
  })
})
