import { describe, expect, it } from 'vitest'
import {
  buildGameStateFromLevelPackage,
  clonePlaybackValue,
  diceFaceFromActions,
  diceRollFrameKey,
  hasEngineDynamicSnapshot,
  hasFrameDynamicSnapshot,
  isSimulationTrace,
  makePlaybackDiceRollFrame,
  normalizeTraceForPlayback,
  stripDiceRollFromFrame
} from '../tracePlayback.js'

/**
 * Level package with MULTIPLE same-type units on MULTIPLE distinct spawn hexes.
 * That makes `placeUnitsFromLevel`'s Fisher-Yates shuffle observable: with one
 * unit on one spawn the layout is fixed, but with N units on N spawns the
 * id→position mapping depends entirely on the RNG draw, so a fixed seed must
 * reproduce it byte-for-byte while a different seed may permute it.
 */
function makeMultiSpawnLevelPackage() {
  const width = 6
  const height = 3
  const map = []
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      map.push({ q, r, terrain: 'plains' })
    }
  }
  // Three player1 spawns on the left column, three player2 spawns on the right.
  map.find(c => c.q === 0 && c.r === 0).player1Spawn = true
  map.find(c => c.q === 0 && c.r === 1).player1Spawn = true
  map.find(c => c.q === 0 && c.r === 2).player1Spawn = true
  map.find(c => c.q === 5 && c.r === 0).player2Spawn = true
  map.find(c => c.q === 5 && c.r === 1).player2Spawn = true
  map.find(c => c.q === 5 && c.r === 2).player2Spawn = true

  const roster = player => ({
    units: [
      { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackAngle: 1, attackPower: 30, maxTerrainDifficulty: 10, count: 3 }
    ]
  })

  return {
    id: 'multi-spawn',
    hexmap: { parameters: { width, height }, map },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4caf50', terrainDifficulty: 0 }
      ]
    },
    units: {
      player1: roster('player1'),
      player2: roster('player2')
    },
    turntable: {
      Our_operations: [],
      Enemy_operations: []
    }
  }
}

/** Map an engine snapshot's units to a stable `id -> "q,r"` layout signature. */
function unitLayoutSignature(engine) {
  return (engine.units || [])
    .map(([, unit]) => `${unit.id}@${unit.position.q},${unit.position.r}`)
    .sort()
    .join('|')
}

/** Minimal v2 trace: dynamic state per frame, no per-frame hexes. */
function makeTraceWithFrames(frames) {
  return {
    kind: 'hwg/simulation-trace',
    schemaVersion: 2,
    createdAt: '2026-06-16T00:00:00.000Z',
    levelPackage: { id: 'fixture' },
    runConfig: { seed: 'fixture-seed' },
    result: { winner: 'player1' },
    frames
  }
}

describe('tracePlayback — isSimulationTrace', () => {
  it('accepts a well-formed trace with a frames array', () => {
    expect(isSimulationTrace(makeTraceWithFrames([]))).toBe(true)
  })

  it('rejects payloads with the wrong kind or missing frames', () => {
    expect(isSimulationTrace(null)).toBe(false)
    expect(isSimulationTrace({})).toBe(false)
    expect(isSimulationTrace({ kind: 'hwg/simulation-trace' })).toBe(false)
    expect(isSimulationTrace({ kind: 'other', frames: [] })).toBe(false)
  })
})

describe('tracePlayback — dynamic snapshot detection (v1 vs v2)', () => {
  it('treats a frame carrying units as a usable dynamic snapshot', () => {
    const v1Frame = { engine: { units: [['p1_inf1', { id: 'p1_inf1' }]], hexes: [['0,0', {}]] } }
    expect(hasEngineDynamicSnapshot(v1Frame.engine)).toBe(true)
    expect(hasFrameDynamicSnapshot(v1Frame)).toBe(true)
  })

  it('treats a dynamic-only engine WITH units as a snapshot regardless of hexes', () => {
    // schemaVersion 2: no per-frame hexes, but units present -> still dynamic.
    const v2Frame = { engine: { units: [['p1_inf1', { id: 'p1_inf1' }]] } }
    expect(hasFrameDynamicSnapshot(v2Frame)).toBe(true)
  })

  it('rejects engines/frames with no units (the fallback case)', () => {
    expect(hasEngineDynamicSnapshot({ units: [] })).toBe(false)
    expect(hasEngineDynamicSnapshot({})).toBe(false)
    expect(hasEngineDynamicSnapshot(null)).toBe(false)
    expect(hasFrameDynamicSnapshot({})).toBe(false)
    expect(hasFrameDynamicSnapshot({ engine: { units: [] } })).toBe(false)
    expect(hasFrameDynamicSnapshot(null)).toBe(false)
  })
})

describe('tracePlayback — diceFaceFromActions', () => {
  it('extracts the most recent dice face, normalized to 1..6', () => {
    expect(diceFaceFromActions([{ type: 'dice_roll', result: 4 }])).toBe(4)
    expect(diceFaceFromActions([
      { type: 'startTurn' },
      { type: 'dice_roll', result: 2 },
      { type: 'dice_roll', result: 6 }
    ])).toBe(6)
  })

  it('returns null when no dice_roll action is present or input is invalid', () => {
    expect(diceFaceFromActions([{ type: 'startTurn' }])).toBeNull()
    expect(diceFaceFromActions([])).toBeNull()
    expect(diceFaceFromActions(null)).toBeNull()
  })
})

describe('tracePlayback — clonePlaybackValue', () => {
  it('deep-clones JSON-serializable values', () => {
    const src = { a: 1, nested: { b: [1, 2, 3] } }
    const clone = clonePlaybackValue(src)
    expect(clone).toEqual(src)
    expect(clone).not.toBe(src)
    expect(clone.nested).not.toBe(src.nested)
  })

  it('returns the fallback for null/undefined inputs', () => {
    expect(clonePlaybackValue(null, 'fallback')).toBe('fallback')
    expect(clonePlaybackValue(undefined, 'fallback')).toBe('fallback')
  })
})

describe('tracePlayback — diceRollFrameKey', () => {
  it('keys a frame by player, turn and dice face', () => {
    const frame = { actingPlayer: 'player1', turnNumber: 2, diceResult: 5, engine: {} }
    expect(diceRollFrameKey(frame)).toBe('player1:2:d5')
  })

  it('falls back to engine-derived dice/turn/player and returns "" without a face', () => {
    const frame = {
      engine: {
        currentPlayer: 'player2',
        turnNumber: 3,
        currentTurnActions: [{ type: 'dice_roll', result: 1 }]
      }
    }
    expect(diceRollFrameKey(frame)).toBe('player2:3:d1')
    expect(diceRollFrameKey({ engine: {} })).toBe('')
    expect(diceRollFrameKey(null)).toBe('')
  })
})

describe('tracePlayback — stripDiceRollFromFrame', () => {
  it('clears diceResult and removes dice_roll actions without mutating the source', () => {
    const frame = {
      diceResult: 4,
      engine: {
        currentTurnActions: [
          { type: 'startTurn' },
          { type: 'dice_roll', result: 4 }
        ]
      }
    }
    const stripped = stripDiceRollFromFrame(frame)
    expect(stripped.diceResult).toBeNull()
    expect(stripped.engine.currentTurnActions).toEqual([{ type: 'startTurn' }])
    // Source untouched (deep clone).
    expect(frame.diceResult).toBe(4)
    expect(frame.engine.currentTurnActions).toHaveLength(2)
  })
})

describe('tracePlayback — makePlaybackDiceRollFrame', () => {
  it('synthesizes a diceRoll frame carrying the face and a dice_roll action', () => {
    const source = {
      actingPlayer: 'player1',
      turnNumber: 1,
      diceResult: 3,
      command: { type: 'move' },
      engine: { currentPlayer: 'player1', currentTurnActions: [{ type: 'startTurn' }] }
    }
    const diceFrame = makePlaybackDiceRollFrame(source)
    expect(diceFrame.event).toBe('diceRoll')
    expect(diceFrame.diceResult).toBe(3)
    expect(diceFrame.command).toBeNull()
    expect(diceFrame.actingPlayer).toBe('player1')
    expect(diceFrame.label).toBe('Rolled D6 for player1')
    expect(diceFrame.engine.currentTurnActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dice_roll', player: 'player1', result: 3 })
      ])
    )
  })

  it('returns null when the source frame has no extractable face', () => {
    expect(makePlaybackDiceRollFrame({ engine: {} })).toBeNull()
  })
})

describe('tracePlayback — normalizeTraceForPlayback', () => {
  it('returns non-trace inputs unchanged', () => {
    expect(normalizeTraceForPlayback(null)).toBeNull()
    const notTrace = { kind: 'other' }
    expect(normalizeTraceForPlayback(notTrace)).toBe(notTrace)
  })

  it('leaves traces that already contain diceRoll frames untouched', () => {
    const trace = makeTraceWithFrames([
      { event: 'initial', engine: {} },
      { event: 'diceRoll', diceResult: 2, engine: {} }
    ])
    expect(normalizeTraceForPlayback(trace)).toBe(trace)
  })

  it('deep-clones and synthesizes a diceRoll frame after the initial frame', () => {
    const trace = makeTraceWithFrames([
      {
        event: 'initial',
        actingPlayer: 'player1',
        turnNumber: 1,
        diceResult: 5,
        command: null,
        engine: { currentPlayer: 'player1', currentTurnActions: [{ type: 'startTurn' }] }
      }
    ])
    const normalized = normalizeTraceForPlayback(trace)

    // New trace object, original frames untouched.
    expect(normalized).not.toBe(trace)
    expect(trace.frames).toHaveLength(1)

    // initial (dice stripped) + synthesized diceRoll.
    expect(normalized.frames).toHaveLength(2)
    expect(normalized.frames[0].event).toBe('initial')
    expect(normalized.frames[0].diceResult).toBeNull()
    expect(normalized.frames[1].event).toBe('diceRoll')
    expect(normalized.frames[1].diceResult).toBe(5)

    // Reindexed sequentially.
    expect(normalized.frames.map(f => f.index)).toEqual([0, 1])
  })

  it('injects a diceRoll frame before a command frame that introduces a new face', () => {
    const trace = makeTraceWithFrames([
      {
        event: 'afterCommand',
        actingPlayer: 'player1',
        turnNumber: 1,
        diceResult: 4,
        command: { type: 'move', unitId: 'p1_inf1' },
        engine: { currentPlayer: 'player1', currentTurnActions: [{ type: 'dice_roll', result: 4 }] }
      }
    ])
    const normalized = normalizeTraceForPlayback(trace)
    expect(normalized.frames).toHaveLength(2)
    expect(normalized.frames[0].event).toBe('diceRoll')
    expect(normalized.frames[0].diceResult).toBe(4)
    expect(normalized.frames[1].event).toBe('afterCommand')
    expect(normalized.frames[1].command).toMatchObject({ type: 'move' })
  })
})

describe('tracePlayback — buildGameStateFromLevelPackage', () => {
  it('returns null for a level package without hexmap parameters', () => {
    expect(buildGameStateFromLevelPackage(null)).toBeNull()
    expect(buildGameStateFromLevelPackage({})).toBeNull()
    expect(buildGameStateFromLevelPackage({ hexmap: {} })).toBeNull()
  })

  it('builds an engine snapshot with hexes and units from the package', () => {
    const pkg = makeMultiSpawnLevelPackage()
    const engine = buildGameStateFromLevelPackage(pkg)
    expect(Array.isArray(engine.hexes)).toBe(true)
    expect(engine.hexes.length).toBeGreaterThan(0)
    expect(Array.isArray(engine.units)).toBe(true)
    // 3 player1 + 3 player2 units across the 6 spawns.
    expect(engine.units).toHaveLength(6)
  })

  it('overlays currentPlayer/turnNumber and appends a dice_roll from the frame', () => {
    const pkg = makeMultiSpawnLevelPackage()
    const engine = buildGameStateFromLevelPackage(pkg, {
      currentPlayer: 'player2',
      turnNumber: 7,
      diceResult: 6
    })
    expect(engine.currentPlayer).toBe('player2')
    expect(engine.turnNumber).toBe(7)
    expect(engine.currentTurnActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dice_roll', result: 6 })
      ])
    )
  })

  it('is DETERMINISTIC for a fixed seed: two builds produce identical unit positions', () => {
    const pkg = makeMultiSpawnLevelPackage()
    const a = buildGameStateFromLevelPackage(pkg, {}, 'seed-determinism')
    const b = buildGameStateFromLevelPackage(pkg, {}, 'seed-determinism')
    const sigA = unitLayoutSignature(a)
    const sigB = unitLayoutSignature(b)
    expect(sigA).toBe(sigB)
    // Sanity: all six units actually placed at distinct hexes.
    expect(sigA.split('|')).toHaveLength(6)
  })

  it('lets the seed drive placement: at least one other seed yields a different layout', () => {
    const pkg = makeMultiSpawnLevelPackage()
    const baseline = unitLayoutSignature(buildGameStateFromLevelPackage(pkg, {}, 'seed-a'))
    const candidates = ['seed-b', 'seed-c', 'seed-d', 'seed-e', 'seed-f', 'seed-g']
    const anyDifferent = candidates.some(seed => {
      return unitLayoutSignature(buildGameStateFromLevelPackage(pkg, {}, seed)) !== baseline
    })
    expect(anyDifferent).toBe(true)
  })

  it('preserves today\'s behavior with no seed (builds a valid snapshot, no crash)', () => {
    const pkg = makeMultiSpawnLevelPackage()
    const engine = buildGameStateFromLevelPackage(pkg)
    expect(engine.units).toHaveLength(6)
    // Without a seed the layout uses Math.random; we only assert it does not
    // throw and still places every unit somewhere valid.
    for (const [, unit] of engine.units) {
      expect(Number.isInteger(unit.position.q)).toBe(true)
      expect(Number.isInteger(unit.position.r)).toBe(true)
    }
  })
})
