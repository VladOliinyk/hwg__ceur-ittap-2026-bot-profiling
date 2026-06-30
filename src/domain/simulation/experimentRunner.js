/**
 * Experiment runner for the behavioral-profile method (research harness).
 *
 * Runs deterministic batches of `runMatch`, collecting an `onFrame` trace per
 * match, and reduces each to a behavioral profile (aMove/aAll, consistency c,
 * run-lengths) for the bot side via experimentMetrics. Strategies are stateless
 * across matches (heuristicStrategy resolves its doctrine once and reads turn
 * state from the game, not a closure), so a scheme's strategy is built once and
 * reused across all seeds — matching runBatch's contract.
 *
 * A "scheme" is `{ kind:'doctrine', profile, orientationBias? }` (orientationBias
 * overrides the doctrine default on the 0..1 continuum, for the E2 sweep) or
 * `{ kind:'random' }` (the chaotic baseline).
 *
 * @module domain/simulation/experimentRunner
 */

import { runMatch } from './runMatch.js'
import { liftMaxTurnsToDeadline } from './runConfiguredMatch.js'
import { createStrategyFromConfig } from './strategyProfiles.js'
import { randomStrategy } from './strategies/randomStrategy.js'
import { cautiousStrategy, mixStrategy } from './experimentStrategies.js'
import {
  extractCodedSequence,
  aggressiveness,
  consistency,
  runLengths,
  meanCI
} from './experimentMetrics.js'

export function buildStrategy(scheme, { playerId, maxTurns = null } = {}) {
  const kind = scheme && scheme.kind
  if (kind === 'random') return randomStrategy()
  if (kind === 'cautious') return cautiousStrategy()
  if (kind === 'mix') return mixStrategy(scheme.beta, { profile: scheme.profile || 'aggressive', maxTurns })
  const profile = (scheme && scheme.profile) || 'balanced'
  const configOverride = scheme && Number.isFinite(scheme.orientationBias)
    ? { orientationBias: scheme.orientationBias }
    : (scheme && scheme.config) || null
  return createStrategyFromConfig({ profile }, { playerId, maxTurns, configOverride })
}

/** Run one match and reduce the bot side's command stream to a profile row. */
export function runMatchProfile({ levelPackage, botPlayer = 'player1', strategies, seed, maxTurns }) {
  const frames = []
  const result = runMatch({
    levelPackage,
    strategies,
    seed,
    maxTurns,
    onFrame: f => { frames.push(f) }
  })
  const coded = extractCodedSequence(frames, botPlayer)
  const ad = coded.filter(c => c.code === 'A' || c.code === 'D').map(c => c.code)
  const agg = aggressiveness(coded)
  const cons = consistency(ad)
  const runs = runLengths(ad)
  return {
    seed: result.seed,
    winner: result.winner,
    turns: result.turns,
    reason: result.reason,
    commandCount: coded.length,
    adCount: ad.length,
    A: agg.A,
    D: agg.D,
    neutral: agg.neutral,
    fires: agg.fires,
    towardMoves: agg.towardMoves,
    awayMoves: agg.awayMoves,
    aMove: agg.aMove,
    aAll: agg.aAll,
    c: cons.c,
    switchRate: cons.switchRate,
    pA: cons.p,
    maxRun: runs.maxRun,
    fractionInRunsGTE3: runs.fractionInRunsGTE3
  }
}

/**
 * Run a deterministic batch of one bot scheme vs one fixed opponent scheme.
 * @returns {{config:object, matches:object[], summary:object}}
 */
export function runProfileBatch({
  levelPackage,
  botPlayer = 'player1',
  botScheme,
  opponentScheme,
  seeds,
  maxTurns
}) {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new Error('runProfileBatch: seeds must be a non-empty array')
  }
  const effMax = liftMaxTurnsToDeadline(maxTurns, levelPackage)
  const opponentPlayer = botPlayer === 'player1' ? 'player2' : 'player1'
  const strategies = {
    [botPlayer]: buildStrategy(botScheme, { playerId: botPlayer, maxTurns: effMax }),
    [opponentPlayer]: buildStrategy(opponentScheme, { playerId: opponentPlayer, maxTurns: effMax })
  }
  const matches = seeds.map(seed =>
    runMatchProfile({ levelPackage, botPlayer, strategies, seed, maxTurns: effMax })
  )
  const botWins = matches.filter(m => m.winner === botPlayer).length
  return {
    config: {
      levelId: levelPackage.id,
      botPlayer,
      botScheme,
      opponentScheme,
      seeds: seeds.length,
      maxTurns: effMax
    },
    matches,
    summary: {
      matchCount: matches.length,
      botWinRate: botWins / matches.length,
      aMove: meanCI(matches.map(m => m.aMove)),
      aAll: meanCI(matches.map(m => m.aAll)),
      c: meanCI(matches.map(m => m.c)),
      fractionInRunsGTE3: meanCI(matches.map(m => m.fractionInRunsGTE3)),
      avgTurns: meanCI(matches.map(m => m.turns)).mean,
      avgCommands: meanCI(matches.map(m => m.commandCount)).mean
    }
  }
}
