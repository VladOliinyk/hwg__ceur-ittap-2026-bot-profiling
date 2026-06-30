/**
 * Headless legal-command generation.
 *
 * Given a `GameState` whose dice has already been rolled for the
 * current player, expand every legal move/reverse/turn/fire/reload
 * action into a concrete `{ type, unitId, payload }` command. Action
 * commands are emitted in turntable priority order within each phase.
 * The `endTurn` command is always appended so a strategy can choose to
 * pass at any point.
 *
 * Commands here are *engine-authoritative*: each one passes
 * `GameState.canPerformAction` and (for move/reverse) the reachability
 * cache. Strategies therefore never need to re-implement rules — they
 * just pick from the list.
 *
 * @module domain/simulation/legalCommands
 */

import {
  ACTION_TYPES,
  PHASES
} from '../rules/actionTypes.js'
import { getHexDirections, normalizeHexFacing } from '@/domain/engine/hexUtils.js'

const END_TURN_COMMAND = Object.freeze({ type: 'endTurn' })

function commandPriority(entry) {
  if (!entry || !Number.isInteger(entry.priority) || entry.priority <= 0) return {}
  const meta = { turntablePriority: entry.priority }
  if (entry.phase) meta.turntablePhase = entry.phase
  return meta
}

function pushMoveCommands(out, gameState, unit, motionKind, entry) {
  const type = motionKind === 'reverse' ? ACTION_TYPES.REVERSE : ACTION_TYPES.MOVE
  // Use direction-specific reachability so a `move` command can't reach
  // a hex that requires reversing, and vice versa. This keeps
  // listLegalCommands truly turntable-authoritative even when the dice
  // row allows only one of {move, reverse}.
  const motionMode = motionKind === 'reverse' ? 'reverse' : 'forward'
  const costs = gameState.getDirectionalReachableCosts(unit.id, motionMode)
  const position = unit && unit.position
  if (!position || !Number.isInteger(position.q) || !Number.isInteger(position.r)) return
  const directionIndex = motionKind === 'reverse'
    ? normalizeHexFacing(unit.facing + 3)
    : normalizeHexFacing(unit.facing)
  const directions = getHexDirections(position.r)
  const delta = directions[directionIndex]
  if (!delta) return
  const q = position.q + delta.q
  const r = position.r + delta.r
  const key = gameState.getHexKey(q, r)
  const cost = costs.get(key)
  if (cost === undefined) return
  if (!gameState.canPerformAction(unit.id, type, cost, PHASES.MANOEUVRE)) return
  out.push({
    type,
    unitId: unit.id,
    payload: { to: { q, r }, cost },
    ...commandPriority(entry)
  })
}

function pushTurnCommands(out, gameState, unit, entry) {
  // Turn cost is constant (1 AP) and dice/budget eligibility doesn't
  // depend on the chosen facing — gate once, then enumerate.
  if (!gameState.canPerformAction(unit.id, ACTION_TYPES.TURN, 1, PHASES.MANOEUVRE)) return
  for (let facing = 0; facing < 6; facing++) {
    if (facing === unit.facing) continue
    out.push({
      type: ACTION_TYPES.TURN,
      unitId: unit.id,
      payload: { facing },
      ...commandPriority(entry)
    })
  }
}

function pushFireCommands(out, gameState, unit, entry) {
  if (!gameState.canPerformAction(unit.id, ACTION_TYPES.FIRE, 1, PHASES.ATTACK)) return
  const targets = gameState.getValidFireTargetsCached(unit.id)
  for (const t of targets) {
    out.push({
      type: ACTION_TYPES.FIRE,
      unitId: unit.id,
      payload: {
        target: { q: t.q, r: t.r, unitId: t.unitId }
      },
      ...commandPriority(entry)
    })
  }
}

function pushReloadCommand(out, gameState, unit, entry) {
  if (!gameState.canPerformAction(unit.id, ACTION_TYPES.RELOAD, 1, PHASES.ATTACK)) return
  out.push({
    type: ACTION_TYPES.RELOAD,
    unitId: unit.id,
    payload: {},
    ...commandPriority(entry)
  })
}

/**
 * Enumerate every legal command for `player` given the current
 * `gameState`. Returns `[{ type: 'endTurn' }]` if dice hasn't been
 * rolled or the player has no legal action commands — strategies can
 * always at least pass. Returns `[]` when it is NOT `player`'s turn:
 * `applyCommand`'s endTurn carries no initiator and unconditionally
 * ends the *current* player's turn, so an inactive player has no legal
 * commands at all.
 *
 * @param {import('@/domain/engine/gameState.js').GameState} gameState
 * @param {string} player
 * @returns {Array<{type:string, unitId?:string, payload?:object}>}
 *   Empty array when it is not `player`'s turn (see function body comment).
 */
export function listLegalCommands(gameState, player) {
  if (!gameState || typeof gameState !== 'object') {
    throw new Error('listLegalCommands: gameState is required')
  }
  if (typeof player !== 'string' || !player.trim()) {
    throw new Error('listLegalCommands: player must be a non-empty string')
  }

  const out = []
  // Not this player's turn: NO legal commands, not even endTurn.
  // applyCommand's endTurn has no ownership check — it would end the
  // CURRENT player's turn on the inactive player's behalf, breaking the
  // engine-authoritative contract. (The runner only consults the current
  // player; this guards future consumers.)
  if (gameState.currentPlayer !== player) {
    return []
  }
  // Dice not rolled yet: the only legal command is endTurn (the runner
  // rolls dice before consulting this function in the normal flow).
  if (!gameState.hasRolledDice()) {
    return [END_TURN_COMMAND]
  }

  const units = gameState.getActivePlayerUnits(player)
  for (const unit of units) {
    const allowedEntries = typeof gameState.getAllowedActionEntriesForUnit === 'function'
      ? gameState.getAllowedActionEntriesForUnit(unit.id)
      : gameState.getAllowedActionsForUnit(unit.id).map((type, index) => ({
          type,
          phase: null,
          priority: index + 1
        }))
    if (allowedEntries.length === 0) continue
    for (const entry of allowedEntries) {
      if (!entry || !entry.type) continue
      if (entry.type === ACTION_TYPES.MOVE) {
        pushMoveCommands(out, gameState, unit, 'forward', entry)
      } else if (entry.type === ACTION_TYPES.REVERSE) {
        pushMoveCommands(out, gameState, unit, 'reverse', entry)
      } else if (entry.type === ACTION_TYPES.TURN) {
        pushTurnCommands(out, gameState, unit, entry)
      } else if (entry.type === ACTION_TYPES.FIRE) {
        pushFireCommands(out, gameState, unit, entry)
      } else if (entry.type === ACTION_TYPES.RELOAD) {
        pushReloadCommand(out, gameState, unit, entry)
      }
    }
  }

  out.push(END_TURN_COMMAND)
  return out
}
