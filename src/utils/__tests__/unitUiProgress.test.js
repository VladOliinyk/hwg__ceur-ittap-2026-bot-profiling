import { describe, expect, it } from 'vitest'
import { computeProgressSegments } from '../unitUiProgress'

describe('unitUiProgress', () => {
  it('caps visual segments but preserves exact normalized totals', () => {
    const stats = computeProgressSegments(1000, 375, 16)
    expect(stats.normalizedMovement).toBe(1000)
    expect(stats.normalizedActions).toBe(375)
    expect(stats.segmentCount).toBe(16)
    expect(stats.filledCount).toBe(6)
  })

  it('handles invalid and negative values safely', () => {
    expect(computeProgressSegments(-5, 10, 16)).toEqual({
      normalizedMovement: 0,
      normalizedActions: 0,
      segmentCount: 0,
      filledCount: 0
    })

    expect(computeProgressSegments(4, NaN, 16)).toEqual({
      normalizedMovement: 4,
      normalizedActions: 0,
      segmentCount: 4,
      filledCount: 0
    })
  })
})
