import { isQuotaExceededError } from '../simulation/traceStorage'

// Single-slot persistence for the in-progress Level Builder draft. The draft is
// serialized as the compact level PACKAGE form (cell-seeds, no geometry) so it
// round-trips through the existing builderStateToPackage / packageToBuilderState
// helpers. localStorage (not sessionStorage) so the draft survives a full
// browser reload, which is the whole point: keep-alive already preserves it
// across in-app navigation.

export const BUILDER_DRAFT_STORAGE_KEY = 'hwg:builderDraft'
export const BUILDER_DRAFT_SCHEMA_VERSION = 1

const ENVELOPE_KIND = 'hwg/builder-draft'

function canRead(storage) {
  return !!storage && typeof storage.getItem === 'function'
}

function canWrite(storage) {
  return !!storage && typeof storage.setItem === 'function'
}

function canRemove(storage) {
  return !!storage && typeof storage.removeItem === 'function'
}

/**
 * Persist the builder draft package under the single slot.
 *
 * Returns `{ ok: true }` on success. A browser quota error is translated into
 * `{ ok: false, quotaExceeded: true }` (mirrors traceStorage.persistTrace) so
 * callers never repeat the same try/catch; an incapable/absent storage yields
 * `{ ok: false }`. Any NON-quota error is rethrown so genuine failures surface.
 */
export function saveBuilderDraft(storage, pkg, savedAt) {
  if (!canWrite(storage)) return { ok: false }
  const envelope = {
    kind: ENVELOPE_KIND,
    schemaVersion: BUILDER_DRAFT_SCHEMA_VERSION,
    savedAt,
    package: pkg
  }
  try {
    storage.setItem(BUILDER_DRAFT_STORAGE_KEY, JSON.stringify(envelope))
    return { ok: true }
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return { ok: false, quotaExceeded: true }
    }
    throw error
  }
}

/**
 * Read back the persisted draft. Returns `{ package, savedAt }` ONLY when the
 * stored value is a well-formed envelope of the expected kind and schema with a
 * non-null object package; otherwise `null`. Never throws — absent slot,
 * malformed JSON, wrong kind, or a mismatched schema version all collapse to
 * `null`.
 */
export function loadBuilderDraft(storage) {
  if (!canRead(storage)) return null
  const raw = storage.getItem(BUILDER_DRAFT_STORAGE_KEY)
  if (typeof raw !== 'string' || raw.length === 0) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  if (parsed.kind !== ENVELOPE_KIND) return null
  if (parsed.schemaVersion !== BUILDER_DRAFT_SCHEMA_VERSION) return null
  if (!parsed.package || typeof parsed.package !== 'object') return null
  return { package: parsed.package, savedAt: parsed.savedAt }
}

/**
 * Remove the persisted draft (guarded against an incapable storage).
 */
export function clearBuilderDraft(storage) {
  if (!canRemove(storage)) return
  storage.removeItem(BUILDER_DRAFT_STORAGE_KEY)
}

/**
 * Whether a loadable draft is currently persisted.
 */
export function hasBuilderDraft(storage) {
  return loadBuilderDraft(storage) !== null
}
