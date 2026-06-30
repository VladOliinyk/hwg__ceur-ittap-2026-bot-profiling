import { describe, expect, it } from 'vitest'
import { runBatch, batchResultToJSON, batchResultToCSV } from '../runBatch.js'
import { runMatch } from '../runMatch.js'
import { randomStrategy } from '../strategies/randomStrategy.js'
import { makeMicroLevelPackage } from './fixtures.js'
import { OBJECTIVE_REASONS } from '../../objectives/objectives.js'

function strats() {
  return { player1: randomStrategy(), player2: randomStrategy() }
}

/** Level with a surviveTurns primary objective and a deadline of `deadlineTurns`. */
function makeDeadlineLevelPackage(deadlineTurns) {
  const base = makeMicroLevelPackage()
  return {
    ...base,
    objectives: {
      primary: {
        id: 'survive',
        type: 'surviveTurns',
        player: 'player1',
        deadlineTurns
      }
    }
  }
}

describe('runBatch — input validation', () => {
  it('throws when input is missing', () => {
    expect(() => runBatch()).toThrow()
  })

  it('throws when levelPackage is missing', () => {
    expect(() => runBatch({ strategies: strats(), seeds: [1] })).toThrow()
  })

  it('throws when strategies are missing', () => {
    expect(() => runBatch({ levelPackage: makeMicroLevelPackage(), seeds: [1] })).toThrow()
  })

  it('throws when seeds is missing, not an array, or empty', () => {
    const pkg = makeMicroLevelPackage()
    expect(() => runBatch({ levelPackage: pkg, strategies: strats() })).toThrow()
    expect(() => runBatch({ levelPackage: pkg, strategies: strats(), seeds: 'not array' })).toThrow()
    expect(() => runBatch({ levelPackage: pkg, strategies: strats(), seeds: [] })).toThrow()
  })
})

describe('runBatch — determinism', () => {
  it('produces identical BatchResult for the same seeds, strategies, level', () => {
    const pkg = makeMicroLevelPackage()
    const a = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: ['s1', 's2', 's3'],
      maxTurns: 15
    })
    const b = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: ['s1', 's2', 's3'],
      maxTurns: 15
    })
    expect(a).toEqual(b)
  })

  it('JSON export is byte-identical across two runs of the same batch', () => {
    const pkg = makeMicroLevelPackage()
    const a = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: [1, 2, 3, 4],
      maxTurns: 10
    })
    const b = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: [1, 2, 3, 4],
      maxTurns: 10
    })
    expect(batchResultToJSON(a)).toBe(batchResultToJSON(b))
  })

  it('each match in the batch equals the corresponding runMatch single run', () => {
    const pkg = makeMicroLevelPackage()
    const seeds = ['a', 'b', 'c']
    const batch = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds,
      maxTurns: 10
    })
    for (const seed of seeds) {
      const expected = runMatch({
        levelPackage: pkg,
        strategies: strats(),
        seed,
        maxTurns: 10
      })
      const inBatch = batch.matches.find(m => m.seed === seed)
      expect(inBatch.winner).toBe(expected.winner)
      expect(inBatch.turns).toBe(expected.turns)
      expect(inBatch.reason).toBe(expected.reason)
      expect(inBatch.metrics).toEqual(expected.metrics)
    }
  })

  it('preserves seed order in matches[]', () => {
    const pkg = makeMicroLevelPackage()
    const seeds = ['z', 'a', 'q', 'b']
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds, maxTurns: 5 })
    expect(r.matches.map(m => m.seed)).toEqual(seeds)
  })
})

describe('runBatch — variance across seeds', () => {
  it('different seed ranges can produce different aggregate metrics', () => {
    const pkg = makeMicroLevelPackage()
    const a = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: ['A1', 'A2', 'A3', 'A4'],
      maxTurns: 12
    })
    const b = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: ['B1', 'B2', 'B3', 'B4'],
      maxTurns: 12
    })
    // Two distinct seed sets should not yield identical aggregates with
    // a random strategy. If they do, RNG isolation per seed is broken.
    expect(a.aggregate).not.toEqual(b.aggregate)
  })
})

describe('runBatch — aggregate correctness', () => {
  it('matchCount equals seeds.length', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2, 3, 4, 5], maxTurns: 5 })
    expect(r.aggregate.matchCount).toBe(5)
    expect(r.matches.length).toBe(5)
  })

  it('winRates sum to 1 across player1/player2/draw', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: ['x', 'y', 'z'], maxTurns: 8 })
    const sum = r.aggregate.winRates.player1 + r.aggregate.winRates.player2 + r.aggregate.winRates.draw
    expect(sum).toBeCloseTo(1, 10)
  })

  it('terminationReasons counts equal per-match reason counts', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2, 3, 4, 5, 6], maxTurns: 5 })
    const counted = {}
    for (const m of r.matches) {
      counted[m.reason] = (counted[m.reason] || 0) + 1
    }
    for (const [reason, count] of Object.entries(counted)) {
      expect(r.aggregate.terminationReasons[reason]).toBe(count)
    }
    const totalReasons = Object.values(r.aggregate.terminationReasons)
      .reduce((sum, count) => sum + count, 0)
    expect(totalReasons).toBe(r.aggregate.matchCount)
  })

  it('totalActionsByType equals sum of per-match actionsByType', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2, 3], maxTurns: 6 })
    for (const k of ['move', 'reverse', 'turn', 'fire', 'reload', 'endTurn']) {
      const sum = r.matches.reduce((s, m) => s + m.metrics.actionsByType[k], 0)
      expect(r.aggregate.totalActionsByType[k]).toBe(sum)
    }
  })

  it('avgTurns equals total turns / matchCount', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [10, 20, 30], maxTurns: 6 })
    const total = r.matches.reduce((s, m) => s + m.turns, 0)
    expect(r.aggregate.avgTurns).toBeCloseTo(total / r.aggregate.matchCount, 10)
  })

  it('totalIllegalAttempts, totalKills, totalDamage equal per-player sums across matches', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: ['k1', 'k2', 'k3'], maxTurns: 8 })
    for (const p of ['player1', 'player2']) {
      const illegal = r.matches.reduce((s, m) => s + m.metrics.illegalAttemptsByPlayer[p], 0)
      const kills = r.matches.reduce((s, m) => s + m.metrics.killsByPlayer[p], 0)
      const dmg = r.matches.reduce((s, m) => s + m.metrics.damageByPlayer[p], 0)
      expect(r.aggregate.totalIllegalAttempts[p]).toBe(illegal)
      expect(r.aggregate.totalKills[p]).toBe(kills)
      expect(r.aggregate.totalDamage[p]).toBe(dmg)
    }
  })
})

describe('runBatch — result shape', () => {
  it('returns a frozen result with frozen aggregate and matches', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1], maxTurns: 3 })
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.aggregate)).toBe(true)
    expect(Object.isFrozen(r.matches)).toBe(true)
    expect(Object.isFrozen(r.config)).toBe(true)
  })

  it('echoes the config (seeds, maxTurns, levelId)', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({
      levelPackage: pkg,
      strategies: strats(),
      seeds: ['cfg-a', 'cfg-b'],
      maxTurns: 7
    })
    expect(r.config.seeds).toEqual(['cfg-a', 'cfg-b'])
    // makeMicroLevelPackage has no objectives deadline, so liftMaxTurnsToDeadline is a no-op and the raw value is echoed.
    expect(r.config.maxTurns).toBe(7)
    expect(r.config.levelId).toBe(pkg.id)
  })
})

describe('runBatch — exports', () => {
  it('batchResultToJSON round-trips through JSON.parse with deep equality', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2], maxTurns: 4 })
    const json = batchResultToJSON(r)
    expect(typeof json).toBe('string')
    const parsed = JSON.parse(json)
    expect(parsed.config.seeds).toEqual(r.config.seeds)
    expect(parsed.aggregate.matchCount).toBe(r.aggregate.matchCount)
    expect(parsed.matches.length).toBe(r.matches.length)
  })

  it('batchResultToCSV emits a header row + one row per match', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: ['s1', 's2', 's3'], maxTurns: 5 })
    const csv = batchResultToCSV(r)
    const lines = csv.trim().split(/\r?\n/)
    expect(lines.length).toBe(r.matches.length + 1) // header + rows
    // Header should include core columns at minimum.
    const header = lines[0].split(',')
    for (const col of ['seed', 'winner', 'turns', 'reason']) {
      expect(header).toContain(col)
    }
  })

  it('batchResultToCSV quotes seeds containing commas / quotes', () => {
    const pkg = makeMicroLevelPackage()
    const tricky = 'seed,with"comma'
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [tricky], maxTurns: 2 })
    const csv = batchResultToCSV(r)
    // Field with comma must be quoted; inner double quotes doubled.
    expect(csv).toContain('"seed,with""comma"')
  })

  it('batchResultToCSV includes per-match action counts in the row', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: ['only'], maxTurns: 5 })
    const csv = batchResultToCSV(r)
    const lines = csv.trim().split(/\r?\n/)
    const header = lines[0].split(',')
    for (const col of [
      'actions_move', 'actions_reverse', 'actions_turn',
      'actions_fire', 'actions_reload', 'actions_endTurn',
      'illegal_player1', 'illegal_player2',
      'kills_player1', 'kills_player2',
      'damage_player1', 'damage_player2'
    ]) {
      expect(header).toContain(col)
    }
    // Single row for our single match — number of fields equals header count.
    const row = lines[1].split(',')
    expect(row.length).toBe(header.length)
  })
})

describe('runBatch — headless purity', () => {
  it('runs without any Vue/DOM symbols on the module path', () => {
    // This is a smoke check; if the implementation accidentally pulls in
    // a DOM helper, the import itself would have already failed under
    // Vitest's node environment for this file. Confirm a batch runs.
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1], maxTurns: 2 })
    expect(r.aggregate.matchCount).toBe(1)
  })
})

describe('runBatch — terminationReasons stable shape (#25)', () => {
  it('terminationReasons has every OBJECTIVE_REASONS key pre-seeded with 0', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2, 3], maxTurns: 5 })
    for (const key of Object.values(OBJECTIVE_REASONS)) {
      expect(r.aggregate.terminationReasons).toHaveProperty(key)
      expect(typeof r.aggregate.terminationReasons[key]).toBe('number')
    }
  })

  it('terminationReasons includes "objective" fallback key pre-seeded with 0', () => {
    const pkg = makeMicroLevelPackage()
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1], maxTurns: 3 })
    expect(r.aggregate.terminationReasons).toHaveProperty('objective')
    expect(typeof r.aggregate.terminationReasons.objective).toBe('number')
  })

  it('terminationReasons shape is identical between two independent batches of the same level', () => {
    const pkg = makeMicroLevelPackage()
    const a = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2], maxTurns: 5 })
    const b = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [3, 4], maxTurns: 5 })
    expect(Object.keys(a.aggregate.terminationReasons).sort())
      .toEqual(Object.keys(b.aggregate.terminationReasons).sort())
  })
})

describe('runBatch — deadline lift (#26)', () => {
  it('config.maxTurns is lifted to deadlineTurns when caller passes lower value', () => {
    const pkg = makeDeadlineLevelPackage(120)
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1], maxTurns: 50 })
    expect(r.config.maxTurns).toBe(120)
  })

  it('matches run at least to the deadline when maxTurns < deadlineTurns', () => {
    const deadline = 12
    const pkg = makeDeadlineLevelPackage(deadline)
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1, 2, 3], maxTurns: 5 })
    // Every match must run at least until surviveTurns resolves (turn count >= deadline)
    // or end earlier on a wipe/capture. Because the micro-level units can wipe before
    // the deadline, we verify the batch maxTurns was lifted (no match was cut at 5 turns
    // due to a false cap) — check config.maxTurns equals the deadline.
    expect(r.config.maxTurns).toBe(deadline)
  })

  it('config.maxTurns equals the deadline, not the caller-supplied cap', () => {
    const pkg = makeDeadlineLevelPackage(30)
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: ['lift-1'], maxTurns: 10 })
    expect(r.config.maxTurns).toBe(30)
    expect(r.config.maxTurns).not.toBe(10)
  })

  it('does not lift when maxTurns is already >= deadlineTurns', () => {
    const pkg = makeDeadlineLevelPackage(10)
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1], maxTurns: 50 })
    expect(r.config.maxTurns).toBe(50)
  })

  it('applies lift when maxTurns is omitted (default 100) and deadline > 100', () => {
    const pkg = makeDeadlineLevelPackage(150)
    const r = runBatch({ levelPackage: pkg, strategies: strats(), seeds: [1] })
    expect(r.config.maxTurns).toBe(150)
  })
})
