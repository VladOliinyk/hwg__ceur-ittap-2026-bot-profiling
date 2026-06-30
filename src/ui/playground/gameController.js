/**
 * Playground UI game controller.
 *
 * Single dispatch boundary between Vue components and `GameState`
 * mutations. UI components ask the controller to perform a command;
 * the controller calls the engine, wraps engine errors into a uniform
 * `{ ok, code, message }` result shape, and never lets the engine
 * throw through into a Vue event handler.
 *
 * The controller is intentionally NOT a Vue composable so the same
 * factory can be reused from headless tests, simulation harnesses,
 * or a future Pinia-style store.
 *
 * Rules:
 * - The controller never re-implements engine rules. It only routes
 *   calls into the existing `GameState` API.
 * - The controller never mutates `GameState` outside of the documented
 *   command methods.
 * - On any thrown error, the command returns `{ ok: false, code, message }`
 *   so a UI caller can decide how to notify the user without try/catch.
 *
 * @module ui/playground/gameController
 */

import { describeThrown } from '../../domain/simulation/safeFormat.js'

/**
 * Build a successful command result.
 * @param {object} [result]
 * @returns {{ok: true, result: any}}
 */
function ok(result) {
  return { ok: true, result: result === undefined ? null : result }
}

/**
 * Build a rejected command result.
 * @param {string} code Stable machine-readable rejection code.
 * @param {string} [message] Human-readable detail, typically from the engine.
 * @returns {{ok: false, code: string, message: string}}
 */
function fail(code, message) {
  return { ok: false, code, message: typeof message === 'string' ? message : '' }
}

/**
 * Create a controller bound to a live `GameState` reference.
 *
 * `getGameState` is a getter so the controller always reads the latest
 * `GameState` even if the host component re-assigns its reference
 * (initialize, restore, history import).
 *
 * @param {{getGameState: () => (import('@/domain/engine/gameState.js').GameState | null | undefined)}} deps
 */
export function createGameController({ getGameState } = {}) {
  if (typeof getGameState !== 'function') {
    throw new Error('createGameController: getGameState function is required')
  }

  function requireGameState() {
    const gs = getGameState()
    return gs && typeof gs === 'object' ? gs : null
  }

  /**
   * Commit a die face to the engine as the dice roll for the current
   * player/turn. The engine rejects re-rolls; we surface that as a
   * `DICE_REJECTED` result so the caller can show a warning.
   */
  function commitDiceRoll(face) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      gs.rollDice(face)
      return ok({ type: 'rollDice', face })
    } catch (err) {
      return fail('DICE_REJECTED', describeThrown(err))
    }
  }

  /**
   * Draw a D6 face from the engine RNG without committing it to history.
   * The animated UI uses this at roll start and calls `commitDiceRoll`
   * only when the reveal animation finishes.
   *
   * @returns {{ok: true, result: {type: 'drawDice', face: number}} | {ok: false, code: string, message: string}}
   */
  function drawDiceFromEngine() {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      const face = gs.drawDiceFaceFromRng()
      return ok({ type: 'drawDice', face })
    } catch (err) {
      return fail('DICE_REJECTED', describeThrown(err))
    }
  }

  /**
   * Ask the engine to roll a D6 from its own seeded RNG and commit the
   * result. UI should prefer this over computing the face locally so
   * that randomness stays inside the engine and a seeded `GameState`
   * makes Playground games reproducible.
   *
   * @returns {{ok: true, result: {type: 'rollDice', face: number}} | {ok: false, code: string, message: string}}
   */
  function rollDiceFromEngine() {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      const face = gs.rollDiceFromRng()
      return ok({ type: 'rollDice', face })
    } catch (err) {
      return fail('DICE_REJECTED', describeThrown(err))
    }
  }

  /**
   * Move a unit to the given destination hex. `motionKind` is either
   * `'forward'` (default) or `'reverse'`; it controls the AP charge
   * channel and history `actionType` inside the engine.
   */
  function moveUnit({ unitId, q, r, motionKind } = {}) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      const meta = motionKind === 'reverse' ? { motionKind: 'reverse' } : undefined
      gs.moveUnit(unitId, q, r, meta)
      return ok({
        type: 'moveUnit',
        unitId,
        q,
        r,
        motionKind: motionKind === 'reverse' ? 'reverse' : 'forward'
      })
    } catch (err) {
      return fail('MOVE_REJECTED', describeThrown(err))
    }
  }

  /**
   * Rotate a unit to the given facing (0..5). The engine charges AP
   * and validates against the turntable / dice / phase.
   */
  function updateUnitFacing({ unitId, facing } = {}) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      gs.updateUnitFacing(unitId, facing)
      return ok({ type: 'rotate', unitId, facing })
    } catch (err) {
      return fail('ROTATE_REJECTED', describeThrown(err))
    }
  }

  /**
   * Resolve a fire command against a chosen target hex. `diceResult`
   * is the UI's authoritative current-turn die face; the engine still
   * re-checks `canPerformAction` before applying the attack.
   */
  function performAttack({ unitId, target, diceResult } = {}) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    if (!target || typeof target !== 'object') {
      return fail('FIRE_REJECTED', 'No target supplied for fire command.')
    }
    try {
      const damage = gs.performAttack(unitId, target.q, target.r, { diceResult })
      return ok({
        type: 'fire',
        unitId,
        target: { q: target.q, r: target.r },
        damage
      })
    } catch (err) {
      return fail('FIRE_REJECTED', describeThrown(err))
    }
  }

  /** Reload the unit's weapon. */
  function performReload({ unitId, diceResult } = {}) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      gs.performReload(unitId, { diceResult })
      return ok({ type: 'reload', unitId })
    } catch (err) {
      return fail('RELOAD_REJECTED', describeThrown(err))
    }
  }

  /**
   * Advance to the next player's turn. Returns the resulting
   * `turnNumber` and `currentPlayer` so the caller can include them
   * in a notification without re-reading the engine.
   */
  function endTurn() {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      gs.endTurn()
      return ok({
        type: 'endTurn',
        turnNumber: gs.turnNumber,
        currentPlayer: gs.currentPlayer
      })
    } catch (err) {
      return fail('END_TURN_REJECTED', describeThrown(err))
    }
  }

  /**
   * Roll history back to the state immediately before
   * `history[turnIndex].actions[actionIndex]` was applied. The engine's
   * `revertTo` returns `false` if the indices are out of range or the
   * replay fails atomically.
   */
  function revertTo({ turnIndex, actionIndex } = {}) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      const success = gs.revertTo(turnIndex, actionIndex)
      if (!success) return fail('REVERT_REJECTED', 'Revert was rejected by the engine.')
      return ok({ type: 'revert', turnIndex, actionIndex })
    } catch (err) {
      return fail('REVERT_REJECTED', describeThrown(err))
    }
  }

  /**
   * Import history JSON into the live game. Delegates to
   * `GameState.loadHistoryJSON`, which is transactional after Batch 1.
   */
  function importHistory(json) {
    const gs = requireGameState()
    if (!gs) return fail('NO_GAMESTATE', 'Game is not initialized.')
    try {
      const success = gs.loadHistoryJSON(json)
      if (!success) return fail('IMPORT_REJECTED', 'Failed to import history.')
      return ok({ type: 'importHistory' })
    } catch (err) {
      return fail('IMPORT_REJECTED', describeThrown(err))
    }
  }

  return {
    commitDiceRoll,
    drawDiceFromEngine,
    rollDiceFromEngine,
    moveUnit,
    updateUnitFacing,
    performAttack,
    performReload,
    endTurn,
    revertTo,
    importHistory
  }
}
