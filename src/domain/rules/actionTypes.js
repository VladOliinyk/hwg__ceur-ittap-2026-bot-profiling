/**
 * Canonical action-type and phase constants for the wargame engine.
 *
 * Centralizes the strings shared between turntable JSON, `GameState`, UI controls,
 * and history payloads so that future generators (LLM, builder, simulation)
 * have one source of truth instead of ad-hoc string literals.
 *
 * @module domain/rules/actionTypes
 */

/**
 * Action types as referenced by turntable rows and engine commands.
 * Values are lowercase to match `level_*_turntable.json` data and the
 * `normalizedType` produced inside `GameState.canPerformAction`.
 * @readonly
 */
export const ACTION_TYPES = Object.freeze({
  MOVE: 'move',
  REVERSE: 'reverse',
  TURN: 'turn',
  FIRE: 'fire',
  RELOAD: 'reload'
})

/**
 * Phase titles as referenced by turntable operations (`operation.title`).
 * Uppercase to match the data files; `normalizeActionPhase` accepts variants.
 * @readonly
 */
export const PHASES = Object.freeze({
  MANOEUVRE: 'MANOEUVRE',
  ATTACK: 'ATTACK'
})

/** Frozen list of every known action type (stable iteration order). */
export const ALL_ACTION_TYPES = Object.freeze([
  ACTION_TYPES.MOVE,
  ACTION_TYPES.REVERSE,
  ACTION_TYPES.TURN,
  ACTION_TYPES.FIRE,
  ACTION_TYPES.RELOAD
])

/**
 * Which phase each action type belongs to in the standard turntable layout.
 * Reserved for callers that need to know whether a given action type is
 * MANOEUVRE-class (move/reverse/turn) or ATTACK-class (fire/reload).
 * @readonly
 */
export const ACTION_TYPE_PHASE = Object.freeze({
  [ACTION_TYPES.MOVE]: PHASES.MANOEUVRE,
  [ACTION_TYPES.REVERSE]: PHASES.MANOEUVRE,
  [ACTION_TYPES.TURN]: PHASES.MANOEUVRE,
  [ACTION_TYPES.FIRE]: PHASES.ATTACK,
  [ACTION_TYPES.RELOAD]: PHASES.ATTACK
})

/**
 * Default action-point cost for action types whose cost is not derived from
 * pathfinding. For `move` / `reverse` the authoritative cost comes from the
 * reachability cache and is intentionally not represented here.
 * @readonly
 */
export const DEFAULT_ACTION_COST = Object.freeze({
  [ACTION_TYPES.TURN]: 1,
  [ACTION_TYPES.FIRE]: 1,
  [ACTION_TYPES.RELOAD]: 1
})

/**
 * Normalize a raw action-type string to the canonical lowercase form used
 * by the engine. Returns `''` for non-strings or empty input.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalizeActionType(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

/**
 * Check whether a value is one of the recognized action types.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isKnownActionType(value) {
  const normalized = normalizeActionType(value)
  if (!normalized) return false
  return ALL_ACTION_TYPES.includes(normalized)
}
