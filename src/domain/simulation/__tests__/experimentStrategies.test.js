import { describe, it, expect } from 'vitest'
import { cautiousStrategy, makeMixChooser } from '../experimentStrategies.js'

const qDist = (a, b) => Math.abs(a.q - b.q)
const obs = (own, enemies) => ({ ownUnits: own, enemyUnits: enemies })

describe('cautiousStrategy — greedy evasion (maximize distance to nearest enemy)', () => {
  const enemies = [{ id: 'e', position: { q: 5, r: 0 } }]
  const own = [{ id: 'u', position: { q: 2, r: 0 } }]

  it('picks the move that maximizes distance to the nearest enemy', () => {
    const cautious = cautiousStrategy({ distanceFn: qDist })
    const legal = [
      { type: 'move', unitId: 'u', payload: { to: { q: 3, r: 0 } } }, // dist 2
      { type: 'move', unitId: 'u', payload: { to: { q: 1, r: 0 } } }, // dist 4 (best)
      { type: 'endTurn' }
    ]
    expect(cautious(obs(own, enemies), legal)).toEqual(legal[1])
  })

  it('still moves to the least-exposed option when every move reduces distance (cornered)', () => {
    const cautious = cautiousStrategy({ distanceFn: qDist })
    const legal = [
      { type: 'move', unitId: 'u', payload: { to: { q: 4, r: 0 } } }, // dist 1
      { type: 'move', unitId: 'u', payload: { to: { q: 3, r: 0 } } }, // dist 2 (best of bad)
      { type: 'endTurn' }
    ]
    expect(cautious(obs(own, enemies), legal)).toEqual(legal[1])
  })

  it('holds (endTurn) when there are no enemies', () => {
    const cautious = cautiousStrategy({ distanceFn: qDist })
    const legal = [{ type: 'move', unitId: 'u', payload: { to: { q: 1, r: 0 } } }, { type: 'endTurn' }]
    expect(cautious(obs(own, []), legal).type).toBe('endTurn')
  })

  it('holds when no move is available (only fire/endTurn legal)', () => {
    const cautious = cautiousStrategy({ distanceFn: qDist })
    expect(cautious(obs(own, enemies), [{ type: 'fire', unitId: 'u' }, { type: 'endTurn' }]).type).toBe('endTurn')
  })
})

describe('makeMixChooser — probabilistic aggressive/cautious blend', () => {
  const agg = () => 'AGG'
  const cau = () => 'CAU'
  const rngWith = v => ({ next: () => v })

  it('uses cautious when the rng draw < beta', () => {
    expect(makeMixChooser(agg, cau, 0.3)({}, [], rngWith(0.2))).toBe('CAU')
  })

  it('uses aggressive when the rng draw >= beta', () => {
    expect(makeMixChooser(agg, cau, 0.3)({}, [], rngWith(0.5))).toBe('AGG')
  })

  it('beta=0 is always aggressive', () => {
    expect(makeMixChooser(agg, cau, 0)({}, [], rngWith(0))).toBe('AGG')
  })

  it('beta=1 is always cautious', () => {
    expect(makeMixChooser(agg, cau, 1)({}, [], rngWith(0.999))).toBe('CAU')
  })
})
