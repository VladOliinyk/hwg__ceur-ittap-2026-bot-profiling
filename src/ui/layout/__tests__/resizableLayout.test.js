import { describe, it, expect } from 'vitest'
import {
  defaultLayoutRatios,
  normalizeLayoutRatios,
  ratiosMatchDefaults,
  buildLayoutTracksFromRatios,
  layoutRatiosFromTracks,
  resizeLayoutTrackPair
} from '../resizableLayout.js'

const TWO_COL = Object.freeze({
  board: Object.freeze({ min: 520, max: 1080, defaultRatio: 0.62 }),
  inspector: Object.freeze({ min: 300, max: 560, defaultRatio: 0.38 })
})

describe('resizableLayout pure helpers', () => {
  it('normalizes ratios to sum to 1', () => {
    const ratios = normalizeLayoutRatios({ board: 6, inspector: 4 }, TWO_COL)
    expect(ratios.board + ratios.inspector).toBeCloseTo(1, 6)
    expect(ratios.board).toBeCloseTo(0.6, 6)
  })

  it('falls back to defaults when ratios are invalid', () => {
    const ratios = normalizeLayoutRatios({ board: 0, inspector: -1 }, TWO_COL)
    expect(ratios).toEqual(defaultLayoutRatios(TWO_COL))
  })

  it('builds tracks that fit available width and respect min/max', () => {
    const tracks = buildLayoutTracksFromRatios(
      defaultLayoutRatios(TWO_COL),
      900,
      TWO_COL
    )
    expect(tracks.board + tracks.inspector).toBeCloseTo(900, 1)
    expect(tracks.board).toBeGreaterThanOrEqual(520)
    expect(tracks.inspector).toBeGreaterThanOrEqual(300)
    expect(tracks.inspector).toBeLessThanOrEqual(560)
  })

  it('resizeLayoutTrackPair clamps the moved boundary to min/max', () => {
    const splitter = { before: 'board', after: 'inspector' }
    const start = { board: 600, inspector: 300 }
    const grown = resizeLayoutTrackPair(start, splitter, 500, TWO_COL)
    expect(grown.inspector).toBe(300)
    expect(grown.board).toBe(600)
    const shrunk = resizeLayoutTrackPair(start, splitter, -500, TWO_COL)
    expect(shrunk.board).toBe(520)
    expect(shrunk.inspector).toBe(380)
  })

  it('ratiosMatchDefaults detects custom vs default within epsilon', () => {
    expect(ratiosMatchDefaults(defaultLayoutRatios(TWO_COL), TWO_COL)).toBe(true)
    expect(ratiosMatchDefaults({ board: 0.9, inspector: 0.1 }, TWO_COL)).toBe(false)
  })

  it('layoutRatiosFromTracks computes proportions', () => {
    const ratios = layoutRatiosFromTracks({ board: 600, inspector: 400 }, TWO_COL)
    expect(ratios.board).toBeCloseTo(0.6, 6)
    expect(ratios.inspector).toBeCloseTo(0.4, 6)
  })
})
