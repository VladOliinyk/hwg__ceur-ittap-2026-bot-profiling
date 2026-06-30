import { describe, it, expect } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { stepCostToEnter } from '@/domain/engine/actionEconomy.js'

const turntable = {
  Our_operations: [
    { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
    { title: 'ATTACK', moves: [{ dice: [['fire'], ['fire'], ['fire'], ['fire'], ['fire'], ['fire']] }] }
  ],
  Enemy_operations: [
    { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
    { title: 'ATTACK', moves: [{ dice: [['fire'], ['fire'], ['fire'], ['fire'], ['fire'], ['fire']] }] }
  ]
}

function legacyForestHexData() {
  return { q: 0, r: 0, terrain: { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficuly: 2 } }
}

/**
 * Regression: a pre-Batch-4 localStorage payload may have `hex.terrain`
 * entries that carry only the legacy `terrainDifficuly` typo. After
 * Batch 4 stopped silently falling back to that key in engine code
 * (`actionEconomy.stepCostToEnter`, `createBoardSnapshot`,
 * `canMoveOnTerrain`), naive restore would have treated every cell as
 * cost 0. `GameHex` now migrates the typo at the persistence boundary
 * so old saves continue to produce correct movement costs.
 */
describe('GameState.fromJSON — legacy terrain typo migration at persistence boundary', () => {
  it('restores hex.terrain.terrainDifficulty from a snapshot that only stored terrainDifficuly', () => {
    // Build a v1-ish snapshot by hand. We deliberately bypass the
    // validator so the legacy typo survives onto disk — that is what a
    // pre-Batch-4 save actually looks like.
    const snapshot = {
      width: 1,
      height: 1,
      currentPlayer: 'player1',
      turnNumber: 1,
      gamePhase: 'playing',
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'], ['fire'], ['fire'], ['fire'], ['fire'], ['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'], ['fire'], ['fire'], ['fire'], ['fire'], ['fire']] }] }
        ]
      },
      hexes: [[
        '0,0',
        {
          q: 0, r: 0,
          // Legacy: only the typo key is present, no canonical field.
          terrain: { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficuly: 2 }
        }
      ]],
      units: [],
      turnState: {},
      history: [],
      currentTurnActions: [],
      initialState: null
    }

    const restored = GameState.fromJSON(snapshot)
    const hex = restored.hexes.get('0,0')
    expect(hex).toBeTruthy()
    // Canonical name is populated from the legacy value at restore time.
    expect(hex.terrain.terrainDifficulty).toBe(2)
    // And the legacy key is stripped, so a re-export through toJSON does
    // not write the typo back to disk.
    expect('terrainDifficuly' in hex.terrain).toBe(false)
  })

  it('movement cost computation uses the migrated canonical field, not 0', () => {
    // Same fixture flavour but exercised end-to-end: a restored board
    // snapshot must produce the same `stepCostToEnter` as a freshly
    // built board would, otherwise legacy saves silently turn into
    // zero-cost terrain after Batch 4.
    const snapshot = {
      width: 1, height: 1, currentPlayer: 'player1', turnNumber: 1, gamePhase: 'playing',
      turntable,
      hexes: [['0,0', legacyForestHexData()]],
      units: [], turnState: {}, history: [], currentTurnActions: [], initialState: null
    }
    const restored = GameState.fromJSON(snapshot)
    const boardState = restored.createBoardSnapshot()
    const unit = { type: 'infantry', maxTerrainDifficulty: 10 }
    // forest terrainDifficulty=2 → MINIMAL_MOVE_COST(1) + 2 = 3.
    expect(stepCostToEnter(unit, { q: 0, r: 0 }, boardState)).toBe(3)
  })

  it('normalizes the nested replay anchor (`initialState.hexes`) so a re-exported snapshot does not reintroduce the typo', () => {
    // Realistic pre-Batch-4 save shape: the live `hexes` carries the
    // typo AND the replay anchor `initialState.hexes` (used by
    // `revertTo`) carries the same typo. Without normalization of
    // `initialState`, the live board would be fixed but `toJSON(true)`
    // would re-export the raw `initialState` and write the typo back
    // to disk — defeating the "input-only legacy" promise on
    // save/restore cycles.
    const innerAnchor = {
      width: 1, height: 1, currentPlayer: 'player1', turnNumber: 1, gamePhase: 'playing',
      turntable,
      hexes: [['0,0', legacyForestHexData()]],
      units: [], turnState: {}, selectedUnit: null, selectedHex: null
    }
    const snapshot = {
      width: 1, height: 1, currentPlayer: 'player1', turnNumber: 1, gamePhase: 'playing',
      turntable,
      hexes: [['0,0', legacyForestHexData()]],
      units: [], turnState: {}, history: [], currentTurnActions: [],
      initialState: innerAnchor
    }
    const restored = GameState.fromJSON(snapshot)
    // Live restored hex is already canonical (GameHex constructor migration).
    const liveHex = restored.hexes.get('0,0')
    expect(liveHex.terrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in liveHex.terrain).toBe(false)

    // The replay anchor is also migrated.
    const restoredAnchorHexEntry = restored.initialState.hexes.find(([k]) => k === '0,0')
    expect(restoredAnchorHexEntry).toBeTruthy()
    const restoredAnchorTerrain = restoredAnchorHexEntry[1].terrain
    expect(restoredAnchorTerrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in restoredAnchorTerrain).toBe(false)

    // And a subsequent round trip through toJSON(true) does NOT
    // reintroduce the typo on either side of the artifact.
    const reExported = JSON.parse(JSON.stringify(restored.toJSON(true)))
    const reLiveHexEntry = reExported.hexes.find(([k]) => k === '0,0')
    expect(reLiveHexEntry[1].terrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in reLiveHexEntry[1].terrain).toBe(false)
    const reAnchorHexEntry = reExported.initialState.hexes.find(([k]) => k === '0,0')
    expect(reAnchorHexEntry[1].terrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in reAnchorHexEntry[1].terrain).toBe(false)
  })
})

describe('GameState.loadHistoryJSON — legacy terrain typo migration on history-only import', () => {
  it('commits the normalized replay anchor so getHistoryJSON does not re-export the legacy typo', () => {
    // History-only payload (legacy export path): a pre-Batch-4 file
    // carries the typo on `initialState.hexes[*].terrain`. The fix to
    // `GameState.fromJSON` migrates the anchor for the *full-snapshot*
    // path, but `loadHistoryJSON` has its own commit step that used to
    // copy `data.initialState` verbatim into `this.initialState`,
    // bypassing the normalization. This test guards that path.
    const legacyAnchor = {
      width: 1, height: 1, currentPlayer: 'player1', turnNumber: 1, gamePhase: 'playing',
      turntable,
      hexes: [['0,0', legacyForestHexData()]],
      units: [], turnState: {}, selectedUnit: null, selectedHex: null
    }
    const historyPayload = {
      initialState: legacyAnchor,
      history: [],
      currentTurnActions: []
    }

    // Build a live engine on a clean canonical board, then import the
    // legacy history payload into it (this is exactly what the
    // Timeline "Import history" code path does).
    const live = new GameState({
      currentPlayer: 'player1',
      turntableData: turntable,
      mapData: {
        parameters: { width: 1, height: 1 },
        map: [{ q: 0, r: 0, terrain: 'plains' }]
      },
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }],
      unitsData: { player1: { units: [] }, player2: { units: [] } }
    })

    const ok = live.loadHistoryJSON(JSON.stringify(historyPayload))
    expect(ok).toBe(true)

    // The live replay anchor must be normalized — no legacy key.
    const liveAnchorTerrain = live.initialState.hexes.find(([k]) => k === '0,0')[1].terrain
    expect(liveAnchorTerrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in liveAnchorTerrain).toBe(false)

    // And the corresponding `getHistoryJSON` re-export must not write
    // the typo back to disk.
    const reExported = JSON.parse(live.getHistoryJSON())
    const reAnchorTerrain = reExported.initialState.hexes.find(([k]) => k === '0,0')[1].terrain
    expect(reAnchorTerrain.terrainDifficulty).toBe(2)
    expect('terrainDifficuly' in reAnchorTerrain).toBe(false)
  })
})
