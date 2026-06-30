/**
 * Hardening helpers for diagnostic strings produced inside the
 * simulation boundary.
 *
 * The runner must never crash while *formatting* an error from a
 * malformed strategy or unexpected engine throw. Any path that
 * interpolates an untrusted value into an error string funnels
 * through one of these helpers so that throwing `toString`, throwing
 * `.message` getters, Symbols, and other unsafe-to-coerce values all
 * become readable strings instead of cascading throws.
 *
 * @module domain/simulation/safeFormat
 */

/**
 * Safely stringify any value for an error message. Tolerates:
 *   - `Symbol` (template interpolation throws; `String(Symbol(...))`
 *     returns `"Symbol(...)"`).
 *   - Objects whose `toString` throws.
 * Returns the literal `'<unstringifiable>'` if even `String()` throws.
 *
 * @param {*} value
 * @returns {string}
 */
export function describeForError(value) {
  try {
    return String(value)
  } catch (_) {
    return '<unstringifiable>'
  }
}

/**
 * Extract a printable description from a caught throwable. Prefers
 * `err.message` when it is a non-empty string, since `Error` instances
 * are the common case and their message is the most useful diagnostic.
 * Falls back to `describeForError` when:
 *   - `err.message` accessor throws.
 *   - `err.message` is missing / non-string / empty.
 *
 * The first lookup is inside its own try/catch so a throwing `message`
 * getter on the thrown value cannot escape this function.
 *
 * @param {*} err
 * @returns {string}
 */
export function describeThrown(err) {
  try {
    const m = err && err.message
    if (typeof m === 'string' && m.length > 0) return m
  } catch (_) {
    // throwing `.message` getter — fall through to safe stringification.
  }
  return describeForError(err)
}

/**
 * Build a sanitized snapshot of a strategy-supplied command for safe
 * storage in match history. The returned object is frozen, owns no
 * references to the original strategy object, and only carries a small
 * whitelist of fields (`type`, `unitId`) — read inside try/catch so
 * throwing property getters cannot escape.
 *
 * Used by the runner whenever it needs to persist an *untrusted*
 * command (e.g. the rejected illegal-attempt branch in `runMatch`).
 * The success branch already uses `applyResult.result` directly, which
 * is built from validated primitives and needs no sanitization.
 *
 * @param {*} command
 * @returns {Readonly<{ type: string, unitId?: string }>}
 */
export function summarizeCommand(command) {
  if (command === null || typeof command !== 'object') {
    return Object.freeze({ type: describeForError(command) })
  }
  let typeStr
  try {
    const rawType = command.type
    typeStr = typeof rawType === 'string' ? rawType : describeForError(rawType)
  } catch (_) {
    typeStr = '<unstringifiable>'
  }
  let unitIdStr
  try {
    const rawUnitId = command.unitId
    if (typeof rawUnitId === 'string') unitIdStr = rawUnitId
  } catch (_) {
    // throwing `unitId` getter — omit the field entirely. The
    // rejection error (stored alongside in history) is the primary
    // diagnostic; this summary is just a stable identity tag.
  }
  const out = { type: typeStr }
  if (unitIdStr !== undefined) out.unitId = unitIdStr
  return Object.freeze(out)
}
