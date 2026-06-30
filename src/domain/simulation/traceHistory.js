import { fingerprintLevelPackage } from '@/domain/level/builderPlaytestLevels.js'
import {
  isQuotaExceededError,
  removeStoredSimulationTraces,
  simulationTraceStorageKey
} from './traceStorage.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRACE_HISTORY_INDEX_KEY = 'hwg:simulation-trace-index'
export const SIMULATION_LEVEL_STORAGE_PREFIX = 'hwg:simulation-level:'
export const BUILDER_EPOCH_KEY = 'hwg:simulation-builder-epoch'
export const DEFAULT_TRACE_HISTORY_CAP = 10

export function simulationLevelStorageKey(fingerprint) {
  return SIMULATION_LEVEL_STORAGE_PREFIX + fingerprint
}

// ---------------------------------------------------------------------------
// Storage guard
// ---------------------------------------------------------------------------

function isCapableStorage(storage) {
  return (
    storage != null &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function' &&
    typeof storage.key === 'function' &&
    typeof storage.length === 'number'
  )
}

// ---------------------------------------------------------------------------
// Index read / write
// ---------------------------------------------------------------------------

/**
 * Read the trace history index from storage.
 * Returns an array (oldest first, newest last).
 * Falls back to [] on absent key, malformed JSON, or non-array result.
 */
export function readTraceHistoryIndex(storage) {
  if (!isCapableStorage(storage)) return []
  try {
    const raw = storage.getItem(TRACE_HISTORY_INDEX_KEY)
    if (raw == null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTraceHistoryIndex(storage, index) {
  storage.setItem(TRACE_HISTORY_INDEX_KEY, JSON.stringify(index))
}

// ---------------------------------------------------------------------------
// Level-package GC helpers
// ---------------------------------------------------------------------------

/**
 * Collect all SIMULATION_LEVEL_STORAGE_PREFIX keys currently in storage.
 */
function allLevelKeys(storage) {
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (typeof k === 'string' && k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX)) {
      keys.push(k)
    }
  }
  return keys
}

/**
 * Remove level-package keys that are no longer referenced by any entry in
 * `remainingIndex`.
 */
function gcOrphanLevelPackages(storage, remainingIndex) {
  const referenced = new Set(
    remainingIndex
      .map(e => e.levelFingerprint)
      .filter(fp => typeof fp === 'string' && fp !== '')
      .map(fp => simulationLevelStorageKey(fp))
  )
  for (const key of allLevelKeys(storage)) {
    if (!referenced.has(key)) {
      storage.removeItem(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Core write
// ---------------------------------------------------------------------------

/**
 * Append (or upsert) a trace to the capped history.
 *
 * @param {Storage} storage - A Storage-like object.
 * @param {{ metadata: object, trace: object }} payload
 *   metadata   - Opaque caller object; MUST contain `traceId` string.
 *   trace      - Full simulation trace (with `levelPackage` top-level field).
 * @param {{ cap?: number }} options
 * @returns {{ ok: boolean, quotaExceeded: boolean, evictedTraceIds: string[] }}
 */
export function appendTraceToHistory(storage, { metadata, trace }, { cap = DEFAULT_TRACE_HISTORY_CAP } = {}) {
  if (!isCapableStorage(storage)) return { ok: false, quotaExceeded: false, evictedTraceIds: [] }

  if (!metadata || typeof metadata.traceId !== 'string' || !metadata.traceId) {
    throw new Error('[traceHistory] appendTraceToHistory: metadata.traceId must be a non-empty string')
  }

  // A cap < 1 would evict the just-appended entry, orphaning its trace blob in
  // storage (written but unreachable via the empty index). Reject it outright.
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error('[traceHistory] appendTraceToHistory: cap must be a positive integer')
  }

  const { traceId } = metadata

  // --- Compute fingerprint ---
  const fp =
    trace && trace.levelPackage != null
      ? fingerprintLevelPackage(trace.levelPackage)
      : ''

  // --- Write slim trace (strip levelPackage, add levelFingerprint) ---
  const slimTrace = { ...(trace || {}), levelFingerprint: fp }
  delete slimTrace.levelPackage
  const traceKey = simulationTraceStorageKey(traceId)
  const levelPkgJson = fp !== '' ? JSON.stringify(trace.levelPackage) : null
  const lpKey = fp !== '' ? simulationLevelStorageKey(fp) : null

  // --- Upsert into index ---
  let index = readTraceHistoryIndex(storage)
  const existingIdx = index.findIndex(e => e.traceId === traceId)
  const entry = { ...metadata, levelFingerprint: fp }
  if (existingIdx >= 0) {
    index[existingIdx] = entry
  } else {
    index.push(entry)
  }

  // --- Trim to cap ---
  const evictedTraceIds = []
  if (index.length > cap) {
    const evicted = index.splice(0, index.length - cap)
    for (const e of evicted) {
      storage.removeItem(simulationTraceStorageKey(e.traceId))
      evictedTraceIds.push(e.traceId)
    }
    gcOrphanLevelPackages(storage, index)
  }

  // --- Quota degrade-loop ---
  // All storage writes are inside attemptWrite so quota errors from any of
  // them are caught here and trigger eviction of the oldest entry.
  //
  // Level-pkg dedup: write only if not already present (checked each attempt
  // because a previous eviction + GC may have removed it, or it may already
  // exist from a prior run of the same level).

  function attemptWrite(currentIndex) {
    if (lpKey !== null && storage.getItem(lpKey) == null) {
      storage.setItem(lpKey, levelPkgJson)
    }
    storage.setItem(traceKey, JSON.stringify(slimTrace))
    writeTraceHistoryIndex(storage, currentIndex)
  }

  let currentIndex = [...index]
  for (;;) {
    try {
      attemptWrite(currentIndex)
      return { ok: true, quotaExceeded: false, evictedTraceIds }
    } catch (err) {
      if (!isQuotaExceededError(err)) throw err

      // Evict oldest that is NOT the one we're currently inserting
      const evictIdx = currentIndex.findIndex(e => e.traceId !== traceId)
      if (evictIdx === -1) {
        // Nothing left to evict — give up. Attempt to persist the empty index;
        // if that also throws (e.g. storage always throws), silently ignore it.
        try { writeTraceHistoryIndex(storage, []) } catch { /* ignore */ }
        return { ok: false, quotaExceeded: true, evictedTraceIds }
      }
      const [evictedEntry] = currentIndex.splice(evictIdx, 1)
      storage.removeItem(simulationTraceStorageKey(evictedEntry.traceId))
      evictedTraceIds.push(evictedEntry.traceId)
      gcOrphanLevelPackages(storage, currentIndex)
    }
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Reconstitute a full trace from the history, rehydrating levelPackage.
 * Returns null if the trace blob is absent or malformed.
 */
export function readTraceFromHistory(storage, traceId) {
  if (!isCapableStorage(storage)) return null
  try {
    const raw = storage.getItem(simulationTraceStorageKey(traceId))
    if (raw == null) return null
    const slimTrace = JSON.parse(raw)
    const { levelFingerprint, ...rest } = slimTrace

    if (typeof levelFingerprint === 'string' && levelFingerprint !== '') {
      const pkgRaw = storage.getItem(simulationLevelStorageKey(levelFingerprint))
      if (pkgRaw != null) {
        try {
          rest.levelPackage = JSON.parse(pkgRaw)
        } catch {
          // level pkg JSON malformed — leave levelPackage absent
        }
      }
      // If pkgRaw is null, levelPackage is simply absent — don't throw
    }

    return rest
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

/**
 * Remove a single trace from history: blob, index entry, GC orphan level pkgs.
 * Returns the updated index.
 */
export function removeTraceFromHistory(storage, traceId) {
  if (!isCapableStorage(storage)) return []
  storage.removeItem(simulationTraceStorageKey(traceId))
  let index = readTraceHistoryIndex(storage)
  index = index.filter(e => e.traceId !== traceId)
  gcOrphanLevelPackages(storage, index)
  writeTraceHistoryIndex(storage, index)
  return index
}

/**
 * Clear all trace history: index, all trace blobs, all level-package blobs.
 * Leaves BUILDER_EPOCH_KEY intact.
 */
export function clearTraceHistory(storage) {
  if (!isCapableStorage(storage)) return
  storage.removeItem(TRACE_HISTORY_INDEX_KEY)
  removeStoredSimulationTraces(storage)
  // Remove all level-package keys
  for (const key of allLevelKeys(storage)) {
    storage.removeItem(key)
  }
}

// ---------------------------------------------------------------------------
// Epoch primitives
// ---------------------------------------------------------------------------

/** Read builder epoch string; returns '' if absent. */
export function readBuilderEpoch(storage) {
  if (!isCapableStorage(storage)) return ''
  const val = storage.getItem(BUILDER_EPOCH_KEY)
  return val == null ? '' : String(val)
}

/** Write builder epoch value (coerced to string). */
export function writeBuilderEpoch(storage, value) {
  if (!isCapableStorage(storage)) return
  storage.setItem(BUILDER_EPOCH_KEY, String(value))
}
