// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  BUILDER_PLAYTEST_HANDOFF_TTL_MS,
  BUILDER_PLAYTEST_STORAGE_KEY,
  createBuilderPlaytestHandoff,
  consumeBuilderPlaytestHandoff,
  fingerprintLevelPackage,
  loadPersistedBuilderPlaytestLevels,
  persistBuilderPlaytestLevel,
  removePersistedBuilderPlaytestLevel,
  stableStringify
} from '../builderPlaytestLevels.js'

function makePackage(id) {
  return {
    id,
    schemaVersion: 1,
    hexmap: {
      parameters: { width: 2, height: 2, schemaVersion: 1 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 0, r: 1, terrain: 'plains' },
        { q: 1, r: 1, terrain: 'plains', player2Spawn: true }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
      ]
    },
    units: {
      player1: { units: [] },
      player2: { units: [] }
    },
    turntable: {
      Our_operations: [],
      Enemy_operations: []
    }
  }
}

function makeInvalidStoredRecord(id) {
  return {
    label: `Broken ${id}`,
    package: { id, schemaVersion: 1 },
    warnings: [],
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z'
  }
}

function readRawStoredRecords() {
  return JSON.parse(window.localStorage.getItem(BUILDER_PLAYTEST_STORAGE_KEY) || '[]')
}

function makeQuotaExceededError() {
  const err = new Error('The quota has been exceeded.')
  err.name = 'QuotaExceededError'
  return err
}

function makeFakeLocalStorage() {
  const map = new Map()
  const fake = {
    maxRecords: Infinity,
    failAlways: false,
    removeItemCalls: [],
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      if (fake.failAlways) throw makeQuotaExceededError()
      let parsed = null
      try {
        parsed = JSON.parse(value)
      } catch (err) {
        parsed = null
      }
      if (Array.isArray(parsed) && parsed.length > fake.maxRecords) {
        throw makeQuotaExceededError()
      }
      map.set(key, String(value))
    },
    removeItem(key) {
      fake.removeItemCalls.push(key)
      map.delete(key)
    }
  }
  return fake
}

let restoreLocalStorage = null

function installFakeLocalStorage(fake) {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
  restoreLocalStorage = () => {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
    else delete window.localStorage
  }
}

beforeEach(() => {
  window.localStorage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  window.sessionStorage.clear()
})

afterEach(() => {
  if (restoreLocalStorage) {
    restoreLocalStorage()
    restoreLocalStorage = null
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('builderPlaytestLevels', () => {
  it('stores only the latest 20 builder playtest levels', () => {
    for (let i = 0; i < 21; i++) {
      createBuilderPlaytestHandoff({ package: makePackage(`builder_${i}`), warnings: [] })
    }

    const levels = loadPersistedBuilderPlaytestLevels()

    expect(levels).toHaveLength(20)
    expect(levels[0].id).toBe('builder_20')
    expect(levels.some(level => level.id === 'builder_0')).toBe(false)
  })

  it('consumes one handoff token without deleting the persisted dropdown record', () => {
    const token = createBuilderPlaytestHandoff({ package: makePackage('builder_roundtrip'), warnings: [] })

    const handoff = consumeBuilderPlaytestHandoff(token)
    const secondConsume = consumeBuilderPlaytestHandoff(token)
    const persisted = loadPersistedBuilderPlaytestLevels()

    expect(handoff.package.id).toBe('builder_roundtrip')
    expect(secondConsume).toBe(null)
    expect(persisted.map(level => level.id)).toContain('builder_roundtrip')
  })

  it('expires stale handoff tokens', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-06-03T20:00:00.000Z').getTime()
    vi.setSystemTime(baseTime)
    const token = createBuilderPlaytestHandoff({ package: makePackage('builder_expired'), warnings: [] })

    vi.setSystemTime(baseTime + BUILDER_PLAYTEST_HANDOFF_TTL_MS + 1)

    expect(consumeBuilderPlaytestHandoff(token)).toBe(null)
    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).toContain('builder_expired')
  })

  it('fingerprints unexpected cyclic values without throwing', () => {
    const value = { a: undefined, b: [1, undefined] }
    value.self = value

    expect(stableStringify(value)).toContain('"[Circular]"')
    expect(fingerprintLevelPackage(value)).toMatch(/^[a-f0-9]{8}$/)
  })

  it('removes persisted custom levels but keeps level_000 protected', () => {
    createBuilderPlaytestHandoff({ package: makePackage('builder_delete'), warnings: [] })

    removePersistedBuilderPlaytestLevel('level_000')
    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).toContain('builder_delete')

    removePersistedBuilderPlaytestLevel('builder_delete')
    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).not.toContain('builder_delete')
  })

  it('quarantines stored records that fail validation instead of erasing them', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(BUILDER_PLAYTEST_STORAGE_KEY, JSON.stringify([
      makeInvalidStoredRecord('builder_broken')
    ]))

    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).not.toContain('builder_broken')

    const result = persistBuilderPlaytestLevel({ package: makePackage('builder_fresh'), warnings: [] })
    expect(result.ok).toBe(true)

    const stored = readRawStoredRecords()
    const quarantined = stored.find(record => record.package && record.package.id === 'builder_broken')
    expect(quarantined).toBeTruthy()
    expect(quarantined.invalid).toBe(true)
    expect(Array.isArray(quarantined.errors)).toBe(true)
    expect(quarantined.errors.length).toBeGreaterThan(0)
    expect(quarantined.label).toBe('Broken builder_broken')
    expect(stored.some(record => record.id === 'builder_fresh')).toBe(true)
    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).toEqual(['builder_fresh'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 builder playtest record'))
  })

  it('drops quarantined records with a warning when valid levels fill the cap', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(BUILDER_PLAYTEST_STORAGE_KEY, JSON.stringify([
      makeInvalidStoredRecord('builder_broken')
    ]))

    for (let i = 0; i < 20; i++) {
      persistBuilderPlaytestLevel({ package: makePackage(`builder_cap${i}`), warnings: [] })
    }

    const stored = readRawStoredRecords()
    expect(stored).toHaveLength(20)
    expect(stored.some(record => record.package && record.package.id === 'builder_broken')).toBe(false)
    expect(loadPersistedBuilderPlaytestLevels()).toHaveLength(20)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`1 quarantined builder playtest record(s) dropped from "${BUILDER_PLAYTEST_STORAGE_KEY}"`)
    )
  })

  it('keeps quarantined records when removing a different persisted level', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(BUILDER_PLAYTEST_STORAGE_KEY, JSON.stringify([
      makeInvalidStoredRecord('builder_broken')
    ]))
    persistBuilderPlaytestLevel({ package: makePackage('builder_keepalive'), warnings: [] })

    removePersistedBuilderPlaytestLevel('builder_keepalive')

    const stored = readRawStoredRecords()
    expect(stored.some(record => record.package && record.package.id === 'builder_broken')).toBe(true)
    expect(loadPersistedBuilderPlaytestLevels()).toEqual([])
  })

  it('degrades quota-limited writes by dropping the oldest records', () => {
    const fake = makeFakeLocalStorage()
    installFakeLocalStorage(fake)
    for (let i = 0; i < 5; i++) {
      persistBuilderPlaytestLevel({ package: makePackage(`builder_q${i}`), warnings: [] })
    }

    fake.maxRecords = 3
    const result = persistBuilderPlaytestLevel({ package: makePackage('builder_q5'), warnings: [] })

    expect(result.ok).toBe(true)
    const stored = JSON.parse(fake.getItem(BUILDER_PLAYTEST_STORAGE_KEY))
    expect(stored.map(record => record.id)).toEqual(['builder_q5', 'builder_q4', 'builder_q3'])
    expect(loadPersistedBuilderPlaytestLevels().map(level => level.id)).toEqual(['builder_q5', 'builder_q4', 'builder_q3'])
  })

  it('clears the storage key and reports failure when every write throws', () => {
    const fake = makeFakeLocalStorage()
    fake.failAlways = true
    installFakeLocalStorage(fake)

    const result = persistBuilderPlaytestLevel({ package: makePackage('builder_quota'), warnings: [] })

    expect(result.ok).toBe(false)
    expect(fake.removeItemCalls).toContain(BUILDER_PLAYTEST_STORAGE_KEY)
    expect(fake.getItem(BUILDER_PLAYTEST_STORAGE_KEY)).toBe(null)
  })

  it('returns an empty list when the stored JSON is corrupted', () => {
    window.localStorage.setItem(BUILDER_PLAYTEST_STORAGE_KEY, '{not valid json')

    expect(loadPersistedBuilderPlaytestLevels()).toEqual([])
  })
})
