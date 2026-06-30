import { describe, it, expect } from 'vitest'
import { hexFacingToward, hexFacingTowardNearest, hexDistanceOffset, hexNeighbor } from '@/domain/engine/hexUtils.js'

describe('hexFacingToward', () => {
  it('picks neighbor that minimizes distance to target', () => {
    const from = { q: 2, r: 2 }
    const to = { q: 2, r: 0 }
    const f = hexFacingToward(from, to)
    const step = hexNeighbor(from, f)
    const dStep = hexDistanceOffset(step, to)
    for (let d = 0; d < 6; d++) {
      const alt = hexNeighbor(from, d)
      expect(hexDistanceOffset(alt, to)).toBeGreaterThanOrEqual(dStep)
    }
  })

  it('uses offset-grid distance when choosing a facing direction', () => {
    expect(hexFacingToward({ q: 0, r: 0 }, { q: 1, r: 2 })).toBe(2)
  })
})

describe('hexFacingTowardNearest', () => {
  it('uses closest candidate hex then faces toward it', () => {
    const from = { q: 1, r: 0 }
    const candidates = [
      { q: 1, r: 7 },
      { q: 3, r: 7 }
    ]
    const f = hexFacingTowardNearest(from, candidates)
    const toward = { q: 1, r: 7 }
    const step = hexNeighbor(from, f)
    const dStep = hexDistanceOffset(step, toward)
    for (let d = 0; d < 6; d++) {
      const alt = hexNeighbor(from, d)
      expect(hexDistanceOffset(alt, toward)).toBeGreaterThanOrEqual(dStep)
    }
  })

  it('returns 0 for empty candidates', () => {
    expect(hexFacingTowardNearest({ q: 0, r: 0 }, [])).toBe(0)
  })
})
