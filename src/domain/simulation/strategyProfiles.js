import {
  createHeuristicStrategy,
  HEURISTIC_PROFILES
} from './strategies/heuristicStrategy.js'
import { cautiousStrategy } from './experimentStrategies.js'
import { randomStrategy } from './strategies/randomStrategy.js'

export const STRATEGY_PROFILES = Object.freeze({
  DEFENSIVE: HEURISTIC_PROFILES.DEFENSIVE,
  BALANCED: HEURISTIC_PROFILES.BALANCED,
  AGGRESSIVE: HEURISTIC_PROFILES.AGGRESSIVE,
  CAUTIOUS: 'cautious',
  RANDOM: 'random'
})

const PROFILE_VALUES = Object.freeze(Object.values(STRATEGY_PROFILES))

export function normalizeStrategyConfig(config = {}) {
  const profile = config && typeof config.profile === 'string'
    ? config.profile
    : STRATEGY_PROFILES.BALANCED
  if (!PROFILE_VALUES.includes(profile)) {
    throw new Error(`Unknown strategy profile "${profile}"`)
  }
  return { profile }
}

export function createStrategyFromConfig(config, { playerId, maxTurns = null, configOverride = null } = {}) {
  const normalized = normalizeStrategyConfig(config)
  if (normalized.profile === STRATEGY_PROFILES.CAUTIOUS) return cautiousStrategy()
  if (normalized.profile === STRATEGY_PROFILES.RANDOM) return randomStrategy()
  return createHeuristicStrategy({
    playerId,
    profile: normalized.profile,
    maxTurns,
    config: configOverride
  })
}

