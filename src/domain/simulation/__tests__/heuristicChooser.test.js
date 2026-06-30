import { describe, expect, it } from 'vitest'
import { createHeuristicStrategy } from '../strategies/heuristicStrategy.js'
import { hexDistanceOffset, hexFacingToward } from '@/domain/engine/hexUtils.js'

function eliminateObs(overrides = {}) {
  return {
    perspective: 'player1',
    turnsSinceLastDamage: 0,
    ownUnits: [{ id: 'p1', player: 'player1', position: { q: 0, r: 0 }, facing: 0, attackPower: 30, isLoaded: true }],
    enemyUnits: [{ id: 'e1', player: 'player2', position: { q: 4, r: 0 }, health: 60, attackPower: 30 }],
    bases: { player1: [], player2: [] },
    objectives: { mode: 'primaryBlue', primary: { id: 'x', type: 'eliminateUnits', player: 'player1', targetPlayer: 'player2' } },
    ...overrides
  }
}

describe('heuristic chooser', () => {
  it('never returns endTurn when a productive advance exists (aggressive)', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive', maxTurns: 100 })
    const advance = { type: 'move', unitId: 'p1', payload: { to: { q: 1, r: 0 } } }
    expect(s(eliminateObs(), [advance, { type: 'endTurn' }])).toBe(advance)
  })

  it('holds (endTurn) rather than oscillate when the only motion worsens position', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive', maxTurns: 100 })
    const obs = eliminateObs({
      ownUnits: [{ id: 'p1', player: 'player1', position: { q: 3, r: 0 }, facing: 0, attackPower: 30, isLoaded: true }],
      enemyUnits: [{ id: 'e1', player: 'player2', position: { q: 4, r: 0 }, health: 60, attackPower: 30 }]
    })
    const away = { type: 'move', unitId: 'p1', payload: { to: { q: 2, r: 0 } } } // increases distance to enemy
    expect(s(obs, [away, { type: 'endTurn' }])).toEqual({ type: 'endTurn' })
  })

  it('defensive holds early but drifts to advancing after prolonged idle', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'defensive', maxTurns: 100 })
    const advance = { type: 'move', unitId: 'p1', payload: { to: { q: 1, r: 0 } } }
    expect(s(eliminateObs({ turnsSinceLastDamage: 0 }), [advance, { type: 'endTurn' }]))
      .toEqual({ type: 'endTurn' })
    expect(s(eliminateObs({ turnsSinceLastDamage: 50 }), [advance, { type: 'endTurn' }]))
      .toBe(advance)
  })

  it('respects turntable priority as a tie-break among equally-productive moves', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive', maxTurns: 100 })
    const obs = eliminateObs({
      ownUnits: [
        { id: 'a', player: 'player1', position: { q: 0, r: 0 }, facing: 0, attackPower: 30, isLoaded: true },
        { id: 'b', player: 'player1', position: { q: 0, r: 0 }, facing: 0, attackPower: 30, isLoaded: true }
      ]
    })
    const lowPri = { type: 'move', unitId: 'a', payload: { to: { q: 1, r: 0 } }, turntablePriority: 1 }
    const highPri = { type: 'move', unitId: 'b', payload: { to: { q: 1, r: 0 } }, turntablePriority: 3 }
    expect(s(obs, [highPri, lowPri, { type: 'endTurn' }])).toBe(lowPri)
  })

  it('stalemate probe: fully committed bias takes a zero-value sidestep instead of freezing', () => {
    // Aggressive base orientationBias is 1.0 (DOCTRINE_DEFAULTS.aggressive in aiConfig.js),
    // so effectiveBias >= 1 from turn one and the probe branch is reachable without an idle streak.
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive', maxTurns: 100 })
    const obs = eliminateObs({
      ownUnits: [{ id: 'p1', player: 'player1', position: { q: 2, r: 0 }, facing: 1, attackPower: 30, isLoaded: true }]
    })
    // Precondition: the sidestep keeps the distance to the enemy unchanged,
    // so its reposition value is exactly 0 (not strictly positive).
    expect(hexDistanceOffset({ q: 2, r: 1 }, { q: 4, r: 0 }))
      .toBe(hexDistanceOffset({ q: 2, r: 0 }, { q: 4, r: 0 }))
    const sidestep = { type: 'move', unitId: 'p1', payload: { to: { q: 2, r: 1 } } }
    expect(s(obs, [sidestep, { type: 'endTurn' }])).toBe(sidestep)
  })

  it('stalemate probe: +0.5 relocation bonus ranks a move above an equally-valued turn', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive', maxTurns: 100 })
    const obs = eliminateObs({
      ownUnits: [{ id: 'p1', player: 'player1', position: { q: 2, r: 0 }, facing: 0, attackPower: 30, isLoaded: true }]
    })
    // Preconditions: desired facing is 1, so facings 0 (current) and 2 are both
    // one step away — the swivel's value is 0; the sidestep's value is 0 too.
    expect(hexFacingToward({ q: 2, r: 0 }, { q: 4, r: 0 })).toBe(1)
    expect(hexDistanceOffset({ q: 2, r: 1 }, { q: 4, r: 0 }))
      .toBe(hexDistanceOffset({ q: 2, r: 0 }, { q: 4, r: 0 }))
    // The swivel is listed first AND carries the better turntable priority, so
    // only the +0.5 move/reverse bonus can explain the sidestep winning.
    const swivel = { type: 'turn', unitId: 'p1', payload: { facing: 2 }, turntablePriority: 1 }
    const sidestep = { type: 'move', unitId: 'p1', payload: { to: { q: 2, r: 1 } }, turntablePriority: 2 }
    expect(s(obs, [swivel, sidestep, { type: 'endTurn' }])).toBe(sidestep)
  })

  it('reloads (prepares to fire) when no fire/advance is productive and the unit is unloaded', () => {
    const s = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced', maxTurns: 100 })
    const obs = eliminateObs({
      ownUnits: [{ id: 'p1', player: 'player1', position: { q: 3, r: 0 }, facing: 0, attackPower: 30, isLoaded: false }],
      enemyUnits: [{ id: 'e1', player: 'player2', position: { q: 4, r: 0 }, health: 60, attackPower: 30 }]
    })
    const away = { type: 'move', unitId: 'p1', payload: { to: { q: 2, r: 0 } } } // worsens
    const reload = { type: 'reload', unitId: 'p1', payload: {} }
    expect(s(obs, [away, reload, { type: 'endTurn' }])).toBe(reload)
  })
})
