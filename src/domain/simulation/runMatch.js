/**
 * Headless match runner.
 *
 * Builds a `GameState` from a validated `LevelPackage`, drives the
 * turn/dice lifecycle with a seeded RNG, asks each player's strategy
 * for a command, and records metrics. The only "game I/O" is the
 * package + strategies + seed in, `SimulationResult` out — there is
 * no Vue, no DOM, no `Math.random`.
 *
 * @example
 *   const result = runMatch({
 *     levelPackage: pkg,
 *     strategies: {
 *       player1: randomStrategy(),
 *       player2: randomStrategy()
 *     },
 *     seed: 'level_000-smoke-001',
 *     maxTurns: 100
 *   })
 *
 * @module domain/simulation/runMatch
 */

import { GameState } from '@/domain/engine/gameState.js'
import { createRng, rollD6 } from './rng.js'
import { getObservation } from './observation.js'
import { listLegalCommands } from './legalCommands.js'
import { applyCommand } from './applyCommand.js'
import { createMetrics } from './metrics.js'
import { describeThrown, summarizeCommand } from './safeFormat.js'
import {
  buildDefaultObjectivesForLevelPackage,
  createEndedOutcome,
  isTerminalOutcome,
  OBJECTIVE_REASONS
} from '../objectives/objectives.js'

const DEFAULT_MAX_TURNS = 100
// Per-turn safety to stop pathological strategies that issue legal
// commands forever without ending the turn. Each successful action
// drains AP, so this bound is comfortably above realistic action counts.
// Exported so boundary tests stay in sync with the runner's actual limit.
export const PER_TURN_COMMAND_LIMIT = 500

function buildGameState(levelPackage, rng) {
  if (!levelPackage || typeof levelPackage !== 'object') {
    throw new Error('runMatch: levelPackage is required')
  }
  const { hexmap, terrain, units, turntable, objectives } = levelPackage
  if (!hexmap || !hexmap.parameters) {
    throw new Error('runMatch: levelPackage.hexmap.parameters is required')
  }
  if (!terrain || !Array.isArray(terrain.terrainTypes)) {
    throw new Error('runMatch: levelPackage.terrain.terrainTypes is required')
  }
  return new GameState({
    width: hexmap.parameters.width,
    height: hexmap.parameters.height,
    currentPlayer: 'player1',
    mapData: hexmap,
    terrainTypes: terrain.terrainTypes,
    unitsData: units,
    turntableData: turntable,
    objectivesData: objectives || buildDefaultObjectivesForLevelPackage(levelPackage),
    rng
  })
}

function normalizeStrategies(strategies) {
  if (!strategies || typeof strategies !== 'object') {
    throw new Error('runMatch: strategies must be an object with player1/player2 functions')
  }
  const p1 = strategies.player1
  const p2 = strategies.player2
  if (typeof p1 !== 'function' || typeof p2 !== 'function') {
    throw new Error('runMatch: strategies.player1 and .player2 must be functions')
  }
  return { player1: p1, player2: p2 }
}

function decideWinner(gameState) {
  const p1Alive = gameState.getActivePlayerUnits('player1').length
  const p2Alive = gameState.getActivePlayerUnits('player2').length
  if (p1Alive === 0 && p2Alive === 0) return 'draw'
  if (p1Alive === 0) return 'player2'
  if (p2Alive === 0) return 'player1'
  // Both sides survive — tie-break by remaining unit count, then HP.
  if (p1Alive !== p2Alive) return p1Alive > p2Alive ? 'player1' : 'player2'
  const sumHp = player =>
    gameState.getActivePlayerUnits(player).reduce((s, u) => s + (u.health || 0), 0)
  const p1Hp = sumHp('player1')
  const p2Hp = sumHp('player2')
  if (p1Hp !== p2Hp) return p1Hp > p2Hp ? 'player1' : 'player2'
  return 'draw'
}

function evaluateTerminalOutcome(gameState) {
  if (!gameState || typeof gameState.evaluateOutcome !== 'function') return null
  const outcome = gameState.evaluateOutcome()
  return isTerminalOutcome(outcome) ? outcome : null
}

function maxTurnsOutcome(gameState) {
  // The turn cap is not a "the simulation gave up" ending: resolve it as a real
  // material verdict (winner = more units, then more HP; equal = draw) so every
  // match reports a decisive result, not a hollow `maxTurns`.
  const winner = decideWinner(gameState)
  const p1 = gameState.getActivePlayerUnits('player1').length
  const p2 = gameState.getActivePlayerUnits('player2').length
  const message = winner === 'draw'
    ? `Turn limit reached — material tie (player1 ${p1} vs player2 ${p2} units).`
    : `Turn limit reached — ${winner} leads on material (player1 ${p1} vs player2 ${p2} units).`
  return createEndedOutcome({
    winner,
    reason: OBJECTIVE_REASONS.MATERIAL_DECISION,
    conditionId: null,
    message
  })
}

function perTurnLimitOutcome(gameState) {
  return createEndedOutcome({
    winner: decideWinner(gameState),
    reason: OBJECTIVE_REASONS.PER_TURN_LIMIT,
    conditionId: null,
    message: 'Per-turn command limit reached.'
  })
}

function cloneTraceValue(value, fallback) {
  try {
    if (value === undefined || value === null) return fallback
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function buildTraceEngineSnapshot(gameState) {
  const snapshot = gameState.toJSON(false)
  // The hex/terrain map is immutable for the whole match and is bundled once
  // at the trace root (levelPackage). Dropping it here keeps every per-frame
  // snapshot to DYNAMIC state only — no static-board duplication, even in the
  // transient frame buffer before `createSimulationTrace` compacts the trace.
  delete snapshot.hexes
  snapshot.currentTurnActions = cloneTraceValue(gameState.currentTurnActions, [])
  return snapshot
}

/**
 * Run a single match.
 *
 * @param {{
 *   levelPackage: object,
 *   strategies: { player1: Function, player2: Function },
 *   seed?: number|string,
 *   maxTurns?: number,
 *   recordHistory?: boolean,
 *   onFrame?: Function
 * }} input
 * @returns {{
 *   winner: 'player1'|'player2'|'draw',
 *   turns: number,
 *   seed: number|string,
 *   reason: string,
 *   metrics: object,
 *   history?: object[]
 * }}
 */
export function runMatch(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runMatch: input is required')
  }
  const {
    levelPackage,
    strategies: rawStrategies,
    seed = 0,
    maxTurns = DEFAULT_MAX_TURNS,
    recordHistory = false,
    onFrame = null
  } = input

  const normalizedMaxTurns = Number.isInteger(maxTurns) && maxTurns > 0 ? maxTurns : DEFAULT_MAX_TURNS
  const strategies = normalizeStrategies(rawStrategies)
  const shouldEmitFrame = typeof onFrame === 'function'

  const rng = createRng(seed)
  const gameState = buildGameState(levelPackage, rng)
  const metrics = createMetrics()
  metrics.captureInitialUnits(gameState)

  let finalOutcome = evaluateTerminalOutcome(gameState)
  let turnsCompleted = 0
  let endReason = finalOutcome ? finalOutcome.reason : OBJECTIVE_REASONS.MAX_TURNS
  const turnEvents = recordHistory ? [] : null
  let frameIndex = 0
  let emittedTerminalFrame = false
  const emitFrame = shouldEmitFrame
    ? (event, {
        player = null,
        command = null,
        ok = true,
        error = undefined,
        forcedEnd = false,
        outcome = null,
        label = event,
        diceResult = undefined
      } = {}) => {
        const terminalOutcome = outcome || null
        if (terminalOutcome) emittedTerminalFrame = true
        const currentDiceResult = typeof gameState.getCurrentDiceResult === 'function'
          ? gameState.getCurrentDiceResult()
          : null
        const frame = {
          index: frameIndex,
          event,
          tick: Array.isArray(gameState.history) ? gameState.history.length : turnsCompleted,
          turnNumber: gameState.turnNumber,
          currentPlayer: gameState.currentPlayer,
          actingPlayer: player,
          diceResult: diceResult !== undefined ? diceResult : currentDiceResult,
          command,
          ok,
          forcedEnd,
          label,
          outcome: terminalOutcome || gameState.outcome || null,
          engine: buildTraceEngineSnapshot(gameState)
        }
        if (error !== undefined) frame.error = error
        frameIndex += 1
        onFrame(frame)
      }
    : null

  const rollCurrentTurnDice = label => {
    const player = gameState.currentPlayer
    const diceResult = rollD6(rng)
    gameState.rollDice(diceResult)
    if (emitFrame) {
      emitFrame('diceRoll', {
        player,
        diceResult,
        label: label || `Rolled D6 for ${player}`
      })
    }
  }

  if (emitFrame) {
    emitFrame(finalOutcome ? 'terminal' : 'initial', {
      outcome: finalOutcome,
      label: finalOutcome ? 'Initial terminal outcome' : 'Initial state'
    })
  }
  // Frame order is explicit: setup snapshot first, then a standalone
  // D6 frame for the active player before strategy decisions begin.
  if (!finalOutcome) {
    rollCurrentTurnDice('Opening D6 roll')
  }

  outer: while (turnsCompleted < normalizedMaxTurns) {
    finalOutcome = evaluateTerminalOutcome(gameState)
    if (finalOutcome) {
      endReason = finalOutcome.reason || 'objective'
      break
    }

    const player = gameState.currentPlayer
    const strategy = strategies[player]
    let perTurnSteps = 0
    // Distinguishes "loop left because the turn completed" from "loop left
    // because the step budget ran out". Checking `perTurnSteps >= limit`
    // alone is off-by-one: a turn whose endTurn lands exactly on the last
    // allowed step would be misreported as a perTurnLimit bail-out.
    // Set to true in *every* path that legitimately ends the turn (voluntary
    // endTurn, forced endTurn after an illegal command). Left false only when
    // the inner while exhausts its budget — the perTurnLimit bail-out.
    let turnEnded = false

    while (perTurnSteps < PER_TURN_COMMAND_LIMIT) {
      perTurnSteps += 1

      const observation = getObservation(gameState, player)
      const legalCommands = listLegalCommands(gameState, player)
      let command = null
      // When a strategy throws, we synthesize an applyResult here so the
      // failure flows through the *same* illegal-attempt branch below
      // (recordIllegal + forced endTurn + history entry with ok:false,
      // error, forcedEnd). Previously we silently rewrote the command
      // to `{type:'endTurn'}` and let it flow through the success path
      // — that disagreed with metrics (which counted the throw as
      // illegal) and hid the strategy failure from `recordHistory`
      // consumers, who saw a plain successful endTurn.
      let applyResult = null
      try {
        command = strategy(observation, legalCommands, rng)
      } catch (err) {
        command = { type: 'strategyThrow' }
        applyResult = {
          ok: false,
          error: `strategy threw: ${describeThrown(err)}`
        }
      }
      if (!applyResult && (!command || typeof command !== 'object')) {
        // Strategy returned null / undefined / primitive — documented
        // semantics: treat as an explicit "pass" via endTurn. This
        // stays on the success path (no illegal attempt recorded),
        // which is the existing contract verified by tests.
        command = { type: 'endTurn' }
      }

      const diceResultBeforeCommand = typeof gameState.getCurrentDiceResult === 'function'
        ? gameState.getCurrentDiceResult()
        : null

      // Defense-in-depth: an unexpected throw inside applyCommand (e.g.
      // engine-level invariant violation surfaced via a future code path,
      // or a thunk strategy that handcrafts a command shape the
      // dispatcher hasn't anticipated) must not crash the whole match.
      // Treat any throw as an illegal attempt and force-endTurn — same
      // contract the loop already applies when applyCommand returns
      // `{ok:false}`.
      if (!applyResult) {
        try {
          applyResult = applyCommand(gameState, command)
        } catch (err) {
          // `describeThrown` tolerates throwing `.message` getters and
          // throwing toString — a hostile thrown value cannot re-crash
          // the catch block while formatting the diagnostic string.
          applyResult = {
            ok: false,
            error: `applyCommand threw: ${describeThrown(err)}`
          }
        }
      }
      if (!applyResult.ok) {
        // Strategy returned an illegal command. Don't let it loop:
        // record the rejection and force-endTurn.
        metrics.recordIllegal(player, command)
        const forced = applyCommand(gameState, { type: 'endTurn' })
        metrics.record(player, { type: 'endTurn' }, forced)
        // Sanitize the illegal command before persisting it in history:
        // a strategy-owned object can carry throwing getters (crashes
        // downstream `JSON.stringify(history)`) and can be mutated later
        // by the strategy (retroactively rewriting past history events).
        // `summarizeCommand` returns a frozen plain object that owns no
        // reference to the strategy's command.
        if (turnEvents) turnEvents.push({ turn: turnsCompleted, player, command: summarizeCommand(command), ok: false, error: applyResult.error, forcedEnd: true })
        turnsCompleted += 1
        // Objective completion takes precedence over maxTurns: a kill/base
        // capture on the final allowed turn must report the objective reason,
        // not be silently masked by the cap.
        finalOutcome = evaluateTerminalOutcome(gameState)
        const reachedMaxTurns = !finalOutcome && turnsCompleted >= normalizedMaxTurns
        if (emitFrame) {
          emitFrame(finalOutcome ? 'terminal' : 'forcedEnd', {
            player,
            command: summarizeCommand(command),
            ok: false,
            error: applyResult.error,
            forcedEnd: true,
            outcome: finalOutcome,
            label: 'Forced endTurn after illegal strategy command',
            diceResult: diceResultBeforeCommand
          })
        }
        if (finalOutcome) {
          endReason = finalOutcome.reason || 'objective'
          break outer
        }
        if (reachedMaxTurns) {
          finalOutcome = maxTurnsOutcome(gameState)
          endReason = finalOutcome.reason
          if (emitFrame) {
            emitFrame('terminal', {
              player,
              command: { type: 'endTurn' },
              ok: true,
              forcedEnd: true,
              outcome: finalOutcome,
              label: 'Maximum turn count reached'
            })
          }
          break outer
        }
        rollCurrentTurnDice()
        turnEnded = true
        break // exit per-turn loop, advance to next iteration of outer
      }

      // Use `applyResult.result` directly — it's the canonical record
      // the dispatcher built from validated payload primitives, so every
      // property is a trusted value (no strategy-supplied getters).
      // Spreading the raw `command` here would, after the engine has
      // already mutated, evaluate any throwing getters the strategy
      // attached as extra fields and crash the runner outside the
      // applyCommand try/catch — leaving engine state mutated but the
      // match result never finalized. The fallback type defends against
      // a future applyCommand contract change that omits `result.type`.
      const trustedResult =
        applyResult.result && typeof applyResult.result === 'object'
          ? applyResult.result
          : null
      const appliedType =
        trustedResult && typeof trustedResult.type === 'string'
          ? trustedResult.type
          : 'endTurn'
      const appliedRecord = trustedResult || { type: appliedType }
      metrics.record(player, appliedRecord, applyResult)
      if (turnEvents) turnEvents.push({ turn: turnsCompleted, player, command: appliedRecord, ok: true })

      if (appliedType === 'endTurn') {
        turnsCompleted += 1
        finalOutcome = evaluateTerminalOutcome(gameState)
        const reachedMaxTurns = !finalOutcome && turnsCompleted >= normalizedMaxTurns
        if (emitFrame) {
          emitFrame(finalOutcome ? 'terminal' : 'afterCommand', {
            player,
            command: appliedRecord,
            ok: true,
            outcome: finalOutcome,
            label: 'Applied endTurn',
            diceResult: diceResultBeforeCommand
          })
        }
        if (finalOutcome) {
          endReason = finalOutcome.reason || 'objective'
          break outer
        }
        if (reachedMaxTurns) {
          finalOutcome = maxTurnsOutcome(gameState)
          endReason = finalOutcome.reason
          if (emitFrame) {
            emitFrame('terminal', {
              player,
              command: appliedRecord,
              ok: true,
              outcome: finalOutcome,
              label: 'Maximum turn count reached'
            })
          }
          break outer
        }
        rollCurrentTurnDice()
        turnEnded = true
        break // start the new player's turn from the outer loop
      }

      // Mid-turn objective check: a fire that eliminates the last opposing
      // unit must end the match immediately, not let the same player pile
      // on extra actions before endTurn. This catches unit wipes ONLY —
      // evaluateOutcome() without {phase:'endTurn'} keeps base-capture
      // objectives (occupyBase/protectBase) active; those resolve inside
      // gameState.endTurn({phase:'endTurn'}) on the endTurn branch above.
      finalOutcome = evaluateTerminalOutcome(gameState)
      if (emitFrame) {
        emitFrame(finalOutcome ? 'terminal' : 'afterCommand', {
          player,
          command: appliedRecord,
          ok: true,
          outcome: finalOutcome,
          label: `Applied ${appliedType}`
        })
      }
      if (finalOutcome) {
        endReason = finalOutcome.reason || 'objective'
        break outer
      }
    }

    if (!turnEnded) {
      // Safety bail-out: log nothing, just force end turn to avoid hang.
      finalOutcome = perTurnLimitOutcome(gameState)
      endReason = finalOutcome.reason
      if (emitFrame) {
        emitFrame('terminal', {
          outcome: finalOutcome,
          label: 'Per-turn command limit reached'
        })
      }
      break
    }
  }

  if (!finalOutcome) {
    finalOutcome = evaluateTerminalOutcome(gameState) || maxTurnsOutcome(gameState)
    endReason = finalOutcome.reason || endReason
  }
  if (emitFrame && !emittedTerminalFrame) {
    emitFrame('terminal', {
      outcome: finalOutcome,
      label: 'Final outcome'
    })
  }

  const winner = finalOutcome && finalOutcome.winner
    ? finalOutcome.winner
    : decideWinner(gameState)
  const finalMetrics = metrics.finalize(gameState)

  const result = {
    winner,
    turns: turnsCompleted,
    seed,
    reason: endReason,
    metrics: finalMetrics
  }
  if (turnEvents) result.history = turnEvents
  return result
}
