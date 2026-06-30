import { normalizeObjectives } from '../objectives/objectives.js'
import { runMatch } from './runMatch.js'
import { createStrategyFromConfig, normalizeStrategyConfig, STRATEGY_PROFILES } from './strategyProfiles.js'
import { createSimulationTrace } from './simulationTrace.js'

const DEFAULT_MAX_TURNS = 100

function normalizeMaxTurns(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TURNS
}

function primaryDeadline(levelPackage) {
  const objectives = normalizeObjectives(levelPackage && levelPackage.objectives, levelPackage)
  const deadline = objectives && objectives.primary && objectives.primary.deadlineTurns
  return Number.isInteger(deadline) && deadline > 0 ? deadline : null
}

/**
 * Lift `requestedMaxTurns` to the level's primary objective deadline so a
 * match cannot be cut short before the objective can resolve.
 *
 * If `requestedMaxTurns` is not a valid positive integer it is treated as
 * DEFAULT_MAX_TURNS (same normalisation `runMatch` applies to its own
 * `maxTurns` input), then lifted if the deadline exceeds it.
 *
 * @param {number|undefined} requestedMaxTurns
 * @param {object} levelPackage
 * @returns {number}
 */
export function liftMaxTurnsToDeadline(requestedMaxTurns, levelPackage) {
  const deadline = primaryDeadline(levelPackage)
  const normalized = normalizeMaxTurns(requestedMaxTurns)
  return deadline != null && normalized < deadline ? deadline : normalized
}

export function normalizeRunConfig(runConfig = {}, levelPackage = null) {
  const maxTurns = liftMaxTurnsToDeadline(runConfig.maxTurns, levelPackage)
  return {
    seed: runConfig.seed != null ? runConfig.seed : 'builder-playtest-001',
    maxTurns,
    players: {
      player1: normalizeStrategyConfig(runConfig.players && runConfig.players.player1
        ? runConfig.players.player1
        : { profile: STRATEGY_PROFILES.BALANCED }),
      player2: normalizeStrategyConfig(runConfig.players && runConfig.players.player2
        ? runConfig.players.player2
        : { profile: STRATEGY_PROFILES.BALANCED })
    },
    trace: runConfig.trace === true
  }
}

export function runConfiguredMatch({ levelPackage, runConfig = {}, trace = false } = {}) {
  if (!levelPackage || typeof levelPackage !== 'object') {
    throw new Error('runConfiguredMatch: levelPackage is required')
  }
  const normalizedRunConfig = normalizeRunConfig(runConfig, levelPackage)
  const frames = []
  const recordTrace = trace === true || normalizedRunConfig.trace === true
  const strategies = {
    player1: createStrategyFromConfig(normalizedRunConfig.players.player1, {
      playerId: 'player1',
      maxTurns: normalizedRunConfig.maxTurns
    }),
    player2: createStrategyFromConfig(normalizedRunConfig.players.player2, {
      playerId: 'player2',
      maxTurns: normalizedRunConfig.maxTurns
    })
  }

  const result = runMatch({
    levelPackage,
    strategies,
    seed: normalizedRunConfig.seed,
    maxTurns: normalizedRunConfig.maxTurns,
    onFrame: recordTrace ? frame => frames.push(frame) : null
  })

  const output = {
    result,
    runConfig: normalizedRunConfig
  }
  if (recordTrace) {
    output.trace = createSimulationTrace({
      levelPackage,
      runConfig: normalizedRunConfig,
      result,
      frames
    })
  }
  return output
}
