import { describe, expect, it } from 'vitest'
import { createRng, rollD6 } from '../rng.js'

function take(rng, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(rng.next())
  return out
}

describe('createRng — determinism', () => {
  it('same seed (number) produces identical streams', () => {
    const a = take(createRng(42), 10)
    const b = take(createRng(42), 10)
    expect(a).toEqual(b)
  })

  it('same seed (string) produces identical streams', () => {
    const a = take(createRng('level_000-smoke'), 10)
    const b = take(createRng('level_000-smoke'), 10)
    expect(a).toEqual(b)
  })

  it('different seeds produce different streams', () => {
    const a = take(createRng('seed-a'), 10)
    const b = take(createRng('seed-b'), 10)
    expect(a).not.toEqual(b)
  })

  it('next() outputs values in [0, 1)', () => {
    const rng = createRng(1)
    for (let i = 0; i < 100; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('createRng — integer helpers', () => {
  it('nextInt(n) returns integer in [0, n)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(6)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
  })

  it('nextInt rejects non-positive/non-finite bounds', () => {
    const rng = createRng(7)
    expect(() => rng.nextInt(0)).toThrow()
    expect(() => rng.nextInt(-1)).toThrow()
    expect(() => rng.nextInt(NaN)).toThrow()
  })

  it('nextIntInRange returns integer in [min, max)', () => {
    const rng = createRng('range')
    for (let i = 0; i < 200; i++) {
      const v = rng.nextIntInRange(5, 9)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThan(9)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('nextIntInRange rejects empty/inverted ranges', () => {
    const rng = createRng('range')
    expect(() => rng.nextIntInRange(5, 5)).toThrow()
    expect(() => rng.nextIntInRange(9, 5)).toThrow()
  })

  it('pickOne picks an element from the array', () => {
    const rng = createRng('pick')
    const items = ['a', 'b', 'c', 'd']
    for (let i = 0; i < 30; i++) {
      expect(items).toContain(rng.pickOne(items))
    }
  })

  it('pickOne rejects empty array', () => {
    const rng = createRng('pick')
    expect(() => rng.pickOne([])).toThrow()
    expect(() => rng.pickOne(null)).toThrow()
  })

  it('shuffle is a permutation of the original elements', () => {
    const rng = createRng('shuffle')
    const a = ['x', 'y', 'z', 'w']
    const shuffled = rng.shuffle([...a])
    expect(shuffled.sort()).toEqual([...a].sort())
  })

  it('shuffle is deterministic for the same seed', () => {
    const a = createRng('shuffle').shuffle([1, 2, 3, 4, 5])
    const b = createRng('shuffle').shuffle([1, 2, 3, 4, 5])
    expect(a).toEqual(b)
  })
})

describe('createRng — fork', () => {
  it('fork(label) produces a deterministic but distinct stream', () => {
    const parent = createRng('parent')
    const childA = parent.fork('a')
    const childB = parent.fork('a')
    // Forking the same parent twice with the same label after the same
    // amount of parent consumption yields the same child stream.
    expect(take(childA, 5)).toEqual(take(childB, 5))
  })

  it('fork advances independently from parent stream', () => {
    const parent = createRng('parent')
    const child = parent.fork('child')
    const childSeq = take(child, 5)
    // Parent stream is unaffected by child consumption — its first 5
    // outputs must match a fresh parent's first 5 outputs.
    expect(take(parent, 5)).toEqual(take(createRng('parent'), 5))
    // And child stream differs from parent stream.
    expect(childSeq).not.toEqual(take(createRng('parent'), 5))
  })

  it('different fork labels produce different streams', () => {
    const parent = createRng('parent')
    const a = parent.fork('alpha')
    const b = createRng('parent').fork('beta')
    expect(take(a, 5)).not.toEqual(take(b, 5))
  })
})

describe('createRng — state restoration', () => {
  it('createRng({ state }) resumes the stream exactly from a previous stateSnapshot', () => {
    const original = createRng('resume-seed')
    for (let i = 0; i < 7; i++) original.next()
    const snapshot = original.stateSnapshot()
    const expected = take(original, 5)

    const resumed = createRng({ state: snapshot })
    const actual = take(resumed, 5)

    expect(actual).toEqual(expected)
  })

  it('stateSnapshot() advances after each next()', () => {
    const rng = createRng('snap-advance')
    const s1 = rng.stateSnapshot()
    rng.next()
    const s2 = rng.stateSnapshot()
    rng.next()
    const s3 = rng.stateSnapshot()
    expect(s2).not.toBe(s1)
    expect(s3).not.toBe(s2)
  })

  it('createRng({ state: 0 }) bypasses zero-state guard and preserves zero state', () => {
    // The stream legitimately passes through state=0 mid-flight; restoring
    // from it must not silently swap in the construction-time non-zero
    // fallback or the post-restore stream would diverge.
    const a = createRng({ state: 0 })
    const b = createRng({ state: 0 })
    expect(a.next()).toBe(b.next())
    // And a fresh-seeded RNG must not collide with the resumed one.
    const fresh = createRng(0)
    expect(a.next()).not.toBe(fresh.next())
  })

  it('createRng({ state }) ignores zero-state guard regardless of seed truthiness', () => {
    // Non-zero state value must be used verbatim (uint32 truncated).
    const a = createRng({ state: 0x12345678 })
    const b = createRng({ state: 0x12345678 })
    expect(take(a, 4)).toEqual(take(b, 4))
  })
})

describe('rollD6', () => {
  it('returns integer in [1, 6]', () => {
    const rng = createRng('dice')
    for (let i = 0; i < 600; i++) {
      const face = rollD6(rng)
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(6)
      expect(Number.isInteger(face)).toBe(true)
    }
  })

  it('is deterministic for a fixed seed', () => {
    const a = []
    const b = []
    const r1 = createRng('roll')
    const r2 = createRng('roll')
    for (let i = 0; i < 20; i++) {
      a.push(rollD6(r1))
      b.push(rollD6(r2))
    }
    expect(a).toEqual(b)
  })
})
