import { describe, expect, it } from 'vitest'
import { DOCTRINE_DEFAULTS, resolveDoctrineConfig } from '../aiConfig.js'

describe('aiConfig', () => {
  it('exposes three doctrine defaults ordered by aggression', () => {
    expect(DOCTRINE_DEFAULTS.aggressive.orientationBias).toBe(1.0)
    expect(DOCTRINE_DEFAULTS.balanced.orientationBias).toBe(0.5)
    expect(DOCTRINE_DEFAULTS.defensive.orientationBias).toBe(0.1)
  })

  it('falls back to balanced for an unknown profile', () => {
    const cfg = resolveDoctrineConfig('nope')
    expect(cfg.orientationBias).toBe(0.5)
    expect(cfg.targetValuation.kill).toBeGreaterThan(cfg.targetValuation.damage)
  })

  it('merges an override onto the profile default without mutating defaults', () => {
    const cfg = resolveDoctrineConfig('defensive', {
      orientationBias: 0.4,
      targetValuation: { danger: 9 }
    })
    expect(cfg.orientationBias).toBe(0.4)
    expect(cfg.driftWindowFraction).toBe(DOCTRINE_DEFAULTS.defensive.driftWindowFraction)
    expect(cfg.targetValuation.danger).toBe(9)
    expect(cfg.targetValuation.kill).toBe(DOCTRINE_DEFAULTS.defensive.targetValuation.kill)
    expect(DOCTRINE_DEFAULTS.defensive.orientationBias).toBe(0.1)
  })

  it('ignores non-finite override numbers', () => {
    const cfg = resolveDoctrineConfig('aggressive', { orientationBias: 'x', driftWindowFraction: null })
    expect(cfg.orientationBias).toBe(1.0)
    expect(cfg.driftWindowFraction).toBe(0.15)
  })
})
