import { describe, expect, it } from 'vitest'
import {
  BUILDER_DRAFT_SCHEMA_VERSION,
  BUILDER_DRAFT_STORAGE_KEY,
  clearBuilderDraft,
  hasBuilderDraft,
  loadBuilderDraft,
  saveBuilderDraft
} from '../builderDraftStorage.js'

// ---------------------------------------------------------------------------
// Fake Storage (mirrors the in-memory Storage used by the traceHistory tests)
// ---------------------------------------------------------------------------

function createStorage({ initial = {}, alwaysThrow = false } = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      if (alwaysThrow) {
        const err = new Error('QuotaExceededError')
        err.name = 'QuotaExceededError'
        throw err
      }
      data.set(key, String(value))
    },
    removeItem(key) {
      data.delete(key)
    },
    _data: data
  }
}

const SAMPLE_PACKAGE = Object.freeze({
  id: 'draft_level',
  map: { width: 2, height: 2 },
  cellSeeds: [{ q: 0, r: 0, terrainId: 'plains' }]
})

describe('builderDraftStorage · save → load round-trip', () => {
  it('round-trips the package and savedAt through the single slot', () => {
    const storage = createStorage()
    const savedAt = 1718000000000
    const result = saveBuilderDraft(storage, SAMPLE_PACKAGE, savedAt)
    expect(result).toEqual({ ok: true })

    const loaded = loadBuilderDraft(storage)
    expect(loaded).not.toBeNull()
    expect(loaded.package).toEqual(SAMPLE_PACKAGE)
    expect(loaded.savedAt).toBe(savedAt)
  })

  it('writes a well-formed envelope under BUILDER_DRAFT_STORAGE_KEY', () => {
    const storage = createStorage()
    saveBuilderDraft(storage, SAMPLE_PACKAGE, 123)
    const raw = JSON.parse(storage._data.get(BUILDER_DRAFT_STORAGE_KEY))
    expect(raw.kind).toBe('hwg/builder-draft')
    expect(raw.schemaVersion).toBe(BUILDER_DRAFT_SCHEMA_VERSION)
    expect(raw.savedAt).toBe(123)
    expect(raw.package).toEqual(SAMPLE_PACKAGE)
  })
})

describe('builderDraftStorage · loadBuilderDraft → null on bad input', () => {
  it('returns null when the slot is absent', () => {
    expect(loadBuilderDraft(createStorage())).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    const storage = createStorage({ initial: { [BUILDER_DRAFT_STORAGE_KEY]: '{ not json' } })
    expect(loadBuilderDraft(storage)).toBeNull()
  })

  it('returns null when the envelope kind is wrong', () => {
    const storage = createStorage({
      initial: {
        [BUILDER_DRAFT_STORAGE_KEY]: JSON.stringify({
          kind: 'hwg/something-else',
          schemaVersion: BUILDER_DRAFT_SCHEMA_VERSION,
          package: SAMPLE_PACKAGE
        })
      }
    })
    expect(loadBuilderDraft(storage)).toBeNull()
  })

  it('returns null when the schema version mismatches', () => {
    const storage = createStorage({
      initial: {
        [BUILDER_DRAFT_STORAGE_KEY]: JSON.stringify({
          kind: 'hwg/builder-draft',
          schemaVersion: BUILDER_DRAFT_SCHEMA_VERSION + 1,
          package: SAMPLE_PACKAGE
        })
      }
    })
    expect(loadBuilderDraft(storage)).toBeNull()
  })

  it('returns null when the package is missing or not an object', () => {
    const storage = createStorage({
      initial: {
        [BUILDER_DRAFT_STORAGE_KEY]: JSON.stringify({
          kind: 'hwg/builder-draft',
          schemaVersion: BUILDER_DRAFT_SCHEMA_VERSION,
          package: null
        })
      }
    })
    expect(loadBuilderDraft(storage)).toBeNull()
  })
})

describe('builderDraftStorage · clear / has', () => {
  it('clearBuilderDraft removes the slot', () => {
    const storage = createStorage()
    saveBuilderDraft(storage, SAMPLE_PACKAGE, 1)
    expect(hasBuilderDraft(storage)).toBe(true)
    clearBuilderDraft(storage)
    expect(storage._data.has(BUILDER_DRAFT_STORAGE_KEY)).toBe(false)
    expect(hasBuilderDraft(storage)).toBe(false)
  })

  it('hasBuilderDraft reflects presence of a loadable draft', () => {
    const storage = createStorage()
    expect(hasBuilderDraft(storage)).toBe(false)
    saveBuilderDraft(storage, SAMPLE_PACKAGE, 1)
    expect(hasBuilderDraft(storage)).toBe(true)
  })
})

describe('builderDraftStorage · quota and incapable storage', () => {
  it('translates a quota error into { ok:false, quotaExceeded:true }', () => {
    const storage = createStorage({ alwaysThrow: true })
    expect(saveBuilderDraft(storage, SAMPLE_PACKAGE, 1)).toEqual({ ok: false, quotaExceeded: true })
  })

  it('rethrows a non-quota setItem error', () => {
    const storage = createStorage()
    storage.setItem = () => {
      throw new Error('boom')
    }
    expect(() => saveBuilderDraft(storage, SAMPLE_PACKAGE, 1)).toThrow('boom')
  })

  it('guards every function against a falsy / incapable storage', () => {
    expect(saveBuilderDraft(null, SAMPLE_PACKAGE, 1)).toEqual({ ok: false })
    expect(saveBuilderDraft({}, SAMPLE_PACKAGE, 1)).toEqual({ ok: false })
    expect(loadBuilderDraft(null)).toBeNull()
    expect(loadBuilderDraft({})).toBeNull()
    expect(hasBuilderDraft(null)).toBe(false)
    expect(() => clearBuilderDraft(null)).not.toThrow()
    expect(() => clearBuilderDraft({})).not.toThrow()
  })
})
