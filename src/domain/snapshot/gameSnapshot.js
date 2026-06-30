/**
 * GameSnapshot — complete, self-contained replay artifact.
 *
 * A snapshot bundles:
 *   - the full validated `LevelPackage` (so the receiver does not need
 *     to fetch `/level_<id>/*.json` or trust the importing app's
 *     currently-selected level),
 *   - the engine snapshot (`GameState.toJSON(true)`) including history,
 *     `currentTurnActions`, `initialState`, and the persisted RNG
 *     `state` from Batch 1,
 *   - the original `rngSeed` string (used to construct the engine RNG
 *     in the source game) so the receiver can display / re-use it,
 *   - a `schemaVersion` and a `kind` tag so import code can refuse
 *     foreign / newer / mismatched payloads instead of mutating the
 *     live game with junk data.
 *
 * The previous Timeline export only contained `initialState`, `history`,
 * and `currentTurnActions`. That is not enough to replay an unrelated
 * level (no terrain catalog, no turntable, no spawn layout) and not
 * enough to continue deterministically (no RNG state, no seed). This
 * module is the contract that fixes that.
 *
 * @module domain/snapshot/gameSnapshot
 */

import { validateLevelPackage } from '../level/validateLevelPackage.js'
import { GameState } from '@/domain/engine/gameState.js'

/** Bump only on incompatible shape changes. */
export const SNAPSHOT_SCHEMA_VERSION = 1

/**
 * Magic string so a snapshot file is recognizable even after `JSON.parse`
 * and never confused with a bare `GameState.toJSON()` blob or with the
 * legacy history-only export shape.
 */
export const SNAPSHOT_KIND = 'hwg/game-snapshot'

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const KNOWN_PLAYER_KEYS = ['player1', 'player2']

/**
 * Deep value equality over plain JSON-ish structures (no functions, no Date,
 * no Map/Set). Used to detect tampered turntables where the snapshot's
 * `engine.turntable` does not match `levelPackage.turntable` — a payload
 * with a matching `levelPackage.id` but a foreign engine turntable would
 * otherwise import cleanly because `GameState.fromJSON` does not
 * cross-check.
 */
function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!deepEqual(a[k], b[k])) return false
  }
  return true
}

/**
 * Validate one engine-shaped snapshot half (either the top-level `engine`
 * or `engine.initialState`). `GameState.fromJSON` is permissive on
 * missing fields — its constructor fills in defaults — so without this
 * step a payload can keep the expected `levelPackage.id` but ride in
 * with an engine from a different map, no `rng.state`, missing history
 * arrays, etc., and still import cleanly.
 *
 * `requireHistory: true` covers the top-level engine (the snapshot
 * mid-game). `requireHistory: false` covers `engine.initialState`,
 * which is `toJSON(false)` and intentionally has no `history` /
 * `currentTurnActions` / `initialState` of its own.
 *
 * Pushes structured errors with the given `basePath` prefix.
 * Does not throw.
 */
function validateEngineSubsnapshot(engine, errors, basePath, { requireHistory }) {
  if (!Number.isInteger(engine.width) || engine.width <= 0) {
    errors.push({ path: `${basePath}.width`, message: `${basePath}.width must be a positive integer, got ${JSON.stringify(engine.width)}` })
  }
  if (!Number.isInteger(engine.height) || engine.height <= 0) {
    errors.push({ path: `${basePath}.height`, message: `${basePath}.height must be a positive integer, got ${JSON.stringify(engine.height)}` })
  }
  if (!Number.isInteger(engine.turnNumber) || engine.turnNumber < 1) {
    errors.push({ path: `${basePath}.turnNumber`, message: `${basePath}.turnNumber must be a positive integer, got ${JSON.stringify(engine.turnNumber)}` })
  }
  if (typeof engine.currentPlayer !== 'string' || !KNOWN_PLAYER_KEYS.includes(engine.currentPlayer)) {
    errors.push({ path: `${basePath}.currentPlayer`, message: `${basePath}.currentPlayer must be one of ${KNOWN_PLAYER_KEYS.join(', ')}, got ${JSON.stringify(engine.currentPlayer)}` })
  }

  if (!Array.isArray(engine.hexes)) {
    errors.push({ path: `${basePath}.hexes`, message: `${basePath}.hexes must be an array` })
  }
  if (!Array.isArray(engine.units)) {
    errors.push({ path: `${basePath}.units`, message: `${basePath}.units must be an array` })
  }
  if (!isPlainObject(engine.turnState)) {
    errors.push({ path: `${basePath}.turnState`, message: `${basePath}.turnState must be an object keyed by unit id` })
  }
  if (!isPlainObject(engine.turntable)) {
    errors.push({ path: `${basePath}.turntable`, message: `${basePath}.turntable section is required` })
  }

  // RNG state is required for v1: it is what makes the artifact a
  // deterministic replay rather than just a serialized board. The same
  // anchor must be present on `initialState` so revert/replay re-seeds
  // from the same starting RNG as the original run. The type check is
  // strict (`typeof === 'number'`, not `Number(...)`): a coerced value
  // like `null`, `""`, `"123"`, or `true` would silently resume a
  // foreign state, which defeats the determinism contract.
  if (!isPlainObject(engine.rng)) {
    errors.push({ path: `${basePath}.rng`, message: `${basePath}.rng is required in schema v1 (carries the persisted RNG state for deterministic replay)` })
  } else if (typeof engine.rng.state !== 'number' || !Number.isFinite(engine.rng.state)) {
    errors.push({ path: `${basePath}.rng.state`, message: `${basePath}.rng.state must be a finite number, got ${JSON.stringify(engine.rng.state)}` })
  }

  if (requireHistory) {
    if (!Array.isArray(engine.history)) {
      errors.push({ path: `${basePath}.history`, message: `${basePath}.history must be an array (one entry per completed turn)` })
    } else {
      for (let i = 0; i < engine.history.length; i++) {
        if (!Array.isArray(engine.history[i])) {
          errors.push({ path: `${basePath}.history[${i}]`, message: 'each history turn must be an array of actions' })
          break
        }
      }
    }
    if (!Array.isArray(engine.currentTurnActions)) {
      errors.push({ path: `${basePath}.currentTurnActions`, message: `${basePath}.currentTurnActions must be an array` })
    }
    // `initialState` is the revert anchor: `GameState.revertTo` calls
    // `GameState.fromJSON(this.initialState)` and replays history on
    // top. If the anchor is empty `{}`, fromJSON fills in defaults and
    // produces a board that has nothing to do with the level the game
    // was played on. Validate it as a full sub-snapshot — with
    // `requireHistory: false`, since `initialState` is `toJSON(false)`.
    if (!isPlainObject(engine.initialState)) {
      errors.push({ path: `${basePath}.initialState`, message: `${basePath}.initialState must be an object snapshot of the game start` })
    } else {
      validateEngineSubsnapshot(engine.initialState, errors, `${basePath}.initialState`, { requireHistory: false })
    }
  }
}

/**
 * Cross-validate one engine-shaped subsnapshot against the embedded
 * `levelPackage`. Used for both the top-level `engine` and
 * `engine.initialState` so a foreign or truncated revert anchor cannot
 * sneak past the snapshot validator and only blow up later when the
 * user clicks "revert turn".
 *
 * Checked invariants (all schema-v1):
 *   - width / height match `levelPackage.hexmap.parameters`.
 *   - turntable deep-equals `levelPackage.turntable` (no foreign
 *     turntable smuggled past the package validator).
 *   - when present, objectives deep-equal `levelPackage.objectives`.
 *   - every `hexes` entry is a `[keyString, hexData]` pair where the
 *     key parses to integers in board bounds, `hexData.q/r` agree with
 *     the key, no duplicate keys, and the total count equals
 *     `width × height` (rejects truncated / extended maps —
 *     `GameState.fromJSON` builds a default board first and overlays
 *     supplied hexes, so omitted cells would silently become default
 *     terrain without this check).
 */
function validateEngineSubsnapshotAgainstPackage(engine, pkg, errors, basePath) {
  const params = pkg && pkg.hexmap && pkg.hexmap.parameters
  const havePkgParams = isPlainObject(params) && Number.isInteger(params.width) && Number.isInteger(params.height)

  if (havePkgParams) {
    if (Number.isInteger(engine.width) && engine.width !== params.width) {
      errors.push({
        path: `${basePath}.width`,
        message: `${basePath}.width (${engine.width}) does not match levelPackage.hexmap.parameters.width (${params.width})`
      })
    }
    if (Number.isInteger(engine.height) && engine.height !== params.height) {
      errors.push({
        path: `${basePath}.height`,
        message: `${basePath}.height (${engine.height}) does not match levelPackage.hexmap.parameters.height (${params.height})`
      })
    }
  }

  if (isPlainObject(engine.turntable) && pkg && pkg.turntable && !deepEqual(engine.turntable, pkg.turntable)) {
    errors.push({
      path: `${basePath}.turntable`,
      message: `${basePath}.turntable does not match levelPackage.turntable (snapshot may have been re-bundled with a foreign engine)`
    })
  }

  if (pkg && pkg.objectives != null) {
    if (!isPlainObject(engine.objectives) || !deepEqual(engine.objectives, pkg.objectives)) {
      errors.push({
        path: `${basePath}.objectives`,
        message: `${basePath}.objectives does not match levelPackage.objectives (snapshot may have been re-bundled with foreign objectives)`
      })
    }
  }

  if (Array.isArray(engine.hexes) && havePkgParams) {
    const expectedCount = params.width * params.height
    const seen = new Set()
    let walkError = false
    for (let i = 0; i < engine.hexes.length; i++) {
      const entry = engine.hexes[i]
      const entryPath = `${basePath}.hexes[${i}]`
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
        errors.push({ path: entryPath, message: `${basePath}.hexes entry must be [keyString, hexData]` })
        walkError = true
        break
      }
      // Key must be exactly two comma-separated parts. `split(',')` happily
      // tolerates extra commas otherwise ("0,0,extra" parses to keyQ=0,
      // keyR=0 and silently passes), which would let a tampered payload
      // sneak past coordinate enforcement.
      const parts = entry[0].split(',')
      if (parts.length !== 2) {
        errors.push({ path: entryPath, message: `hex key "${entry[0]}" must be exactly "q,r" (two comma-separated integers)` })
        walkError = true
        break
      }
      const keyQ = Number(parts[0])
      const keyR = Number(parts[1])
      if (!Number.isInteger(keyQ) || !Number.isInteger(keyR) || keyQ < 0 || keyQ >= params.width || keyR < 0 || keyR >= params.height) {
        errors.push({
          path: entryPath,
          message: `hex key "${entry[0]}" is outside the levelPackage board [0..${params.width - 1}] × [0..${params.height - 1}]`
        })
        walkError = true
        break
      }
      // Canonical form check: rebuild the key from the parsed integers and
      // compare against the input. Catches non-canonical strings like
      // " 0,0", "00,0", "+0,0" that all `Number(...)` to a valid integer
      // but would also let two different strings collide in `seen`.
      if (`${keyQ},${keyR}` !== entry[0]) {
        errors.push({ path: entryPath, message: `hex key "${entry[0]}" is not canonical (expected "${keyQ},${keyR}")` })
        walkError = true
        break
      }
      if (seen.has(entry[0])) {
        errors.push({ path: entryPath, message: `duplicate hex key "${entry[0]}"` })
        walkError = true
        break
      }
      seen.add(entry[0])
      const hexData = entry[1]
      if (!isPlainObject(hexData)) {
        errors.push({ path: `${entryPath}[1]`, message: `hex data for "${entry[0]}" must be a plain object` })
        walkError = true
        break
      }
      // hexData.q/r must be present, integer, and match the key. Without
      // this `GameState.fromJSON` happily restores hexes whose declared
      // coordinates disagree with the key, leaving the board internally
      // inconsistent.
      if (!Number.isInteger(hexData.q) || hexData.q !== keyQ) {
        errors.push({ path: `${entryPath}.q`, message: `hex.q must be integer ${keyQ} (matching key "${entry[0]}"), got ${JSON.stringify(hexData.q)}` })
        walkError = true
        break
      }
      if (!Number.isInteger(hexData.r) || hexData.r !== keyR) {
        errors.push({ path: `${entryPath}.r`, message: `hex.r must be integer ${keyR} (matching key "${entry[0]}"), got ${JSON.stringify(hexData.r)}` })
        walkError = true
        break
      }
    }
    if (!walkError && seen.size !== expectedCount) {
      errors.push({
        path: `${basePath}.hexes`,
        message: `${basePath}.hexes has ${seen.size} entries but the levelPackage board requires ${expectedCount} (${params.width} × ${params.height})`
      })
    }
  }

  // Recursively apply the same cross-checks to `initialState` so a
  // matching live engine cannot mask a foreign revert anchor.
  if (isPlainObject(engine.initialState)) {
    validateEngineSubsnapshotAgainstPackage(engine.initialState, pkg, errors, `${basePath}.initialState`)
  }
}

/**
 * Build a GameSnapshot from a live game.
 *
 * The function does not validate the `levelPackage` — callers are
 * expected to pass the same validated package the engine was started
 * from (`Playground` already keeps it on `data()`). Import will
 * re-validate the embedded package on the receiving side, which is
 * where untrusted data actually enters.
 *
 * @param {{ levelPackage: object, gameState: import('@/domain/engine/gameState.js').GameState, rngSeed?: string|null, exportedAt?: string|null }} args
 * @returns {object} JSON-serializable snapshot
 */
export function createGameSnapshot({ levelPackage, gameState, rngSeed = null, exportedAt = null } = {}) {
  if (!isPlainObject(levelPackage)) {
    throw new Error('createGameSnapshot: levelPackage must be a plain object')
  }
  if (!gameState || typeof gameState.toJSON !== 'function') {
    throw new Error('createGameSnapshot: gameState must expose toJSON()')
  }
  return {
    kind: SNAPSHOT_KIND,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: typeof exportedAt === 'string' && exportedAt
      ? exportedAt
      : new Date().toISOString(),
    levelPackage,
    rngSeed: rngSeed == null ? null : String(rngSeed),
    engine: gameState.toJSON(true)
  }
}

/**
 * Validate the shape of a parsed snapshot without applying it. The
 * embedded `levelPackage` is re-validated through `validateLevelPackage`
 * and the normalized package is attached to the returned `snapshot`.
 *
 * @param {*} input parsed JSON value (object expected)
 * @returns {{ ok: boolean, errors: Array<{path:string, message:string}>, warnings: Array<{path:string, message:string}>, snapshot: object|null }}
 */
export function validateGameSnapshot(input) {
  const errors = []
  const warnings = []

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'snapshot must be a plain object' }],
      warnings,
      snapshot: null
    }
  }

  if (input.kind !== SNAPSHOT_KIND) {
    errors.push({
      path: 'kind',
      message: `expected kind "${SNAPSHOT_KIND}", got ${JSON.stringify(input.kind)}`
    })
  }

  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    errors.push({
      path: 'schemaVersion',
      message: `schemaVersion must be a positive integer, got ${JSON.stringify(input.schemaVersion)}`
    })
  } else if (input.schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    errors.push({
      path: 'schemaVersion',
      message: `schemaVersion ${input.schemaVersion} is newer than supported ${SNAPSHOT_SCHEMA_VERSION}`
    })
  }

  if (input.rngSeed != null && typeof input.rngSeed !== 'string') {
    errors.push({ path: 'rngSeed', message: 'rngSeed must be a string or null' })
  }

  if (!isPlainObject(input.engine)) {
    errors.push({ path: 'engine', message: 'engine snapshot section is required' })
  } else {
    // Validate the live engine plus its `initialState` revert anchor as
    // full schema-v1 subsnapshots. Anything `GameState.fromJSON` would
    // silently paper over (missing rng.state, truncated hexes, missing
    // initialState fields) is caught here.
    validateEngineSubsnapshot(input.engine, errors, 'engine', { requireHistory: true })
  }

  let normalizedPackage = null
  if (!isPlainObject(input.levelPackage)) {
    errors.push({ path: 'levelPackage', message: 'levelPackage section is required' })
  } else {
    const pkgResult = validateLevelPackage(input.levelPackage)
    for (const e of pkgResult.errors) {
      errors.push({ path: `levelPackage.${e.path}`, message: e.message })
    }
    for (const w of pkgResult.warnings) {
      warnings.push({ path: `levelPackage.${w.path}`, message: w.message })
    }
    if (pkgResult.ok) {
      normalizedPackage = pkgResult.package
    }
  }

  // Cross-checks only make sense when both halves passed their independent
  // validations. Running them on a malformed engine or package would just
  // generate duplicate noise on top of the upstream errors.
  if (errors.length === 0 && isPlainObject(input.engine) && normalizedPackage) {
    validateEngineSubsnapshotAgainstPackage(input.engine, normalizedPackage, errors, 'engine')
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, snapshot: null }
  }

  return {
    ok: true,
    errors: [],
    warnings,
    snapshot: {
      ...input,
      levelPackage: normalizedPackage || input.levelPackage
    }
  }
}

/**
 * Apply a parsed snapshot transactionally.
 *
 * The function first validates the entire payload (snapshot shape + embedded
 * `LevelPackage`). Only if every check passes does it construct a fresh
 * `GameState` via `GameState.fromJSON`. Any failure short-circuits with
 * `{ ok: false, errors }` and the caller's live game stays untouched.
 *
 * `options.expectedLevelId`, when provided, enforces that the snapshot's
 * package id matches the importer's current level. This is the
 * "wrong-level rejection" required by Batch 2's acceptance criteria.
 * Callers that intentionally want to swap levels (full restore from a
 * cold app start) simply omit the option.
 *
 * @param {*} input parsed JSON value
 * @param {{ expectedLevelId?: string|null }} [options]
 * @returns {{ ok: true, warnings: Array<{path:string, message:string}>, result: { levelPackage: object, rngSeed: string|null, gameState: import('@/domain/engine/gameState.js').GameState, exportedAt: string|null } } | { ok: false, errors: Array<{path:string, message:string}>, warnings: Array<{path:string, message:string}> }}
 */
export function applyGameSnapshot(input, options = {}) {
  const validation = validateGameSnapshot(input)
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings
    }
  }

  const snapshot = validation.snapshot

  const expectedLevelId = options && options.expectedLevelId
  if (expectedLevelId != null && expectedLevelId !== '' && snapshot.levelPackage.id !== expectedLevelId) {
    return {
      ok: false,
      errors: [{
        path: 'levelPackage.id',
        message: `snapshot is for level "${snapshot.levelPackage.id}" but current game is on "${expectedLevelId}"`
      }],
      warnings: validation.warnings
    }
  }

  let gameState
  try {
    gameState = GameState.fromJSON(snapshot.engine)
  } catch (err) {
    return {
      ok: false,
      errors: [{
        path: 'engine',
        message: err && err.message ? err.message : String(err)
      }],
      warnings: validation.warnings
    }
  }

  return {
    ok: true,
    warnings: validation.warnings,
    result: {
      levelPackage: snapshot.levelPackage,
      rngSeed: snapshot.rngSeed == null ? null : String(snapshot.rngSeed),
      gameState,
      exportedAt: typeof snapshot.exportedAt === 'string' ? snapshot.exportedAt : null
    }
  }
}

/**
 * Parse a snapshot JSON string and apply it. Convenience wrapper for UI
 * import paths that hand off file contents directly.
 *
 * @param {string} jsonString
 * @param {{ expectedLevelId?: string|null }} [options]
 */
export function applyGameSnapshotFromJSON(jsonString, options = {}) {
  let parsed
  try {
    parsed = JSON.parse(jsonString)
  } catch (err) {
    return {
      ok: false,
      errors: [{ path: '', message: `invalid JSON: ${err && err.message ? err.message : String(err)}` }],
      warnings: []
    }
  }
  return applyGameSnapshot(parsed, options)
}

/**
 * Probe whether a parsed JSON value looks like a `GameSnapshot` envelope
 * (carries the magic `kind` tag). Used by the UI import path to decide
 * between snapshot apply and the legacy history-only import.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isGameSnapshotEnvelope(value) {
  return isPlainObject(value) && value.kind === SNAPSHOT_KIND
}
