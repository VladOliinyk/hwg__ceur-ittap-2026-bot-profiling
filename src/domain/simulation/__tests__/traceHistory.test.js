import { describe, expect, it } from 'vitest'
import { fingerprintLevelPackage } from '@/domain/level/builderPlaytestLevels.js'
import {
  appendTraceToHistory,
  BUILDER_EPOCH_KEY,
  clearTraceHistory,
  DEFAULT_TRACE_HISTORY_CAP,
  readBuilderEpoch,
  readTraceFromHistory,
  readTraceHistoryIndex,
  removeTraceFromHistory,
  SIMULATION_LEVEL_STORAGE_PREFIX,
  simulationLevelStorageKey,
  TRACE_HISTORY_INDEX_KEY,
  writeBuilderEpoch
} from '../traceHistory.js'
import { simulationTraceStorageKey } from '../traceStorage.js'

// ---------------------------------------------------------------------------
// Fake Storage
// ---------------------------------------------------------------------------

/**
 * Create an in-memory Storage-like object backed by a Map.
 *
 * @param {object} options
 * @param {Record<string,string>} [options.initial={}]  Pre-populated entries.
 * @param {boolean} [options.alwaysThrow]  If true, setItem ALWAYS throws.
 */
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
    // Expose raw Map for assertions
    _data: data
  }
}

/**
 * Create a storage that throws QuotaExceededError for the first `n` calls to
 * setItem, then succeeds normally.
 */
function createCountdownStorage(initial = {}, throwCount = 0) {
  const data = new Map(Object.entries(initial))
  let remaining = throwCount
  return {
    get length() { return data.size },
    key(i) { return Array.from(data.keys())[i] ?? null },
    getItem(k) { return data.has(k) ? data.get(k) : null },
    setItem(k, v) {
      if (remaining > 0) {
        remaining--
        const err = new Error('quota')
        err.name = 'QuotaExceededError'
        throw err
      }
      data.set(k, String(v))
    },
    removeItem(k) { data.delete(k) },
    _data: data
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLevelPackage(id = 'level-A') {
  return { id, hexes: ['hex1', 'hex2'], units: [] }
}

function makeTrace(traceId, levelPackage) {
  return {
    kind: 'hwg/simulation-trace',
    schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    levelPackage,
    runConfig: { seed: 42 },
    result: { winner: 1 },
    frames: []
  }
}

function makePayload(traceId, levelPackage = makeLevelPackage()) {
  return {
    metadata: { traceId, createdAt: '2026-01-01T00:00:00.000Z' },
    trace: makeTrace(traceId, levelPackage)
  }
}

// ---------------------------------------------------------------------------
// 1. Append + read round-trip
// ---------------------------------------------------------------------------

describe('traceHistory', () => {
  describe('1. append then read round-trip', () => {
    it('rehydrates levelPackage identically', () => {
      const storage = createStorage()
      const pkg = makeLevelPackage('round-trip')
      const result = appendTraceToHistory(storage, makePayload('t1', pkg))

      expect(result.ok).toBe(true)
      expect(result.quotaExceeded).toBe(false)
      expect(result.evictedTraceIds).toEqual([])

      const trace = readTraceFromHistory(storage, 't1')
      expect(trace).not.toBeNull()
      expect(trace.kind).toBe('hwg/simulation-trace')
      expect(trace.levelPackage).toEqual(pkg)
      // levelFingerprint must be stripped from the returned object
      expect('levelFingerprint' in trace).toBe(false)
    })

    it('slim blob stored WITHOUT inline levelPackage', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, makePayload('t2', makeLevelPackage()))
      const raw = JSON.parse(storage.getItem(simulationTraceStorageKey('t2')))
      expect('levelPackage' in raw).toBe(false)
      expect(typeof raw.levelFingerprint).toBe('string')
    })

    it('index contains the metadata entry after append', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, makePayload('t3'))
      const index = readTraceHistoryIndex(storage)
      expect(index).toHaveLength(1)
      expect(index[0].traceId).toBe('t3')
    })
  })

  // ---------------------------------------------------------------------------
  // 2. levelPackage dedup
  // ---------------------------------------------------------------------------

  describe('2. levelPackage dedup', () => {
    it('same levelPackage → exactly one hwg:simulation-level: key', () => {
      const storage = createStorage()
      const pkg = makeLevelPackage('shared')
      appendTraceToHistory(storage, makePayload('ta', pkg))
      appendTraceToHistory(storage, makePayload('tb', pkg))

      const levelKeys = Array.from(storage._data.keys()).filter(k =>
        k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX)
      )
      expect(levelKeys).toHaveLength(1)
    })

    it('different levelPackages → two hwg:simulation-level: keys', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, makePayload('tc', makeLevelPackage('A')))
      appendTraceToHistory(storage, makePayload('td', makeLevelPackage('B')))

      const levelKeys = Array.from(storage._data.keys()).filter(k =>
        k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX)
      )
      expect(levelKeys).toHaveLength(2)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. FIFO cap
  // ---------------------------------------------------------------------------

  describe('3. FIFO cap', () => {
    it('keeps only the newest `cap` entries when over the limit', () => {
      const storage = createStorage()
      const cap = 3
      for (let i = 1; i <= cap + 2; i++) {
        appendTraceToHistory(storage, makePayload(`trace-${i}`), { cap })
      }
      const index = readTraceHistoryIndex(storage)
      expect(index).toHaveLength(cap)
      // newest cap entries are 3, 4, 5
      expect(index.map(e => e.traceId)).toEqual(['trace-3', 'trace-4', 'trace-5'])
    })

    it('evicted trace blobs are removed from storage', () => {
      const storage = createStorage()
      const cap = 2
      for (let i = 1; i <= 4; i++) {
        appendTraceToHistory(storage, makePayload(`tr-${i}`), { cap })
      }
      // tr-1 and tr-2 were evicted
      expect(storage.getItem(simulationTraceStorageKey('tr-1'))).toBeNull()
      expect(storage.getItem(simulationTraceStorageKey('tr-2'))).toBeNull()
      // tr-3 and tr-4 are kept
      expect(storage.getItem(simulationTraceStorageKey('tr-3'))).not.toBeNull()
      expect(storage.getItem(simulationTraceStorageKey('tr-4'))).not.toBeNull()
    })

    it('evictedTraceIds lists them in the result', () => {
      const storage = createStorage()
      // fill to cap
      for (let i = 1; i <= 2; i++) {
        appendTraceToHistory(storage, makePayload(`base-${i}`), { cap: 2 })
      }
      // overflow by 2 more
      const r3 = appendTraceToHistory(storage, makePayload('base-3'), { cap: 2 })
      const r4 = appendTraceToHistory(storage, makePayload('base-4'), { cap: 2 })
      expect(r3.evictedTraceIds).toContain('base-1')
      expect(r4.evictedTraceIds).toContain('base-2')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. GC of orphaned level packages
  // ---------------------------------------------------------------------------

  describe('4. GC of orphaned level packages', () => {
    it('removes level pkg referenced only by evicted trace', () => {
      const storage = createStorage()
      const cap = 1
      const pkgA = makeLevelPackage('A-only')
      const pkgB = makeLevelPackage('B-only')
      appendTraceToHistory(storage, makePayload('gc-1', pkgA), { cap })
      appendTraceToHistory(storage, makePayload('gc-2', pkgB), { cap })

      // gc-1 evicted; pkgA should be GC'd
      const levelKeys = Array.from(storage._data.keys()).filter(k =>
        k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX)
      )
      expect(levelKeys).toHaveLength(1)
      // Only pkgB's key remains
      const fpB = fingerprintLevelPackage(pkgB)
      expect(levelKeys[0]).toBe(simulationLevelStorageKey(fpB))
    })

    it('keeps level pkg still referenced by a surviving trace', () => {
      const storage = createStorage()
      const cap = 2
      const sharedPkg = makeLevelPackage('shared-forever')
      appendTraceToHistory(storage, makePayload('keep-1', sharedPkg), { cap })
      appendTraceToHistory(storage, makePayload('keep-2', sharedPkg), { cap })
      appendTraceToHistory(storage, makePayload('keep-3', makeLevelPackage('other')), { cap })
      // keep-1 evicted; keep-2 still references sharedPkg → level pkg stays

      const fpShared = fingerprintLevelPackage(sharedPkg)
      expect(storage.getItem(simulationLevelStorageKey(fpShared))).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Upsert — same traceId twice
  // ---------------------------------------------------------------------------

  describe('5. upsert', () => {
    it('does not duplicate the index entry on a second append', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, makePayload('dup'))
      appendTraceToHistory(storage, makePayload('dup'))
      const index = readTraceHistoryIndex(storage)
      const entries = index.filter(e => e.traceId === 'dup')
      expect(entries).toHaveLength(1)
    })

    it('updates the entry in place (does not move it to the end)', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, makePayload('first'))
      appendTraceToHistory(storage, makePayload('second'))
      // Upsert 'first' again — it should stay in position 0
      appendTraceToHistory(storage, makePayload('first'))
      const index = readTraceHistoryIndex(storage)
      expect(index[0].traceId).toBe('first')
      expect(index[1].traceId).toBe('second')
    })

    it('overwrites the stored trace blob on upsert (new metadata wins)', () => {
      const storage = createStorage()
      appendTraceToHistory(storage, {
        metadata: { traceId: 'up', seed: 'old' },
        trace: makeTrace('up', makeLevelPackage())
      })
      appendTraceToHistory(storage, {
        metadata: { traceId: 'up', seed: 'new' },
        trace: makeTrace('up', makeLevelPackage())
      })
      const index = readTraceHistoryIndex(storage)
      expect(index.filter(e => e.traceId === 'up')).toHaveLength(1)
      expect(index.find(e => e.traceId === 'up').seed).toBe('new')
    })
  })

  describe('5b. cap validation', () => {
    it.each([0, -1, 1.5, NaN])('throws when cap is %p', cap => {
      const storage = createStorage()
      expect(() => appendTraceToHistory(storage, makePayload('x'), { cap }))
        .toThrow(/cap must be a positive integer/)
      // No orphaned blob is left behind by the rejected append.
      expect(storage._data.has(simulationTraceStorageKey('x'))).toBe(false)
    })
  })

  describe('5c. trace without a levelPackage (fp = "")', () => {
    it('round-trips a trace whose levelPackage is null without writing a level key', () => {
      const storage = createStorage()
      const result = appendTraceToHistory(storage, {
        metadata: { traceId: 'nolevel' },
        trace: makeTrace('nolevel', null)
      })
      expect(result.ok).toBe(true)
      // No level-pkg key written for an empty fingerprint.
      const levelKeys = [...storage._data.keys()].filter(k => k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX))
      expect(levelKeys).toEqual([])

      const trace = readTraceFromHistory(storage, 'nolevel')
      expect(trace).not.toBeNull()
      expect(trace.kind).toBe('hwg/simulation-trace')
      expect(trace.levelFingerprint).toBeUndefined()
      expect(trace.levelPackage == null).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Quota degrade-loop
  // ---------------------------------------------------------------------------

  describe('6. quota degrade-loop', () => {
    it('evicts oldest until write succeeds and returns quotaExceeded:false', () => {
      const pkg1 = makeLevelPackage('degrade-pkg')
      const fp1 = fingerprintLevelPackage(pkg1)

      // Pre-seed 2 existing traces. throwCount=2 makes the first two individual
      // setItem calls throw QuotaExceededError. Each failing attempt throws on
      // its first write (the level-pkg), so two throws == two degrade evictions:
      //   throw 1 → evict 'evict-me-1'; throw 2 → evict 'evict-me-2'; then succeed.
      const preSeeded = {
        [simulationTraceStorageKey('evict-me-1')]: JSON.stringify({ levelFingerprint: fp1 }),
        [simulationTraceStorageKey('evict-me-2')]: JSON.stringify({ levelFingerprint: fp1 }),
        [simulationLevelStorageKey(fp1)]: JSON.stringify(pkg1),
        [TRACE_HISTORY_INDEX_KEY]: JSON.stringify([
          { traceId: 'evict-me-1', levelFingerprint: fp1 },
          { traceId: 'evict-me-2', levelFingerprint: fp1 }
        ])
      }
      const storage = createCountdownStorage(preSeeded, 2)

      const newPkg = makeLevelPackage('new-pkg')
      const result = appendTraceToHistory(storage, {
        metadata: { traceId: 'new-trace' },
        trace: makeTrace('new-trace', newPkg)
      }, { cap: 10 })

      expect(result.ok).toBe(true)
      expect(result.quotaExceeded).toBe(false)
      expect(result.evictedTraceIds.length).toBeGreaterThan(0)
      // new trace must exist in index
      const index = readTraceHistoryIndex(storage)
      expect(index.some(e => e.traceId === 'new-trace')).toBe(true)
    })

    it('returns { ok:false, quotaExceeded:true } when storage always throws', () => {
      const storage = createStorage({ alwaysThrow: true })
      // Seed index manually (bypassing setItem)
      storage._data.set(TRACE_HISTORY_INDEX_KEY, JSON.stringify([
        { traceId: 'trapped-1', levelFingerprint: '' }
      ]))
      storage._data.set(simulationTraceStorageKey('trapped-1'), '{}')

      const result = appendTraceToHistory(storage, makePayload('new-always-fail'), { cap: 10 })
      expect(result.ok).toBe(false)
      expect(result.quotaExceeded).toBe(true)
    })

    it('returns { ok:false } with evictedTraceIds array when always throws and no pre-existing', () => {
      const storage = createStorage({ alwaysThrow: true })
      const result = appendTraceToHistory(storage, makePayload('doom'), { cap: 10 })
      expect(result.ok).toBe(false)
      expect(result.quotaExceeded).toBe(true)
      expect(result.evictedTraceIds).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // 7. clearTraceHistory
  // ---------------------------------------------------------------------------

  describe('7. clearTraceHistory', () => {
    it('removes index, all trace blobs, all level-pkg keys, but not epoch key', () => {
      const storage = createStorage()

      // Write epoch first
      writeBuilderEpoch(storage, 'epoch-42')

      // Append some traces
      appendTraceToHistory(storage, makePayload('clear-1', makeLevelPackage('X')))
      appendTraceToHistory(storage, makePayload('clear-2', makeLevelPackage('Y')))

      clearTraceHistory(storage)

      // Index gone
      expect(storage.getItem(TRACE_HISTORY_INDEX_KEY)).toBeNull()

      // All trace blobs gone
      expect(storage.getItem(simulationTraceStorageKey('clear-1'))).toBeNull()
      expect(storage.getItem(simulationTraceStorageKey('clear-2'))).toBeNull()

      // All level-pkg keys gone
      const levelKeys = Array.from(storage._data.keys()).filter(k =>
        k.startsWith(SIMULATION_LEVEL_STORAGE_PREFIX)
      )
      expect(levelKeys).toHaveLength(0)

      // Epoch key untouched
      expect(storage.getItem(BUILDER_EPOCH_KEY)).toBe('epoch-42')
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Robustness
  // ---------------------------------------------------------------------------

  describe('8. robustness', () => {
    it('readTraceHistoryIndex returns [] for absent key', () => {
      const storage = createStorage()
      expect(readTraceHistoryIndex(storage)).toEqual([])
    })

    it('readTraceHistoryIndex returns [] for malformed JSON', () => {
      const storage = createStorage({ initial: { [TRACE_HISTORY_INDEX_KEY]: 'not-json{{{' } })
      expect(readTraceHistoryIndex(storage)).toEqual([])
    })

    it('readTraceHistoryIndex returns [] when JSON is a non-array value', () => {
      const storage = createStorage({ initial: { [TRACE_HISTORY_INDEX_KEY]: '"just a string"' } })
      expect(readTraceHistoryIndex(storage)).toEqual([])
    })

    it('readTraceFromHistory returns null when trace blob absent', () => {
      const storage = createStorage()
      expect(readTraceFromHistory(storage, 'nonexistent')).toBeNull()
    })

    it('readTraceFromHistory returns null when trace blob is malformed JSON', () => {
      const storage = createStorage({
        initial: { [simulationTraceStorageKey('bad')]: '{{invalid}}' }
      })
      expect(readTraceFromHistory(storage, 'bad')).toBeNull()
    })

    it('readTraceFromHistory returns trace with levelPackage absent when level pkg is missing', () => {
      const fp = 'deadbeef'
      const storage = createStorage({
        initial: {
          [simulationTraceStorageKey('orphan')]: JSON.stringify({
            kind: 'hwg/simulation-trace',
            levelFingerprint: fp
          })
        }
      })
      const trace = readTraceFromHistory(storage, 'orphan')
      expect(trace).not.toBeNull()
      expect(trace.levelPackage).toBeUndefined()
    })

    it('appendTraceToHistory throws when metadata.traceId is missing', () => {
      const storage = createStorage()
      expect(() =>
        appendTraceToHistory(storage, { metadata: {}, trace: makeTrace('x', makeLevelPackage()) })
      ).toThrow(/traceId/)
    })

    it('appendTraceToHistory throws when metadata.traceId is empty string', () => {
      const storage = createStorage()
      expect(() =>
        appendTraceToHistory(storage, { metadata: { traceId: '' }, trace: makeTrace('x', makeLevelPackage()) })
      ).toThrow(/traceId/)
    })

    it('all read functions return safe defaults for null/undefined storage', () => {
      expect(readTraceHistoryIndex(null)).toEqual([])
      expect(readTraceFromHistory(null, 'id')).toBeNull()
      expect(readBuilderEpoch(null)).toBe('')
    })

    it('appendTraceToHistory returns { ok:false } for null storage', () => {
      const result = appendTraceToHistory(null, makePayload('x'))
      expect(result.ok).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Epoch read / write
  // ---------------------------------------------------------------------------

  describe('9. epoch read/write', () => {
    it('read returns empty string when absent', () => {
      const storage = createStorage()
      expect(readBuilderEpoch(storage)).toBe('')
    })

    it('write then read round-trips the value', () => {
      const storage = createStorage()
      writeBuilderEpoch(storage, 'abc-123')
      expect(readBuilderEpoch(storage)).toBe('abc-123')
    })

    it('coerces non-string values to string on write', () => {
      const storage = createStorage()
      writeBuilderEpoch(storage, 42)
      expect(readBuilderEpoch(storage)).toBe('42')
    })

    it('is stored under BUILDER_EPOCH_KEY', () => {
      const storage = createStorage()
      writeBuilderEpoch(storage, 'epoch-val')
      expect(storage.getItem(BUILDER_EPOCH_KEY)).toBe('epoch-val')
    })
  })

  // ---------------------------------------------------------------------------
  // removeTraceFromHistory
  // ---------------------------------------------------------------------------

  describe('removeTraceFromHistory', () => {
    it('removes blob, drops index entry, GCs orphan level pkg', () => {
      const storage = createStorage()
      const pkg = makeLevelPackage('removable')
      appendTraceToHistory(storage, makePayload('rem-1', pkg))
      appendTraceToHistory(storage, makePayload('rem-2', makeLevelPackage('other')))

      const updated = removeTraceFromHistory(storage, 'rem-1')

      expect(storage.getItem(simulationTraceStorageKey('rem-1'))).toBeNull()
      expect(updated.find(e => e.traceId === 'rem-1')).toBeUndefined()

      // pkg was only referenced by rem-1; should be GC'd
      const fp = fingerprintLevelPackage(pkg)
      expect(storage.getItem(simulationLevelStorageKey(fp))).toBeNull()
    })

    it('returns safe default for null storage', () => {
      expect(removeTraceFromHistory(null, 'x')).toEqual([])
    })
  })
})
