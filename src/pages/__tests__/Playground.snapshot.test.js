// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Playground from '../Playground.vue'
import { loadLevelPackage } from '../../domain/level/loadLevelPackage'
import { GameState } from '@/domain/engine/gameState.js'
import { DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID } from '@/domain/engine/gameUnits.js'
import { createRng } from '../../domain/simulation/rng'
import { createGameSnapshot } from '../../domain/snapshot/gameSnapshot'

vi.mock('../../domain/level/loadLevelPackage', () => ({
  loadLevelPackage: vi.fn()
}))

/**
 * Component-level coverage for the snapshot import flow added in Batch 2:
 *
 *   TimelineBlock 'import-history' emit
 *     -> Playground.onImportHistory
 *     -> isGameSnapshotEnvelope dispatch:
 *          - GameSnapshot envelope -> applyGameSnapshot, atomic commit
 *          - legacy history JSON   -> gameController.importHistory
 *
 * Heavy children are stubbed; the test focuses on the routing decision
 * and the atomic commit on success / non-mutation on failure.
 */

const stubChildComponents = {
  HeaderComponent: { template: '<div />' },
  MovesTableBlock: {
    props: ['movesData', 'gameState'],
    template: '<div data-testid="moves-table-stub" />'
  },
  TimelineBlock: {
    name: 'TimelineBlock',
    props: ['gameState', 'levelPackage', 'rngSeed'],
    emits: ['end-turn', 'revert-game', 'import-history'],
    template: '<div data-testid="timeline-stub" />'
  },
  GameMapBlock: {
    name: 'GameMapBlock',
    props: [
      'mapData', 'terrainTypes', 'gameState', 'gameController',
      'selectedHexDropdownPosition',
      'showFloatingPanel', 'commandSeq', 'attackTargetShiftIntent', 'deselectIntent',
      'actionsDisabled'
    ],
    emits: [
      'hex-selected', 'game-state-updated',
      'update-selected-hex-dropdown-position',
      'update:showFloatingPanel', 'selection-inspector-bridge'
    ],
    template: '<div data-testid="game-map-stub" />'
  },
  GameEngineBlock: {
    name: 'GameEngineBlock',
    props: [
      'selectedHex', 'mapData', 'gameState', 'gameController',
      'isRestoring', 'isInitializingGlobal', 'showFloatingPanel', 'selectionInspectorBridge',
      'levelOptions', 'selectedLevelId', 'seed', 'loadedPackage',
      'loadedSource', 'loadedWarnings', 'isStartingGame'
    ],
    emits: [
      'level-selected', 'seed-updated',
      'load-selected-level', 'upload-archive', 'start-game',
      'game-state-updated', 'reset-game', 'dice-rolling-changed', 'deselect',
      'end-turn', 'restart-game',
      'update:showFloatingPanel', 'move-unit-forward', 'move-unit-reverse',
      'rotate-unit-clockwise', 'rotate-unit-counterclockwise', 'fire',
      'reload', 'attack-target-shift'
    ],
    template: '<div data-testid="engine-stub" />'
  },
  SelectionBlock: {
    name: 'SelectionBlock',
    props: [
      'selectedHex', 'gameState', 'showFloatingPanel',
      'selectionInspectorBridge', 'actionsDisabled'
    ],
    emits: [
      'deselect', 'update:showFloatingPanel', 'move-unit-forward', 'move-unit-reverse',
      'rotate-unit-clockwise', 'rotate-unit-counterclockwise', 'fire',
      'reload', 'attack-target-shift'
    ],
    template: '<div data-testid="selection-stub" />'
  }
}

/**
 * Full LevelPackage shape that passes `validateLevelPackage`. The board
 * is intentionally small (2×3) so the snapshot stays compact and assertions
 * over engine/level coordinates are easy to write.
 */
function makeValidPackage(id = 'level_snapshot') {
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
      player1: { units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ] },
      player2: { units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ] }
    },
    turntable: {
      Our_operations: [
        { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [
          ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
        ] }] },
        { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [
          ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
        ] }] }
      ],
      Enemy_operations: [
        { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [
          ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
        ] }] },
        { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [
          ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
        ] }] }
      ]
    }
  }
}

function buildSnapshotJSON({ pkg = makeValidPackage(), seed = 'snap-seed', burnDice = false } = {}) {
  const gs = new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    rng: createRng(seed)
  })
  if (burnDice) {
    gs.rollDiceFromRng()
    gs.endTurn()
  }
  const snapshot = createGameSnapshot({ levelPackage: pkg, gameState: gs, rngSeed: seed })
  return JSON.stringify(snapshot)
}

let notifySpy
beforeEach(() => {
  loadLevelPackage.mockReset()
  notifySpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  // eslint-disable-next-line no-undef
  window.$notify = notifySpy
})
afterEach(() => {
  vi.restoreAllMocks()
  // eslint-disable-next-line no-undef
  delete window.$notify
})

async function mountCold() {
  return mount(Playground, {
    global: { stubs: stubChildComponents }
  })
}

async function mountWithLevel(pkg) {
  loadLevelPackage.mockResolvedValue({ ok: true, warnings: [], package: pkg })
  const wrapper = await mountCold()
  const loaded = await wrapper.vm.loadLevelById({ levelId: pkg.id, seed: 'initial-seed', source: 'default' })
  if (loaded) wrapper.vm.startLoadedLevel({ seed: 'initial-seed' })
  // Reset the notification spies so post-init assertions only see the
  // calls produced by the snapshot import being exercised.
  notifySpy.success.mockClear()
  notifySpy.info.mockClear()
  notifySpy.warning.mockClear()
  notifySpy.error.mockClear()
  return wrapper
}

describe('Playground snapshot import routing', () => {
  it('imports a GameSnapshot from a cold app state (no level loaded) and commits all level + RNG + engine fields', async () => {
    const pkg = makeValidPackage('level_cold_import')
    const json = buildSnapshotJSON({ pkg, seed: 'cold-seed', burnDice: true })
    const wrapper = await mountCold()
    expect(wrapper.vm.levelId).toBe(null)
    expect(wrapper.vm.gameState).toBe(null)

    wrapper.vm.onImportHistory(json)

    expect(wrapper.vm.levelId).toBe('level_cold_import')
    expect(wrapper.vm.rngSeed).toBe('cold-seed')
    expect(wrapper.vm.currentMapData).toBeTruthy()
    expect(wrapper.vm.currentMapData.parameters.width).toBe(pkg.hexmap.parameters.width)
    expect(wrapper.vm.terrainTypes).toEqual(pkg.terrain.terrainTypes)
    expect(wrapper.vm.currentMovesData).toEqual(pkg.turntable)
    expect(wrapper.vm.unitsData.player1.units[0].type).toBe(DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry)
    expect(wrapper.vm.unitsData.player2.units[0].type).toBe(DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry)
    expect(wrapper.vm.unitsData.unitTypes.map(t => t.id)).toEqual(
      expect.arrayContaining([
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.armored,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.artillery,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.scout
      ])
    )
    expect(wrapper.vm.gameState).toBeTruthy()
    expect(wrapper.vm.gameState.turnNumber).toBeGreaterThanOrEqual(1)
    expect(notifySpy.success).toHaveBeenCalledWith(
      'Snapshot imported',
      expect.stringContaining('level_cold_import')
    )
    expect(notifySpy.error).not.toHaveBeenCalled()
  })

  it('rejects a snapshot for a different level without mutating the live game', async () => {
    const livePkg = makeValidPackage('level_live')
    const wrapper = await mountWithLevel(livePkg)
    // Capture the pre-import live snapshot to assert nothing mutates.
    const beforeLevelId = wrapper.vm.levelId
    const beforeGameStateRef = wrapper.vm.gameState
    const beforeRngSeed = wrapper.vm.rngSeed
    const beforeMapData = wrapper.vm.currentMapData

    const foreignPkg = makeValidPackage('level_foreign')
    const json = buildSnapshotJSON({ pkg: foreignPkg, seed: 'foreign-seed' })

    wrapper.vm.onImportHistory(json)

    expect(wrapper.vm.levelId).toBe(beforeLevelId)
    expect(wrapper.vm.levelId).toBe('level_live')
    expect(wrapper.vm.gameState).toBe(beforeGameStateRef)
    expect(wrapper.vm.rngSeed).toBe(beforeRngSeed)
    expect(wrapper.vm.currentMapData).toBe(beforeMapData)
    expect(notifySpy.error).toHaveBeenCalledWith(
      'Import failed',
      expect.stringContaining('level_foreign')
    )
    expect(notifySpy.success).not.toHaveBeenCalled()
  })

  it('rejects a malformed snapshot (mismatched engine ↔ levelPackage) without mutation', async () => {
    const livePkg = makeValidPackage('level_live_2')
    const wrapper = await mountWithLevel(livePkg)
    const beforeGameStateRef = wrapper.vm.gameState

    // Build a snapshot for the same level id, then corrupt the engine
    // turntable so the engine ↔ levelPackage compatibility check fails.
    const samePkg = makeValidPackage('level_live_2')
    const json = buildSnapshotJSON({ pkg: samePkg, seed: 'corrupt-seed' })
    const parsed = JSON.parse(json)
    parsed.engine.turntable.Our_operations[0].moves[0].dice[0].push('reload')

    wrapper.vm.onImportHistory(JSON.stringify(parsed))

    expect(wrapper.vm.gameState).toBe(beforeGameStateRef)
    expect(notifySpy.error).toHaveBeenCalledWith('Import failed', expect.any(String))
  })

  it('routes a legacy history-only JSON through gameController.importHistory (no level swap)', async () => {
    const livePkg = makeValidPackage('level_legacy')
    const wrapper = await mountWithLevel(livePkg)
    const liveGameState = wrapper.vm.gameState
    const importSpy = vi.spyOn(liveGameState, 'loadHistoryJSON').mockReturnValue(true)
    const beforeLevelId = wrapper.vm.levelId

    // Legacy export shape: no `kind`, no `schemaVersion`, just the original
    // `getHistoryJSON` envelope.
    const legacyJson = JSON.stringify({
      initialState: liveGameState.initialState,
      history: [],
      currentTurnActions: []
    })

    wrapper.vm.onImportHistory(legacyJson)

    expect(importSpy).toHaveBeenCalledWith(legacyJson)
    expect(wrapper.vm.levelId).toBe(beforeLevelId)
    expect(notifySpy.success).toHaveBeenCalledWith(
      'History imported',
      expect.any(String)
    )
  })

  it('routes invalid JSON through the legacy import path and surfaces the engine error', async () => {
    const livePkg = makeValidPackage('level_invalid_json')
    const wrapper = await mountWithLevel(livePkg)
    const liveGameState = wrapper.vm.gameState
    // Engine returns false on a bogus payload — controller maps that to IMPORT_REJECTED.
    vi.spyOn(liveGameState, 'loadHistoryJSON').mockReturnValue(false)

    wrapper.vm.onImportHistory('not-json-at-all')

    expect(notifySpy.error).toHaveBeenCalledWith('Import failed', expect.any(String))
    expect(notifySpy.success).not.toHaveBeenCalled()
  })
})
