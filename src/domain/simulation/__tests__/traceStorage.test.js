import { describe, expect, it, vi } from 'vitest'
import {
  isQuotaExceededError,
  persistTrace,
  removeStoredSimulationTraces,
  simulationTraceStorageKey,
  storeSimulationTrace,
  TRACE_QUOTA_MESSAGE
} from '../traceStorage.js'

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key(index) {
      return Array.from(data.keys())[index] || null
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem: vi.fn((key, value) => {
      data.set(key, String(value))
    }),
    removeItem: vi.fn(key => {
      data.delete(key)
    })
  }
}

describe('traceStorage', () => {
  it('builds stable simulation trace keys', () => {
    expect(simulationTraceStorageKey('abc')).toBe('hwg:simulation-trace:abc')
  })

  it('removes old simulation traces without touching unrelated storage', () => {
    const storage = createStorage({
      'hwg:simulation-trace:old-1': '{}',
      'hwg:simulation-trace:keep': '{}',
      'hwg:other': 'value'
    })

    const removed = removeStoredSimulationTraces(storage, 'hwg:simulation-trace:keep')

    expect(removed).toBe(1)
    expect(storage.getItem('hwg:simulation-trace:old-1')).toBeNull()
    expect(storage.getItem('hwg:simulation-trace:keep')).toBe('{}')
    expect(storage.getItem('hwg:other')).toBe('value')
  })

  it('clears old traces before storing a new trace', () => {
    const storage = createStorage({
      'hwg:simulation-trace:old': '{}'
    })
    const trace = { kind: 'hwg/simulation-trace', frames: [] }

    const key = storeSimulationTrace(storage, 'new', trace)

    expect(key).toBe('hwg:simulation-trace:new')
    expect(storage.getItem('hwg:simulation-trace:old')).toBeNull()
    expect(JSON.parse(storage.getItem('hwg:simulation-trace:new'))).toEqual(trace)
  })

  it('detects browser quota exceptions', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaExceededError({ code: 22 })).toBe(true)
    expect(isQuotaExceededError(new Error('nope'))).toBe(false)
  })

  describe('persistTrace', () => {
    it('stores the trace, evicting prior traces, and returns { ok: true }', () => {
      const storage = createStorage({
        'hwg:simulation-trace:old': '{}'
      })
      const trace = { kind: 'hwg/simulation-trace', frames: [] }

      const result = persistTrace(storage, 'new', trace)

      expect(result).toEqual({ ok: true })
      // Eviction happened via storeSimulationTrace: the old trace key is gone.
      expect(storage.getItem('hwg:simulation-trace:old')).toBeNull()
      expect(JSON.parse(storage.getItem('hwg:simulation-trace:new'))).toEqual(trace)
    })

    it('returns { ok: false, quotaExceeded: true } and does not rethrow on a quota error', () => {
      const storage = createStorage()
      storage.setItem = vi.fn(() => {
        const error = new Error('full')
        error.name = 'QuotaExceededError'
        throw error
      })

      const result = persistTrace(storage, 'new', { frames: [] })

      expect(result).toEqual({ ok: false, quotaExceeded: true })
    })

    it('rethrows a non-quota error', () => {
      const storage = createStorage()
      const boom = new Error('disk on fire')
      storage.setItem = vi.fn(() => {
        throw boom
      })

      expect(() => persistTrace(storage, 'new', { frames: [] })).toThrow(boom)
    })

    it('exposes the shared quota fallback message', () => {
      expect(TRACE_QUOTA_MESSAGE).toContain('session storage is full')
    })
  })
})
