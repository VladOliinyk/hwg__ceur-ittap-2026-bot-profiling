import { describe, it, expect } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../../domain/simulation/rng.js'

function makeMicroLevel() {
  const width = 5
  const height = 3
  const map = []
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const cell = { q, r, terrain: 'plains' }
      if (r === 0) cell.player1Spawn = true
      if (r === 2) cell.player2Spawn = true
      map.push(cell)
    }
  }
  const mapData = { parameters: { width, height }, map }
  const terrainTypes = [
    { id: 'plains', name: 'Plains', color: '#4caf50', terrainDifficulty: 0 }
  ]
  const unitsData = {
    player1: {
      units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 3 }
      ]
    },
    player2: {
      units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 3 }
      ]
    }
  }
  return { mapData, terrainTypes, unitsData }
}

function unitPositionsByPlayer(gs, player) {
  const list = []
  for (const unit of gs.units.values()) {
    if (unit.player === player) {
      list.push({ id: unit.id, q: unit.position.q, r: unit.position.r })
    }
  }
  return list.sort((a, b) => a.id.localeCompare(b.id))
}

describe('GameState — seeded RNG reproducibility', () => {
  describe('placeUnitsFromLevel', () => {
    it('yields identical placement order for two states built with the same seed', () => {
      const { mapData, terrainTypes, unitsData } = makeMicroLevel()
      const seed = 'placement-seed-1'

      const gsA = new GameState({
        width: mapData.parameters.width,
        height: mapData.parameters.height,
        mapData,
        terrainTypes,
        unitsData,
        rng: createRng(seed)
      })
      const gsB = new GameState({
        width: mapData.parameters.width,
        height: mapData.parameters.height,
        mapData,
        terrainTypes,
        unitsData,
        rng: createRng(seed)
      })

      expect(unitPositionsByPlayer(gsA, 'player1')).toEqual(unitPositionsByPlayer(gsB, 'player1'))
      expect(unitPositionsByPlayer(gsA, 'player2')).toEqual(unitPositionsByPlayer(gsB, 'player2'))
    })

    it('different seeds can produce different placement orders', () => {
      const { mapData, terrainTypes, unitsData } = makeMicroLevel()
      const signatures = ['seed-A', 'seed-B', 'seed-C', 'seed-D'].map(seed => {
        const gs = new GameState({
          width: mapData.parameters.width,
          height: mapData.parameters.height,
          mapData,
          terrainTypes,
          unitsData,
          rng: createRng(seed)
        })
        return JSON.stringify(unitPositionsByPlayer(gs, 'player1'))
      })

      expect(new Set(signatures).size).toBeGreaterThan(1)
    })
  })

  describe('rollDiceFromRng', () => {
    function newStateWithRng(seed) {
      // Minimal turntable so rollDice's recording semantics work end-to-end.
      const turntable = {
        Our_operations: [
          {
            title: 'MANOEUVRE',
            moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }]
          }
        ],
        Enemy_operations: []
      }
      return new GameState({ width: 3, height: 3, turntableData: turntable, rng: createRng(seed) })
    }

    it('produces a face in 1..6', () => {
      const gs = newStateWithRng(123)
      const face = gs.rollDiceFromRng()
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
      expect(Number.isInteger(face)).toBe(true)
    })

    it('commits the rolled face to the current turn buffer', () => {
      const gs = newStateWithRng(123)
      const face = gs.rollDiceFromRng()
      expect(gs.hasRolledDice()).toBe(true)
      expect(gs.getCurrentDiceResult()).toBe(face)
    })

    it('can draw a deterministic face without committing it until rollDice()', () => {
      const drawn = newStateWithRng('delayed-reveal')
      const committed = newStateWithRng('delayed-reveal')

      const face = drawn.drawDiceFaceFromRng()
      expect(drawn.hasRolledDice()).toBe(false)
      expect(drawn.getCurrentDiceResult()).toBe(null)
      expect(face).toBe(committed.rollDiceFromRng())

      drawn.rollDice(face)
      expect(drawn.hasRolledDice()).toBe(true)
      expect(drawn.getCurrentDiceResult()).toBe(face)
    })

    it('two states with the same seed roll the same sequence', () => {
      const gsA = newStateWithRng('dice-seed-1')
      const gsB = newStateWithRng('dice-seed-1')

      const a1 = gsA.rollDiceFromRng()
      gsA.endTurn()
      const a2 = gsA.rollDiceFromRng()
      gsA.endTurn()
      const a3 = gsA.rollDiceFromRng()

      const b1 = gsB.rollDiceFromRng()
      gsB.endTurn()
      const b2 = gsB.rollDiceFromRng()
      gsB.endTurn()
      const b3 = gsB.rollDiceFromRng()

      expect([a1, a2, a3]).toEqual([b1, b2, b3])
    })

    it('rejects a second roll inside the same turn (engine-enforced one-roll-per-turn)', () => {
      const gs = newStateWithRng(7)
      gs.rollDiceFromRng()
      expect(() => gs.rollDiceFromRng()).toThrow(/already rolled/i)
    })

    it('does not consume rng when the one-roll guard rejects a reroll', () => {
      const draws = []
      const rng = {
        next() {
          draws.push(true)
          return 0.1
        }
      }
      const gs = new GameState({ width: 3, height: 3, rng })

      gs.rollDiceFromRng()
      expect(draws).toHaveLength(1)

      expect(() => gs.rollDiceFromRng()).toThrow(/already rolled/i)
      expect(draws).toHaveLength(1)

      gs.endTurn()
      gs.rollDiceFromRng()
      expect(draws).toHaveLength(2)
    })

    it('does not consume rng when the draw guard rejects a reroll', () => {
      const draws = []
      const rng = {
        next() {
          draws.push(true)
          return 0.1
        }
      }
      const gs = new GameState({ width: 3, height: 3, rng })

      gs.rollDiceFromRng()
      expect(draws).toHaveLength(1)

      expect(() => gs.drawDiceFaceFromRng()).toThrow(/already rolled/i)
      expect(draws).toHaveLength(1)
    })
  })

  describe('toJSON / fromJSON — RNG continuity across save/restore', () => {
    function minimalTurntable() {
      return {
        Our_operations: [
          {
            title: 'MANOEUVRE',
            moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }]
          }
        ],
        Enemy_operations: [
          {
            title: 'MANOEUVRE',
            moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }]
          }
        ]
      }
    }

    function newSeededState(seed) {
      return new GameState({ width: 3, height: 3, turntableData: minimalTurntable(), rng: createRng(seed) })
    }

    // Mimic the real localStorage round-trip: toJSON → JSON serialize → JSON parse → fromJSON.
    // Without the serialize step the snapshot shares mutable arrays with the live state.
    function snapshotRestore(gs) {
      return GameState.fromJSON(JSON.parse(JSON.stringify(gs.toJSON(true))))
    }

    it('round-trip preserves the next rolled face after a save/restore', () => {
      const seed = 'restore-seed-1'
      const gs = newSeededState(seed)
      gs.rollDiceFromRng()
      gs.endTurn()

      const restored = snapshotRestore(gs)

      const restoredFace = restored.rollDiceFromRng()
      const referenceFace = gs.rollDiceFromRng()

      expect(restoredFace).toBe(referenceFace)
    })

    it('round-trip preserves multiple future RNG draws across consecutive turns', () => {
      const seed = 'restore-seed-multi'
      const gs = newSeededState(seed)
      gs.rollDiceFromRng()
      gs.endTurn()

      const restored = snapshotRestore(gs)

      const refSeq = []
      const restoredSeq = []
      for (let i = 0; i < 4; i++) {
        refSeq.push(gs.rollDiceFromRng())
        restoredSeq.push(restored.rollDiceFromRng())
        gs.endTurn()
        restored.endTurn()
      }
      expect(restoredSeq).toEqual(refSeq)
    })

    it('legacy snapshot without RNG metadata still loads and falls back to Math.random', () => {
      const seed = 'legacy-seed'
      const gs = newSeededState(seed)
      gs.rollDiceFromRng()

      const rawSnapshot = JSON.parse(JSON.stringify(gs.toJSON(true)))
      delete rawSnapshot.rng

      const restored = GameState.fromJSON(rawSnapshot)
      restored.endTurn()
      // Fallback engine should still produce a valid roll without throwing.
      const face = restored.rollDiceFromRng()
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
    })

    it('rejected reroll after restore does not consume RNG', () => {
      const seed = 'reroll-after-restore'
      const gs = newSeededState(seed)
      gs.rollDiceFromRng()

      const restored = snapshotRestore(gs)

      expect(() => restored.rollDiceFromRng()).toThrow(/already rolled/i)
      restored.endTurn()
      gs.endTurn()

      // After the rejected reroll the restored stream should still match the
      // original-engine stream on the very next turn.
      expect(restored.rollDiceFromRng()).toBe(gs.rollDiceFromRng())
    })
  })
})
