/**
 * Per-match metrics accumulator.
 *
 * `runMatch` calls `record()` after every applied command and at end-of-game
 * to capture initial/final unit counts. The frozen `finalize()` output is
 * the `metrics` field of the run result and is stable across versions for
 * dashboards and balance reports.
 *
 * @module domain/simulation/metrics
 */

import { ACTION_TYPES } from '../rules/actionTypes.js'

const PLAYERS = ['player1', 'player2']
const COMMAND_TYPES = [
  ACTION_TYPES.MOVE,
  ACTION_TYPES.REVERSE,
  ACTION_TYPES.TURN,
  ACTION_TYPES.FIRE,
  ACTION_TYPES.RELOAD,
  'endTurn'
]

function zeroByPlayer() {
  const o = {}
  for (const p of PLAYERS) o[p] = 0
  return o
}

function zeroActionsByType() {
  const o = {}
  for (const t of COMMAND_TYPES) o[t] = 0
  return o
}

function zeroActionsByTypePerPlayer() {
  const o = {}
  for (const p of PLAYERS) o[p] = zeroActionsByType()
  return o
}

/**
 * Create a fresh metrics collector.
 *
 * @returns {{
 *   record: (player: string, command: object, applyResult: object) => void,
 *   recordIllegal: (player: string, command: object) => void,
 *   captureInitialUnits: (gameState: object) => void,
 *   finalize: (gameState: object) => object
 * }}
 */
export function createMetrics() {
  const actionsByType = zeroActionsByType()
  const actionsByPlayerType = zeroActionsByTypePerPlayer()
  const damageByPlayer = zeroByPlayer()
  const killsByPlayer = zeroByPlayer()
  const illegalAttemptsByPlayer = zeroByPlayer()
  let initialUnitCount = null

  function record(player, command, applyResult) {
    if (!command || typeof command.type !== 'string') return
    const type = command.type
    if (!(type in actionsByType)) return
    actionsByType[type] += 1
    if (player && actionsByPlayerType[player]) {
      actionsByPlayerType[player][type] += 1
    }

    if (type === ACTION_TYPES.FIRE && applyResult && applyResult.ok === true) {
      const result = applyResult.result || {}
      const damage = Number(result.damage)
      // damage is the attacker's nominal attackPower per landed fire, INCLUDING
      // overkill (a 30-power shot at a 20 HP target records 30).
      if (Number.isFinite(damage) && damage > 0) {
        if (player && damageByPlayer[player] != null) {
          damageByPlayer[player] += damage
        }
      }
      if (result.killed === true && player && killsByPlayer[player] != null) {
        killsByPlayer[player] += 1
      }
    }
  }

  function recordIllegal(player /*, command */) {
    if (player && illegalAttemptsByPlayer[player] != null) {
      illegalAttemptsByPlayer[player] += 1
    }
  }

  function countLivingByPlayer(gameState) {
    const counts = zeroByPlayer()
    for (const unit of gameState.getAllUnits()) {
      if (!unit || !unit.isAlive || !unit.isAlive()) continue
      if (counts[unit.player] != null) counts[unit.player] += 1
    }
    return counts
  }

  function captureInitialUnits(gameState) {
    initialUnitCount = countLivingByPlayer(gameState)
  }

  function finalize(gameState) {
    const finalUnitCount = countLivingByPlayer(gameState)
    return Object.freeze({
      actionsByType: Object.freeze({ ...actionsByType }),
      actionsByPlayerType: Object.freeze({
        player1: Object.freeze({ ...actionsByPlayerType.player1 }),
        player2: Object.freeze({ ...actionsByPlayerType.player2 })
      }),
      damageByPlayer: Object.freeze({ ...damageByPlayer }),
      killsByPlayer: Object.freeze({ ...killsByPlayer }),
      illegalAttemptsByPlayer: Object.freeze({ ...illegalAttemptsByPlayer }),
      initialUnitCount: initialUnitCount
        ? Object.freeze({ ...initialUnitCount })
        : Object.freeze({ player1: 0, player2: 0 }),
      finalUnitCount: Object.freeze({ ...finalUnitCount })
    })
  }

  return { record, recordIllegal, captureInitialUnits, finalize }
}
