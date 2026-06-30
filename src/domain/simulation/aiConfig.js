/**
 * AI numeric tuning, kept separate from level data.
 *
 * The turntable (level builder) owns action-type priority; the doctrine code
 * owns behaviour. This module holds only the *numbers* a doctrine uses:
 * - orientationBias: 0 = orient toward the home pole, 1 = toward the enemy pole.
 * - driftWindowFraction: fraction of the horizon over which idle turns push the
 *   effective bias toward the enemy (anti-stall).
 * - targetValuation: tie-break weights for choosing a fire target.
 *
 * @module domain/simulation/aiConfig
 */

const SHARED_VALUATION = Object.freeze({ kill: 1000, damage: 1, danger: 0.5 })

// driftWindowFraction: idle turns relative to the horizon over which a doctrine's
// orientation drifts fully to the enemy. Tuned at 0.15 against real level_000:
// at 0.5 defensive mirrors never finished (held too long); 0.15 lets every
// doctrine commit early enough to resolve matches by elimination within the cap.
export const DOCTRINE_DEFAULTS = Object.freeze({
  aggressive: Object.freeze({
    orientationBias: 1.0,
    driftWindowFraction: 0.15,
    targetValuation: SHARED_VALUATION
  }),
  balanced: Object.freeze({
    orientationBias: 0.5,
    driftWindowFraction: 0.15,
    targetValuation: SHARED_VALUATION
  }),
  defensive: Object.freeze({
    orientationBias: 0.1,
    driftWindowFraction: 0.15,
    targetValuation: SHARED_VALUATION
  })
})

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function resolveDoctrineConfig(profile, override = null) {
  const base = DOCTRINE_DEFAULTS[profile] || DOCTRINE_DEFAULTS.balanced
  const ov = override && typeof override === 'object' ? override : {}
  const ovValuation = ov.targetValuation && typeof ov.targetValuation === 'object' ? ov.targetValuation : {}
  return {
    orientationBias: num(ov.orientationBias, base.orientationBias),
    driftWindowFraction: num(ov.driftWindowFraction, base.driftWindowFraction),
    targetValuation: { ...base.targetValuation, ...ovValuation }
  }
}
