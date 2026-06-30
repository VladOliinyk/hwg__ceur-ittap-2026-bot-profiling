/**
 * Утиліти для збереження та завантаження стану гри.
 *
 * Public contract (Batch 6 — Persistence Beyond localStorage):
 *
 *   loadGameState() → { ok: true, state, warnings }
 *                   | { ok: false, code, error, details, warnings }
 *
 *   saveGameState(state) → { ok: true }
 *                        | { ok: false, code, error }
 *
 * Failure modes are surfaced through `code` so the UI can choose copy
 * (corrupted JSON vs forward version vs quota full vs engine restore
 * failure) instead of guessing from a free-text message. Legacy v0
 * envelopes (no `version` field, pre-Batch-1 saves) are migrated to v1
 * with a structured warning rather than silently coerced.
 *
 * Acceptance criteria for this module (per IMPLEMENTATION_BATCHES_2026-05-21.md):
 *  1. Corrupted persistence never throws through app mount → all parse /
 *     validate / restore failures stay inside try/catch and surface as
 *     `{ ok: false, code }`.
 *  2. User gets a clear restore failure message → `code` + `error` +
 *     `details[]` are sufficient for `$notify.error(title, body)`.
 *  3. Large snapshot strategy documented → see DOMAIN_MODEL.md →
 *     Persistence section (file-backed `GameSnapshot` export is the
 *     escape hatch when localStorage quota is hit).
 */

import { GameState } from '@/domain/engine/gameState.js'
import { GameUnit } from '@/domain/engine/gameUnits.js'

const STORAGE_KEY = 'hexWarGameState'

/**
 * Current persistence envelope version. Bump only on incompatible shape
 * changes. The validator treats a missing `version` as legacy v0 and
 * normalizes to this value with a migration warning.
 */
export const SNAPSHOT_VERSION = 1

/**
 * Highest envelope version this build can load. A saved snapshot with a
 * larger `version` is rejected as `UNSUPPORTED_VERSION` so a downgrade
 * cannot silently reinterpret newer fields.
 */
export const LATEST_SUPPORTED_VERSION = 1

/**
 * Structured restore error codes returned by `loadGameState`. The string
 * value is part of the public contract — UI code matches on it to pick
 * notification copy.
 */
export const RESTORE_ERROR_CODES = Object.freeze({
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  CORRUPTED_JSON: 'CORRUPTED_JSON',
  INVALID_SHAPE: 'INVALID_SHAPE',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  ENGINE_RESTORE_FAILED: 'ENGINE_RESTORE_FAILED'
})

/**
 * Structured save error codes returned by `saveGameState`. Same contract
 * idea as `RESTORE_ERROR_CODES`.
 */
export const SAVE_ERROR_CODES = Object.freeze({
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  SERIALIZATION_FAILED: 'SERIALIZATION_FAILED'
})

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Явний boolean для збережень / подій (уникає 0, "false", [] тощо як «увімкнено»).
 * @param {unknown} value
 * @param {boolean} defaultValue якщо value не true/false і не 'true'/'false'
 */
export function normalizeBool(value, defaultValue) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return defaultValue
}

/**
 * Cheap check that `localStorage` is at least present and accessible.
 * Returns false in SSR (no global at all). Cookies-blocked Safari
 * exposes a `localStorage` object that throws on every write — that
 * case is NOT papered over here; instead, `saveGameState` /
 * `loadGameState` catch the thrown error at the actual call site and
 * classify it (a quota throw becomes `QUOTA_EXCEEDED`; everything else
 * becomes `STORAGE_UNAVAILABLE`).
 *
 * A previous version of this module performed a write-then-remove
 * probe here, which classified every write failure as
 * `STORAGE_UNAVAILABLE` — including the case where storage was already
 * at quota. That broke the documented `QUOTA_EXCEEDED` UX (the user
 * got "Save Disabled" instead of "Storage Full" with the Timeline
 * snapshot recovery path). The probe is intentionally gone.
 */
function isLocalStorageSupported() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    // Accessing `localStorage` itself can throw in some sandboxed
    // contexts even before any read/write.
    return false
  }
}

/**
 * Detect the various browser-specific names for the quota-exceeded
 * DOMException. Chromium and the W3C spec use `QuotaExceededError`
 * (code 22), older Firefox uses `NS_ERROR_DOM_QUOTA_REACHED` (code 1014).
 */
function isQuotaError(err) {
  if (!err) return false
  // happy-dom / jsdom set `name` on a regular Error rather than throwing
  // a real DOMException, so name + code checks have to be standalone.
  if (err.name === 'QuotaExceededError') return true
  if (err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (err.code === 22 || err.code === 1014) return true
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'QuotaExceededError' || err.code === 22
  }
  return false
}

/**
 * Structure of an issue produced by the validator. `path` is a JSON-ish
 * dotted path into the saved envelope (e.g. `gameState.hexes`). The UI's
 * `formatLevelIssues` helper accepts the same shape.
 *
 * @typedef {{ path: string, message: string }} ValidationIssue
 */

/**
 * Validate the shape of a parsed persistence envelope without touching
 * `GameState.fromJSON`. Pure function — does not read from or write to
 * localStorage. Suitable for direct unit testing.
 *
 * Migration rule: a missing `version` field is treated as the
 * pre-Batch-1 v0 schema and normalized to `SNAPSHOT_VERSION` with a
 * warning. A `version > LATEST_SUPPORTED_VERSION` is rejected as a hard
 * error — the receiver cannot guarantee it understands new fields, so
 * silently truncating would risk corruption on the next save.
 *
 * @param {*} parsed value previously produced by `JSON.parse(localStorage[STORAGE_KEY])`
 * @returns {{
 *   ok: boolean,
 *   errors: ValidationIssue[],
 *   warnings: ValidationIssue[],
 *   normalized: object | null
 * }}
 */
export function validatePersistedSnapshot(parsed) {
  const errors = []
  const warnings = []

  if (!isPlainObject(parsed)) {
    errors.push({ path: '', message: 'Saved snapshot must be a plain JSON object.' })
    return { ok: false, errors, warnings, normalized: null }
  }

  let normalizedVersion = parsed.version
  if (normalizedVersion == null) {
    warnings.push({
      path: 'version',
      message: 'Legacy save without `version` field — migrated to v1 schema.'
    })
    normalizedVersion = SNAPSHOT_VERSION
  } else if (!Number.isInteger(normalizedVersion) || normalizedVersion < 1) {
    errors.push({
      path: 'version',
      message: `version must be a positive integer, got ${JSON.stringify(parsed.version)}`
    })
  } else if (normalizedVersion > LATEST_SUPPORTED_VERSION) {
    errors.push({
      path: 'version',
      message: `Saved game version ${normalizedVersion} is newer than supported ${LATEST_SUPPORTED_VERSION}. Update the app to load it.`
    })
  }

  if (parsed.gameState !== undefined && parsed.gameState !== null) {
    if (!isPlainObject(parsed.gameState)) {
      errors.push({ path: 'gameState', message: 'gameState section must be a plain object or null.' })
    } else {
      const gs = parsed.gameState
      if (!Array.isArray(gs.hexes)) {
        errors.push({ path: 'gameState.hexes', message: 'gameState.hexes must be an array.' })
      }
      if (!Array.isArray(gs.units)) {
        errors.push({ path: 'gameState.units', message: 'gameState.units must be an array.' })
      }
      if (gs.width != null && (!Number.isInteger(gs.width) || gs.width <= 0)) {
        errors.push({
          path: 'gameState.width',
          message: `gameState.width must be a positive integer, got ${JSON.stringify(gs.width)}`
        })
      }
      if (gs.height != null && (!Number.isInteger(gs.height) || gs.height <= 0)) {
        errors.push({
          path: 'gameState.height',
          message: `gameState.height must be a positive integer, got ${JSON.stringify(gs.height)}`
        })
      }
      // RNG block is optional for legacy v0 saves. When present it must be
      // `{ state: finite number }` so `createRng({ state })` resumes the
      // exact stream; anything malformed downgrades to the Math.random
      // fallback (warning, not error — the rest of the save is still
      // restorable, just non-deterministic).
      if (gs.rng !== undefined && gs.rng !== null) {
        if (!isPlainObject(gs.rng) || typeof gs.rng.state !== 'number' || !Number.isFinite(gs.rng.state)) {
          warnings.push({
            path: 'gameState.rng',
            message: 'gameState.rng is malformed — RNG will fall back to Math.random instead of resuming the persisted stream.'
          })
        }
      } else {
        warnings.push({
          path: 'gameState.rng',
          message: 'gameState.rng is missing — legacy save, RNG will fall back to Math.random.'
        })
      }
    }
  }

  if (parsed.rngSeed != null && typeof parsed.rngSeed !== 'string') {
    warnings.push({ path: 'rngSeed', message: 'rngSeed is not a string — will be coerced on restore.' })
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, normalized: null }
  }

  return {
    ok: true,
    errors: [],
    warnings,
    normalized: { ...parsed, version: normalizedVersion }
  }
}

/**
 * Structure of the in-memory DTO produced by `loadGameState` on a fresh
 * app start (nothing saved yet).
 */
const createEmptyState = () => ({
  version: SNAPSHOT_VERSION,
  levelId: null,
  /**
   * Original seed string used to create the engine RNG. The full RNG
   * stream is recovered from the snapshot inside `gameState.rng`;
   * `rngSeed` is kept separately so the UI can display the seed and
   * reuse it for a "new game, same seed" flow without re-deriving it
   * from the engine state.
   */
  rngSeed: null,
  mapData: null,
  terrainTypes: null,
  unitsData: null,
  movesData: null,
  gameState: null,
  selectedHex: null,
  selectedUnit: null,
  selectedHexDropdownPosition: { x: 100, y: 100 },
  selectedHexDropdownVisible: false,
  /** Показ плаваючої панелі вибору (× лише ховає панель; вибір гекса не скидається). */
  showFloatingPanel: true,
  lastSaved: null
})

/**
 * Зберігає повний стан гри в localStorage.
 *
 * Returns a structured result instead of the legacy boolean so the UI can
 * tell quota-exceeded (user should export via Timeline → snapshot) apart
 * from a generic storage failure.
 *
 * @returns {{ ok: true } | { ok: false, code: string, error: string }}
 */
export function saveGameState(state) {
  if (!isLocalStorageSupported()) {
    return {
      ok: false,
      code: SAVE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: 'Local storage is unavailable in this environment.'
    }
  }

  let payload
  try {
    payload = {
      version: SNAPSHOT_VERSION,
      levelId: state.levelId ?? null,
      // Original RNG seed string. The continuation state is inside
      // `gameState.rng`; this field exists so the UI can re-display
      // the seed and reuse it for a "new game, same seed" flow.
      rngSeed: state.rngSeed ?? null,
      // Зберігаємо «сирі» дані рівня, якщо вони є в памʼяті
      mapData: state.mapData ?? null,
      terrainTypes: state.terrainTypes ?? null,
      unitsData: state.unitsData ?? null,
      movesData: state.movesData ?? null,
      // GameState серіалізуємо через toJSON(true)
      gameState: state.gameState ? state.gameState.toJSON(true) : null,
      selectedHex: state.selectedHex ?? null,
      selectedUnit: state.selectedUnit ? state.selectedUnit.toJSON() : null,
      selectedHexDropdownPosition: state.selectedHexDropdownPosition || { x: 100, y: 100 },
      selectedHexDropdownVisible: state.selectedHexDropdownVisible || false,
      showFloatingPanel: normalizeBool(state.showFloatingPanel, true),
      lastSaved: new Date().toISOString()
    }
  } catch (err) {
    return {
      ok: false,
      code: SAVE_ERROR_CODES.SERIALIZATION_FAILED,
      error: err && err.message ? err.message : 'Failed to build save payload.'
    }
  }

  let serialized
  try {
    serialized = JSON.stringify(payload)
  } catch (err) {
    return {
      ok: false,
      code: SAVE_ERROR_CODES.SERIALIZATION_FAILED,
      error: err && err.message ? err.message : 'Failed to stringify game state.'
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized)
    return { ok: true }
  } catch (err) {
    if (isQuotaError(err)) {
      return {
        ok: false,
        code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
        error: 'Local storage quota exceeded. Export the game via Timeline → snapshot to keep your progress.'
      }
    }
    return {
      ok: false,
      code: SAVE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: err && err.message ? err.message : 'Failed to write to local storage.'
    }
  }
}

/**
 * Завантажує стан гри з localStorage.
 *
 * @returns {{ ok: true, state: object, warnings: ValidationIssue[] }
 *          | { ok: false, code: string, error: string, details: ValidationIssue[], warnings: ValidationIssue[] }}
 */
export function loadGameState() {
  if (!isLocalStorageSupported()) {
    // Treat as "no saved state": a missing-storage environment is not a
    // user-visible failure of the restore flow, just an empty starting
    // condition. The Playground already handles `state.gameState == null`
    // gracefully on mount.
    return { ok: true, state: createEmptyState(), warnings: [] }
  }

  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (err) {
    return {
      ok: false,
      code: RESTORE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: err && err.message ? err.message : 'Local storage read failed.',
      details: [],
      warnings: []
    }
  }

  if (raw == null) {
    return { ok: true, state: createEmptyState(), warnings: [] }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      ok: false,
      code: RESTORE_ERROR_CODES.CORRUPTED_JSON,
      error: 'Saved game JSON is corrupted and cannot be parsed.',
      details: [{ path: '', message: err && err.message ? err.message : String(err) }],
      warnings: []
    }
  }

  const validation = validatePersistedSnapshot(parsed)
  if (!validation.ok) {
    // Distinguish "future-version" from generic shape failure so the UI
    // can ask the user to update the app rather than show "shape invalid".
    const versionErr = validation.errors.find(
      e => e.path === 'version' && /newer than supported/i.test(e.message)
    )
    const code = versionErr
      ? RESTORE_ERROR_CODES.UNSUPPORTED_VERSION
      : RESTORE_ERROR_CODES.INVALID_SHAPE
    return {
      ok: false,
      code,
      error: versionErr ? versionErr.message : 'Saved game shape is invalid and was not restored.',
      details: validation.errors,
      warnings: validation.warnings
    }
  }

  const normalized = validation.normalized
  const warnings = [...validation.warnings]

  let gameState = null
  if (normalized.gameState) {
    try {
      gameState = GameState.fromJSON(normalized.gameState)
    } catch (err) {
      return {
        ok: false,
        code: RESTORE_ERROR_CODES.ENGINE_RESTORE_FAILED,
        error: 'Engine snapshot could not be restored.',
        details: [{
          path: 'gameState',
          message: err && err.message ? err.message : String(err)
        }],
        warnings
      }
    }
  }

  let selectedUnit = null
  if (normalized.selectedUnit) {
    try {
      selectedUnit = GameUnit.fromJSON(normalized.selectedUnit)
    } catch (err) {
      // Non-fatal: the selected unit is a UI hint, not engine state.
      // Drop it but keep the rest of the snapshot loadable.
      warnings.push({
        path: 'selectedUnit',
        message: `selectedUnit could not be rehydrated: ${err && err.message ? err.message : String(err)}`
      })
    }
  }

  const state = {
    version: normalized.version,
    levelId: normalized.levelId || null,
    rngSeed: normalized.rngSeed != null ? String(normalized.rngSeed) : null,
    mapData: normalized.mapData || null,
    terrainTypes: normalized.terrainTypes || null,
    unitsData: normalized.unitsData || null,
    movesData: normalized.movesData || null,
    gameState,
    selectedHex: normalized.selectedHex || null,
    selectedUnit,
    selectedHexDropdownPosition: normalized.selectedHexDropdownPosition || { x: 100, y: 100 },
    selectedHexDropdownVisible: normalized.selectedHexDropdownVisible || false,
    showFloatingPanel: normalizeBool(normalized.showFloatingPanel, true),
    lastSaved: normalized.lastSaved || null
  }

  console.log('Game state loaded from localStorage')
  return { ok: true, state, warnings }
}

/**
 * Очищає збережений стан гри. Returns false on storage failure but does
 * not throw — caller can ignore the result safely.
 */
export function clearGameState() {
  if (!isLocalStorageSupported()) return false
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('Game state cleared from localStorage')
    return true
  } catch (error) {
    console.error('Failed to clear game state:', error)
    return false
  }
}

/**
 * Перевіряє чи є збережений стан. Robust to storage being unavailable.
 */
export function hasSavedGameState() {
  if (!isLocalStorageSupported()) return false
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Отримує інформацію про останнє збереження. Returns null when no save
 * exists, storage is unavailable, or the saved blob is unparseable —
 * never throws.
 */
export function getLastSavedInfo() {
  if (!isLocalStorageSupported()) return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null

    const parsed = JSON.parse(saved)
    return {
      lastSaved: parsed.lastSaved,
      hasMap: !!parsed.mapData,
      hasGameState: !!parsed.gameState,
      hasUnits:
        !!parsed.gameState &&
        Array.isArray(parsed.gameState.units) &&
        parsed.gameState.units.length > 0
    }
  } catch (error) {
    console.error('Failed to get last saved info:', error)
    return null
  }
}
