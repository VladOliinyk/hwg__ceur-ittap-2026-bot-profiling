import { describe, it, expect } from 'vitest'
import { runProfileBatch, buildStrategy } from '../experimentRunner.js'
import { makeMicroLevelPackage } from './fixtures.js'

describe('experimentRunner — buildStrategy', () => {
  // enemy far in +q; only legal non-endTurn move goes -q (unambiguously a retreat).
  const retreatScenario = {
    observation: { ownUnits: [{ id: 'u', position: { q: 2, r: 0 } }], enemyUnits: [{ id: 'e', position: { q: 9, r: 0 } }] },
    legal: [{ type: 'move', unitId: 'u', payload: { to: { q: 1, r: 0 } } }, { type: 'endTurn' }]
  }

  it('builds a doctrine strategy function and a random one', () => {
    expect(typeof buildStrategy({ kind: 'doctrine', profile: 'aggressive' }, { playerId: 'player1' })).toBe('function')
    expect(typeof buildStrategy({ kind: 'random' }, { playerId: 'player2' })).toBe('function')
  })

  it('builds a cautious scheme that retreats (not the fall-through doctrine, which would hold)', () => {
    const s = buildStrategy({ kind: 'cautious' }, { playerId: 'player1' })
    expect(s(retreatScenario.observation, retreatScenario.legal).type).toBe('move')
  })

  it('builds a mix scheme that honors beta via the rng draw', () => {
    const s = buildStrategy({ kind: 'mix', beta: 1 }, { playerId: 'player1' })
    // beta=1 -> always cautious -> retreat
    expect(s(retreatScenario.observation, retreatScenario.legal, { next: () => 0.99 }).type).toBe('move')
  })
})

describe('experimentRunner — runProfileBatch', () => {
  const pkg = makeMicroLevelPackage()
  const opts = () => ({
    levelPackage: pkg,
    botPlayer: 'player1',
    botScheme: { kind: 'doctrine', profile: 'aggressive' },
    opponentScheme: { kind: 'doctrine', profile: 'defensive' },
    seeds: ['e1-1', 'e1-2', 'e1-3', 'e1-4'],
    maxTurns: 40
  })

  it('returns config, one profile per seed, and a summary', () => {
    const r = runProfileBatch(opts())
    expect(r.matches).toHaveLength(4)
    expect(r.summary.matchCount).toBe(4)
    expect(r.summary).toHaveProperty('aMove')
    expect(r.summary).toHaveProperty('c')
    expect(r.summary.botWinRate).toBeGreaterThanOrEqual(0)
    expect(r.summary.botWinRate).toBeLessThanOrEqual(1)
  })

  it('each match profile has bounded ratios (or null) and a valid winner', () => {
    const r = runProfileBatch(opts())
    for (const m of r.matches) {
      expect(['player1', 'player2', 'draw']).toContain(m.winner)
      if (m.aMove !== null) {
        expect(m.aMove).toBeGreaterThanOrEqual(0)
        expect(m.aMove).toBeLessThanOrEqual(1)
      }
      if (m.c !== null) {
        expect(m.c).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(runProfileBatch(opts())).toEqual(runProfileBatch(opts()))
  })
})
