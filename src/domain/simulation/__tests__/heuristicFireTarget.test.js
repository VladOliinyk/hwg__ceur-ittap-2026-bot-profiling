import { describe, expect, it } from 'vitest'
import { chooseFireTarget } from '../strategies/heuristicStrategy.js'

const VALUATION = { kill: 1000, damage: 1, danger: 0.5 }

function obs(enemyUnits) {
  return {
    ownUnits: [{ id: 'p1', player: 'player1', position: { q: 0, r: 0 }, attackPower: 40 }],
    enemyUnits
  }
}

function fire(unitId) {
  return { type: 'fire', unitId: 'p1', payload: { target: { q: 1, r: 0, unitId } } }
}

describe('chooseFireTarget', () => {
  it('prefers a killable target over a higher-HP one', () => {
    const o = obs([
      { id: 'weak', player: 'player2', position: { q: 1, r: 0 }, health: 30, attackPower: 10 },
      { id: 'tough', player: 'player2', position: { q: 1, r: 0 }, health: 90, attackPower: 90 }
    ])
    expect(chooseFireTarget([fire('tough'), fire('weak')], o, VALUATION)).toEqual(fire('weak'))
  })

  it('among non-kills, prefers the most damage then the most dangerous', () => {
    const o = obs([
      { id: 'a', player: 'player2', position: { q: 1, r: 0 }, health: 90, attackPower: 10 },
      { id: 'b', player: 'player2', position: { q: 1, r: 0 }, health: 90, attackPower: 90 }
    ])
    // equal damage (min(40,90)=40); danger breaks the tie -> b
    expect(chooseFireTarget([fire('a'), fire('b')], o, VALUATION)).toEqual(fire('b'))
  })

  it('is deterministic via command-key tie-break', () => {
    const o = obs([
      { id: 'a', player: 'player2', position: { q: 1, r: 0 }, health: 90, attackPower: 50 },
      { id: 'b', player: 'player2', position: { q: 1, r: 0 }, health: 90, attackPower: 50 }
    ])
    expect(chooseFireTarget([fire('b'), fire('a')], o, VALUATION)).toEqual(fire('a'))
  })
})
