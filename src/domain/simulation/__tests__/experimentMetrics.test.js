import { describe, it, expect } from 'vitest'
import {
  classifyCommand,
  extractCodedSequence,
  aggressiveness,
  consistency,
  runLengths,
  meanCI
} from '../experimentMetrics.js'

// Trivial 1-D distance on the q axis so A/D classification is hand-verifiable
// without depending on hex-math internals (the production default is the real
// hexDistanceOffset).
const qDist = (a, b) => Math.abs(a.q - b.q)

describe('classifyCommand — A/D/N coding of a single bot command', () => {
  it('codes fire as A regardless of position', () => {
    expect(classifyCommand({ type: 'fire', unitId: 'u' }, [{ q: 5, r: 0 }], qDist)).toBe('A')
  })

  it('codes a move that reduces distance to nearest enemy as A', () => {
    const cmd = { type: 'move', unitId: 'u', from: { q: 0, r: 0 }, to: { q: 2, r: 0 } }
    expect(classifyCommand(cmd, [{ q: 5, r: 0 }], qDist)).toBe('A')
  })

  it('codes a move that increases distance to nearest enemy as D', () => {
    const cmd = { type: 'move', unitId: 'u', from: { q: 2, r: 0 }, to: { q: 0, r: 0 } }
    expect(classifyCommand(cmd, [{ q: 5, r: 0 }], qDist)).toBe('D')
  })

  it('codes a lateral move (no distance change) as N', () => {
    const cmd = { type: 'move', unitId: 'u', from: { q: 2, r: 0 }, to: { q: 2, r: 1 } }
    expect(classifyCommand(cmd, [{ q: 5, r: 0 }], qDist)).toBe('N')
  })

  it('uses the NEAREST enemy when several exist', () => {
    const cmd = { type: 'move', unitId: 'u', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }
    // nearest enemy is q:3 (dist 3 -> 2), so closing = A
    expect(classifyCommand(cmd, [{ q: 5, r: 0 }, { q: 3, r: 0 }], qDist)).toBe('A')
  })

  it('codes reverse like a move (distance-based)', () => {
    const cmd = { type: 'reverse', unitId: 'u', from: { q: 2, r: 0 }, to: { q: 0, r: 0 } }
    expect(classifyCommand(cmd, [{ q: 5, r: 0 }], qDist)).toBe('D')
  })

  it('codes turn and reload as N', () => {
    expect(classifyCommand({ type: 'turn', unitId: 'u', payload: { facing: 2 } }, [{ q: 5, r: 0 }], qDist)).toBe('N')
    expect(classifyCommand({ type: 'reload', unitId: 'u' }, [{ q: 5, r: 0 }], qDist)).toBe('N')
  })

  it('codes a move as N when there are no living enemies', () => {
    const cmd = { type: 'move', unitId: 'u', from: { q: 0, r: 0 }, to: { q: 2, r: 0 } }
    expect(classifyCommand(cmd, [], qDist)).toBe('N')
  })
})

describe('extractCodedSequence — bot command stream from frames', () => {
  const frame = (actingPlayer, command, units) => ({
    event: 'afterCommand',
    actingPlayer,
    command,
    engine: { units }
  })
  // units: array of [id, unit] pairs like the real engine snapshot
  const units = [
    ['p1', { id: 'p1', player: 'player1', position: { q: 0, r: 0 }, health: 60, isActive: true }],
    ['e1', { id: 'e1', player: 'player2', position: { q: 5, r: 0 }, health: 60, isActive: true }]
  ]

  it('keeps only the bot player commands, drops endTurn and the opponent', () => {
    const frames = [
      { event: 'diceRoll', actingPlayer: null, command: null, engine: { units } },
      frame('player1', { type: 'move', unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }, units),
      frame('player2', { type: 'move', unitId: 'e1', from: { q: 5, r: 0 }, to: { q: 4, r: 0 } }, units),
      frame('player1', { type: 'fire', unitId: 'p1' }, units),
      frame('player1', { type: 'endTurn' }, units)
    ]
    const coded = extractCodedSequence(frames, 'player1', { distanceFn: qDist })
    expect(coded.map(c => c.type)).toEqual(['move', 'fire'])
    expect(coded.map(c => c.code)).toEqual(['A', 'A'])
  })
})

describe('aggressiveness — aMove and aAll', () => {
  it('computes aMove over moves only and aAll over all A/D', () => {
    const coded = [
      { type: 'move', code: 'A' },
      { type: 'move', code: 'A' },
      { type: 'move', code: 'D' },
      { type: 'fire', code: 'A' },
      { type: 'turn', code: 'N' }
    ]
    const r = aggressiveness(coded)
    expect(r.towardMoves).toBe(2)
    expect(r.awayMoves).toBe(1)
    expect(r.fires).toBe(1)
    expect(r.aMove).toBeCloseTo(2 / 3, 6) // toward / (toward+away)
    expect(r.aAll).toBeCloseTo(3 / 4, 6) // A / (A+D) = (fires+toward)/(...+away)
  })

  it('returns null ratios when there are no directional actions', () => {
    const r = aggressiveness([{ type: 'turn', code: 'N' }, { type: 'reload', code: 'N' }])
    expect(r.aMove).toBeNull()
    expect(r.aAll).toBeNull()
  })
})

describe('consistency — c = 1 - s/s0', () => {
  it('a constant streak AAA is perfectly consistent (c=1)', () => {
    expect(consistency(['A', 'A', 'A']).c).toBe(1)
  })

  it('strict alternation ADAD is maximally anti-persistent (c=-1)', () => {
    expect(consistency(['A', 'D', 'A', 'D']).c).toBeCloseTo(-1, 6)
  })

  it('AADD switches once of three -> c = 1/3', () => {
    expect(consistency(['A', 'A', 'D', 'D']).c).toBeCloseTo(1 / 3, 6)
  })

  it('AAAD with p=0.75 -> c = 1 - (1/3)/0.375', () => {
    expect(consistency(['A', 'A', 'A', 'D']).c).toBeCloseTo(1 - (1 / 3) / 0.375, 6)
  })

  it('returns null for sequences shorter than 2', () => {
    expect(consistency(['A']).c).toBeNull()
    expect(consistency([]).c).toBeNull()
  })
})

describe('runLengths — streak distribution', () => {
  it('reports run lengths, max run and fraction in runs >= 3', () => {
    const r = runLengths(['A', 'A', 'D', 'A', 'A', 'A'])
    expect(r.lengths).toEqual([2, 1, 3])
    expect(r.maxRun).toBe(3)
    expect(r.fractionInRunsGTE3).toBeCloseTo(3 / 6, 6)
  })
})

describe('meanCI — mean and 95% CI over matches', () => {
  it('computes sample mean, sd (n-1) and 95% CI', () => {
    const r = meanCI([1, 2, 3, 4, 5])
    expect(r.n).toBe(5)
    expect(r.mean).toBeCloseTo(3, 6)
    expect(r.sd).toBeCloseTo(Math.sqrt(2.5), 6)
    expect(r.ci95).toBeCloseTo(1.96 * Math.sqrt(2.5) / Math.sqrt(5), 6)
  })

  it('filters nulls and non-finite values', () => {
    const r = meanCI([2, null, 4, undefined, NaN])
    expect(r.n).toBe(2)
    expect(r.mean).toBeCloseTo(3, 6)
  })

  it('returns null stats for empty input', () => {
    const r = meanCI([])
    expect(r.n).toBe(0)
    expect(r.mean).toBeNull()
  })

  it('single value has sd 0 and null CI', () => {
    const r = meanCI([5])
    expect(r.n).toBe(1)
    expect(r.mean).toBe(5)
    expect(r.sd).toBe(0)
    expect(r.ci95).toBeNull()
  })
})
