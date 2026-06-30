import { describe, it, expect } from 'vitest'
import { clampTargetIndex } from '../combat.js'

describe('clampTargetIndex', () => {
  it('при len ≤ 0 повертає 0', () => {
    expect(clampTargetIndex(5, 0)).toBe(0)
    expect(clampTargetIndex(0, -1)).toBe(0)
  })

  it('клампить у [0, len−1]', () => {
    expect(clampTargetIndex(0, 3)).toBe(0)
    expect(clampTargetIndex(2, 3)).toBe(2)
    expect(clampTargetIndex(-1, 3)).toBe(0)
    expect(clampTargetIndex(99, 3)).toBe(2)
    expect(clampTargetIndex(1.9, 3)).toBe(1)
  })

  it('NaN / нечисло → 0', () => {
    expect(clampTargetIndex(NaN, 3)).toBe(0)
    expect(clampTargetIndex(undefined, 3)).toBe(0)
  })
})
