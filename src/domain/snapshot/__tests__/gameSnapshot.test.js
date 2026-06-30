import { describe, it, expect } from 'vitest'
import {
  createGameSnapshot,
  validateGameSnapshot,
  applyGameSnapshot,
  applyGameSnapshotFromJSON,
  isGameSnapshotEnvelope,
  SNAPSHOT_KIND,
  SNAPSHOT_SCHEMA_VERSION
} from '../gameSnapshot.js'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../../simulation/rng.js'

/**
 * Compact, valid LevelPackage used as the snapshot's embedded level. Mirrors
 * the shape `validateLevelPackage` accepts on the happy path so the snapshot
 * tests don't double as level validator tests.
 */
function makeValidPackage(id = 'level_000') {
  return {
    id,
    hexmap: {
      parameters: { width: 2, height: 3 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 0, r: 1, terrain: 'forest' },
        { q: 1, r: 1, terrain: 'plains' },
        { q: 0, r: 2, terrain: 'plains', player2Spawn: true, player2Base: true },
        { q: 1, r: 2, terrain: 'plains', player2Spawn: true }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
      ]
    },
    units: {
      player1: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
        ]
      },
      player2: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
        ]
      }
    },
    turntable: {
      Our_operations: [
        {
          title: 'MANOEUVRE',
          moves: [{ title: 'x1 dice', dice: [
            ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
          ] }]
        },
        {
          title: 'ATTACK',
          moves: [{ title: 'x1 dice', dice: [
            ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
          ] }]
        }
      ],
      Enemy_operations: [
        {
          title: 'MANOEUVRE',
          moves: [{ title: 'x1 dice', dice: [
            ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
          ] }]
        },
        {
          title: 'ATTACK',
          moves: [{ title: 'x1 dice', dice: [
            ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
          ] }]
        }
      ]
    }
  }
}

function makeSeededGameState(seed, pkg = makeValidPackage()) {
  return new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    objectivesData: pkg.objectives || null,
    rng: createRng(seed)
  })
}

// Pass any value through JSON to emulate the file round-trip the snapshot
// goes through on import (download → read back as text → JSON.parse).
function serdes(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('createGameSnapshot', () => {
  it('returns a JSON-serializable snapshot with kind, schemaVersion, levelPackage, rngSeed, engine', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('snap-seed', pkg)

    const snapshot = createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: 'snap-seed' })

    expect(snapshot.kind).toBe(SNAPSHOT_KIND)
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(typeof snapshot.exportedAt).toBe('string')
    expect(snapshot.levelPackage).toBe(pkg)
    expect(snapshot.rngSeed).toBe('snap-seed')
    expect(snapshot.engine).toBeTruthy()
    expect(Array.isArray(snapshot.engine.hexes)).toBe(true)
    expect(Array.isArray(snapshot.engine.units)).toBe(true)

    // Survives JSON.stringify → JSON.parse without losing fields.
    const round = serdes(snapshot)
    expect(round.kind).toBe(SNAPSHOT_KIND)
    expect(round.rngSeed).toBe('snap-seed')
  })

  it('normalizes rngSeed to a string or null', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    expect(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: 42 }).rngSeed).toBe('42')
    expect(createGameSnapshot({ levelPackage: pkg, gameState: gs }).rngSeed).toBe(null)
    expect(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: null }).rngSeed).toBe(null)
  })

  it('throws when given an invalid levelPackage or gameState', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    expect(() => createGameSnapshot({ gameState: gs })).toThrow()
    expect(() => createGameSnapshot({ levelPackage: pkg })).toThrow()
    expect(() => createGameSnapshot({ levelPackage: null, gameState: gs })).toThrow()
  })
})

describe('isGameSnapshotEnvelope', () => {
  it('returns true only for objects carrying the SNAPSHOT_KIND tag', () => {
    expect(isGameSnapshotEnvelope({ kind: SNAPSHOT_KIND })).toBe(true)
    expect(isGameSnapshotEnvelope({ kind: 'other' })).toBe(false)
    expect(isGameSnapshotEnvelope({ initialState: {}, history: [] })).toBe(false)
    expect(isGameSnapshotEnvelope(null)).toBe(false)
    expect(isGameSnapshotEnvelope('hwg/game-snapshot')).toBe(false)
  })
})

describe('validateGameSnapshot', () => {
  it('accepts a freshly-built snapshot after a JSON round-trip', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('valid', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: 'valid' }))

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.snapshot.levelPackage.id).toBe('level_000')
  })

  it('rejects a payload without the SNAPSHOT_KIND tag', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))
    snapshot.kind = 'hwg/something-else'

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(false)
    expect(result.errors.find(e => e.path === 'kind')).toBeTruthy()
  })

  it('rejects a payload with a future schemaVersion', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))
    snapshot.schemaVersion = SNAPSHOT_SCHEMA_VERSION + 1

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(false)
    expect(result.errors.find(e => e.path === 'schemaVersion')).toBeTruthy()
  })

  it('rejects an engine section missing hexes / units arrays', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))
    snapshot.engine.hexes = 'not-an-array'

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(false)
    expect(result.errors.find(e => e.path === 'engine.hexes')).toBeTruthy()
  })

  // The remaining cases close the gap surfaced by code review: a payload
  // that keeps a matching `levelPackage.id` but smuggles in an engine
  // from another game (different board, foreign turntable, missing RNG)
  // used to import cleanly because GameState.fromJSON is permissive.
  // v1 validation now rejects those before any state is mutated.
  describe('schema-v1 engine contract', () => {
    function snapshotFrom(seed = 'engine-contract', pkg = makeValidPackage()) {
      const gs = makeSeededGameState(seed, pkg)
      return serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: seed }))
    }

    it('requires rng.state', () => {
      const snapshot = snapshotFrom()
      delete snapshot.engine.rng
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.rng')).toBeTruthy()
    })

    it('rejects a non-finite rng.state', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.rng.state = 'not-a-number'
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.rng.state')).toBeTruthy()
    })

    // `Number(null)` is 0, `Number("")` is 0, `Number("123")` is 123,
    // `Number(true)` is 1. A lenient coercion-based check would accept
    // all of these and silently resume the RNG from a foreign state.
    // v1 must reject non-`number` types outright.
    it.each([
      ['null', null],
      ['empty string', ''],
      ['numeric string', '123'],
      ['boolean true', true],
      ['boolean false', false]
    ])('rejects rng.state of %s (no coercion)', (_label, value) => {
      const snapshot = snapshotFrom()
      snapshot.engine.rng.state = value
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.rng.state')).toBeTruthy()
    })

    it.each([
      ['null', null],
      ['numeric string', '7'],
      ['boolean true', true]
    ])('rejects engine.initialState.rng.state of %s (no coercion)', (_label, value) => {
      const snapshot = snapshotFrom()
      snapshot.engine.initialState.rng.state = value
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.initialState.rng.state')).toBeTruthy()
    })

    it('requires history / currentTurnActions / initialState / turnState / turntable', () => {
      for (const field of ['history', 'currentTurnActions', 'initialState', 'turnState', 'turntable']) {
        const snapshot = snapshotFrom()
        delete snapshot.engine[field]
        const result = validateGameSnapshot(snapshot)
        expect(result.ok, `should reject missing engine.${field}`).toBe(false)
        expect(result.errors.find(e => e.path === `engine.${field}`)).toBeTruthy()
      }
    })

    it('rejects history entries that are not arrays', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.history = [{ not: 'an array' }]
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.history[0]')).toBeTruthy()
    })

    it('rejects unknown currentPlayer', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.currentPlayer = 'player3'
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.currentPlayer')).toBeTruthy()
    })

    it('rejects non-positive turnNumber', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.turnNumber = 0
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.turnNumber')).toBeTruthy()
    })
  })

  describe('engine ↔ levelPackage compatibility', () => {
    function snapshotFrom(seed = 'compat-seed', pkg = makeValidPackage()) {
      const gs = makeSeededGameState(seed, pkg)
      return serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: seed }))
    }

    it('rejects engine width that does not match levelPackage board', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.width += 1
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.width')).toBeTruthy()
    })

    it('rejects engine height that does not match levelPackage board', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.height += 1
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.height')).toBeTruthy()
    })

    it('rejects an engine turntable that does not deep-equal the levelPackage turntable', () => {
      const snapshot = snapshotFrom()
      // Append a stray action token to a single dice row — same id on the
      // package, but the engine half is now foreign.
      snapshot.engine.turntable.Our_operations[0].moves[0].dice[0].push('reload')
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.turntable')).toBeTruthy()
    })

    it('rejects engine objectives that do not deep-equal levelPackage objectives', () => {
      const pkg = makeValidPackage()
      pkg.objectives = {
        mode: 'firstSatisfied',
        conditions: [{ id: 'hold_2', type: 'surviveTurns', player: 'player1', turns: 2 }]
      }
      const snapshot = snapshotFrom('objectives-compat', pkg)
      snapshot.engine.objectives.primary.deadlineTurns = 3
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.objectives')).toBeTruthy()
    })

    it('rejects engine hex keys outside the package board rectangle', () => {
      const snapshot = snapshotFrom()
      // Width is 2 (valid q ∈ [0,1]); inject a hex at q=5 to simulate a
      // truncated / re-bundled engine snapshot.
      snapshot.engine.hexes.push(['5,0', { q: 5, r: 0, terrainType: 'plains' }])
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.path.startsWith('engine.hexes['))).toBe(true)
    })

    it('applyGameSnapshot reports compatibility errors without producing a result', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.width += 1
      const outcome = applyGameSnapshot(snapshot)
      expect(outcome.ok).toBe(false)
      expect(outcome).not.toHaveProperty('result')
      expect(outcome.errors.find(e => e.path === 'engine.width')).toBeTruthy()
    })
  })

  describe('strict hex coverage (truncated / duplicate / mismatched keys)', () => {
    function snapshotFrom(seed = 'hex-coverage', pkg = makeValidPackage()) {
      const gs = makeSeededGameState(seed, pkg)
      return serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: seed }))
    }

    it('rejects a truncated engine.hexes array (count != width × height)', () => {
      const snapshot = snapshotFrom()
      // Remove one cell — GameState.fromJSON would silently fill it in
      // with default plains terrain, hiding the data loss. Strict
      // coverage catches it before the engine sees the payload.
      snapshot.engine.hexes.pop()
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.path === 'engine.hexes' && /entries.*requires/.test(e.message))).toBe(true)
    })

    it('rejects duplicate engine.hexes keys', () => {
      const snapshot = snapshotFrom()
      // Replace the last entry with a duplicate of the first.
      const first = snapshot.engine.hexes[0]
      snapshot.engine.hexes[snapshot.engine.hexes.length - 1] = JSON.parse(JSON.stringify(first))
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /duplicate hex key/.test(e.message))).toBe(true)
    })

    it('rejects engine.hexes where hexData.q/r disagrees with the key', () => {
      const snapshot = snapshotFrom()
      // Take the entry for (0,0) and swap its inner q to 1 — the key
      // still says "0,0" but the cell describes a different coordinate.
      const target = snapshot.engine.hexes.find(([k]) => k === '0,0')
      target[1].q = 1
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /hex\.q must be integer 0/.test(e.message))).toBe(true)
    })

    it('rejects keys with extra commas like "0,0,extra"', () => {
      const snapshot = snapshotFrom()
      // Re-key one entry with a 3-part string. Without the explicit
      // `parts.length === 2` check this would parse to keyQ=0, keyR=0
      // and silently slip past coordinate enforcement.
      snapshot.engine.hexes[0] = ['0,0,extra', snapshot.engine.hexes[0][1]]
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /must be exactly "q,r"/.test(e.message))).toBe(true)
    })

    it('rejects non-canonical hex keys like "00,0" or " 0,0"', () => {
      const snapshot = snapshotFrom()
      // Two different strings can both `Number(...)` to the same integer
      // pair. Canonical form enforcement closes that collision channel
      // (and reverse-protects the dedupe Set).
      snapshot.engine.hexes[0] = ['00,0', snapshot.engine.hexes[0][1]]
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /is not canonical/.test(e.message))).toBe(true)
    })

    it('rejects non-object hex data (null / array / primitive)', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.hexes[0] = ['0,0', null]
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /must be a plain object/.test(e.message))).toBe(true)
    })

    it('rejects hex data missing q / r entirely', () => {
      const snapshot = snapshotFrom()
      const target = snapshot.engine.hexes.find(([k]) => k === '0,0')
      delete target[1].q
      delete target[1].r
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /hex\.q must be integer/.test(e.message))).toBe(true)
    })

    it('rejects hex data with only one of q / r', () => {
      const snapshot = snapshotFrom()
      const target = snapshot.engine.hexes.find(([k]) => k === '0,0')
      delete target[1].r
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => /hex\.r must be integer/.test(e.message))).toBe(true)
    })
  })

  describe('engine.initialState is validated as a v1 replay anchor', () => {
    function snapshotFrom(seed = 'init-anchor', pkg = makeValidPackage()) {
      const gs = makeSeededGameState(seed, pkg)
      return serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: seed }))
    }

    it('rejects an empty engine.initialState (revertTo would reconstruct a default board)', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.initialState = {}
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      // Multiple sub-errors expected (width/height/currentPlayer/etc. all missing).
      expect(result.errors.some(e => e.path.startsWith('engine.initialState.'))).toBe(true)
    })

    it('rejects engine.initialState missing rng.state', () => {
      const snapshot = snapshotFrom()
      delete snapshot.engine.initialState.rng
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.initialState.rng')).toBeTruthy()
    })

    // Regression: a `GameState` constructed without `options.rng` (legacy
    // saves restored from pre-Batch-1 localStorage, or any caller that
    // didn't pass a seed) writes `engine.rng = undefined` and the same
    // for `engine.initialState.rng`. Building a snapshot from it must
    // not silently succeed — Timeline relies on this rejection to fall
    // back to the legacy history-only export.
    it('rejects a snapshot generated from a legacy (rng-less) GameState', () => {
      const pkg = makeValidPackage('legacy_no_rng')
      const gs = new GameState({
        width: pkg.hexmap.parameters.width,
        height: pkg.hexmap.parameters.height,
        mapData: pkg.hexmap,
        terrainTypes: pkg.terrain.terrainTypes,
        unitsData: pkg.units,
        turntableData: pkg.turntable
        // no `rng` option — falls back to Math.random
      })
      const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: null }))

      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      // Both the top-level engine and its initialState anchor should be
      // missing rng.state on a legacy GameState.
      expect(result.errors.some(e => e.path === 'engine.rng')).toBe(true)
      expect(result.errors.some(e => e.path === 'engine.initialState.rng')).toBe(true)
    })

    it('rejects a foreign engine.initialState (different width than the package)', () => {
      const snapshot = snapshotFrom()
      // Live engine matches the package; the revert anchor describes a
      // different board. Without the recursive cross-check this would
      // pass and only break later inside `revertTo`.
      snapshot.engine.initialState.width += 1
      // Keep the hex count consistent so the inner v1 check doesn't trip
      // before the cross-check fires.
      snapshot.engine.initialState.hexes.push(['2,0', { q: 2, r: 0, terrain: 'plains' }])
      snapshot.engine.initialState.hexes.push(['2,1', { q: 2, r: 1, terrain: 'plains' }])
      snapshot.engine.initialState.hexes.push(['2,2', { q: 2, r: 2, terrain: 'plains' }])
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.path.startsWith('engine.initialState.'))).toBe(true)
    })

    it('rejects a truncated engine.initialState.hexes coverage', () => {
      const snapshot = snapshotFrom()
      snapshot.engine.initialState.hexes.pop()
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.path === 'engine.initialState.hexes')).toBe(true)
    })

    it('rejects a foreign turntable inside engine.initialState', () => {
      const snapshot = snapshotFrom()
      // Live engine.turntable still matches; only the anchor is corrupted.
      snapshot.engine.initialState.turntable.Our_operations[0].moves[0].dice[0].push('reload')
      const result = validateGameSnapshot(snapshot)
      expect(result.ok).toBe(false)
      expect(result.errors.find(e => e.path === 'engine.initialState.turntable')).toBeTruthy()
    })
  })

  it('rejects a snapshot with a malformed embedded LevelPackage', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))
    // Break the package so validateLevelPackage fails.
    delete snapshot.levelPackage.turntable

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path.startsWith('levelPackage'))).toBe(true)
  })

  it('forwards legacy `terrainDifficuly` migration as a warning, not an error', () => {
    const pkg = makeValidPackage()
    // Replace the canonical spelling with the legacy typo on one entry.
    pkg.terrain.terrainTypes[0] = {
      id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficuly: 0
    }
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))

    const result = validateGameSnapshot(snapshot)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => /terrainDifficuly/.test(w.message))).toBe(true)
    expect(result.snapshot.levelPackage.terrain.terrainTypes[0].terrainDifficulty).toBe(0)
  })
})

describe('applyGameSnapshot — transactional apply', () => {
  it('returns a fresh GameState that continues the source dice stream', () => {
    const pkg = makeValidPackage()
    const source = makeSeededGameState('replay-seed', pkg)
    // Burn one die so the persisted RNG state has actually advanced.
    source.rollDiceFromRng()
    source.endTurn()

    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: source, rngSeed: 'replay-seed' }))

    const outcome = applyGameSnapshot(snapshot)
    expect(outcome.ok).toBe(true)
    expect(outcome.result.levelPackage.id).toBe('level_000')
    expect(outcome.result.rngSeed).toBe('replay-seed')

    const restored = outcome.result.gameState

    // Drive both engines forward in lock-step. They must produce identical
    // dice sequences because the RNG state rode along inside `engine.rng.state`.
    const refSeq = []
    const restoredSeq = []
    for (let i = 0; i < 4; i++) {
      refSeq.push(source.rollDiceFromRng())
      restoredSeq.push(restored.rollDiceFromRng())
      source.endTurn()
      restored.endTurn()
    }
    expect(restoredSeq).toEqual(refSeq)
  })

  it('preserves history and currentTurnActions on the restored engine', () => {
    const pkg = makeValidPackage()
    const source = makeSeededGameState('history-seed', pkg)
    source.rollDiceFromRng()
    source.endTurn()
    source.rollDiceFromRng()

    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: source }))

    const outcome = applyGameSnapshot(snapshot)
    expect(outcome.ok).toBe(true)
    const restored = outcome.result.gameState
    expect(restored.history).toHaveLength(1)
    expect(restored.history[0].some(a => a.type === 'dice_roll')).toBe(true)
    expect(restored.currentTurnActions.some(a => a.type === 'dice_roll')).toBe(true)
  })

  it('rejects a snapshot whose level id does not match expectedLevelId', () => {
    const pkg = makeValidPackage('level_777')
    const gs = makeSeededGameState('mismatch', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))

    const outcome = applyGameSnapshot(snapshot, { expectedLevelId: 'level_000' })
    expect(outcome.ok).toBe(false)
    expect(outcome.errors.find(e => e.path === 'levelPackage.id')).toBeTruthy()
    // The error message includes both ids so the user can see the mismatch.
    const msg = outcome.errors.find(e => e.path === 'levelPackage.id').message
    expect(msg).toMatch(/level_777/)
    expect(msg).toMatch(/level_000/)
  })

  it('accepts the snapshot when expectedLevelId is omitted (cold-start import)', () => {
    const pkg = makeValidPackage('level_random')
    const gs = makeSeededGameState('any', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))

    const outcome = applyGameSnapshot(snapshot) // no expectedLevelId
    expect(outcome.ok).toBe(true)
    expect(outcome.result.levelPackage.id).toBe('level_random')
  })

  it('does not produce a gameState when the snapshot is invalid', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('seed', pkg)
    const snapshot = serdes(createGameSnapshot({ levelPackage: pkg, gameState: gs }))
    // Break the kind tag so the whole apply must short-circuit.
    snapshot.kind = 'something-else'

    const outcome = applyGameSnapshot(snapshot)
    expect(outcome.ok).toBe(false)
    expect(outcome.errors.length).toBeGreaterThan(0)
    expect(outcome).not.toHaveProperty('result')
  })
})

describe('applyGameSnapshotFromJSON', () => {
  it('parses + applies in one call', () => {
    const pkg = makeValidPackage()
    const gs = makeSeededGameState('json-seed', pkg)
    const json = JSON.stringify(createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: 'json-seed' }))

    const outcome = applyGameSnapshotFromJSON(json)
    expect(outcome.ok).toBe(true)
    expect(outcome.result.rngSeed).toBe('json-seed')
  })

  it('returns a structured error on invalid JSON without throwing', () => {
    const outcome = applyGameSnapshotFromJSON('not-json')
    expect(outcome.ok).toBe(false)
    expect(outcome.errors[0].message).toMatch(/invalid JSON/i)
  })
})
