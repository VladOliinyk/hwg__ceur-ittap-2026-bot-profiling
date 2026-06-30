// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  normalizeBool,
  saveGameState,
  loadGameState,
  clearGameState,
  validatePersistedSnapshot,
  RESTORE_ERROR_CODES,
  SAVE_ERROR_CODES,
  SNAPSHOT_VERSION,
  LATEST_SUPPORTED_VERSION
} from '../gamePersistence.js'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../../domain/simulation/rng.js'

const STORAGE_KEY = 'hexWarGameState'

describe('normalizeBool', () => {
  it('preserves strict booleans', () => {
    expect(normalizeBool(true, false)).toBe(true)
    expect(normalizeBool(false, true)).toBe(false)
  })

  it('accepts string true/false', () => {
    expect(normalizeBool('true', false)).toBe(true)
    expect(normalizeBool('false', true)).toBe(false)
  })

  it('uses default for ambiguous values (e.g. 0, null, junk)', () => {
    expect(normalizeBool(0, true)).toBe(true)
    expect(normalizeBool(0, false)).toBe(false)
    expect(normalizeBool(null, true)).toBe(true)
    expect(normalizeBool(undefined, false)).toBe(false)
    expect(normalizeBool('maybe', true)).toBe(true)
  })
})

describe('saveGameState / loadGameState — RNG metadata round-trip', () => {
  beforeEach(() => {
    clearGameState()
  })

  function makeSeededGameState(seed) {
    return new GameState({
      width: 3,
      height: 3,
      turntableData: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] }
        ],
        Enemy_operations: []
      },
      rng: createRng(seed)
    })
  }

  it('persists rngSeed at the envelope level so the playground can re-display it after restore', () => {
    const gs = makeSeededGameState('persist-seed-1')
    saveGameState({
      levelId: 'level_seed',
      mapData: null,
      terrainTypes: null,
      unitsData: null,
      movesData: null,
      rngSeed: 'persist-seed-1',
      gameState: gs,
      selectedHex: null,
      selectedUnit: null
    })

    const result = loadGameState()
    expect(result.ok).toBe(true)
    expect(result.state.rngSeed).toBe('persist-seed-1')
  })

  it('round-trips the engine RNG stream through localStorage so next dice continues seeded', () => {
    const gs = makeSeededGameState('persist-seed-2')
    // Burn one roll so the saved RNG state is not the original seed.
    gs.rollDiceFromRng()
    gs.endTurn()

    saveGameState({
      levelId: 'level_seed',
      mapData: null,
      terrainTypes: null,
      unitsData: null,
      movesData: null,
      rngSeed: 'persist-seed-2',
      gameState: gs,
      selectedHex: null,
      selectedUnit: null
    })

    const result = loadGameState()
    expect(result.ok).toBe(true)
    const restored = result.state.gameState

    // The original engine would roll some face next; the restored engine —
    // having gone through JSON.stringify in localStorage and JSON.parse on
    // load — must produce the same face.
    const referenceFace = gs.rollDiceFromRng()
    const restoredFace = restored.rollDiceFromRng()
    expect(restoredFace).toBe(referenceFace)
  })

  it('legacy envelope without rngSeed/RNG metadata still loads without throwing', () => {
    // Hand-craft an older payload shape (no `rngSeed`, snapshot has no `rng`).
    const gs = makeSeededGameState('legacy-persist')
    const rawSnapshot = JSON.parse(JSON.stringify(gs.toJSON(true)))
    delete rawSnapshot.rng

    // eslint-disable-next-line no-undef
    localStorage.setItem('hexWarGameState', JSON.stringify({
      version: 1,
      levelId: 'level_seed',
      gameState: rawSnapshot
    }))

    const result = loadGameState()
    expect(result.ok).toBe(true)
    expect(result.state.rngSeed).toBe(null)
    expect(result.state.gameState).toBeTruthy()
    // Legacy save (no rng block) should surface a structured warning so
    // the UI can tell the user determinism is downgraded.
    expect(Array.isArray(result.warnings)).toBe(true)
    expect(result.warnings.some(w => w.path === 'gameState.rng')).toBe(true)
  })
})

describe('validatePersistedSnapshot — shape + migration contract', () => {
  it('accepts a current-version envelope without warnings', () => {
    const out = validatePersistedSnapshot({
      version: SNAPSHOT_VERSION,
      levelId: 'level_seed'
    })
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.warnings).toEqual([])
    expect(out.normalized.version).toBe(SNAPSHOT_VERSION)
  })

  it('treats missing `version` as legacy v0 and migrates to current with a warning', () => {
    const out = validatePersistedSnapshot({ levelId: 'level_seed' })
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.warnings.some(w => w.path === 'version')).toBe(true)
    expect(out.normalized.version).toBe(SNAPSHOT_VERSION)
  })

  it('rejects a forward `version` as a structured error', () => {
    const out = validatePersistedSnapshot({ version: LATEST_SUPPORTED_VERSION + 1 })
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => e.path === 'version' && /newer than supported/i.test(e.message))).toBe(true)
    expect(out.normalized).toBe(null)
  })

  it('rejects non-integer / zero / negative versions', () => {
    for (const bad of [0, -1, 1.5, 'one', true, []]) {
      const out = validatePersistedSnapshot({ version: bad })
      expect(out.ok).toBe(false)
      expect(out.errors.some(e => e.path === 'version')).toBe(true)
    }
  })

  it('rejects a non-plain-object input (array, null, primitive)', () => {
    for (const bad of [null, undefined, 'a string', 42, [], true]) {
      const out = validatePersistedSnapshot(bad)
      expect(out.ok).toBe(false)
      expect(out.errors.some(e => e.path === '')).toBe(true)
      expect(out.normalized).toBe(null)
    }
  })

  it('errors when gameState is present but not a plain object', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      gameState: 'corrupted'
    })
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => e.path === 'gameState')).toBe(true)
  })

  it('errors when gameState.hexes / gameState.units are not arrays', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      gameState: { hexes: 'oops', units: { not: 'array' } }
    })
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => e.path === 'gameState.hexes')).toBe(true)
    expect(out.errors.some(e => e.path === 'gameState.units')).toBe(true)
  })

  it('errors when gameState.width / height are not positive integers', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      gameState: { hexes: [], units: [], width: 0, height: -1 }
    })
    expect(out.ok).toBe(false)
    expect(out.errors.some(e => e.path === 'gameState.width')).toBe(true)
    expect(out.errors.some(e => e.path === 'gameState.height')).toBe(true)
  })

  it('warns when gameState.rng is malformed but does not error', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      gameState: { hexes: [], units: [], rng: { state: 'not-a-number' } }
    })
    expect(out.ok).toBe(true)
    expect(out.warnings.some(w => w.path === 'gameState.rng')).toBe(true)
  })

  it('warns when rngSeed is not a string', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      rngSeed: 42
    })
    expect(out.ok).toBe(true)
    expect(out.warnings.some(w => w.path === 'rngSeed')).toBe(true)
  })

  it('treats explicit gameState: null as "no engine saved" (no errors, no warnings)', () => {
    const out = validatePersistedSnapshot({
      version: 1,
      levelId: 'level_seed',
      gameState: null
    })
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.warnings).toEqual([])
  })
})

describe('loadGameState — structured error codes', () => {
  beforeEach(() => {
    clearGameState()
  })

  it('returns CORRUPTED_JSON when the storage blob is unparseable', () => {
    // eslint-disable-next-line no-undef
    localStorage.setItem(STORAGE_KEY, '{not json')
    const result = loadGameState()
    expect(result.ok).toBe(false)
    expect(result.code).toBe(RESTORE_ERROR_CODES.CORRUPTED_JSON)
    expect(result.error).toMatch(/corrupted/i)
    expect(Array.isArray(result.details)).toBe(true)
    expect(result.details.length).toBeGreaterThan(0)
  })

  it('returns INVALID_SHAPE when gameState section is malformed', () => {
    // eslint-disable-next-line no-undef
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      gameState: { hexes: 'not array', units: 'not array' }
    }))
    const result = loadGameState()
    expect(result.ok).toBe(false)
    expect(result.code).toBe(RESTORE_ERROR_CODES.INVALID_SHAPE)
    expect(result.details.some(d => d.path === 'gameState.hexes')).toBe(true)
    expect(result.details.some(d => d.path === 'gameState.units')).toBe(true)
  })

  it('returns UNSUPPORTED_VERSION when the saved version is newer than the build', () => {
    // eslint-disable-next-line no-undef
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: LATEST_SUPPORTED_VERSION + 1,
      levelId: 'level_seed'
    }))
    const result = loadGameState()
    expect(result.ok).toBe(false)
    expect(result.code).toBe(RESTORE_ERROR_CODES.UNSUPPORTED_VERSION)
    expect(result.error).toMatch(/newer than supported/i)
  })

  it('returns ENGINE_RESTORE_FAILED when GameState.fromJSON throws on a shape-valid snapshot', () => {
    // Validator only checks `width > 0` when `width != null`; setting it
    // to a width without matching hex coverage doesn't fail the validator,
    // but GameState.fromJSON ends up with a degenerate state. To force a
    // throw, hand it a payload where the validator passes (hexes/units
    // arrays present, no width set so the validator doesn't fire its
    // integer check) but `data.hexes` entries are invalid shape.
    // GameHex.fromJSON does not throw, so we go one level up: stub
    // `gameState: 0` (rejected by validator), or send `gameState: { ...,
    // hexes: [[{q:0,r:0,terrain:null}]] }` — these flow through fine.
    // Pick the GameUnit.fromJSON path: `selectedUnit` is an object that
    // looks like a unit but lacks required fields. Actually
    // `GameUnit.fromJSON` is permissive too. The clean path is to break
    // `GameState.fromJSON`'s primitive type guard.
    //
    // Approach: pass a `gameState` that strips the top-level `data` argument
    // type guard. The `GameState.fromJSON(data)` throws when `data` is not
    // an object. So set `gameState` to a non-object via the validator-permitted
    // path: not possible, the validator already rejects non-objects.
    //
    // Real-world ENGINE_RESTORE_FAILED happens when the validator passes but
    // a downstream invariant inside `GameState.fromJSON` fails (e.g. malformed
    // turntable causes the constructor to throw). Simulate by stubbing
    // GameState.fromJSON for this test only.
    const originalFromJSON = GameState.fromJSON
    GameState.fromJSON = () => { throw new Error('simulated engine restore failure') }
    try {
      // eslint-disable-next-line no-undef
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        levelId: 'level_seed',
        gameState: { hexes: [], units: [] }
      }))
      const result = loadGameState()
      expect(result.ok).toBe(false)
      expect(result.code).toBe(RESTORE_ERROR_CODES.ENGINE_RESTORE_FAILED)
      expect(result.error).toMatch(/engine snapshot/i)
      expect(result.details[0].message).toMatch(/simulated engine restore failure/)
    } finally {
      GameState.fromJSON = originalFromJSON
    }
  })

  it('does not throw and returns an empty state when no save exists', () => {
    const result = loadGameState()
    expect(result.ok).toBe(true)
    expect(result.state).toBeTruthy()
    expect(result.state.gameState).toBe(null)
    expect(result.warnings).toEqual([])
  })

  it('surfaces warnings on a successful but legacy restore', () => {
    // eslint-disable-next-line no-undef
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      // No version → legacy migration warning.
      levelId: 'level_seed'
    }))
    const result = loadGameState()
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.path === 'version')).toBe(true)
  })
})

describe('saveGameState — structured error codes', () => {
  beforeEach(() => {
    clearGameState()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok: true on a clean save', () => {
    const result = saveGameState({ levelId: 'level_seed' })
    expect(result.ok).toBe(true)
  })

  it('returns QUOTA_EXCEEDED when localStorage.setItem throws a quota error', () => {
    // happy-dom wraps `localStorage` in a Proxy that hides both own-property
    // writes (`ls.setItem = ...` is silently dropped) and pre-binds the
    // prototype methods (so patching `Storage.prototype.setItem` also has
    // no effect on the live proxy). Replace the whole `localStorage`
    // global with a controllable fake — the gamePersistence module
    // resolves `localStorage` at call time, not at import time, so the
    // stub takes effect.
    //
    // Unconditional throw: every `setItem` raises a quota error. After
    // the probe-write was removed from `saveGameState`, this is exactly
    // what an already-full storage looks like — no probe special-casing
    // needed.
    const realStorage = new Map()
    const fakeStorage = {
      getItem: (k) => (realStorage.has(k) ? realStorage.get(k) : null),
      removeItem: (k) => { realStorage.delete(k) },
      setItem: () => {
        const err = new Error('storage full')
        err.name = 'QuotaExceededError'
        err.code = 22
        throw err
      }
    }
    vi.stubGlobal('localStorage', fakeStorage)

    try {
      const result = saveGameState({ levelId: 'level_seed' })
      expect(result.ok).toBe(false)
      expect(result.code).toBe(SAVE_ERROR_CODES.QUOTA_EXCEEDED)
      expect(result.error).toMatch(/quota/i)
      // The error message points the user at the export escape hatch.
      expect(result.error).toMatch(/Timeline.*snapshot/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('classifies an already-full storage as QUOTA_EXCEEDED, not STORAGE_UNAVAILABLE (regression for probe-swallow bug)', () => {
    // Regression case: a previous version of this module ran a
    // write-then-remove probe inside `saveGameState` to verify storage
    // availability before the real write. If the storage was already at
    // quota, the probe `setItem` threw `QuotaExceededError` and the
    // probe-availability check returned false, so the user got
    // `STORAGE_UNAVAILABLE` ("Save Disabled") instead of `QUOTA_EXCEEDED`
    // ("Storage Full" — which points at the Timeline snapshot recovery
    // path). The fix: drop the probe and classify the actual save write.
    //
    // This test asserts the user-facing outcome directly: when every
    // `setItem` throws a quota error from the very first call, the
    // module must still surface `QUOTA_EXCEEDED`. A regression that
    // re-introduces a probe write inside `saveGameState` would fail
    // this test.
    let setItemCalls = 0
    const fakeStorage = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        setItemCalls += 1
        const err = new Error('storage full')
        err.name = 'QuotaExceededError'
        err.code = 22
        throw err
      }
    }
    vi.stubGlobal('localStorage', fakeStorage)

    try {
      const result = saveGameState({ levelId: 'level_seed' })
      expect(result.ok).toBe(false)
      expect(result.code).toBe(SAVE_ERROR_CODES.QUOTA_EXCEEDED)
      // Exactly one write attempt — no probe pre-pass.
      expect(setItemCalls).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns SERIALIZATION_FAILED when gameState.toJSON throws', () => {
    const exploding = {
      levelId: 'level_seed',
      gameState: {
        toJSON() {
          throw new Error('cannot serialize')
        }
      }
    }
    const result = saveGameState(exploding)
    expect(result.ok).toBe(false)
    expect(result.code).toBe(SAVE_ERROR_CODES.SERIALIZATION_FAILED)
    expect(result.error).toMatch(/cannot serialize/i)
  })

  it('returns STORAGE_UNAVAILABLE for a non-quota write failure', () => {
    const fakeStorage = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('generic write failure')
      }
    }
    vi.stubGlobal('localStorage', fakeStorage)

    try {
      const result = saveGameState({ levelId: 'level_seed' })
      expect(result.ok).toBe(false)
      expect(result.code).toBe(SAVE_ERROR_CODES.STORAGE_UNAVAILABLE)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
