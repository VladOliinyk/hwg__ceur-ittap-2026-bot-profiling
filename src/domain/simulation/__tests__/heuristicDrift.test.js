import { describe, expect, it } from 'vitest'
import {
  computeEffectiveBias,
  lerpRound,
  UNBOUNDED_DRIFT_HORIZON
} from '../strategies/heuristicStrategy.js'

describe('computeEffectiveBias', () => {
  it('returns the base bias when the horizon is non-positive (drift disabled)', () => {
    expect(computeEffectiveBias(0.5, 999, 0, 0.5)).toBe(0.5)
    expect(computeEffectiveBias(0.5, 999, -10, 0.5)).toBe(0.5)
  })

  it('drifts over an absolute idle window when the horizon is unbounded', () => {
    // No finite turn cap (e.g. the Playground "auto-play turn" feature) must
    // still anti-stall: drift falls back to an absolute window of
    // UNBOUNDED_DRIFT_HORIZON * frac idle player-turns instead of freezing at
    // the base bias forever.
    const frac = 0.15
    const window = UNBOUNDED_DRIFT_HORIZON * frac
    expect(computeEffectiveBias(0.5, 0, Infinity, frac)).toBe(0.5)
    const early = computeEffectiveBias(0.5, 3, Infinity, frac)
    const later = computeEffectiveBias(0.5, 10, Infinity, frac)
    expect(early).toBeGreaterThan(0.5)
    expect(later).toBeGreaterThan(early)
    expect(computeEffectiveBias(0.5, window, Infinity, frac)).toBe(1)
    expect(computeEffectiveBias(0.5, window * 4, Infinity, frac)).toBe(1)
  })

  it('is the base bias at zero idle', () => {
    expect(computeEffectiveBias(0.1, 0, 100, 0.5)).toBe(0.1)
  })

  it('increases monotonically with idle turns and reaches 1 by the window end', () => {
    const a = computeEffectiveBias(0.1, 10, 100, 0.5)
    const b = computeEffectiveBias(0.1, 25, 100, 0.5)
    const c = computeEffectiveBias(0.1, 50, 100, 0.5) // idle == window (0.5*100)
    expect(b).toBeGreaterThan(a)
    expect(c).toBe(1)
  })

  it('clamps to [0,1]', () => {
    expect(computeEffectiveBias(0.1, 9999, 100, 0.5)).toBe(1)
    expect(computeEffectiveBias(2, 0, 100, 0.5)).toBe(1)
    expect(computeEffectiveBias(-1, 0, 100, 0.5)).toBe(0)
  })
})

describe('lerpRound', () => {
  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpRound({ q: 0, r: 0 }, { q: 4, r: 2 }, 0)).toEqual({ q: 0, r: 0 })
    expect(lerpRound({ q: 0, r: 0 }, { q: 4, r: 2 }, 1)).toEqual({ q: 4, r: 2 })
  })

  it('rounds the interpolated midpoint', () => {
    expect(lerpRound({ q: 0, r: 0 }, { q: 4, r: 0 }, 0.5)).toEqual({ q: 2, r: 0 })
    expect(lerpRound({ q: 0, r: 0 }, { q: 3, r: 0 }, 0.1)).toEqual({ q: 0, r: 0 })
  })
})
