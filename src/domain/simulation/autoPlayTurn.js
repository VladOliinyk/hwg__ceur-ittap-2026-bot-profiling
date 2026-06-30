/**
 * Drive the active player's turn on a LIVE `GameState` with a doctrine
 * strategy — the "auto-play turn" engine behind the Playground feature.
 *
 * This reuses the exact same machinery the headless match runner uses:
 *   getObservation → listLegalCommands → strategy → applyCommand,
 * looping until the strategy yields `endTurn` (or the per-turn budget is
 * hit). Combat / movement / reachability rules are NOT re-implemented
 * here; every command comes from `listLegalCommands` and is applied via
 * `applyCommand`, identical to `runMatch`.
 *
 * Difference from `runMatch`: this operates on an externally-owned,
 * already-built `GameState` (the live Playground game) and STOPS right
 * before ending the turn. "End turn" stays a separate, explicit
 * human/UI action ("hard finish") — auto-play only spends the active
 * side's remaining unit actions for the current turn.
 *
 * It is still pure of Vue/DOM: state in (`gameState` + `strategy`),
 * a plain summary out. The caller is responsible for re-rendering and
 * for persisting/announcing the result.
 *
 * @module domain/simulation/autoPlayTurn
 */

import { getObservation } from './observation.js'
import { listLegalCommands } from './legalCommands.js'
import { applyCommand } from './applyCommand.js'
import { describeThrown, summarizeCommand } from './safeFormat.js'
import { PER_TURN_COMMAND_LIMIT } from './runMatch.js'

/**
 * Has the active player already committed a D6 this turn?
 * Mirrors `GameState.hasRolledDice()` but tolerates a partial/stub state.
 */
function hasRolledDice(gameState) {
  if (typeof gameState.hasRolledDice === 'function') {
    try {
      return gameState.hasRolledDice() === true
    } catch {
      return false
    }
  }
  return false
}

/**
 * Roll the current turn's D6 from the engine's own seeded RNG if it has
 * not been rolled yet. `listLegalCommands` requires a die face, so this
 * runs before the action loop. Returns the committed face, or `null` if
 * the engine refused (already rolled / game ended).
 */
function ensureDiceRolled(gameState) {
  if (hasRolledDice(gameState)) {
    return typeof gameState.getCurrentDiceResult === 'function'
      ? gameState.getCurrentDiceResult()
      : null
  }
  if (typeof gameState.rollDiceFromRng !== 'function') return null
  try {
    return gameState.rollDiceFromRng()
  } catch {
    return null
  }
}

/**
 * Auto-play the active player's remaining actions for the CURRENT turn.
 *
 * The loop pulls a fresh observation + legal-command list each step,
 * asks the strategy for a command, and applies it — exactly the inner
 * loop of `runMatch`. It returns as soon as the strategy chooses
 * `endTurn`, a command is rejected, or the per-turn budget is exhausted.
 * It NEVER calls `endTurn` on the engine; the turn is left "ready to
 * finish" for the caller.
 *
 * @param {object} options
 * @param {import('@/domain/engine/gameState.js').GameState} options.gameState live game
 * @param {Function} options.strategy doctrine strategy `(observation, legalCommands, rng) => command`
 * @param {Function} [options.rng] optional RNG forwarded to the strategy (heuristics ignore it)
 * @param {Function} [options.onStep] optional callback `({ player, command, ok })` after each applied command
 * @returns {{
 *   ok: boolean,
 *   player: string|null,
 *   steps: number,
 *   ended: 'endTurn'|'rejected'|'limit'|'noGameState'|'gameEnded',
 *   diceResult: number|null,
 *   error?: string
 * }}
 */
export function autoPlayTurn({ gameState, strategy, rng = null, onStep = null } = {}) {
  if (!gameState || typeof gameState !== 'object') {
    return { ok: false, player: null, steps: 0, ended: 'noGameState', diceResult: null }
  }
  if (typeof strategy !== 'function') {
    return { ok: false, player: null, steps: 0, ended: 'rejected', diceResult: null, error: 'strategy must be a function' }
  }

  // A finished game has nothing to play out. `outcome.status === 'ended'`
  // is the same terminal flag the UI gates "End turn" on.
  const outcome = gameState.outcome
  if (outcome && outcome.status === 'ended') {
    return { ok: false, player: gameState.currentPlayer || null, steps: 0, ended: 'gameEnded', diceResult: null }
  }

  const player = gameState.currentPlayer
  const diceResult = ensureDiceRolled(gameState)
  const reportStep = typeof onStep === 'function' ? onStep : null

  let steps = 0
  while (steps < PER_TURN_COMMAND_LIMIT) {
    steps += 1

    const observation = getObservation(gameState, player)
    const legalCommands = listLegalCommands(gameState, player)

    let command = null
    try {
      command = strategy(observation, legalCommands, rng)
    } catch (err) {
      return {
        ok: false,
        player,
        steps,
        ended: 'rejected',
        diceResult,
        error: `strategy threw: ${describeThrown(err)}`
      }
    }

    // Documented strategy contract: a null/undefined/primitive command
    // means "pass" — treat it as a voluntary end of the auto-play turn.
    if (!command || typeof command !== 'object') {
      return { ok: true, player, steps: steps - 1, ended: 'endTurn', diceResult }
    }

    // The strategy chose to end the turn — stop here WITHOUT applying an
    // engine `endTurn`. The human/UI keeps ownership of the hard finish.
    if (command.type === 'endTurn') {
      return { ok: true, player, steps: steps - 1, ended: 'endTurn', diceResult }
    }

    let applyResult
    try {
      applyResult = applyCommand(gameState, command)
    } catch (err) {
      applyResult = { ok: false, error: `applyCommand threw: ${describeThrown(err)}` }
    }

    if (!applyResult.ok) {
      // An illegal command from the doctrine means the turn has nothing
      // more it can legally do — stop and let the human finish. We do
      // NOT force an engine endTurn (unlike runMatch) because the human
      // still owns that action.
      if (reportStep) reportStep({ player, command: summarizeCommand(command), ok: false })
      return { ok: true, player, steps: steps - 1, ended: 'rejected', diceResult, error: applyResult.error }
    }

    const appliedRecord =
      applyResult.result && typeof applyResult.result === 'object'
        ? applyResult.result
        : { type: command.type }
    if (reportStep) reportStep({ player, command: appliedRecord, ok: true })

    // A mid-turn kill can end the match. Stop immediately so the UI can
    // surface the outcome instead of probing for more (impossible) moves.
    const liveOutcome = gameState.outcome
    if (liveOutcome && liveOutcome.status === 'ended') {
      return { ok: true, player, steps, ended: 'gameEnded', diceResult }
    }
  }

  // Budget exhausted — pathological strategy that never ends the turn.
  return { ok: true, player, steps, ended: 'limit', diceResult }
}

export default autoPlayTurn
