/**
 * Headless batch runner — seed-sweep over `runMatch` with aggregate metrics.
 *
 * `runBatch({ levelPackage, strategies, seeds, maxTurns })` executes one
 * `runMatch` per seed (in order), then folds the per-match metrics into a
 * single `BatchAggregate` so a research workflow can answer balance
 * questions ("win rate of player1 over 1000 seeds", "average turns to
 * wipe", "illegal-attempt rate of strategy X") without re-running.
 *
 * The runner is pure-domain: no Vue, no DOM, no `Math.random()`. Every
 * match's RNG is created fresh from its seed inside `runMatch`, so the
 * `BatchResult` for `(levelPackage, strategies, seeds, maxTurns)` is
 * deterministic — the JSON export is byte-identical across re-runs and
 * across machines.
 *
 * @example
 *   const result = runBatch({
 *     levelPackage: pkg,
 *     strategies: { player1: randomStrategy(), player2: randomStrategy() },
 *     seeds: ['sweep-001', 'sweep-002', 'sweep-003'],
 *     maxTurns: 100
 *   })
 *   fs.writeFileSync('out.json', batchResultToJSON(result))
 *   fs.writeFileSync('out.csv',  batchResultToCSV(result))
 *
 * @module domain/simulation/runBatch
 */

import { runMatch } from './runMatch.js'
import { liftMaxTurnsToDeadline } from './runConfiguredMatch.js'
import { OBJECTIVE_REASONS } from '../objectives/objectives.js'

const ACTION_COLUMNS = ['move', 'reverse', 'turn', 'fire', 'reload', 'endTurn']
// Seed terminationReasons with every reason the engine can emit so the shape
// is stable across batches regardless of which reasons happen to fire.
// Object.values(OBJECTIVE_REASONS) covers all canonical reasons; 'objective'
// is the runMatch fallback used when an outcome carries no reason string.
const REASON_KEYS = [...Object.values(OBJECTIVE_REASONS), 'objective']

function zeroActions() {
  const o = {}
  for (const k of ACTION_COLUMNS) o[k] = 0
  return o
}

function zeroReasons() {
  const o = {}
  for (const k of REASON_KEYS) o[k] = 0
  return o
}

function zeroPlayers() {
  return { player1: 0, player2: 0 }
}

/**
 * Run a deterministic batch of matches over a seed list.
 *
 * @param {{
 *   levelPackage: object,
 *   strategies: { player1: Function, player2: Function },
 *   seeds: Array<number|string>,
 *   maxTurns?: number
 * }} input
 * @returns {{
 *   config: { seeds: Array<number|string>, maxTurns: number|undefined, levelId: string|undefined },
 *   matches: Array<{ seed: number|string, winner: string, turns: number, reason: string, metrics: object }>,
 *   aggregate: object
 * }}
 */
export function runBatch(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runBatch: input is required')
  }
  const { levelPackage, strategies, seeds, maxTurns } = input
  if (!levelPackage || typeof levelPackage !== 'object') {
    throw new Error('runBatch: levelPackage is required')
  }
  if (!strategies || typeof strategies !== 'object') {
    throw new Error('runBatch: strategies is required')
  }
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new Error('runBatch: seeds must be a non-empty array')
  }

  // Freeze the input seed list before storing it on the result config so a
  // later mutation of the caller's array cannot retroactively change what
  // the batch claims to have run on.
  const seedsCopy = Object.freeze(seeds.slice())

  // Lift maxTurns to the level's primary objective deadline so batch runs are
  // consistent with runConfiguredMatch: a level with deadlineTurns 120 and a
  // caller-supplied maxTurns of 50 would otherwise cut every match short
  // before the objective can resolve.
  const effectiveMaxTurns = liftMaxTurnsToDeadline(maxTurns, levelPackage)

  const matches = []
  const totalActionsByType = zeroActions()
  const totalIllegalAttempts = zeroPlayers()
  const totalKills = zeroPlayers()
  const totalDamage = zeroPlayers()
  const totalInitialUnits = zeroPlayers()
  const totalFinalUnits = zeroPlayers()
  const terminationReasons = zeroReasons()
  const winnerCounts = { player1: 0, player2: 0, draw: 0 }
  let totalTurns = 0

  for (const seed of seedsCopy) {
    const result = runMatch({ levelPackage, strategies, seed, maxTurns: effectiveMaxTurns })

    matches.push(Object.freeze({
      seed: result.seed,
      winner: result.winner,
      turns: result.turns,
      reason: result.reason,
      // Per-match `metrics` is already frozen by `metrics.finalize()`.
      metrics: result.metrics
    }))

    totalTurns += result.turns
    if (winnerCounts[result.winner] != null) winnerCounts[result.winner] += 1
    if (terminationReasons[result.reason] == null) terminationReasons[result.reason] = 0
    terminationReasons[result.reason] += 1

    const m = result.metrics
    for (const k of ACTION_COLUMNS) totalActionsByType[k] += m.actionsByType[k] || 0
    for (const p of ['player1', 'player2']) {
      totalIllegalAttempts[p] += m.illegalAttemptsByPlayer[p] || 0
      totalKills[p] += m.killsByPlayer[p] || 0
      totalDamage[p] += m.damageByPlayer[p] || 0
      totalInitialUnits[p] += m.initialUnitCount[p] || 0
      totalFinalUnits[p] += m.finalUnitCount[p] || 0
    }
  }

  const matchCount = matches.length
  const avgTurns = totalTurns / matchCount
  const avgActionsByType = zeroActions()
  for (const k of ACTION_COLUMNS) avgActionsByType[k] = totalActionsByType[k] / matchCount

  const winRates = Object.freeze({
    player1: winnerCounts.player1 / matchCount,
    player2: winnerCounts.player2 / matchCount,
    draw: winnerCounts.draw / matchCount
  })

  const aggregate = Object.freeze({
    matchCount,
    winRates,
    winnerCounts: Object.freeze({ ...winnerCounts }),
    avgTurns,
    totalTurns,
    terminationReasons: Object.freeze({ ...terminationReasons }),
    totalActionsByType: Object.freeze({ ...totalActionsByType }),
    avgActionsByType: Object.freeze({ ...avgActionsByType }),
    totalIllegalAttempts: Object.freeze({ ...totalIllegalAttempts }),
    totalKills: Object.freeze({ ...totalKills }),
    totalDamage: Object.freeze({ ...totalDamage }),
    avgInitialUnitCount: Object.freeze({
      player1: totalInitialUnits.player1 / matchCount,
      player2: totalInitialUnits.player2 / matchCount
    }),
    avgFinalUnitCount: Object.freeze({
      player1: totalFinalUnits.player1 / matchCount,
      player2: totalFinalUnits.player2 / matchCount
    })
  })

  const config = Object.freeze({
    seeds: seedsCopy,
    maxTurns: effectiveMaxTurns,
    levelId: levelPackage.id
  })

  return Object.freeze({
    config,
    matches: Object.freeze(matches),
    aggregate
  })
}

/**
 * Serialize a `BatchResult` to a stable JSON string.
 *
 * Key order is the insertion order of the runner output, which is itself
 * deterministic for a given input — so two runs of the same batch produce
 * a byte-identical JSON string.
 *
 * @param {object} batchResult
 * @returns {string}
 */
export function batchResultToJSON(batchResult) {
  return JSON.stringify(batchResult, null, 2)
}

function csvField(value) {
  if (value == null) return ''
  const s = String(value)
  // RFC 4180: quote if the field contains a comma, double quote, CR, or LF.
  // Inner double quotes are escaped by doubling.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Serialize a `BatchResult` to a CSV string: one header row + one row per match.
 *
 * Columns: `seed,winner,turns,reason,
 *           actions_move,actions_reverse,actions_turn,actions_fire,actions_reload,actions_endTurn,
 *           illegal_player1,illegal_player2,
 *           kills_player1,kills_player2,
 *           damage_player1,damage_player2,
 *           finalUnits_player1,finalUnits_player2`
 *
 * @param {object} batchResult
 * @returns {string}
 */
export function batchResultToCSV(batchResult) {
  const header = [
    'seed', 'winner', 'turns', 'reason',
    ...ACTION_COLUMNS.map(c => `actions_${c}`),
    'illegal_player1', 'illegal_player2',
    'kills_player1', 'kills_player2',
    'damage_player1', 'damage_player2',
    'finalUnits_player1', 'finalUnits_player2'
  ]
  const rows = [header.join(',')]
  for (const m of batchResult.matches) {
    const metrics = m.metrics
    const cells = [
      csvField(m.seed),
      csvField(m.winner),
      csvField(m.turns),
      csvField(m.reason),
      ...ACTION_COLUMNS.map(c => csvField(metrics.actionsByType[c])),
      csvField(metrics.illegalAttemptsByPlayer.player1),
      csvField(metrics.illegalAttemptsByPlayer.player2),
      csvField(metrics.killsByPlayer.player1),
      csvField(metrics.killsByPlayer.player2),
      csvField(metrics.damageByPlayer.player1),
      csvField(metrics.damageByPlayer.player2),
      csvField(metrics.finalUnitCount.player1),
      csvField(metrics.finalUnitCount.player2)
    ]
    rows.push(cells.join(','))
  }
  return rows.join('\n') + '\n'
}
