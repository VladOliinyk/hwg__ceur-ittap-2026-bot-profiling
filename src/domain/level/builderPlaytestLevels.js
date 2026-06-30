import { validateLevelPackage } from './validateLevelPackage.js'

export const BUILDER_PLAYTEST_QUERY_KEY = 'builderLevelToken'
export const BUILDER_PLAYTEST_SOURCE = 'builder'
// Records stored under this key reserve the `invalid` and `errors` keys for the quarantine format.
export const BUILDER_PLAYTEST_STORAGE_KEY = 'hexWarBuilderPlaytestLevels'
export const BUILDER_PLAYTEST_HANDOFF_PREFIX = 'hexWarBuilderPlaytestHandoff:'
export const MAX_BUILDER_PLAYTEST_LEVELS = 20
export const BUILDER_PLAYTEST_HANDOFF_TTL_MS = 30 * 60 * 1000
export const MAX_BUILDER_PLAYTEST_HANDOFFS = 20
const DEFAULT_LEVEL_ID = 'level_000'

const memoryHandoffs = new Map()

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function safeStorage(name) {
  if (typeof window === 'undefined' || window == null) return null
  try {
    return window[name] || null
  } catch (err) {
    return null
  }
}

function readJson(storage, key, fallback) {
  if (!storage) return fallback
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (err) {
    return fallback
  }
}

function writeJson(storage, key, value) {
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    return false
  }
}

function nowMs() {
  const value = Date.now()
  return Number.isFinite(value) ? value : new Date().getTime()
}

function randomTokenPart() {
  const cryptoApi = typeof crypto !== 'undefined'
    ? crypto
    : (typeof window !== 'undefined' ? window.crypto : null)
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${nowMs().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function makeHandoffToken(id) {
  const safeId = typeof id === 'string' && id.trim() ? id.trim() : DEFAULT_LEVEL_ID
  return `${safeId}_${nowMs().toString(36)}_${randomTokenPart()}`
}

function normalizeExpiresAt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : nowMs() + BUILDER_PLAYTEST_HANDOFF_TTL_MS
}

function isExpiredHandoff(record) {
  return normalizeExpiresAt(record && record.expiresAt) <= nowMs()
}

function pruneMemoryHandoffs() {
  for (const [token, record] of memoryHandoffs.entries()) {
    if (isExpiredHandoff(record)) memoryHandoffs.delete(token)
  }
  while (memoryHandoffs.size > MAX_BUILDER_PLAYTEST_HANDOFFS) {
    const oldestToken = memoryHandoffs.keys().next().value
    if (oldestToken == null) break
    memoryHandoffs.delete(oldestToken)
  }
}

function pruneSessionHandoffs(storage) {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (typeof key === 'string' && key.startsWith(BUILDER_PLAYTEST_HANDOFF_PREFIX)) keys.push(key)
  }
  const entries = []
  for (const key of keys) {
    const record = readJson(storage, key, null)
    if (!record || isExpiredHandoff(record)) {
      try {
        storage.removeItem(key)
      } catch (err) {
        // Best-effort cleanup only.
      }
      continue
    }
    entries.push({ key, expiresAt: normalizeExpiresAt(record.expiresAt) })
  }
  entries
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .slice(MAX_BUILDER_PLAYTEST_HANDOFFS)
    .forEach(entry => {
      try {
        storage.removeItem(entry.key)
      } catch (err) {
        // Best-effort cleanup only.
      }
    })
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings
      .filter(issue => issue && typeof issue === 'object')
      .map(issue => ({
        path: typeof issue.path === 'string' ? issue.path : '',
        message: typeof issue.message === 'string' ? issue.message : 'unknown issue'
      }))
    : []
}

function uniqueWarnings(warnings) {
  const seen = new Set()
  const out = []
  for (const issue of warnings) {
    const key = `${issue.path}\n${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
  }
  return out
}

/**
 * Classify a record exactly once: valid packages are normalized to the
 * canonical persisted shape, packages that fail validation are preserved
 * as quarantined entries (raw record plus `invalid: true` and the
 * validator `errors`), and structurally hopeless values (not a plain
 * object, no package object, no usable id) are dropped.
 *
 * @param {*} record
 * @returns {{ valid: object|null, quarantined: object|null }|null}
 */
function classifyBuilderRecord(record) {
  if (!isPlainObject(record) || !isPlainObject(record.package)) return null
  const result = validateLevelPackage(record.package)
  if (!result.ok) {
    return {
      valid: null,
      quarantined: { ...record, invalid: true, errors: normalizeWarnings(result.errors) }
    }
  }
  const pkg = result.package || record.package
  const id = typeof pkg.id === 'string' && pkg.id.trim() ? pkg.id.trim() : null
  // Unreachable by contract: validateLevelPackage guarantees a safe non-empty id on ok (defense-in-depth only).
  if (!id) return null
  return {
    valid: {
      id,
      label: typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id,
      source: BUILDER_PLAYTEST_SOURCE,
      package: pkg,
      warnings: uniqueWarnings(normalizeWarnings(record.warnings).concat(normalizeWarnings(result.warnings))),
      createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString(),
      updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : new Date().toISOString()
    },
    quarantined: null
  }
}

function normalizeBuilderRecord(record) {
  const classified = classifyBuilderRecord(record)
  return classified ? classified.valid : null
}

function quarantinedRecordId(record) {
  const pkg = record && record.package
  const id = pkg && typeof pkg.id === 'string' ? pkg.id.trim() : ''
  return id || null
}

/**
 * Read the persisted records, validating each one exactly once. Quarantined
 * records are kept in storage while the cap allows, so a stricter validator
 * does not destroy saved levels; a later, more permissive validator can
 * revive them.
 *
 * @returns {{ valid: object[], quarantined: object[] }}
 */
function readPersistedBuilderRecords() {
  const storage = safeStorage('localStorage')
  const raw = readJson(storage, BUILDER_PLAYTEST_STORAGE_KEY, [])
  const list = Array.isArray(raw) ? raw : []
  const valid = []
  const quarantined = []
  for (const record of list) {
    const classified = classifyBuilderRecord(record)
    if (!classified) continue
    if (classified.valid) valid.push(classified.valid)
    else quarantined.push(classified.quarantined)
  }
  if (quarantined.length > 0) {
    console.warn(
      `[builderPlaytestLevels] ${quarantined.length} builder playtest record(s) failed validation and stay quarantined in "${BUILDER_PLAYTEST_STORAGE_KEY}".`
    )
  }
  return { valid, quarantined }
}

/**
 * Persist already-classified records without re-validating them. Valid
 * records take priority over quarantined ones for the storage cap, and the
 * write degrades by dropping the trailing (quarantined first, then oldest)
 * entries when the storage rejects the payload, e.g. on quota errors.
 */
function writePersistedBuilderRecords(validRecords, quarantinedRecords) {
  const storage = safeStorage('localStorage')
  if (!storage) return false
  const cappedValid = validRecords.slice(0, MAX_BUILDER_PLAYTEST_LEVELS)
  let next = cappedValid
    .concat(quarantinedRecords)
    .slice(0, MAX_BUILDER_PLAYTEST_LEVELS)
  const droppedQuarantined = cappedValid.length + quarantinedRecords.length - next.length
  if (droppedQuarantined > 0) {
    console.warn(
      `[builderPlaytestLevels] ${droppedQuarantined} quarantined builder playtest record(s) dropped from "${BUILDER_PLAYTEST_STORAGE_KEY}" because valid records fill the storage cap.`
    )
  }
  while (next.length > 0) {
    if (writeJson(storage, BUILDER_PLAYTEST_STORAGE_KEY, next)) return true
    next = next.slice(0, next.length - 1)
  }
  try {
    storage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  } catch (err) {
    // Ignore storage cleanup failures; callers treat false as advisory.
  }
  return false
}

function stableStringifyInner(value, seen) {
  if (value === undefined) return 'null'
  if (typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"'
    seen.add(value)
    const out = `[${value.map(item => stableStringifyInner(item, seen)).join(',')}]`
    seen.delete(value)
    return out
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return '"[Circular]"'
    seen.add(value)
    const out = `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringifyInner(value[key], seen)}`
    ).join(',')}}`
    seen.delete(value)
    return out
  }
  const serialized = JSON.stringify(value)
  return serialized === undefined ? 'null' : serialized
}

export function stableStringify(value) {
  return stableStringifyInner(value, new WeakSet())
}

function fnv1a32(value) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function fingerprintLevelPackage(pkg) {
  return fnv1a32(stableStringify(pkg))
}

/**
 * Persist a record that is already normalized, so the package is not
 * validated again. Quarantined records are merged back, except entries
 * superseded by the incoming id. The returned `levels` is the intended
 * list and may exceed what actually survived quota degradation.
 */
function persistNormalizedBuilderLevel(normalized) {
  const { valid, quarantined } = readPersistedBuilderRecords()
  const next = [
    { ...normalized, updatedAt: new Date().toISOString() },
    ...valid.filter(level => level.id !== normalized.id)
  ].slice(0, MAX_BUILDER_PLAYTEST_LEVELS)
  const keptQuarantined = quarantined.filter(record => quarantinedRecordId(record) !== normalized.id)
  const ok = writePersistedBuilderRecords(next, keptQuarantined)
  return { ok, levels: next }
}

export function persistBuilderPlaytestLevel(record) {
  const normalized = normalizeBuilderRecord(record)
  if (!normalized) return { ok: false, levels: loadPersistedBuilderPlaytestLevels() }
  return persistNormalizedBuilderLevel(normalized)
}

export function loadPersistedBuilderPlaytestLevels() {
  return readPersistedBuilderRecords().valid
}

export function removePersistedBuilderPlaytestLevel(id) {
  const safeId = typeof id === 'string' ? id.trim() : ''
  const { valid, quarantined } = readPersistedBuilderRecords()
  if (!safeId || safeId === DEFAULT_LEVEL_ID) return valid
  const next = valid.filter(level => level.id !== safeId)
  const keptQuarantined = quarantined.filter(record => quarantinedRecordId(record) !== safeId)
  writePersistedBuilderRecords(next, keptQuarantined)
  return next
}

export function createBuilderPlaytestHandoff(record) {
  const normalized = normalizeBuilderRecord(record)
  if (!normalized) return null
  pruneMemoryHandoffs()
  const token = makeHandoffToken(normalized.id)
  const handoff = {
    token,
    expiresAt: nowMs() + BUILDER_PLAYTEST_HANDOFF_TTL_MS,
    ...normalized
  }
  memoryHandoffs.set(token, handoff)
  pruneMemoryHandoffs()
  const storage = safeStorage('sessionStorage')
  writeJson(storage, `${BUILDER_PLAYTEST_HANDOFF_PREFIX}${token}`, handoff)
  pruneSessionHandoffs(storage)
  // Already normalized above; skip persistBuilderPlaytestLevel so the new
  // package is not validated a second time in the same handoff.
  persistNormalizedBuilderLevel(normalized)
  return token
}

export function consumeBuilderPlaytestHandoff(token) {
  const safeToken = typeof token === 'string' ? token.trim() : ''
  if (!safeToken) return null
  pruneMemoryHandoffs()
  const memoryRecord = memoryHandoffs.get(safeToken)
  memoryHandoffs.delete(safeToken)
  const storage = safeStorage('sessionStorage')
  pruneSessionHandoffs(storage)
  const key = `${BUILDER_PLAYTEST_HANDOFF_PREFIX}${safeToken}`
  if (memoryRecord && storage) {
    try {
      storage.removeItem(key)
    } catch (err) {
      // Nothing else to do if sessionStorage refuses cleanup.
    }
  }
  if (memoryRecord) {
    return isExpiredHandoff(memoryRecord) ? null : normalizeBuilderRecord(memoryRecord)
  }

  const stored = readJson(storage, key, null)
  if (storage) {
    try {
      storage.removeItem(key)
    } catch (err) {
      // Nothing else to do if sessionStorage refuses cleanup.
    }
  }
  if (isExpiredHandoff(stored)) return null
  return normalizeBuilderRecord(stored)
}
