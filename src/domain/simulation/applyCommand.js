/**
 * Headless command dispatcher.
 *
 * Validates a `{ type, unitId, payload }` command, then routes it to
 * the matching `GameState` action API. Engine-level guards
 * (`canPerformAction`, reachability, LOS) remain the source of truth;
 * this layer only catches shape errors and surfaces engine errors as
 * `{ ok: false, error }` rather than throwing through the run loop.
 *
 * @module domain/simulation/applyCommand
 */

import { ACTION_TYPES, PHASES } from '../rules/actionTypes.js'
import { describeForError, describeThrown } from './safeFormat.js'

const SUPPORTED_TYPES = new Set([
  ACTION_TYPES.MOVE,
  ACTION_TYPES.REVERSE,
  ACTION_TYPES.TURN,
  ACTION_TYPES.FIRE,
  ACTION_TYPES.RELOAD,
  'endTurn'
])

function fail(error) {
  return { ok: false, error }
}

function ok(result) {
  return { ok: true, result: result === undefined ? null : result }
}

/**
 * Apply a strategy-issued command to the game.
 *
 * @param {import('@/domain/engine/gameState.js').GameState} gameState
 * @param {{type:string, unitId?:string, payload?:object}} command
 * @returns {{ok:boolean, result?:any, error?:string}}
 */
export function applyCommand(gameState, command) {
  if (!gameState || typeof gameState !== 'object') {
    return fail('applyCommand: gameState is required')
  }
  if (!command || typeof command !== 'object') {
    return fail('applyCommand: command must be an object')
  }
  // Strict equality: no trimming/lowercasing. `listLegalCommands` always
  // emits canonical strings, so a whitespace-or-case-variant type is
  // either a hand-rolled bug or a stale command — surfacing it as
  // illegal keeps the runner branch (`command.type === 'endTurn'`,
  // metric bucket lookup) consistent with what was actually applied.
  const type = typeof command.type === 'string' ? command.type : ''
  if (!SUPPORTED_TYPES.has(type)) {
    // `command.type` may be a Symbol, BigInt, or have a throwing
    // toString; template interpolation on those crashes the dispatcher.
    // Coerce safely so a malformed strategy is downgraded to an illegal
    // attempt instead of taking down the whole match.
    return fail(`applyCommand: unsupported command type "${describeForError(command.type)}"`)
  }

  if (type === 'endTurn') {
    try {
      gameState.endTurn()
      return ok({ type: 'endTurn' })
    } catch (err) {
      return fail(`endTurn failed: ${describeThrown(err)}`)
    }
  }

  const unitId = typeof command.unitId === 'string' ? command.unitId.trim() : ''
  if (!unitId) {
    return fail(`applyCommand: command "${type}" requires unitId`)
  }
  const unit = gameState.units.get(unitId)
  if (!unit) {
    return fail(`applyCommand: unit "${unitId}" not found`)
  }
  if (unit.player !== gameState.currentPlayer) {
    return fail(`applyCommand: unit "${unitId}" is not owned by current player "${gameState.currentPlayer}"`)
  }

  const payload = command.payload && typeof command.payload === 'object' ? command.payload : {}

  try {
    if (type === ACTION_TYPES.MOVE || type === ACTION_TYPES.REVERSE) {
      const to = payload.to
      if (!to || !Number.isInteger(to.q) || !Number.isInteger(to.r)) {
        return fail(`applyCommand: ${type} requires payload.to {q,r}`)
      }
      const from = {
        q: unit.position.q,
        r: unit.position.r,
        facing: unit.facing
      }
      // Verify destination is reachable in the *chosen motion direction*.
      // The engine's `moveUnit` is path-agnostic (it accepts any hex in
      // the union reachability cache), so without this check a strategy
      // could side-step a turntable that allows only `move` by claiming
      // a backward-only-reachable hex is a `move`.
      const motionMode = type === ACTION_TYPES.REVERSE ? 'reverse' : 'forward'
      const directionalCosts = gameState.getDirectionalReachableCosts(unitId, motionMode)
      const targetKey = gameState.getHexKey(to.q, to.r)
      const directionalCost = directionalCosts.get(targetKey)
      if (directionalCost === undefined) {
        return fail(
          `applyCommand: ${type} target ${to.q},${to.r} is not reachable via ${motionMode} motion`
        )
      }
      // Pass `authoritativeCost` so the engine charges the same AP the
      // simulation boundary used to authorize the command. Without this,
      // moveUnit would re-derive a cheaper union path cost and the
      // directional gate would only restrict destinations, not pricing.
      gameState.moveUnit(unitId, to.q, to.r, {
        phase: PHASES.MANOEUVRE,
        motionKind: motionMode,
        authoritativeCost: directionalCost
      })
      const destination = { q: to.q, r: to.r, facing: unit.facing }
      return ok({
        type,
        unitId,
        from,
        to: destination,
        path: [from, destination],
        cost: directionalCost
      })
    }

    if (type === ACTION_TYPES.TURN) {
      const facing = payload.facing
      if (!Number.isInteger(facing) || facing < 0 || facing > 5) {
        return fail('applyCommand: turn requires payload.facing in [0,5]')
      }
      gameState.updateUnitFacing(unitId, facing, {
        actionType: ACTION_TYPES.TURN,
        cost: 1,
        phase: PHASES.MANOEUVRE
      })
      return ok({ type, unitId, facing })
    }

    if (type === ACTION_TYPES.FIRE) {
      const target = payload.target
      if (!target || !Number.isInteger(target.q) || !Number.isInteger(target.r)) {
        return fail('applyCommand: fire requires payload.target {q,r}')
      }
      // `listLegalCommands` always names the target unit; rejecting commands
      // that omit or misname it closes a stale-command attack where the
      // hex is still in range but a different unit has moved into it.
      if (typeof target.unitId !== 'string' || !target.unitId.trim()) {
        return fail('applyCommand: fire requires payload.target.unitId')
      }
      const targetHex = gameState.getHex(target.q, target.r)
      const occupant = targetHex && targetHex.unit
      if (!occupant) {
        return fail(`applyCommand: fire target hex ${target.q},${target.r} is empty`)
      }
      if (String(occupant.id) !== String(target.unitId).trim()) {
        return fail(
          `applyCommand: fire target unitId mismatch — expected "${target.unitId}" at ${target.q},${target.r}, found "${occupant.id}"`
        )
      }
      // Capture the unit ref before performAttack so we can detect a kill
      // even after `removeUnit` strips it from the board map.
      const targetUnitRef = occupant
      const damage = gameState.performAttack(unitId, target.q, target.r, {
        phase: PHASES.ATTACK
      })
      const killed = typeof targetUnitRef.isAlive === 'function'
        ? !targetUnitRef.isAlive()
        : targetUnitRef.health <= 0
      return ok({
        type,
        unitId,
        target: { q: target.q, r: target.r, unitId: targetUnitRef.id },
        damage,
        killed
      })
    }

    if (type === ACTION_TYPES.RELOAD) {
      gameState.performReload(unitId, {
        actionType: ACTION_TYPES.RELOAD,
        cost: 1,
        phase: PHASES.ATTACK
      })
      return ok({ type, unitId })
    }
  } catch (err) {
    return fail(`${type} failed: ${describeThrown(err)}`)
  }

  return fail(`applyCommand: unhandled command type "${type}"`)
}
