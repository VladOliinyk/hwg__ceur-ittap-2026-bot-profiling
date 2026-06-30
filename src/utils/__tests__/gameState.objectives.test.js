import { describe, expect, it } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createUnit } from '@/domain/engine/gameUnits.js'

describe('GameState objectives integration', () => {
  it('updates outcome when a direct removeUnit completes an eliminate objective', () => {
    const objectives = {
      mode: 'firstSatisfied',
      conditions: [
        { id: 'player1_eliminate_player2', type: 'eliminateUnits', targetPlayer: 'player2', winner: 'player1' }
      ]
    }
    const state = new GameState({ width: 2, height: 1, objectivesData: objectives })
    const p1 = createUnit('infantry', {
      id: 'p1',
      player: 'player1',
      position: { q: 0, r: 0 }
    })
    const p2 = createUnit('infantry', {
      id: 'p2',
      player: 'player2',
      position: { q: 1, r: 0 }
    })

    state.addUnit(p1, 0, 0)
    state.addUnit(p2, 1, 0)
    expect(state.outcome.status).toBe('active')

    expect(state.removeUnit('p2')).toBe(true)
    expect(state.outcome).toMatchObject({
      status: 'ended',
      winner: 'player1',
      reason: 'unitWipe',
      conditionId: null
    })
  })
})
