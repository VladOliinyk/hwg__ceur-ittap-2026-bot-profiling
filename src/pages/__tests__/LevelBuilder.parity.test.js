// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// `HexMapEditorCanvas.vue` calls webpack-style `require('@/assets/icons/...')`
// at module top-level, which Vitest's ESM context cannot evaluate. The
// parity tests below exercise `LevelBuilder.methods` directly without
// rendering child components, so a noop stub is sufficient to let the
// page import resolve. The other level-builder children keep their
// `require()` inside `data()` and load cleanly.
vi.mock('@/components/level-builder/HexMapEditorCanvas.vue', () => ({
  default: { name: 'HexMapEditorCanvas', render: () => null }
}))
vi.mock('../../components/level-builder/HexMapEditorCanvas.vue', () => ({
  default: { name: 'HexMapEditorCanvas', render: () => null }
}))

import LevelBuilder from '../LevelBuilder.vue'
import { i18nTextMixin } from '../../ui/i18nTextMixin.js'
import { validateLevelPackage } from '../../domain/level/validateLevelPackage'
import {
  BUILDER_DRAFT_STORAGE_KEY,
  loadBuilderDraft,
  saveBuilderDraft as saveBuilderDraftToStorage
} from '../../domain/level/builderDraftStorage.js'

// LevelBuilder gets uiText/uiFormat/notifyUser/notificationText from the
// shared i18nTextMixin (Finding #49). The hand-rolled vm proxy below resolves
// methods from a plain object, so merge the mixin methods in the same way Vue
// does — component-own methods win on any name collision.
const LEVEL_BUILDER_METHODS = { ...i18nTextMixin.methods, ...LevelBuilder.methods }
import {
  builderStateToPackage,
  packageToBuilderState,
  copyTurntableSide
} from '../../domain/level/builderPackage'
import { OBJECTIVE_TYPES } from '../../domain/objectives/objectives'
import { computeHexPolygonGeometry } from '@/domain/engine/hexUtils.js'
import { hexMap } from '../../config/theme.js'
import { DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID } from '@/domain/engine/gameUnits.js'
import {
  BUILDER_PLAYTEST_QUERY_KEY,
  consumeBuilderPlaytestHandoff
} from '../../domain/level/builderPlaytestLevels.js'

/**
 * Page-level state tests for `LevelBuilder.vue` — the canonical builder
 * page. Originally introduced as parity lock-in against the now-removed
 * `src/pages/HexMapBuilder.vue` (Task B1); after the Task D3 cleanup
 * these tests are the primary contract for the page's domain-helper
 * wiring (loading, generation, painting, validation, import/export,
 * units, and turntable).
 *
 * Tests exercise the page's methods directly (no `mount()` because the
 * SFC's `data()` factory uses webpack `require()` for overlay icons,
 * which Vitest's ESM context cannot evaluate) and assert against the
 * pure domain helpers — so any future refactor that diverges from the
 * domain behavior fails here instead of in production.
 */

const DEFAULT_UNIT_IDS = DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID
const KNOWN_UNIT_TYPES = [
  DEFAULT_UNIT_IDS.armored,
  DEFAULT_UNIT_IDS.infantry,
  DEFAULT_UNIT_IDS.artillery,
  DEFAULT_UNIT_IDS.scout
]

// Hand-crafted steps array. Calling `LevelBuilder.data()` to read the
// real one would trigger the page's `require('@/assets/icons/...')`
// inside `overlayTypes` (webpack syntax Vitest cannot evaluate). The
// canonical ids are also asserted in the live SFC and exercised by the
// stepper component tests; this minimal copy just lets the page-level
// `setActiveStep` method find the requested id.
const STEPS_STUB = [
  { id: 'map-deployment' },
  { id: 'units' },
  { id: 'turntable' },
  { id: 'review-export' }
]

function makeBuilderVm(overrides = {}) {
  const state = {
    steps: STEPS_STUB,
    activeStepId: 'map-deployment',
    mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
    terrainTypes: [
      { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
      { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
    ],
    generatedMap: [],
    currentMapWidth: 0,
    currentMapHeight: 0,
    currentLevelId: 'level_test',
    unitsData: null,
    turntableData: null,
    objectivesData: null,
    exportPreviewTimestamp: new Date(2026, 5, 3, 14, 25, 9).getTime(),
    exportPreviewTimerId: null,
    lastGeneratedExportTimestamp: null,
    victoryConditionSettings: {
      type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
      deadlineEnabled: false,
      deadlineTurns: 10
    },
    terrainSeed: '',
    terrainSeedLocked: false,
    zoomLevel: 1,
    activeRosterPlayer: 'player1',
    rosterAddType: '',
    knownUnitTypes: KNOWN_UNIT_TYPES,
    lastActionStage: 'idle',
    selectedHex: null,
    showCoordinates: false,
    isPaintingMode: false,
    activeMapTool: 'select',
    lockBrushMode: 'lock',
    selectedTerrainForPainting: null,
    isDragging: false,
    lastPaintedHex: null,
    dragButton: 0,
    selectedOverlay: null,
    // Default matches LevelBuilder.vue: deployment-terrain protection is
    // on, so the existing safeCells discriminator test continues to
    // observe `desert` on the spawn cell. The off-path is exercised by
    // the toggle test below.
    protectDeploymentTerrain: true,
    overlayTypes: [
      { id: 'player1-spawn', property: 'player1Spawn', player: 1, type: 'spawn' },
      { id: 'player1-base', property: 'player1Base', player: 1, type: 'base' },
      { id: 'player2-spawn', property: 'player2Spawn', player: 2, type: 'spawn' },
      { id: 'player2-base', property: 'player2Base', player: 2, type: 'base' }
    ],
    ...overrides
  }
  const methods = LEVEL_BUILDER_METHODS
  const computed = LevelBuilder.computed || {}
  const vm = new Proxy(state, {
    get(target, key) {
      // Explicit overrides on the target win over computeds — a test
      // can `Object.defineProperty(stub, 'liveValidation', ...)` to
      // mock one without affecting the others, and computed accessors
      // can still chain through this proxy via `this.<otherComputed>`.
      if (key in target) return target[key]
      if (key in methods) return methods[key].bind(vm)
      if (key in computed) return computed[key].call(vm)
      return undefined
    },
    set(target, key, value) {
      target[key] = value
      return true
    }
  })
  return vm
}

function call(vm, method, ...args) {
  return LEVEL_BUILDER_METHODS[method].call(vm, ...args)
}

describe('LevelBuilder · wires the canonical domain helpers', () => {
  it('exposes the page-level methods that wrap each required domain helper', () => {
    // Method-presence asserts make the page→helper contract visible in
    // the test source — if a refactor renames or drops one of these, the
    // failure points straight at the missing wrapper instead of a vague
    // downstream validator error.
    const methods = LevelBuilder.methods
    expect(typeof methods.buildPackageFromState).toBe('function')   // builderStateToPackage
    expect(typeof methods.snapshotBuilderState).toBe('function')
    expect(typeof methods.hydrateFromPackage).toBe('function')       // packageToBuilderState
    expect(typeof methods.loadMap).toBe('function')                  // detectSection + mergeSectionsIntoPackage + validateLevelPackage
    expect(typeof methods.saveMap).toBe('function')                  // validateLevelPackage + SECTION_FILENAME_SUFFIX
    expect(typeof methods.loadDefaultLevelPackage).toBe('function')  // loadLevelPackage
    expect(typeof methods.generateMap).toBe('function')              // sprinkleTerrainSeeds
    expect(typeof methods.updateTerrainTypes).toBe('function')
    expect(typeof methods.copyTurntable).toBe('function')            // copyTurntableSide
    expect(typeof methods.resetTurntableToDefault).toBe('function')
    // Stepper coordinator
    expect(typeof methods.setActiveStep).toBe('function')
  })
})

describe('LevelBuilder.createHex · wiring to computeHexPolygonGeometry', () => {
  it('passes hexStrokeOffset: hexMap.hexStrokeOffset — preserves legacy visual', () => {
    const stub = makeBuilderVm({
      zoomLevel: 1,
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
    })
    const got = call(stub, 'createHex', 3, 4)
    const expected = computeHexPolygonGeometry({
      q: 3,
      r: 4,
      hexSize: hexMap.baseHexSize * 1,
      hexStrokeOffset: hexMap.hexStrokeOffset
    })
    expect(got.points).toBe(expected.points)
    expect(got.innerPoints).toBe(expected.innerPoints)
    expect(got.center).toEqual(expected.center)
  })

  it('scales hexSize with zoomLevel', () => {
    for (const zoom of [0.5, 1, 1.5, 3]) {
      const stub = makeBuilderVm({
        zoomLevel: zoom,
        terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
      })
      const got = call(stub, 'createHex', 2, 2)
      const expected = computeHexPolygonGeometry({
        q: 2,
        r: 2,
        hexSize: hexMap.baseHexSize * zoom,
        hexStrokeOffset: hexMap.hexStrokeOffset
      })
      expect(got.points).toBe(expected.points)
      expect(got.innerPoints).toBe(expected.innerPoints)
    }
  })

  it('terrainOverride wins over the painting-mode default', () => {
    const stub = makeBuilderVm({
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
    })
    const forest = { id: 'forest', name: 'Forest', color: '#2E7D32' }
    const got = call(stub, 'createHex', 0, 0, forest)
    expect(got.terrain).toBe(forest)
  })

  it('echoes the (q, r) coordinates into the returned hex', () => {
    // Reads-as-spec: callers (e.g. `hydrateFromPackage`) rely on the
    // returned hex carrying its own axial coords so they can do an
    // O(n) lookup by `(q, r)` instead of tracking creation order.
    const stub = makeBuilderVm({
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
    })
    for (const [q, r] of [[0, 0], [3, 4], [-2, 5], [7, -1]]) {
      const got = call(stub, 'createHex', q, r)
      expect(got.q).toBe(q)
      expect(got.r).toBe(r)
    }
  })

  it('defaults stroke styling and overlay flags to off', () => {
    // Anchor painting (`paintOverlay`) flips these booleans from false
    // to true on click — a fresh cell must therefore start with every
    // `player{1,2}{Spawn,Base}` strictly `false`, and the stroke
    // styling must match the visual baseline the legacy SVG used so
    // `HexMapEditorCanvas` does not need a per-cell stroke override.
    const stub = makeBuilderVm({
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
    })
    const got = call(stub, 'createHex', 0, 0)
    expect(got.stroke).toBe('#333')
    expect(got.strokeWidth).toBe(1)
    expect(got.player1Spawn).toBe(false)
    expect(got.player1Base).toBe(false)
    expect(got.player2Spawn).toBe(false)
    expect(got.player2Base).toBe(false)
    expect(got.locked).toBe(false)
  })
})

describe('LevelBuilder · unit roster editor', () => {
  it('ensureUnitsData materializes both player rosters from null', () => {
    const stub = makeBuilderVm({ unitsData: null })
    call(stub, 'ensureUnitsData')
    expect(Array.isArray(stub.unitsData.player1.units)).toBe(true)
    expect(Array.isArray(stub.unitsData.player2.units)).toBe(true)
  })

  it('addUnitToRoster appends a row with validator-passing defaults', () => {
    const stub = makeBuilderVm()
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    expect(stub.unitsData.player1.units).toHaveLength(1)
    const row = stub.unitsData.player1.units[0]
    expect(row.type).toBe(DEFAULT_UNIT_IDS.infantry)
    expect(row.count).toBe(1)
    expect(row.health).toBeUndefined()
  })

  it('addUnitToRoster rejects unknown type and duplicate type', () => {
    const stub = makeBuilderVm()
    call(stub, 'addUnitToRoster', 'player1', 'mecha')
    expect(stub.unitsData.player1.units).toHaveLength(0)
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    expect(stub.unitsData.player1.units).toHaveLength(1)
  })

  it('setUnitType swaps a row\'s type and refreshes default display name', () => {
    const stub = makeBuilderVm({
      unitsData: {
        player1: { units: [{ type: DEFAULT_UNIT_IDS.infantry, name: 'Infantry', count: 1, health: 60, movement: 4, attackRange: 1, attackPower: 30, maxTerrainDifficulty: 2 }] },
        player2: { units: [] }
      }
    })
    call(stub, 'setUnitType', 'player1', 0, DEFAULT_UNIT_IDS.scout)
    expect(stub.unitsData.player1.units[0].type).toBe(DEFAULT_UNIT_IDS.scout)
    expect(stub.unitsData.player1.units[0].name).not.toBe('Infantry')
  })

  it('removeUnitFromRoster removes by index and ignores out-of-range', () => {
    const stub = makeBuilderVm()
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.armored)
    call(stub, 'removeUnitFromRoster', 'player1', 0)
    expect(stub.unitsData.player1.units).toHaveLength(1)
    expect(stub.unitsData.player1.units[0].type).toBe(DEFAULT_UNIT_IDS.armored)
    call(stub, 'removeUnitFromRoster', 'player1', 99)
    expect(stub.unitsData.player1.units).toHaveLength(1)
  })

  it('availableUnitTypes excludes types already present', () => {
    const stub = makeBuilderVm()
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    const avail = call(stub, 'availableUnitTypes', 'player1')
    expect(avail).toContain(DEFAULT_UNIT_IDS.armored)
    expect(avail).not.toContain(DEFAULT_UNIT_IDS.infantry)
  })

  it('updateUnitTypes stores custom catalog entries and makes them selectable', () => {
    const stub = makeBuilderVm()
    call(stub, 'ensureUnitsData')
    call(stub, 'updateUnitTypes', [
      {
        id: 'heavy_tank',
        name: 'Heavy Tank',
        health: 120,
        movement: 2,
        attackRange: 2,
        attackAngle: 1,
        attackPower: 65,
        maxTerrainDifficulty: 3,
        losMode: 'direct_fire',
        iconKey: 'armored'
      }
    ])
    expect(stub.unitsData.unitTypes.map(t => t.id)).toEqual(['heavy_tank'])
    expect(call(stub, 'availableUnitTypes', 'player1')).toEqual(['heavy_tank'])
    call(stub, 'addUnitToRoster', 'player1', 'heavy_tank')
    expect(stub.unitsData.player1.units[0]).toEqual({ type: 'heavy_tank', count: 1 })
  })
})

describe('LevelBuilder · turntable workflow', () => {
  function fullyPopulatedStub() {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ]
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    return stub
  }

  it('resetTurntableToDefault produces a validator-passing template', () => {
    const stub = fullyPopulatedStub()
    call(stub, 'resetTurntableToDefault')
    const pkg = builderStateToPackage({
      levelId: stub.currentLevelId,
      mapParams: stub.mapParams,
      generatedMap: stub.generatedMap,
      terrainTypes: stub.terrainTypes,
      unitsData: stub.unitsData,
      turntableData: stub.turntableData
    })
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('default turntable invalid: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(stub.lastActionStage).toBe('turntable-reset')
  })

  it('copyTurntable delegates to copyTurntableSide (Our → Enemy and back)', () => {
    const stub = fullyPopulatedStub()
    call(stub, 'resetTurntableToDefault')

    stub.turntableData.Our_operations[0].title = 'CUSTOM_MAN'
    call(stub, 'copyTurntable', 'our->enemy')
    // Mirrors the legacy assertion: the wrapper's output must match the
    // pure helper's output exactly. If the wrapper started doing its own
    // mutation, this would diverge.
    const expected = copyTurntableSide(
      { Our_operations: stub.turntableData.Our_operations, Enemy_operations: [] },
      'our->enemy'
    )
    expect(stub.turntableData.Enemy_operations[0].title).toBe(expected.Enemy_operations[0].title)
    expect(stub.lastActionStage).toBe('turntable-our->enemy')
  })
})

describe('LevelBuilder · turntable matrix editor (toggleTurntableAction)', () => {
  // Seed every test from the default template so the toggle semantics
  // are exercised against the same shape `resetTurntableToDefault`
  // produces — which is also the shape the validator expects (six
  // arrays per operation's first move).
  function turntableStub() {
    const stub = makeBuilderVm()
    call(stub, 'resetTurntableToDefault')
    return stub
  }

  function diceAt(stub, sideKey, opIdx, faceIdx) {
    return stub.turntableData[sideKey][opIdx].moves[0].dice[faceIdx]
  }

  it('adds a real action to an empty action row', () => {
    const stub = turntableStub()
    // ATTACK operation, face index 2 defaults to no actions.
    expect(diceAt(stub, 'Our_operations', 1, 2)).toEqual([])
    call(stub, 'toggleTurntableAction', 'Our_operations', 1, 2, 'fire')
    expect(diceAt(stub, 'Our_operations', 1, 2)).toEqual(['fire'])
    expect(stub.lastActionStage).toBe('turntable-edit')
  })

  it('appends a new action to a row that already has actions', () => {
    const stub = turntableStub()
    // MANOEUVRE face 0 default: ['move', 'turn']. Add 'reverse'.
    call(stub, 'toggleTurntableAction', 'Our_operations', 0, 0, 'reverse')
    expect(diceAt(stub, 'Our_operations', 0, 0)).toEqual(['move', 'turn', 'reverse'])
  })

  it('removes an action that is already present in the row', () => {
    const stub = turntableStub()
    // MANOEUVRE face 0 default: ['move', 'turn']. Remove 'turn'.
    call(stub, 'toggleTurntableAction', 'Our_operations', 0, 0, 'turn')
    expect(diceAt(stub, 'Our_operations', 0, 0)).toEqual(['move'])
  })

  it('leaves an empty row when removing the last real action', () => {
    const stub = turntableStub()
    // MANOEUVRE face 1 default: ['move']. Remove 'move' -> no actions.
    call(stub, 'toggleTurntableAction', 'Our_operations', 0, 1, 'move')
    expect(diceAt(stub, 'Our_operations', 0, 1)).toEqual([])
  })

  it('ignores legacy `"-"` toggles on a real-action row', () => {
    const stub = turntableStub()
    stub.lastActionStage = 'idle'
    // ATTACK face 0 default: ['fire', 'reload']. Legacy '-' is no longer editable.
    call(stub, 'toggleTurntableAction', 'Our_operations', 1, 0, '-')
    expect(diceAt(stub, 'Our_operations', 1, 0)).toEqual(['fire', 'reload'])
    expect(stub.lastActionStage).toBe('idle')
  })

  it('ignores legacy `"-"` toggles on an empty row', () => {
    const stub = turntableStub()
    stub.lastActionStage = 'idle'
    // ATTACK face 2 default: no actions.
    call(stub, 'toggleTurntableAction', 'Our_operations', 1, 2, '-')
    expect(diceAt(stub, 'Our_operations', 1, 2)).toEqual([])
    expect(stub.lastActionStage).toBe('idle')
  })

  it('adding a real action removes any pre-existing `"-"` in the same row', () => {
    const stub = turntableStub()
    // Pre-seed a hybrid state so the test exercises the no-op-prune
    // branch even though the canonical defaults never produce it.
    stub.turntableData.Our_operations[1].moves[0].dice[2] = ['-', 'fire']
    call(stub, 'toggleTurntableAction', 'Our_operations', 1, 2, 'reload')
    // Both `-` removed and `reload` appended.
    expect(diceAt(stub, 'Our_operations', 1, 2)).toEqual(['fire', 'reload'])
  })

  it('removing an action prunes all duplicate legacy copies from that row', () => {
    const stub = turntableStub()
    stub.turntableData.Enemy_operations[0].moves[0].dice[0] = ['move', 'turn', 'move']
    call(stub, 'toggleTurntableAction', 'Enemy_operations', 0, 0, 'move')
    expect(diceAt(stub, 'Enemy_operations', 0, 0)).toEqual(['turn'])
  })

  it('silently bails on a bad sideKey / opIndex / faceIdx', () => {
    const stub = turntableStub()
    const before = JSON.parse(JSON.stringify(stub.turntableData))
    stub.lastActionStage = 'idle'
    call(stub, 'toggleTurntableAction', 'No_such_side', 0, 0, 'fire')
    call(stub, 'toggleTurntableAction', 'Our_operations', 99, 0, 'fire')
    call(stub, 'toggleTurntableAction', 'Our_operations', 0, 99, 'fire')
    expect(stub.turntableData).toEqual(before)
    expect(stub.lastActionStage).toBe('idle')
  })

  it('a reset + a couple of edits still produces a validator-passing package', () => {
    // End-to-end: any sequence of canonical chip toggles must keep the
    // turntable shape valid (six dice rows, each an array of tokens).
    // Mirrors the same shape `validateLevelPackage` enforces.
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'turntable_edit_e2e'
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    // A few representative edits across both sides and both phases.
    call(stub, 'toggleTurntableAction', 'Our_operations', 0, 2, 'reverse')
    call(stub, 'toggleTurntableAction', 'Our_operations', 1, 2, 'fire')
    call(stub, 'toggleTurntableAction', 'Enemy_operations', 0, 0, 'reverse')
    call(stub, 'toggleTurntableAction', 'Enemy_operations', 1, 5, 'reload')

    const pkg = call(stub, 'buildPackageFromState')
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('post-edit turntable invalid: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.ok).toBe(true)
  })
})

describe('TurntableMatrixEditor · diceRows defensive normalization', () => {
  it('returns six empty arrays when the operation is missing or malformed', async () => {
    const { default: TurntableMatrixEditor } = await import('@/components/level-builder/TurntableMatrixEditor.vue')
    expect(TurntableMatrixEditor.computed.diceRows.call({ operation: null })).toEqual([[],[],[],[],[],[]])
    expect(TurntableMatrixEditor.computed.diceRows.call({ operation: {} })).toEqual([[],[],[],[],[],[]])
    expect(TurntableMatrixEditor.computed.diceRows.call({ operation: { moves: [{ dice: 'not-an-array' }] } })).toEqual([[],[],[],[],[],[]])
  })

  it('pads short dice arrays to exactly six rows and coerces non-array rows to []', async () => {
    const { default: TurntableMatrixEditor } = await import('@/components/level-builder/TurntableMatrixEditor.vue')
    const out = TurntableMatrixEditor.computed.diceRows.call({
      operation: { moves: [{ dice: [['move'], 'wrong', ['fire']] }] }
    })
    expect(out).toHaveLength(6)
    expect(out[0]).toEqual(['move'])
    expect(out[1]).toEqual([])
    expect(out[2]).toEqual(['fire'])
    expect(out[3]).toEqual([])
    expect(out[4]).toEqual([])
    expect(out[5]).toEqual([])
  })

  it('operationLabel falls back to "operation" for null / empty / non-string titles', async () => {
    // The table's aria-label binding reads `operationLabel` so the
    // template never dereferences `operation.title` directly. Without
    // this safe accessor a malformed `op` (null / no title) would
    // crash the template before `diceRows` even runs.
    const { default: TurntableMatrixEditor } = await import('@/components/level-builder/TurntableMatrixEditor.vue')
    // operationLabel resolves its fallback via the shared i18nTextMixin's
    // uiText; provide the mixin methods on the call context (as a mounted
    // component would) so the isolated computed can reach uiText. With no
    // $tf/$t injected here, uiText returns the 'operation' fallback.
    const label = (operation) =>
      TurntableMatrixEditor.computed.operationLabel.call({ operation, ...i18nTextMixin.methods })
    expect(label(null)).toBe('operation')
    expect(label(undefined)).toBe('operation')
    expect(label({})).toBe('operation')
    expect(label({ title: '' })).toBe('operation')
    expect(label({ title: '   ' })).toBe('operation')
    expect(label({ title: 42 })).toBe('operation')
    expect(label({ title: 'MANOEUVRE' })).toBe('MANOEUVRE')
  })

  it('renders a shared D6 table with phase-specific action chips', async () => {
    const { default: TurntableMatrixEditor } = await import('@/components/level-builder/TurntableMatrixEditor.vue')
    const wrapper = mount(TurntableMatrixEditor, {
      props: {
        operations: [
          {
            title: 'Manoeuvre',
            moves: [{ dice: [['move', 'turn'], [], [], [], [], []] }]
          },
          {
            title: 'Attack',
            moves: [{ dice: [['fire'], [], [], [], [], []] }]
          }
        ]
      }
    })

    expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['D6', 'Manoeuvre', 'Attack'])
    const labels = wrapper
      .findAll('.turntable-matrix-editor__chip-label')
      .map(label => label.text())
    expect(labels).toEqual([
      'move', 'reverse', 'turn',
      'fire', 'reload',
      'move', 'reverse', 'turn',
      'fire', 'reload',
      'move', 'reverse', 'turn',
      'fire', 'reload',
      'move', 'reverse', 'turn',
      'fire', 'reload',
      'move', 'reverse', 'turn',
      'fire', 'reload',
      'move', 'reverse', 'turn',
      'fire', 'reload'
    ])
    expect(labels).not.toContain('-')

    const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
    expect(firstRowCells[0].text()).toContain('move')
    expect(firstRowCells[0].text()).not.toContain('fire')
    expect(firstRowCells[1].text()).toContain('fire')
    expect(firstRowCells[1].text()).not.toContain('move')
    expect(firstRowCells[0].findAll('.turntable-matrix-editor__chip-priority').map(node => node.text())).toEqual(['1', '2'])
    expect(firstRowCells[1].findAll('.turntable-matrix-editor__chip-priority').map(node => node.text())).toEqual(['1'])

    await firstRowCells[0].findAll('button').find(button =>
      button.find('.turntable-matrix-editor__chip-label').text() === 'reverse'
    ).trigger('click')
    await firstRowCells[1].findAll('button').find(button =>
      button.find('.turntable-matrix-editor__chip-label').text() === 'reload'
    ).trigger('click')
    expect(wrapper.emitted('toggle-action')).toEqual([
      [0, 0, 'reverse'],
      [1, 0, 'reload']
    ])
  })
})

describe('LevelBuilder · buildPackageFromState / snapshotBuilderState / liveValidation', () => {
  function fullValidStub() {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'live_validation_test'
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    return stub
  }

  it('snapshotBuilderState emits the shape builderStateToPackage expects', () => {
    const stub = fullValidStub()
    const snapshot = call(stub, 'snapshotBuilderState')
    expect(snapshot.levelId).toBe('live_validation_test')
    expect(snapshot.mapParams).toEqual(
      expect.objectContaining({ width: 2, height: 2, zoom: stub.zoomLevel })
    )
    expect(snapshot.generatedMap).toBe(stub.generatedMap)
    expect(snapshot.terrainTypes).toBe(stub.terrainTypes)
    expect(snapshot.unitsData).toBe(stub.unitsData)
    expect(snapshot.turntableData).toBe(stub.turntableData)
    expect(snapshot.objectivesData).toEqual({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('buildPackageFromState == builderStateToPackage(snapshotBuilderState())', () => {
    const stub = fullValidStub()
    const direct = builderStateToPackage(call(stub, 'snapshotBuilderState'))
    const wrapped = call(stub, 'buildPackageFromState')
    expect(wrapped).toEqual(direct)
  })

  it('buildTimestampedExportLevelId appends a readable timestamp suffix', () => {
    const stub = fullValidStub()
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()

    const id = call(stub, 'buildTimestampedExportLevelId', 'level_000', timestamp)
    const manual = call(stub, 'buildTimestampedExportLevelId', 'save_level_test', timestamp)

    expect(id).toBe('level_000_2026-06-03_14-25-09')
    expect(manual).toBe('save_level_test_2026-06-03_14-25-09')
  })

  it('buildReservedExportLevelId bumps repeated exports inside the same second', () => {
    const stub = fullValidStub()
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()

    const first = call(stub, 'buildReservedExportLevelId', 'level_000', timestamp)
    const second = call(stub, 'buildReservedExportLevelId', 'level_000', timestamp)

    expect(first).toBe('level_000_2026-06-03_14-25-09')
    expect(second).toBe('level_000_2026-06-03_14-25-10')
    expect(stub.currentLevelId).toBe('live_validation_test')
  })

  it('refreshExportPreviewTimestamp shows the next available second after an export reservation', () => {
    const stub = fullValidStub()
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()

    call(stub, 'buildReservedExportLevelId', 'level_000', timestamp)
    call(stub, 'refreshExportPreviewTimestamp', timestamp)

    expect(stub.exportPreviewTimestamp).toBe(timestamp + 1000)
  })

  it('startExportPreviewTicker updates the preview once per second and cleans up', () => {
    vi.useFakeTimers()
    const stub = fullValidStub()
    const first = new Date(2026, 5, 3, 14, 25, 9).getTime()
    const second = first + 1000
    vi.setSystemTime(first)

    try {
      call(stub, 'startExportPreviewTicker')
      expect(stub.exportPreviewTimestamp).toBe(first)
      expect(stub.exportPreviewTimerId).not.toBeNull()

      vi.advanceTimersByTime(1000)
      expect(stub.exportPreviewTimestamp).toBe(second)

      call(stub, 'stopExportPreviewTicker')
      expect(stub.exportPreviewTimerId).toBeNull()

      vi.advanceTimersByTime(1000)
      expect(stub.exportPreviewTimestamp).toBe(second)
    } finally {
      call(stub, 'stopExportPreviewTicker')
      vi.useRealTimers()
    }
  })

  it('levelNameFromImportedId strips an export timestamp suffix only', () => {
    const stub = fullValidStub()

    expect(call(stub, 'levelNameFromImportedId', 'level_000_2026-06-03_14-25-09'))
      .toBe('level_000')
    expect(call(stub, 'levelNameFromImportedId', 'manual_level_2026')).toBe('manual_level_2026')
  })

  it('buildPackageFromState can override the package level id for export', () => {
    const stub = fullValidStub()
    const pkg = call(stub, 'buildPackageFromState', 'level_000_abcd')

    expect(pkg.id).toBe('level_000_abcd')
    expect(stub.currentLevelId).toBe('live_validation_test')
  })

  it('builds a Blue occupy-base objective when a Red base exists', () => {
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Base: false, player2Base: true },
        { q: 1, r: 0, terrain: { id: 'plains' }, player1Base: false, player2Base: false }
      ],
      victoryConditionSettings: {
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        deadlineEnabled: false,
        deadlineTurns: 10
      }
    })

    const objectives = call(stub, 'buildObjectivesDataFromVictoryConditions')

    expect(objectives).toEqual({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2'
      }
    })
  })

  it('falls back to eliminateUnits when the selected base objective becomes unavailable', () => {
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Base: false, player2Base: false }
      ],
      victoryConditionSettings: {
        type: OBJECTIVE_TYPES.OCCUPY_BASE,
        deadlineEnabled: false,
        deadlineTurns: 10
      }
    })

    call(stub, 'syncVictoryConditionsWithMap')

    expect(stub.victoryConditionSettings).toEqual({
      type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
      deadlineEnabled: false,
      deadlineTurns: 10
    })
    expect(stub.objectivesData).toEqual({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('liveValidation returns ok=true on a complete state', () => {
    const stub = fullValidStub()
    const result = LevelBuilder.computed.liveValidation.call(stub)
    if (!result.ok && result.errors && result.errors.length) {
      throw new Error('expected ok, got errors: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.errors).toEqual([])
  })

  it('liveValidation reacts to a roster edit (count exceeds spawn slots)', () => {
    const stub = fullValidStub()
    stub.unitsData.player1.units = [{ type: 'infantry', name: 'Infantry', count: 99, health: 60, movement: 4, attackRange: 1, attackPower: 30, maxTerrainDifficulty: 2 }]
    const result = LevelBuilder.computed.liveValidation.call(stub)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => /spawn/i.test(e.message))).toBe(true)
  })
})

describe('LevelBuilder · generateMap · overlay preservation', () => {
  it('preserves overlay flags by (q, r) across regeneration', () => {
    // Narrow scope: this test only proves the `overlayByKey` re-application
    // path keeps spawn/base flags after the map is wiped and rebuilt.
    // It does NOT prove that `safeCells` reaches `sprinkleTerrainSeeds` —
    // that property is asserted in the next describe block via a
    // terrain-difficulty discriminator.
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'forest' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains' }, player1Spawn: false, player1Base: false, player2Spawn: true,  player2Base: true  },
        { q: 1, r: 1, terrain: { id: 'forest' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ],
      terrainSeed: 'overlay-preserve'
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q, r,
      terrain: terrain || { id: 'plains' },
      player1Spawn: false, player1Base: false,
      player2Spawn: false, player2Base: false
    })

    call(stub, 'generateMap')

    const at = (q, r) => stub.generatedMap.find(h => h.q === q && h.r === r)
    expect(at(0, 0).player1Spawn).toBe(true)
    expect(at(0, 0).player1Base).toBe(true)
    expect(at(0, 1).player2Spawn).toBe(true)
    expect(at(0, 1).player2Base).toBe(true)
    expect(at(1, 0).player1Spawn).toBe(false)
    expect(at(1, 1).player2Spawn).toBe(false)
  })
})

describe('LevelBuilder · generateMap · protectDeploymentTerrain toggle', () => {
  // Counterpoint to the safeCells discriminator below. Same board,
  // same RNG pinning, same overlays — only the toggle changes. When
  // the toggle is off, the page must pass an empty safeCells array so
  // `applySpawnSafety` early-returns and the spawn cell keeps the
  // weighted-picker's choice (mountain).
  it('skips spawn-safety when protectDeploymentTerrain is false', () => {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['mountain', 'desert'] },
      terrainTypes: [
        { id: 'mountain', name: 'M', color: '#000', terrainDifficulty: 3 },
        { id: 'desert',   name: 'D', color: '#000', terrainDifficulty: 1 }
      ],
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'mountain' }, player1Spawn: true,  player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ],
      terrainSeed: 'seed-1',
      terrainSeedLocked: true,
      protectDeploymentTerrain: false
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q, r,
      terrain: terrain || { id: 'mountain' },
      player1Spawn: false, player1Base: false,
      player2Spawn: false, player2Base: false
    })

    call(stub, 'generateMap')

    const spawn = stub.generatedMap.find(h => h.q === 0 && h.r === 0)
    // Without spawn safety the seeded weighted picker keeps `mountain`.
    // The overlay flags themselves still survive via `overlayByKey`.
    expect(spawn.terrain.id).toBe('mountain')
    expect(spawn.player1Spawn).toBe(true)
    expect(spawn.player1Base).toBe(true)
  })
})

describe('LevelBuilder · generateMap · safeCells wiring to sprinkleTerrainSeeds', () => {
  it('forces overlay cells to the low-difficulty terrain via the sprinkler', () => {
    // Discriminator: a 2x2 board with no plains in availableTerrain and
    // two terrains differing in `terrainDifficulty`. With this seed, the
    // weighted picker assigns mountain (difficulty 3) to the spawn cell.
    // The spawn cell at
    // (0,0) only becomes desert (difficulty 1) if `safeCells` is actually
    // passed into `sprinkleTerrainSeeds`. Drop the safeCells wiring and
    // this assertion fails.
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['mountain', 'desert'] },
      terrainTypes: [
        { id: 'mountain', name: 'M', color: '#000', terrainDifficulty: 3 },
        { id: 'desert',   name: 'D', color: '#000', terrainDifficulty: 1 }
      ],
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'mountain' }, player1Spawn: true,  player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'mountain' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ],
      terrainSeed: 'seed-1',
      terrainSeedLocked: true
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q, r,
      terrain: terrain || { id: 'mountain' },
      player1Spawn: false, player1Base: false,
      player2Spawn: false, player2Base: false
    })

    call(stub, 'generateMap')

    const spawn = stub.generatedMap.find(h => h.q === 0 && h.r === 0)
    expect(spawn.terrain.id).toBe('desert')
    expect(spawn.player1Spawn).toBe(true)
    expect(spawn.player1Base).toBe(true)
  })
})

describe('LevelBuilder · hydrateFromPackage · wiring to packageToBuilderState', () => {
  it('round-trips an exported package back through the page-level helpers', () => {
    // Build a known-valid package via the same domain helper export
    // path, then hydrate from it and assert the page-level state ends
    // up coherent with what the helper returned. This locks the
    // packageToBuilderState wiring without needing fetch/network.
    const sourceStub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'hydrate_roundtrip'
    })
    call(sourceStub, 'ensureUnitsData')
    call(sourceStub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(sourceStub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(sourceStub, 'resetTurntableToDefault')

    const pkg = call(sourceStub, 'buildPackageFromState')
    const validated = validateLevelPackage(pkg)
    expect(validated.ok).toBe(true)

    // Hydrate a fresh stub from the validated package and verify the
    // helper's output is reflected on the instance.
    const targetStub = makeBuilderVm({
      mapParams: { width: 0, height: 0, availableTerrain: [] },
      terrainTypes: [],
      generatedMap: [],
      currentLevelId: ''
    })
    targetStub.createHex = (q, r) => ({
      q, r,
      terrain: { id: 'plains' },
      player1Spawn: false, player1Base: false,
      player2Spawn: false, player2Base: false
    })
    targetStub.updateMapDimensions = vi.fn()

    call(targetStub, 'hydrateFromPackage', validated.package, { regenerateMap: true })

    const expectedState = packageToBuilderState(validated.package)
    expect(targetStub.currentLevelId).toBe(expectedState.levelId)
    expect(targetStub.terrainTypes).toEqual(expectedState.terrainTypes)
    expect(targetStub.unitsData).toEqual(expectedState.unitsData)
    expect(targetStub.turntableData).toEqual(expectedState.turntableData)
    expect(targetStub.objectivesData).toEqual(expectedState.objectivesData)
    expect(targetStub.mapParams.width).toBe(expectedState.mapParams.width)
    expect(targetStub.mapParams.height).toBe(expectedState.mapParams.height)
  })
})

describe('LevelBuilder · saveMap · validate-then-download', () => {
  function makeFullValidStub() {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'save_level_test'
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    return stub
  }

  it('downloads the canonical section filenames in order on a valid package', () => {
    const stub = makeFullValidStub()
    const downloads = []
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(timestamp)
    stub.downloadJSON = (filename, payload) => { downloads.push({ filename, payload }) }
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    try {
      call(stub, 'saveMap')
    } finally {
      nowSpy.mockRestore()
    }

    const exportId = 'save_level_test_2026-06-03_14-25-09'
    expect(stub.currentLevelId).toBe('save_level_test')
    expect(downloads.map(d => d.filename)).toEqual([
      `${exportId}_hexmap.json`,
      `${exportId}_terrain.json`,
      `${exportId}_units.json`,
      `${exportId}_turntable.json`,
      `${exportId}_objectives.json`
    ])
    // Payloads come from `validateLevelPackage(...)`'s returned package
    // (the validator's normalized form, not the raw build).
    for (const d of downloads) expect(d.payload).toBeTruthy()
    expect(stub.lastActionStage).toBe('export')
  })

  it('downloads the archive with a timestamped export id', () => {
    const stub = makeFullValidStub()
    const downloads = []
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(timestamp)
    stub.downloadBlob = (filename, blob) => { downloads.push({ filename, blob }) }
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    try {
      call(stub, 'saveLevelArchive')
    } finally {
      nowSpy.mockRestore()
    }

    const exportId = 'save_level_test_2026-06-03_14-25-09'
    expect(stub.currentLevelId).toBe('save_level_test')
    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toBe(`${exportId}.zip`)
    expect(downloads[0].blob).toBeInstanceOf(Blob)
    expect(stub.lastActionStage).toBe('export')
  })

  it('sends a timestamped package to Playground and freezes that export id', () => {
    const stub = makeFullValidStub()
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(timestamp)
    const routerPush = vi.fn()
    stub.$router = { push: routerPush }
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    let handoff = null
    try {
      call(stub, 'testInPlayground')
      const token = routerPush.mock.calls[0][0].query[BUILDER_PLAYTEST_QUERY_KEY]
      handoff = consumeBuilderPlaytestHandoff(token)
    } finally {
      nowSpy.mockRestore()
    }

    const exportId = 'save_level_test_2026-06-03_14-25-09'
    expect(stub.lastActionStage).toBe('playtest')
    expect(stub.frozenExportLevelId).toBe(exportId)
    expect(routerPush).toHaveBeenCalledWith({
      path: '/Playground',
      query: { [BUILDER_PLAYTEST_QUERY_KEY]: expect.any(String) }
    })
    expect(handoff.package.id).toBe(exportId)
  })

  it('testInAutomatedPlayground routes to /AutomatedPlayground with the handoff token', () => {
    const stub = makeFullValidStub()
    const timestamp = new Date(2026, 5, 3, 14, 25, 9).getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(timestamp)
    const routerPush = vi.fn()
    stub.$router = { push: routerPush }
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    let handoff = null
    try {
      call(stub, 'testInAutomatedPlayground')
      const token = routerPush.mock.calls[0][0].query[BUILDER_PLAYTEST_QUERY_KEY]
      handoff = consumeBuilderPlaytestHandoff(token)
    } finally {
      nowSpy.mockRestore()
    }

    const exportId = 'save_level_test_2026-06-03_14-25-09'
    expect(stub.lastActionStage).toBe('playtest')
    expect(stub.frozenExportLevelId).toBe(exportId)
    expect(routerPush).toHaveBeenCalledWith({
      path: '/AutomatedPlayground',
      query: { [BUILDER_PLAYTEST_QUERY_KEY]: expect.any(String) }
    })
    expect(handoff.package.id).toBe(exportId)
  })

  it('reuses the playtest timestamp for an unchanged later export', () => {
    const stub = makeFullValidStub()
    const downloads = []
    stub.downloadBlob = (filename, blob) => { downloads.push({ filename, blob }) }
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    const playtestNow = vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 5, 3, 14, 25, 9).getTime())
    try {
      call(stub, 'testInPlayground')
    } finally {
      playtestNow.mockRestore()
    }

    const exportNow = vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 5, 3, 14, 30, 9).getTime())
    try {
      call(stub, 'saveLevelArchive')
    } finally {
      exportNow.mockRestore()
    }

    expect(downloads[0].filename).toBe('save_level_test_2026-06-03_14-25-09.zip')
  })

  it('does not download anything when the package fails validation', () => {
    // Missing turntable + missing unit rosters => validator rejects.
    const stub = makeBuilderVm({
      mapParams: { width: 1, height: 1, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ],
      unitsData: null,
      turntableData: null,
      currentLevelId: 'broken_export'
    })
    const downloads = []
    stub.downloadJSON = (filename, payload) => { downloads.push({ filename, payload }) }
    window.$notify = { error: vi.fn() }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      call(stub, 'saveMap')
    } finally {
      errorSpy.mockRestore()
    }

    expect(downloads).toHaveLength(0)
    expect(stub.lastActionStage).toBe('export-blocked')
  })
})

describe('LevelBuilder · loadMap · validate-then-hydrate', () => {
  function fakeFile(name, body) {
    return {
      name,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
    }
  }

  function makeFreshTarget(overrides = {}) {
    const stub = makeBuilderVm({
      currentLevelId: 'before_import',
      terrainTypes: [],
      generatedMap: [],
      unitsData: null,
      turntableData: null,
      mapParams: { width: 0, height: 0, availableTerrain: [] },
      lastActionStage: 'idle',
      ...overrides
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = vi.fn((q, r, terrain) => ({
      q,
      r,
      terrain: terrain || { id: 'plains', name: 'Plains', color: '#fff' },
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false
    }))
    return stub
  }

  function buildValidPackage() {
    const source = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'load_level_test'
    })
    call(source, 'ensureUnitsData')
    call(source, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(source, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(source, 'resetTurntableToDefault')
    const pkg = call(source, 'buildPackageFromState')
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('test setup error: produced invalid package: ' + JSON.stringify(result.errors, null, 2))
    }
    return result.package
  }

  it('hydrates target state from a validated full-package JSON', async () => {
    const validated = buildValidPackage()
    const target = makeFreshTarget()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    const fakeEvent = {
      target: { files: [fakeFile('level.json', validated)], value: 'will-be-cleared' }
    }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import')
    expect(target.currentLevelId).toBe(validated.id)
    // hydrateFromPackage walks the cell seeds and calls createHex per (q,r).
    expect(target.createHex).toHaveBeenCalled()
  })

  it('does not mutate state when a file fails JSON.parse', async () => {
    const target = makeFreshTarget({ currentLevelId: 'untouched_parse' })
    const beforeTerrainTypes = target.terrainTypes
    const beforeUnitsData = target.unitsData
    window.$notify = { error: vi.fn() }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fakeEvent = {
      target: { files: [fakeFile('broken.json', '{ this is not valid JSON')], value: '' }
    }
    try {
      await call(target, 'loadMap', fakeEvent)
    } finally {
      errorSpy.mockRestore()
    }

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('untouched_parse')
    expect(target.terrainTypes).toBe(beforeTerrainTypes)
    expect(target.unitsData).toBe(beforeUnitsData)
    expect(target.createHex).not.toHaveBeenCalled()
  })

  it('does not mutate state when the merged package fails validateLevelPackage', async () => {
    // Take a valid package and overshoot player1 unit count beyond the
    // available spawn slots. detectSection still classifies it as
    // 'package', mergeSectionsIntoPackage takes it whole, then the
    // validator rejects. The loadMap atomic-import guarantee means
    // `hydrateFromPackage` must never fire — assert via createHex.
    const validated = buildValidPackage()
    const poisoned = JSON.parse(JSON.stringify(validated))
    poisoned.units.player1.units[0].count = 999

    const target = makeFreshTarget({ currentLevelId: 'untouched_validation' })
    const beforeUnitsData = target.unitsData
    window.$notify = { error: vi.fn() }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fakeEvent = {
      target: { files: [fakeFile('poisoned.json', poisoned)], value: '' }
    }
    try {
      await call(target, 'loadMap', fakeEvent)
    } finally {
      errorSpy.mockRestore()
    }

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('untouched_validation')
    expect(target.unitsData).toBe(beforeUnitsData)
    expect(target.createHex).not.toHaveBeenCalled()
  })

  it('hydrates target state from a .zip archive (Task C2 happy path)', async () => {
    // Round-trip lock-in: build a valid package, run it through the
    // same archive helper the page uses for export, then feed the
    // archive bytes back through `loadMap` via a fake File that only
    // exposes `arrayBuffer()` (the JSON path's `text()` must NOT fire
    // for .zip — this asserts the suffix branch).
    const { buildLevelArchiveBlob } = await import('../../domain/level/levelArchive.js')
    const validated = buildValidPackage()
    const blob = buildLevelArchiveBlob(validated)
    const bytes = await blob.arrayBuffer()

    const target = makeFreshTarget()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    const fakeZip = {
      name: `${validated.id}.zip`,
      arrayBuffer: () => Promise.resolve(bytes),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    }
    const fakeEvent = { target: { files: [fakeZip], value: 'will-be-cleared' } }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import')
    expect(target.createHex).toHaveBeenCalled()
  })

  it('adopts the archive-encoded id when importing a .zip (round-trip fidelity)', async () => {
    // Stronger contract than the happy-path test above: a `.zip`
    // produced by `buildLevelArchiveBlob` for `level_007` and imported
    // into a `level_000` builder must hydrate as `level_007`, so a
    // subsequent `Export Level` writes back to `level_007.zip` instead
    // of overwriting the wrong slot. This is the round-trip property
    // P2 was missing.
    const { buildLevelArchiveBlob } = await import('../../domain/level/levelArchive.js')
    const sourcePkg = buildValidPackage()
    const archivedId = 'level_007'
    const blob = buildLevelArchiveBlob({ ...sourcePkg, id: archivedId }, archivedId)
    const bytes = await blob.arrayBuffer()

    const target = makeFreshTarget()
    // `makeFreshTarget` seeds `currentLevelId` to a sentinel that is
    // distinct from `archivedId` — proves the post-import id came from
    // the archive, not from a coincidental match.
    expect(target.currentLevelId).toBe('before_import')
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }

    const fakeZip = {
      name: `${archivedId}.zip`,
      arrayBuffer: () => Promise.resolve(bytes),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    }
    const fakeEvent = { target: { files: [fakeZip], value: 'will-be-cleared' } }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import')
    expect(target.currentLevelId).toBe(archivedId)
  })

  it('blocks partial .zip archives instead of merging a hybrid package', async () => {
    const { strToU8, zipSync } = await import('fflate')
    const { SECTION_FILENAME_SUFFIX } = await import('../../domain/level/builderPackage.js')
    const pkg = buildValidPackage()
    const archiveBytes = zipSync({
      [`${pkg.id}/${pkg.id}${SECTION_FILENAME_SUFFIX.hexmap}`]: strToU8(JSON.stringify(pkg.hexmap)),
      [`${pkg.id}/${pkg.id}${SECTION_FILENAME_SUFFIX.units}`]: strToU8(JSON.stringify(pkg.units))
    }, { level: 6 })

    const target = makeFreshTarget()
    const notifyError = vi.fn()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: notifyError }

    const fakeZip = {
      name: `${pkg.id}.zip`,
      arrayBuffer: () => Promise.resolve(archiveBytes.buffer.slice(
        archiveBytes.byteOffset,
        archiveBytes.byteOffset + archiveBytes.byteLength
      )),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    }
    const fakeEvent = { target: { files: [fakeZip], value: 'will-be-cleared' } }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('before_import')
    expect(target.createHex).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalled()
    const [, errBody] = notifyError.mock.calls[0]
    expect(errBody).toMatch(/incomplete/)
  })

  it('blocks the import when more than one .zip is selected (no hybrid package)', async () => {
    // Two `.zip` files in one selection would silently overlay each
    // other's sections while `pkg.id` stuck to the first archive id —
    // a hybrid package the user did not ask for. Block this case
    // before any state is touched and surface an "Import Blocked"
    // notification.
    const { buildLevelArchiveBlob } = await import('../../domain/level/levelArchive.js')
    const a = buildLevelArchiveBlob({ ...buildValidPackage(), id: 'level_a' }, 'level_a')
    const b = buildLevelArchiveBlob({ ...buildValidPackage(), id: 'level_b' }, 'level_b')
    const aBytes = await a.arrayBuffer()
    const bBytes = await b.arrayBuffer()

    const target = makeFreshTarget()
    const notifyError = vi.fn()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: notifyError }

    const fakeFile = (name, bytes) => ({
      name,
      arrayBuffer: () => Promise.resolve(bytes),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    })
    const fakeEvent = {
      target: {
        files: [fakeFile('level_a.zip', aBytes), fakeFile('level_b.zip', bBytes)],
        value: 'will-be-cleared'
      }
    }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('before_import')
    expect(target.createHex).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalled()
    const [, errBody] = notifyError.mock.calls[0]
    expect(errBody).toMatch(/Level Archive .*on its own/i)
  })

  it('blocks the import when a .zip is mixed with loose JSON section files (no hybrid)', async () => {
    // Mirror to the multi-zip block: one `.zip` plus one loose JSON
    // would also produce a hybrid — the archive supplies `pkg.id`
    // and three sections, the JSON overlays the fourth in
    // `mergeSectionsIntoPackage`. Block this combination with the
    // same atomic gate so the user is forced to make the choice
    // explicit.
    const { buildLevelArchiveBlob } = await import('../../domain/level/levelArchive.js')
    const pkg = { ...buildValidPackage(), id: 'level_archive' }
    const archive = buildLevelArchiveBlob(pkg, 'level_archive')
    const archiveBytes = await archive.arrayBuffer()

    const target = makeFreshTarget()
    const notifyError = vi.fn()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: notifyError }

    const fakeZip = {
      name: 'level_archive.zip',
      arrayBuffer: () => Promise.resolve(archiveBytes),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    }
    // A hand-edited units JSON that would, without the block,
    // overwrite the archive's units section while keeping the
    // archive id.
    const looseUnits = {
      name: 'level_archive_units.json',
      arrayBuffer: () => { throw new Error('arrayBuffer() must not be called for .json imports') },
      text: () => Promise.resolve(JSON.stringify(pkg.units))
    }
    const fakeEvent = {
      target: { files: [fakeZip, looseUnits], value: 'will-be-cleared' }
    }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('before_import')
    expect(target.createHex).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalled()
    const [, errBody] = notifyError.mock.calls[0]
    expect(errBody).toMatch(/Level Archive .*on its own/i)
  })

  it('blocks the import when a .zip contains conflicting encoded level ids', async () => {
    // P2 follow-up: parseLevelArchive surfaces id-inference conflicts
    // as parseErrors so the existing gate refuses the import. The
    // .zip is shaped by writing two entries under `level_a/...` and
    // two under `level_b/...` — both ids are present, so the archive
    // is internally inconsistent.
    const { strToU8, zipSync } = await import('fflate')
    const { SECTION_FILENAME_SUFFIX } = await import('../../domain/level/builderPackage.js')
    const pkg = buildValidPackage()
    const sectionPayload = (sec) => JSON.stringify(pkg[sec])
    const archiveBytes = zipSync({
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.hexmap}`]: strToU8(sectionPayload('hexmap')),
      [`level_b/level_b${SECTION_FILENAME_SUFFIX.terrain}`]: strToU8(sectionPayload('terrain')),
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.units}`]: strToU8(sectionPayload('units')),
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.turntable}`]: strToU8(sectionPayload('turntable'))
    }, { level: 6 })

    const target = makeFreshTarget()
    const notifyError = vi.fn()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: notifyError }

    const fakeZip = {
      name: 'mixed.zip',
      arrayBuffer: () => Promise.resolve(archiveBytes.buffer.slice(
        archiveBytes.byteOffset,
        archiveBytes.byteOffset + archiveBytes.byteLength
      )),
      text: () => { throw new Error('text() must not be called for .zip imports') }
    }
    const fakeEvent = { target: { files: [fakeZip], value: 'will-be-cleared' } }
    await call(target, 'loadMap', fakeEvent)

    expect(target.lastActionStage).toBe('import-blocked')
    expect(target.currentLevelId).toBe('before_import')
    expect(target.createHex).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalled()
  })
})

describe('LevelBuilder · Units step computeds', () => {
  it('deploymentSlots counts player1/player2 anchors (Spawn OR Base) from generatedMap', () => {
    // Discriminator: cells (0,0) and (1,0) only carry `player1Spawn`;
    // (2,0) only carries `player1Base`; (3,0) only carries
    // `player2Base`. A spawn-only count would return
    // { player1: 2, player2: 0 } — wrong, because the validator
    // (countSpawnSlots) counts Spawn OR Base. Expected total reflects
    // the validator contract.
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player1Base: false, player2Spawn: false, player2Base: false },
        { q: 2, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 3, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: true },
        { q: 4, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ]
    })
    const slots = LevelBuilder.computed.deploymentSlots.call(stub)
    expect(slots).toEqual({ player1: 3, player2: 1 })
  })

  it('deploymentSlots agrees with the validator\'s own count for a fully-valid package', () => {
    // Round-trip discriminator: build a valid package, ask the validator
    // for its `totalCount` view (via the spawn/base error messages) and
    // assert that the page-level computed matches the cells used by the
    // validator. Specifically the validator emits the spawn count in
    // error messages when it disagrees with totalCount; here we just
    // confirm both sides see the same N from the same input cells.
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: true,  player2Spawn: true,  player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: true }
      ]
    })
    const slots = LevelBuilder.computed.deploymentSlots.call(stub)
    // (0,0) and (1,0) both carry Spawn or Base for player1 -> 2.
    // (1,0) and (0,1) both carry Spawn or Base for player2 -> 2.
    expect(slots).toEqual({ player1: 2, player2: 2 })
  })

  it('deploymentSlots returns zeroes for an empty map', () => {
    const stub = makeBuilderVm({ generatedMap: [] })
    expect(LevelBuilder.computed.deploymentSlots.call(stub)).toEqual({ player1: 0, player2: 0 })
  })

  it('availableTypesByKey delegates to availableUnitTypes per side', () => {
    const stub = makeBuilderVm()
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    const result = LevelBuilder.computed.availableTypesByKey.call(stub)
    expect(result.player1).not.toContain(DEFAULT_UNIT_IDS.infantry)
    expect(result.player2).toContain(DEFAULT_UNIT_IDS.infantry)
  })

  it('unitIssuesByKey buckets validator errors+warnings by player path and tags each with severity', () => {
    const stub = makeBuilderVm()
    Object.defineProperty(stub, 'liveValidation', {
      configurable: true,
      get() {
        return {
          ok: false,
          errors: [
            { path: 'units.player1.units[0].count', message: 'too many units' },
            { path: 'units.player2', message: 'missing roster' },
            { path: 'units', message: 'root issue (should be ignored by side filter)' },
            { path: 'hexmap.parameters', message: 'unrelated' },
            { message: 'no path field' }
          ],
          warnings: [
            { path: 'units.player1.units[0].maxTerrainDifficuly', message: 'legacy field name migrated' }
          ],
          package: null
        }
      }
    })
    const buckets = LevelBuilder.computed.unitIssuesByKey.call(stub)

    expect(buckets.player1).toEqual([
      expect.objectContaining({ path: 'units.player1.units[0].count', severity: 'error', message: 'too many units' }),
      expect.objectContaining({ path: 'units.player1.units[0].maxTerrainDifficuly', severity: 'warning', message: 'legacy field name migrated' })
    ])
    expect(buckets.player2).toEqual([
      expect.objectContaining({ path: 'units.player2', severity: 'error', message: 'missing roster' })
    ])
  })

  it('unitIssuesByKey tolerates a malformed liveValidation gracefully', () => {
    const stub = makeBuilderVm()
    Object.defineProperty(stub, 'liveValidation', {
      configurable: true,
      get() {
        return { ok: false, errors: null, warnings: undefined, package: null }
      }
    })
    expect(LevelBuilder.computed.unitIssuesByKey.call(stub)).toEqual({
      player1: [], player2: []
    })
  })
})

describe('LevelBuilder · Review & Export sectionReadiness', () => {
  function withValidation(stub, errors, warnings) {
    Object.defineProperty(stub, 'liveValidation', {
      configurable: true,
      get() {
        return {
          ok: errors.length === 0,
          errors,
          warnings: warnings || [],
          package: null
        }
      }
    })
  }

  it('returns Map / Deployment / Units / Turntable in fixed order', () => {
    const stub = makeBuilderVm()
    withValidation(stub, [], [])
    const rows = LevelBuilder.computed.sectionReadiness.call(stub)
    expect(rows.map(r => r.key)).toEqual(['map', 'deployment', 'units', 'turntable'])
  })

  it('marks every validator-driven row "ready" on a clean validation', () => {
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player2Spawn: false, player1Base: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player2Spawn: true,  player1Base: false, player2Base: false }
      ]
    })
    withValidation(stub, [], [])
    const rows = LevelBuilder.computed.sectionReadiness.call(stub)
    const find = (key) => rows.find(r => r.key === key)
    expect(find('map').status).toBe('ready')
    expect(find('units').status).toBe('ready')
    expect(find('turntable').status).toBe('ready')
    expect(find('deployment').status).toBe('ready')
    expect(find('deployment').statusLabel).toBe('Both sides anchored')
    expect(find('deployment').summary).toBe('Player: 1 · enemy: 1')
  })

  it('routes hexmap.* and terrain.* errors to the Map row', () => {
    const stub = makeBuilderVm()
    withValidation(
      stub,
      [
        { path: 'hexmap.parameters.width', message: 'bad width' },
        { path: 'terrain.terrainTypes[0].id', message: 'bad terrain id' },
        { path: 'units.player1', message: 'missing roster' }
      ],
      []
    )
    const rows = LevelBuilder.computed.sectionReadiness.call(stub)
    const map = rows.find(r => r.key === 'map')
    expect(map.status).toBe('errors')
    expect(map.statusLabel).toBe('2 errors')
    // Units side still gets its own errors counted.
    expect(rows.find(r => r.key === 'units').status).toBe('errors')
    expect(rows.find(r => r.key === 'turntable').status).toBe('ready')
  })

  it('prefers errors over warnings when both are present in the same section', () => {
    const stub = makeBuilderVm()
    withValidation(
      stub,
      [{ path: 'turntable.Our_operations[0]', message: 'bad' }],
      [{ path: 'turntable.Enemy_operations[0]', message: 'soft' }]
    )
    const tt = LevelBuilder.computed.sectionReadiness.call(stub).find(r => r.key === 'turntable')
    expect(tt.status).toBe('errors')
    expect(tt.statusLabel).toBe('1 error')
  })

  it('routes warning-only validator entries to "warnings" status with the warning count', () => {
    const stub = makeBuilderVm()
    withValidation(
      stub,
      [],
      [
        { path: 'units.player1.units[0].maxTerrainDifficuly', message: 'legacy' },
        { path: 'units.player2.units[0].maxTerrainDifficuly', message: 'legacy' }
      ]
    )
    const units = LevelBuilder.computed.sectionReadiness.call(stub).find(r => r.key === 'units')
    expect(units.status).toBe('warnings')
    expect(units.statusLabel).toBe('2 warnings')
  })

  it('reports Deployment as "empty" when no anchors are placed', () => {
    const stub = makeBuilderVm({ generatedMap: [] })
    withValidation(stub, [], [])
    const dep = LevelBuilder.computed.sectionReadiness.call(stub).find(r => r.key === 'deployment')
    expect(dep.status).toBe('empty')
    expect(dep.statusLabel).toBe('No anchors placed')
    expect(dep.summary).toBe('Player: 0 · enemy: 0')
  })

  it('reports Deployment as "warnings" when only one side has anchors', () => {
    // Only player1 has an anchor -> Enemy side is the one that's
    // missing anchors. Label points at what needs fixing.
    const stubP2Missing = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: true,  player2Spawn: false, player1Base: false, player2Base: false }
      ]
    })
    withValidation(stubP2Missing, [], [])
    const depP2 = LevelBuilder.computed.sectionReadiness.call(stubP2Missing).find(r => r.key === 'deployment')
    expect(depP2.status).toBe('warnings')
    expect(depP2.statusLabel).toBe('Missing enemy anchors')

    // Symmetric case: only player2 has an anchor -> Player side missing.
    const stubP1Missing = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player2Spawn: true,  player1Base: false, player2Base: false }
      ]
    })
    withValidation(stubP1Missing, [], [])
    const depP1 = LevelBuilder.computed.sectionReadiness.call(stubP1Missing).find(r => r.key === 'deployment')
    expect(depP1.statusLabel).toBe('Missing player anchors')
  })

  it('Deployment row honours base-only anchors (matches deploymentSlots semantics)', () => {
    // Counterpart to the deploymentSlots base-only test: a row with
    // only `<player>Base` (no Spawn) must still count as an anchor.
    const stub = makeBuilderVm({
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: true,  player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: true }
      ]
    })
    withValidation(stub, [], [])
    const dep = LevelBuilder.computed.sectionReadiness.call(stub).find(r => r.key === 'deployment')
    expect(dep.status).toBe('ready')
    expect(dep.summary).toBe('Player: 1 · enemy: 1')
  })

  it('ignores validator entries without a path string', () => {
    const stub = makeBuilderVm()
    withValidation(
      stub,
      [{ message: 'no path' }, { path: 42, message: 'wrong type' }, { path: 'unknown.section', message: 'unrelated' }],
      []
    )
    const rows = LevelBuilder.computed.sectionReadiness.call(stub)
    for (const r of rows) {
      if (r.key === 'deployment') continue
      expect(r.status).toBe('ready')
    }
  })
})

// UnitRosterEditor's totalUnits is a small but load-bearing piece of UI
// math: the validator treats a missing `unit.count` as 1, but the
// pre-fix computed returned 0 for the same case. Test it directly via
// the same component-import pattern used elsewhere in this file.
describe('UnitRosterEditor · totalUnits matches validator', () => {
  it('shows full stat names as tooltips on abbreviated table headers', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const wrapper = mount(UnitRosterEditor, {
      props: {
        title: 'Player',
        playerKey: 'player1',
        roster: {
          units: [{
            type: 'infantry',
            count: 1,
            health: 60,
            movement: 4,
            attackRange: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10
          }]
        },
        availableTypes: ['infantry'],
        deploymentSlotCount: 1,
        unitIssues: []
      }
    })

    const headerTitles = Object.fromEntries(
      wrapper.findAll('thead th[title]').map(header => [
        header.text(),
        header.attributes('title')
      ])
    )
    expect(headerTitles).toEqual({
      HP: 'Health',
      Mv: 'Movement',
      Rng: 'Attack range',
      Arc: 'Fire angle: 0 fires straight ahead; 1 and 2 add that many hex directions to the left and right; 3 and 4 can fire in any direction.',
      Atk: 'Attack power',
      MaxT: 'Maximum terrain difficulty'
    })
  })

  it('uses inline number steppers for roster numeric cells with Shift-step support', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const wrapper = mount(UnitRosterEditor, {
      props: {
        title: 'Player',
        playerKey: 'player1',
        roster: {
          units: [{
            type: 'infantry',
            count: 1,
            health: 60,
            movement: 4,
            attackRange: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10
          }]
        },
        availableTypes: ['infantry'],
        deploymentSlotCount: 1,
        unitIssues: []
      }
    })

    expect(wrapper.findAllComponents({ name: 'InlineNumberStepper' })).toHaveLength(7)
    await wrapper.find('button[aria-label="Increase Health"]').trigger('click', { shiftKey: true })
    expect(wrapper.emitted('update-field')[0]).toEqual([0, 'health', 70])
  })

  it('counts a missing or null `count` as 1 (validator default)', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const stub = {
      roster: {
        units: [
          { type: 'infantry' },                   // missing count -> 1
          { type: 'armored', count: null },       // null count -> 1
          { type: 'scout', count: 3 },            // valid -> 3
          { type: 'artillery', count: 0 },        // valid zero -> 0
          { type: 'rogue', count: -2 },           // invalid (negative) -> 0 (validator emits error separately)
          { type: 'broken', count: 'two' }        // invalid (non-integer) -> 0
        ]
      },
      unitIssues: []
    }
    const total = UnitRosterEditor.computed.totalUnits.call(stub)
    expect(total).toBe(1 + 1 + 3 + 0 + 0 + 0)
  })

  it('returns 0 when roster is missing or units is not an array', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    expect(UnitRosterEditor.computed.totalUnits.call({ roster: null, unitIssues: [] })).toBe(0)
    expect(UnitRosterEditor.computed.totalUnits.call({ roster: { units: 'nope' }, unitIssues: [] })).toBe(0)
  })

  it('emits numeric field edits instead of mutating roster props directly', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const emitted = []
    const stub = {
      $emit: (...args) => emitted.push(args)
    }
    UnitRosterEditor.methods.emitNumberField.call(stub, 0, 'count', {
      target: { value: '3', valueAsNumber: 3 }
    })
    UnitRosterEditor.methods.emitNumberField.call(stub, 1, 'health', {
      target: { value: '', valueAsNumber: NaN }
    })
    expect(emitted).toEqual([
      ['update-field', 0, 'count', 3],
      ['update-field', 1, 'health', '']
    ])
  })

  it('does not emit roster edits while readonly', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const emitted = []
    const stub = {
      readonly: true,
      addType: 'scout',
      $emit: (...args) => emitted.push(args)
    }

    UnitRosterEditor.methods.emitNumberField.call(stub, 0, 'count', {
      target: { value: '3', valueAsNumber: 3 }
    })
    UnitRosterEditor.methods.onAdd.call(stub)

    expect(emitted).toEqual([])
    expect(stub.addType).toBe('scout')
  })
})

describe('UnitRosterEditor · comparison highlighting', () => {
  it('marks compared numeric fields as better or worse against the matching unit type', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const vm = {
      ...UnitRosterEditor.methods,
      comparisonAlwaysOn: false,
      activeComparison: { type: 'infantry', field: 'health' },
      comparisonRoster: {
        units: [
          { type: 'infantry', health: 60, movement: 4 },
          { type: 'scout', health: 40, movement: 6 }
        ]
      }
    }

    expect(
      UnitRosterEditor.methods.comparisonInputClass.call(
        vm,
        { type: 'infantry', health: 80, movement: 3 },
        'health'
      )
    ).toBe('unit-roster-editor__num--compare-better')
    expect(
      UnitRosterEditor.methods.comparisonInputClass.call(
        vm,
        { type: 'infantry', health: 80, movement: 3 },
        'movement'
      )
    ).toBe('')

    vm.comparisonAlwaysOn = true
    expect(
      UnitRosterEditor.methods.comparisonInputClass.call(
        vm,
        { type: 'infantry', health: 80, movement: 3 },
        'movement'
      )
    ).toBe('unit-roster-editor__num--compare-worse')
    expect(
      UnitRosterEditor.methods.comparisonInputClass.call(
        vm,
        { type: 'infantry', health: 80, movement: 4 },
        'movement'
      )
    ).toBe('unit-roster-editor__num--compare-equal')
  })

  it('emits comparison focus and blur payloads for numeric fields', async () => {
    const { default: UnitRosterEditor } = await import('@/components/level-builder/UnitRosterEditor.vue')
    const emitted = []
    const vm = {
      playerKey: 'player2',
      $emit: (...args) => emitted.push(args)
    }

    UnitRosterEditor.methods.emitCompareFocus.call(vm, { type: 'artillery' }, 'attackPower')
    UnitRosterEditor.methods.emitCompareBlur.call(vm, { type: 'artillery' }, 'attackPower')

    expect(emitted).toEqual([
      ['compare-focus', { playerKey: 'player2', type: 'artillery', field: 'attackPower' }],
      ['compare-blur', { playerKey: 'player2', type: 'artillery', field: 'attackPower' }]
    ])
  })
})

describe('UnitCatalogDialog · catalog editing', () => {
  it('can add, edit, and apply a custom unit type while protecting used rows', async () => {
    const { default: UnitCatalogDialog } = await import('@/components/level-builder/UnitCatalogDialog.vue')
    const wrapper = mount(UnitCatalogDialog, {
      props: {
        unitTypes: [
          {
            id: 'infantry',
            name: 'Infantry',
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }
        ],
        usedUnitTypeIds: ['infantry']
      }
    })

    expect(wrapper.vm.canDeleteUnitType(wrapper.vm.draft[0])).toBe(false)
    wrapper.vm.addUnitType()
    const custom = wrapper.vm.draft[1]
    custom.name = 'Railgun'
    custom.health = 90
    custom.attackRange = 5
    custom.attackAngle = 0
    custom.losMode = 'artillery'
    custom.iconKey = 'unknown'
    expect(wrapper.vm.canApply).toBe(true)

    wrapper.vm.applyChanges()

    const emitted = wrapper.emitted('apply')[0][0]
    expect(emitted).toContainEqual(expect.objectContaining({
      id: custom.id,
      name: 'Railgun',
      health: 90,
      attackRange: 5,
      attackAngle: 0,
      losMode: 'artillery',
      iconKey: 'unknown'
    }))
  })

  it('syncs unit type labels.en_US when an existing unit type name is edited', async () => {
    const { default: UnitCatalogDialog } = await import('@/components/level-builder/UnitCatalogDialog.vue')
    const wrapper = mount(UnitCatalogDialog, {
      props: {
        unitTypes: [
          {
            id: 'infantry',
            name: 'Infantry',
            labels: { en_US: 'Old Infantry', uk_UA: 'Pikhota' },
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }
        ]
      }
    })

    wrapper.vm.draft[0].name = 'Rifle Team'
    wrapper.vm.applyChanges()

    const emitted = wrapper.emitted('apply')[0][0]
    expect(emitted[0]).toEqual(expect.objectContaining({
      id: 'infantry',
      name: 'Rifle Team',
      labels: {
        en_US: 'Rifle Team',
        uk_UA: 'Pikhota'
      }
    }))
  })

  it('shows the selected unit icon and changes icon style from a grid picker', async () => {
    const { default: UnitCatalogDialog } = await import('@/components/level-builder/UnitCatalogDialog.vue')
    const wrapper = mount(UnitCatalogDialog, {
      props: {
        unitTypes: [
          {
            id: 'infantry',
            name: 'Infantry',
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }
        ]
      }
    })

    expect(wrapper.find('select[aria-label="Icon style"]').exists()).toBe(false)
    const pickerButton = wrapper.find('.unit-catalog-dialog__icon-picker-button')
    expect(pickerButton.exists()).toBe(true)
    expect(pickerButton.find('img').exists()).toBe(true)

    await pickerButton.trigger('click')
    const grid = wrapper.find('.unit-catalog-dialog__icon-grid')
    expect(grid.exists()).toBe(true)
    expect(wrapper.find('.unit-catalog-dialog__row').classes()).toContain('unit-catalog-dialog__row--icon-picker-open')
    expect(grid.findAll('.unit-catalog-dialog__icon-option').length).toBeGreaterThan(1)

    const artilleryOption = grid.find('[data-icon-key="artillery"]')
    expect(artilleryOption.exists()).toBe(true)
    await artilleryOption.trigger('click')

    expect(wrapper.vm.draft[0].iconKey).toBe('artillery')
    expect(wrapper.find('.unit-catalog-dialog__icon-grid').exists()).toBe(false)
  })

  it('marks icon picker options already used by unit types', async () => {
    const { default: UnitCatalogDialog } = await import('@/components/level-builder/UnitCatalogDialog.vue')
    const wrapper = mount(UnitCatalogDialog, {
      props: {
        unitTypes: [
          {
            id: 'tank',
            name: 'Tank',
            health: 100,
            movement: 3,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 50,
            maxTerrainDifficulty: 2,
            losMode: 'direct_fire',
            iconKey: 'armored'
          },
          {
            id: 'infantry',
            name: 'Infantry',
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          },
          {
            id: 'rifle_team',
            name: 'Rifle team',
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }
        ]
      }
    })

    await wrapper.find('.unit-catalog-dialog__icon-picker-button').trigger('click')

    const infantryOption = wrapper.find('[data-icon-key="infantry"]')
    expect(infantryOption.classes()).toContain('unit-catalog-dialog__icon-option--used')
    expect(infantryOption.attributes('data-icon-usage-count')).toBe('2')
    expect(infantryOption.attributes('title')).toBe('Infantry - Used by Infantry, Rifle team')
    expect(infantryOption.attributes('aria-label')).toBe('Infantry, used by Infantry, Rifle team')
    expect(infantryOption.find('.unit-catalog-dialog__icon-usage-badge').text()).toBe('2')

    const scoutOption = wrapper.find('[data-icon-key="scout"]')
    expect(scoutOption.classes()).not.toContain('unit-catalog-dialog__icon-option--used')
    expect(scoutOption.attributes('data-icon-usage-count')).toBe('0')
    expect(scoutOption.find('.unit-catalog-dialog__icon-usage-badge').exists()).toBe(false)
  })

  it('explains compact unit catalog column headers with tooltips', async () => {
    const { default: UnitCatalogDialog } = await import('@/components/level-builder/UnitCatalogDialog.vue')
    const wrapper = mount(UnitCatalogDialog, {
      props: {
        unitTypes: [
          {
            id: 'infantry',
            name: 'Infantry',
            health: 60,
            movement: 4,
            attackRange: 1,
            attackAngle: 1,
            attackPower: 30,
            maxTerrainDifficulty: 10,
            losMode: 'direct_fire',
            iconKey: 'infantry'
          }
        ]
      }
    })

    const headingTitles = Object.fromEntries(
      wrapper.findAll('thead th')
        .map(th => [th.text(), th.attributes('title')])
        .filter(([, title]) => title)
    )

    expect(headingTitles.HP).toContain('Health points:')
    expect(headingTitles.Actions).toMatch(/^Actions: /)
    expect(headingTitles['Fire rng']).toMatch(/^Fire range: /)
    expect(headingTitles['Fire angle']).toContain('0 fires straight ahead')
    expect(headingTitles['Fire angle']).toContain('3 and 4 can fire in any direction')
    expect(headingTitles['Atk. dmg']).toMatch(/^Attack damage: /)
    expect(headingTitles['Ter. pass.']).toMatch(/^Terrain passability: /)
    expect(headingTitles['Art. fire']).toMatch(/^Artillery fire: /)
    expect(headingTitles.Icon).toContain('Visual icon style')
  })
})

describe('UnitsBuilderStep · comparison state', () => {
  it('tracks and clears the currently focused comparison field', async () => {
    const { default: UnitsBuilderStep } = await import('@/components/level-builder/UnitsBuilderStep.vue')
    const state = UnitsBuilderStep.data()

    UnitsBuilderStep.methods.setActiveComparison.call(state, {
      playerKey: 'player2',
      type: 'infantry',
      field: 'health'
    })
    expect(state.activeComparison).toEqual({
      playerKey: 'player2',
      type: 'infantry',
      field: 'health'
    })

    UnitsBuilderStep.methods.clearActiveComparison.call(state, {
      playerKey: 'player1',
      type: 'infantry',
      field: 'health'
    })
    expect(state.activeComparison).toEqual({
      playerKey: 'player2',
      type: 'infantry',
      field: 'health'
    })

    UnitsBuilderStep.methods.clearActiveComparison.call(state, {
      playerKey: 'player2',
      type: 'infantry',
      field: 'health'
    })
    expect(state.activeComparison).toBe(null)
  })

  it('sync-lock requests enemy sync and blocks enemy roster edits', async () => {
    const { default: UnitsBuilderStep } = await import('@/components/level-builder/UnitsBuilderStep.vue')
    const emitted = []
    const state = {
      ...UnitsBuilderStep.data(),
      ...UnitsBuilderStep.methods,
      $emit: (...args) => emitted.push(args)
    }

    UnitsBuilderStep.methods.setEnemySyncLocked.call(state, true)
    expect(state.enemySyncLocked).toBe(true)
    expect(emitted).toEqual([['sync-enemy-roster']])

    emitted.length = 0
    UnitsBuilderStep.methods.emitRosterUpdate.call(state, 'player1', 0, 'health', 75)
    expect(emitted).toEqual([
      ['update-field', 'player1', 0, 'health', 75],
      ['sync-enemy-roster']
    ])

    emitted.length = 0
    UnitsBuilderStep.methods.emitRosterUpdate.call(state, 'player2', 0, 'health', 20)
    expect(emitted).toEqual([])
  })

  it('emits copy roster shortcuts and blocks enemy-to-player copy while synced', async () => {
    const { default: UnitsBuilderStep } = await import('@/components/level-builder/UnitsBuilderStep.vue')
    const emitted = []
    const state = {
      ...UnitsBuilderStep.data(),
      ...UnitsBuilderStep.methods,
      $emit: (...args) => emitted.push(args)
    }

    UnitsBuilderStep.methods.copyRoster.call(state, 'player->enemy')
    UnitsBuilderStep.methods.copyRoster.call(state, 'enemy->player')
    expect(emitted).toEqual([
      ['copy-roster', 'player->enemy'],
      ['copy-roster', 'enemy->player']
    ])

    emitted.length = 0
    state.enemySyncLocked = true
    UnitsBuilderStep.methods.copyRoster.call(state, 'enemy->player')
    expect(emitted).toEqual([])
  })

  it('emits reset and preserves sync-lock semantics when resetting units', async () => {
    const { default: UnitsBuilderStep } = await import('@/components/level-builder/UnitsBuilderStep.vue')
    const emitted = []
    const state = {
      ...UnitsBuilderStep.data(),
      ...UnitsBuilderStep.methods,
      $emit: (...args) => emitted.push(args)
    }

    UnitsBuilderStep.methods.resetUnits.call(state)
    expect(emitted).toEqual([['reset-units']])

    emitted.length = 0
    state.enemySyncLocked = true
    UnitsBuilderStep.methods.resetUnits.call(state)
    expect(emitted).toEqual([
      ['reset-units'],
      ['sync-enemy-roster']
    ])
  })
})

describe('LevelBuilder · stepper coordinator', () => {
  it('setActiveStep flips activeStepId only for a step id present in steps[]', () => {
    const stub = makeBuilderVm({ activeStepId: 'map-deployment' })
    call(stub, 'setActiveStep', 'units')
    expect(stub.activeStepId).toBe('units')
    call(stub, 'setActiveStep', 'turntable')
    expect(stub.activeStepId).toBe('turntable')
    call(stub, 'setActiveStep', 'review-export')
    expect(stub.activeStepId).toBe('review-export')
    // Unknown id is rejected.
    call(stub, 'setActiveStep', 'nope')
    expect(stub.activeStepId).toBe('review-export')
  })

  it('applyRouteStep opens a known step from route query', () => {
    const stub = makeBuilderVm({
      activeStepId: 'map-deployment',
      $route: { query: { step: 'review-export' } }
    })

    call(stub, 'applyRouteStep')

    expect(stub.activeStepId).toBe('review-export')
  })

  it('setUnitField updates allowed roster fields only', () => {
    const stub = makeBuilderVm({
      unitsData: {
        player1: { units: [{ type: 'infantry', count: 1 }] },
        player2: { units: [] }
      }
    })
    call(stub, 'setUnitField', 'player1', 0, 'count', 4)
    call(stub, 'setUnitField', 'player1', 0, 'attackAngle', 99)
    call(stub, 'setUnitField', 'player1', 0, 'unknown', 9)
    expect(stub.unitsData.player1.units[0].count).toBe(4)
    expect(stub.unitsData.player1.units[0].attackAngle).toBe(4)
    expect(stub.unitsData.player1.units[0].unknown).toBeUndefined()
  })

  it('syncEnemyRosterFromPlayer replaces enemy roster with cloned player rows', () => {
    const stub = makeBuilderVm({
      unitsData: {
        player1: {
          units: [
            { type: 'infantry', count: 2, health: 60, movement: 3 },
            { type: 'scout', count: 1, health: 40, movement: 4 }
          ]
        },
        player2: {
          units: [
            { type: 'artillery', count: 3, health: 80, movement: 1 }
          ]
        }
      }
    })

    call(stub, 'syncEnemyRosterFromPlayer')

    expect(stub.unitsData.player2.units).toEqual(stub.unitsData.player1.units)
    expect(stub.unitsData.player2.units).not.toBe(stub.unitsData.player1.units)
    expect(stub.unitsData.player2.units[0]).not.toBe(stub.unitsData.player1.units[0])
  })

  it('copyUnitRoster can copy enemy rows back to player', () => {
    const stub = makeBuilderVm({
      unitsData: {
        player1: {
          units: [
            { type: 'infantry', count: 2, health: 60, movement: 3 }
          ]
        },
        player2: {
          units: [
            { type: 'artillery', count: 3, health: 80, movement: 1 }
          ]
        }
      }
    })

    call(stub, 'copyUnitRoster', 'enemy->player')

    expect(stub.unitsData.player1.units).toEqual(stub.unitsData.player2.units)
    expect(stub.unitsData.player1.units).not.toBe(stub.unitsData.player2.units)
    expect(stub.unitsData.player1.units[0]).not.toBe(stub.unitsData.player2.units[0])
  })

  it('resetUnitsToDefault restores the shipping default units roster', () => {
    const stub = makeBuilderVm({
      unitsData: {
        player1: { units: [{ type: 'scout', count: 9, health: 1 }] },
        player2: { units: [] }
      }
    })

    call(stub, 'resetUnitsToDefault')

    expect(stub.unitsData.player1.units.map(u => u.type)).toEqual([
      DEFAULT_UNIT_IDS.infantry,
      DEFAULT_UNIT_IDS.armored,
      DEFAULT_UNIT_IDS.artillery
    ])
    expect(stub.unitsData.player1.units[0].count).toBe(2)
    expect(stub.unitsData.unitTypes.map(t => t.id)).toEqual([
      DEFAULT_UNIT_IDS.armored,
      DEFAULT_UNIT_IDS.infantry,
      DEFAULT_UNIT_IDS.artillery,
      DEFAULT_UNIT_IDS.scout
    ])
    expect(stub.unitsData.player2.units[0].count).toBe(2)
    expect(stub.unitsData.player1.units[0]).not.toBe(stub.unitsData.player2.units[0])
  })
})

describe('LevelBuilder map editor tools', () => {
  it('selectMapTool coordinates editor state and default selections', () => {
    const stub = makeBuilderVm()

    call(stub, 'selectMapTool', 'terrain')
    expect(stub.activeMapTool).toBe('terrain')
    expect(stub.isPaintingMode).toBe(true)
    expect(stub.selectedTerrainForPainting.id).toBe('plains')
    expect(stub.selectedOverlay).toBe(null)

    call(stub, 'selectMapTool', 'deployment')
    expect(stub.activeMapTool).toBe('deployment')
    expect(stub.selectedTerrainForPainting).toBe(null)
    expect(stub.selectedOverlay).toBe(stub.overlayTypes[0])

    call(stub, 'selectMapTool', 'select')
    expect(stub.activeMapTool).toBe('select')
    expect(stub.isPaintingMode).toBe(false)
    expect(stub.selectedOverlay).toBe(null)
  })

  it('updateTerrainTypes reconciles generator selection, brush selection, and painted cells', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const custom = { id: 'custom_terrain_1', name: 'Mud', color: '#795548', terrainDifficulty: 2 }
    const updatedPlains = { id: 'plains', name: 'Open Ground', color: '#8BC34A', terrainDifficulty: 0 }
    const lava = { id: 'custom_terrain_2', name: 'Lava', color: '#FF5722', terrainDifficulty: 4 }
    const stub = makeBuilderVm({
      terrainTypes: [plains, custom],
      mapParams: { width: 2, height: 1, availableTerrain: ['plains', 'custom_terrain_1'] },
      activeMapTool: 'terrain',
      selectedTerrainForPainting: custom,
      generatedMap: [
        { q: 0, r: 0, terrain: plains },
        { q: 1, r: 0, terrain: custom }
      ]
    })

    call(stub, 'updateTerrainTypes', [updatedPlains, lava])

    expect(stub.terrainTypes).toEqual([updatedPlains, lava])
    expect(stub.mapParams.availableTerrain).toEqual(['plains', 'custom_terrain_2'])
    expect(stub.generatedMap[0].terrain).toBe(stub.terrainTypes[0])
    expect(stub.generatedMap[1].terrain).toBe(stub.terrainTypes[0])
    expect(stub.selectedTerrainForPainting).toBe(stub.terrainTypes[0])
    expect(stub.lastActionStage).toBe('terrain-config-edit')
  })

  it('resizeGeneratedMapToDimensions preserves existing cells and generates added cells', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const forest = { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
    const stub = makeBuilderVm({
      mapParams: { width: 5, height: 5, availableTerrain: ['forest'] },
      currentMapWidth: 4,
      currentMapHeight: 4,
      terrainTypes: [plains, forest],
      generatedMap: [
        {
          q: 0,
          r: 0,
          terrain: plains,
          player1Spawn: true,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: true
        },
        {
          q: 1,
          r: 0,
          terrain: forest,
          player1Spawn: false,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: false
        }
      ],
      terrainSeed: 'resize-grow'
    })

    call(stub, 'resizeGeneratedMapToDimensions')

    expect(stub.currentMapWidth).toBe(5)
    expect(stub.currentMapHeight).toBe(5)
    expect(stub.generatedMap).toHaveLength(25)
    const preserved = stub.generatedMap.find(hex => hex.q === 0 && hex.r === 0)
    expect(preserved.terrain).toBe(plains)
    expect(preserved.player1Spawn).toBe(true)
    expect(preserved.locked).toBe(true)
    const added = stub.generatedMap.find(hex => hex.q === 4 && hex.r === 4)
    expect(added.terrain).toBe(forest)
  })

  it('resizeGeneratedMapToDimensions crops cells outside smaller dimensions', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const generatedMap = []
    for (let r = 0; r < 5; r++) {
      for (let q = 0; q < 5; q++) {
        generatedMap.push({ q, r, terrain: plains })
      }
    }
    const croppedSelection = generatedMap.find(hex => hex.q === 4 && hex.r === 4)
    const stub = makeBuilderVm({
      mapParams: { width: 4, height: 4, availableTerrain: ['plains'] },
      currentMapWidth: 5,
      currentMapHeight: 5,
      terrainTypes: [plains],
      generatedMap,
      selectedHex: croppedSelection
    })

    call(stub, 'resizeGeneratedMapToDimensions')

    expect(stub.generatedMap).toHaveLength(16)
    expect(stub.generatedMap.every(hex => hex.q < 4 && hex.r < 4)).toBe(true)
    expect(stub.selectedHex).toBe(null)
  })

  it('generateMap writes a visible seed when the seed field is blank', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const stub = makeBuilderVm({
      mapParams: { width: 4, height: 4, availableTerrain: ['plains'] },
      terrainTypes: [plains],
      terrainSeed: '',
      createTerrainSeed: () => 'generated-visible-seed'
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q,
      r,
      terrain: terrain || plains,
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      locked: false
    })

    call(stub, 'generateMap')

    expect(stub.terrainSeed).toBe('generated-visible-seed')
    expect(stub.generatedMap).toHaveLength(16)
  })

  it('generateMap refreshes the visible seed on regeneration while unlocked', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const createTerrainSeed = vi.fn(() => 'next-visible-seed')
    const stub = makeBuilderVm({
      mapParams: { width: 4, height: 4, availableTerrain: ['plains'] },
      terrainTypes: [plains],
      terrainSeed: 'previous-visible-seed',
      terrainSeedLocked: false,
      generatedMap: [
        {
          q: 0,
          r: 0,
          terrain: plains,
          player1Spawn: false,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: false
        }
      ],
      createTerrainSeed
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q,
      r,
      terrain: terrain || plains,
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      locked: false
    })

    call(stub, 'generateMap')

    expect(createTerrainSeed).toHaveBeenCalledTimes(1)
    expect(stub.terrainSeed).toBe('next-visible-seed')
  })

  it('generateMap keeps the visible seed on regeneration while locked', () => {
    const plains = { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const createTerrainSeed = vi.fn(() => 'unexpected-seed')
    const stub = makeBuilderVm({
      mapParams: { width: 4, height: 4, availableTerrain: ['plains'] },
      terrainTypes: [plains],
      terrainSeed: 'locked-visible-seed',
      terrainSeedLocked: true,
      generatedMap: [
        {
          q: 0,
          r: 0,
          terrain: plains,
          player1Spawn: false,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: false
        }
      ],
      createTerrainSeed
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q,
      r,
      terrain: terrain || plains,
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      locked: false
    })

    call(stub, 'generateMap')

    expect(createTerrainSeed).not.toHaveBeenCalled()
    expect(stub.terrainSeed).toBe('locked-visible-seed')
  })

  it('locked cells reject terrain and deployment edits', () => {
    const lockedHex = {
      q: 0,
      r: 0,
      terrain: { id: 'plains' },
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      locked: true
    }
    const stub = makeBuilderVm({
      activeMapTool: 'terrain',
      isPaintingMode: true,
      selectedTerrainForPainting: { id: 'forest', name: 'Forest', color: '#2E7D32' }
    })

    call(stub, 'selectHex', lockedHex)
    expect(lockedHex.terrain.id).toBe('plains')

    stub.activeMapTool = 'deployment'
    stub.selectedTerrainForPainting = null
    stub.selectedOverlay = {
      id: 'player1-spawn',
      property: 'player1Spawn',
      player: 1
    }
    call(stub, 'selectHex', lockedHex)
    expect(lockedHex.player1Spawn).toBe(false)
  })

  it('lock tool locks, unlocks, and unlocks all cells', () => {
    const a = { locked: false }
    const b = { locked: true }
    const stub = makeBuilderVm({
      activeMapTool: 'lock',
      isPaintingMode: true,
      lockBrushMode: 'lock',
      generatedMap: [a, b]
    })

    call(stub, 'selectHex', a)
    expect(a.locked).toBe(true)

    stub.lockBrushMode = 'unlock'
    call(stub, 'selectHex', b)
    expect(b.locked).toBe(false)

    a.locked = true
    b.locked = true
    call(stub, 'unlockAllHexes')
    expect(a.locked).toBe(false)
    expect(b.locked).toBe(false)
  })

  it('clearDeploymentAnchors clears editable anchors and preserves locked anchors', () => {
    const editable = {
      player1Spawn: true,
      player1Base: true,
      player2Spawn: false,
      player2Base: false,
      locked: false
    }
    const locked = {
      player1Spawn: false,
      player1Base: false,
      player2Spawn: true,
      player2Base: true,
      locked: true
    }
    const stub = makeBuilderVm({ generatedMap: [editable, locked] })

    expect(stub.deploymentAnchorCount).toBe(4)
    expect(stub.clearableDeploymentAnchorCount).toBe(2)

    call(stub, 'clearDeploymentAnchors')

    expect(editable.player1Spawn).toBe(false)
    expect(editable.player1Base).toBe(false)
    expect(locked.player2Spawn).toBe(true)
    expect(locked.player2Base).toBe(true)
  })

  it('generateMap preserves locked cell terrain and lock state', () => {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 1, availableTerrain: ['plains'] },
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
      ],
      generatedMap: [
        {
          q: 0,
          r: 0,
          terrain: { id: 'forest', name: 'Forest', color: '#2E7D32' },
          player1Spawn: true,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: true
        },
        {
          q: 1,
          r: 0,
          terrain: { id: 'forest', name: 'Forest', color: '#2E7D32' },
          player1Spawn: false,
          player1Base: false,
          player2Spawn: false,
          player2Base: false,
          locked: false
        }
      ],
      terrainSeed: 'locked-preserve'
    })
    stub.updateMapDimensions = vi.fn()
    stub.createHex = (q, r, terrain) => ({
      q,
      r,
      terrain: terrain || { id: 'plains', name: 'Plains', color: '#4CAF50' },
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      locked: false
    })

    call(stub, 'generateMap')

    const locked = stub.generatedMap.find(h => h.q === 0 && h.r === 0)
    expect(locked.terrain.id).toBe('forest')
    expect(locked.player1Spawn).toBe(true)
    expect(locked.locked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Finding #6: stale automationTraceId in keep-alive
// (Updated C3a: now uses the unified capped trace-history store)
// ---------------------------------------------------------------------------
import {
  appendTraceToHistory,
  readTraceFromHistory,
  readTraceHistoryIndex,
  clearTraceHistory,
  readBuilderEpoch
} from '../../domain/simulation/traceHistory.js'
import { fingerprintLevelPackage } from '../../domain/level/builderPlaytestLevels.js'

describe('LevelBuilder · activated() stale-trace guard (Finding #6)', () => {
  // Build a minimal vm with automationTraceId set and a $notify stub so
  // openAutomatedPlayback can call notifyUser without crashing.
  function makeTraceVm(traceId, notifyImpl = vi.fn()) {
    const stub = makeBuilderVm({
      automationTraceId: traceId
    })
    stub.$notify = { warning: notifyImpl, error: notifyImpl, success: notifyImpl }
    // Wire the window.$notify path used by notifyUser.
    if (typeof window !== 'undefined') {
      window.$notify = { warning: notifyImpl, error: notifyImpl, success: notifyImpl }
    }
    return stub
  }

  function seedTrace(traceId) {
    // Seed a minimal trace into the capped store so readTraceFromHistory finds it.
    appendTraceToHistory(sessionStorage, {
      metadata: { id: traceId, traceId, source: 'builder', number: 1, createdAt: new Date().toISOString() },
      trace: { frames: [], createdAt: new Date().toISOString() }
    })
  }

  it('keeps automationTraceId when the trace is still in the store', () => {
    const traceId = 'builder-test-123'
    clearTraceHistory(sessionStorage)
    seedTrace(traceId)

    const stub = makeTraceVm(traceId)
    // Call activated() directly — the component lifecycle method.
    LevelBuilder.activated.call(stub)

    expect(stub.automationTraceId).toBe(traceId)

    clearTraceHistory(sessionStorage)
  })

  it('resets automationTraceId to "" when trace is gone from the store', () => {
    const traceId = 'builder-test-stale-456'
    // Ensure the trace is absent — simulates eviction by AutomatedPlayground
    // running many runs that pushed the builder entry out of the capped store.
    clearTraceHistory(sessionStorage)

    const stub = makeTraceVm(traceId)
    LevelBuilder.activated.call(stub)

    expect(stub.automationTraceId).toBe('')
  })

  it('openAutomatedPlayback does NOT navigate and resets id when trace is missing', () => {
    const traceId = 'builder-test-missing-789'
    clearTraceHistory(sessionStorage)

    const routerPush = vi.fn()
    const stub = makeTraceVm(traceId)
    stub.$router = { push: routerPush }

    call(stub, 'openAutomatedPlayback')

    // Must NOT navigate.
    expect(routerPush).not.toHaveBeenCalled()
    // Must reset the id so the button becomes disabled.
    expect(stub.automationTraceId).toBe('')
  })
})

// ---------------------------------------------------------------------------
// C3a: builder playtest runs join the unified capped trace-history
// ---------------------------------------------------------------------------

describe('LevelBuilder · runAutomatedPlaytest → unified trace-history (C3a)', () => {
  // A minimal but fully-valid level package state for the builder vm.
  function makeFullValidPlaytestStub(overrides = {}) {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'c3a_test_level',
      automationRunning: false,
      automationError: '',
      automationResult: null,
      automationTraceId: '',
      automationRunConfig: {
        maxTurns: 50,
        seed: '',
        players: {
          player1: { profile: 'aggressive' },
          player2: { profile: 'defensive' }
        }
      },
      ...overrides
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    // awaitPaint is async; stub it to a no-op so the test runs synchronously.
    stub.awaitPaint = () => Promise.resolve()
    return stub
  }

  beforeEach(() => {
    clearTraceHistory(sessionStorage)
  })

  afterEach(() => {
    clearTraceHistory(sessionStorage)
  })

  it('appends run to the shared store with source:"builder" and correct traceId', async () => {
    const stub = makeFullValidPlaytestStub()

    await call(stub, 'runAutomatedPlaytest')

    expect(stub.automationTraceId).toMatch(/^builder-/)
    const index = readTraceHistoryIndex(sessionStorage)
    expect(index).toHaveLength(1)
    expect(index[0].traceId).toBe(stub.automationTraceId)
    expect(index[0].source).toBe('builder')
  })

  it('readTraceFromHistory returns the trace (with levelPackage rehydrated) after a run', async () => {
    const stub = makeFullValidPlaytestStub()

    await call(stub, 'runAutomatedPlaytest')

    const traceId = stub.automationTraceId
    expect(traceId).toBeTruthy()

    const trace = readTraceFromHistory(sessionStorage, traceId)
    expect(trace).not.toBeNull()
    // The trace must have frames (it was a real match run with trace:true).
    expect(Array.isArray(trace.frames)).toBe(true)
    // levelPackage is rehydrated from the deduplicated level blob.
    expect(trace.levelPackage).toBeDefined()
    expect(trace.levelPackage.id).toBe('c3a_test_level')
  })

  it('does NOT evict a pre-seeded unrelated trace (old evict-all behaviour is gone)', async () => {
    // Pre-seed an unrelated trace via appendTraceToHistory.
    const unrelatedId = 'unrelated-pre-existing-trace'
    appendTraceToHistory(sessionStorage, {
      metadata: { id: unrelatedId, traceId: unrelatedId, source: 'automated', number: 1, createdAt: new Date().toISOString() },
      trace: { frames: [{ turn: 1 }], createdAt: new Date().toISOString() }
    })

    // Run the builder playtest.
    const stub = makeFullValidPlaytestStub()
    await call(stub, 'runAutomatedPlaytest')

    // Both traces must coexist — the pre-seeded trace survived.
    const unrelatedTrace = readTraceFromHistory(sessionStorage, unrelatedId)
    expect(unrelatedTrace).not.toBeNull()
    expect(Array.isArray(unrelatedTrace.frames)).toBe(true)

    const index = readTraceHistoryIndex(sessionStorage)
    expect(index.length).toBeGreaterThanOrEqual(2)
  })

  it('record shape matches makeRunRecord fields: levelId, seed, maxTurns, player profiles', async () => {
    const stub = makeFullValidPlaytestStub()

    await call(stub, 'runAutomatedPlaytest')

    const index = readTraceHistoryIndex(sessionStorage)
    expect(index).toHaveLength(1)
    const record = index[0]

    expect(record.source).toBe('builder')
    expect(record.levelId).toBe('c3a_test_level')
    expect(record.levelLabel).toBe('c3a_test_level')
    expect(record.levelKey).toBe('')
    expect(typeof record.seed).toBe('string')
    expect(typeof record.maxTurns).toBe('number')
    expect(record.player1Profile).toBe('aggressive')
    expect(record.player2Profile).toBe('defensive')
    expect(record.number).toBe(1)
    expect(typeof record.winner).toBe('string')
    expect(typeof record.reason).toBe('string')
    expect(typeof record.turns).toBe('number')
    expect(typeof record.frames).toBe('number')
    expect(record.frames).toBeGreaterThanOrEqual(0)
  })

  it('openAutomatedPlayback navigates when trace is present in the store', async () => {
    const stub = makeFullValidPlaytestStub()
    const routerPush = vi.fn().mockResolvedValue(undefined)
    stub.$router = { push: routerPush }

    await call(stub, 'runAutomatedPlaytest')
    expect(stub.automationTraceId).toBeTruthy()

    call(stub, 'openAutomatedPlayback')

    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/AutomatedPlayground' })
    )
    // traceId is still set after a successful navigation.
    expect(stub.automationTraceId).toBeTruthy()
  })

  it('openAutomatedPlayback clears automationTraceId and warns when trace absent from store', () => {
    const warnNotify = vi.fn()
    const stub = makeFullValidPlaytestStub({
      automationTraceId: 'builder-missing-trace-xyz'
    })
    stub.$notify = { warning: warnNotify, error: vi.fn(), success: vi.fn() }
    if (typeof window !== 'undefined') {
      window.$notify = { warning: warnNotify, error: vi.fn(), success: vi.fn() }
    }
    const routerPush = vi.fn()
    stub.$router = { push: routerPush }
    // Store is empty — trace is absent.
    clearTraceHistory(sessionStorage)

    call(stub, 'openAutomatedPlayback')

    expect(routerPush).not.toHaveBeenCalled()
    expect(stub.automationTraceId).toBe('')
  })
})

// ---------------------------------------------------------------------------
// D2: automation seed-lock (run logic owns the seed)
// ---------------------------------------------------------------------------

describe('LevelBuilder · automation seed-lock (D2)', () => {
  function makeSeedStub(overrides = {}) {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'd2_seed_level',
      automationRunning: false,
      automationError: '',
      automationResult: null,
      automationTraceId: '',
      automationSeedLocked: false,
      automationRunConfig: {
        maxTurns: 50,
        seed: '',
        players: {
          player1: { profile: 'aggressive' },
          player2: { profile: 'defensive' }
        },
        trace: true
      },
      ...overrides
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    stub.awaitPaint = () => Promise.resolve()
    return stub
  }

  beforeEach(() => {
    clearTraceHistory(sessionStorage)
  })

  afterEach(() => {
    clearTraceHistory(sessionStorage)
  })

  it('defaultSeedForBuilderPlaytest is builder-flavored and uses the current level id', () => {
    const stub = makeSeedStub()
    const seed = call(stub, 'defaultSeedForBuilderPlaytest')
    expect(seed).toMatch(/^builder-d2_seed_level-/)
  })

  it('prepareAutomationSeedForRun generates a fresh seed when unlocked', () => {
    const stub = makeSeedStub({ automationSeedLocked: false })
    expect(stub.automationRunConfig.seed).toBe('')
    const seed = call(stub, 'prepareAutomationSeedForRun')
    expect(seed).toMatch(/^builder-d2_seed_level-/)
    expect(stub.automationRunConfig.seed).toBe(seed)
  })

  it('prepareAutomationSeedForRun preserves a locked, non-empty seed', () => {
    const stub = makeSeedStub({
      automationSeedLocked: true,
      automationRunConfig: {
        maxTurns: 50,
        seed: 'pinned-seed-123',
        players: { player1: { profile: 'aggressive' }, player2: { profile: 'defensive' } },
        trace: true
      }
    })
    const seed = call(stub, 'prepareAutomationSeedForRun')
    expect(seed).toBe('pinned-seed-123')
    expect(stub.automationRunConfig.seed).toBe('pinned-seed-123')
  })

  it('prepareAutomationSeedForRun regenerates even when locked if the seed is empty', () => {
    const stub = makeSeedStub({ automationSeedLocked: true })
    const seed = call(stub, 'prepareAutomationSeedForRun')
    expect(seed).toMatch(/^builder-d2_seed_level-/)
  })

  it('runAutomatedPlaytest generates a non-empty seed (not the old constant) when unlocked', async () => {
    const stub = makeSeedStub({ automationSeedLocked: false })

    await call(stub, 'runAutomatedPlaytest')

    expect(stub.automationRunConfig.seed).toBeTruthy()
    expect(stub.automationRunConfig.seed).not.toBe('builder-playtest-001')
    expect(stub.automationRunConfig.seed).toMatch(/^builder-d2_seed_level-/)
  })

  it('commitAutomationSeedInput sets the seed and locks on first non-empty commit', () => {
    const stub = makeSeedStub({ automationSeedLocked: false })

    call(stub, 'commitAutomationSeedInput', 'my-pinned-seed')

    expect(stub.automationRunConfig.seed).toBe('my-pinned-seed')
    expect(stub.automationSeedLocked).toBe(true)
  })

  it('commitAutomationSeedInput does not lock on an empty/whitespace commit', () => {
    const stub = makeSeedStub({ automationSeedLocked: false })

    call(stub, 'commitAutomationSeedInput', '   ')

    expect(stub.automationRunConfig.seed).toBe('   ')
    expect(stub.automationSeedLocked).toBe(false)
  })

  it('toggleAutomationSeedLock unlocks and regenerates a fresh seed', () => {
    const stub = makeSeedStub({
      automationSeedLocked: true,
      automationRunConfig: {
        maxTurns: 50,
        seed: 'pinned-seed-123',
        players: { player1: { profile: 'aggressive' }, player2: { profile: 'defensive' } },
        trace: true
      }
    })

    call(stub, 'toggleAutomationSeedLock')

    expect(stub.automationSeedLocked).toBe(false)
    expect(stub.automationRunConfig.seed).not.toBe('pinned-seed-123')
    expect(stub.automationRunConfig.seed).toMatch(/^builder-d2_seed_level-/)
  })

  it('toggleAutomationSeedLock locks without mutating the seed when toggling on', () => {
    const stub = makeSeedStub({
      automationSeedLocked: false,
      automationRunConfig: {
        maxTurns: 50,
        seed: 'keep-me',
        players: { player1: { profile: 'aggressive' }, player2: { profile: 'defensive' } },
        trace: true
      }
    })

    call(stub, 'toggleAutomationSeedLock')

    expect(stub.automationSeedLocked).toBe(true)
    expect(stub.automationRunConfig.seed).toBe('keep-me')
  })
})

// ---------------------------------------------------------------------------
// C3b: builder-level-change epoch invalidation
// ---------------------------------------------------------------------------

describe('LevelBuilder · builderLevelFingerprint computed + epoch watcher (C3b)', () => {
  // A minimal but fully-valid level package state for the builder vm.
  function makeFullValidPlaytestStub(overrides = {}) {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'c3b_test_level',
      automationRunning: false,
      automationError: '',
      automationResult: null,
      automationTraceId: '',
      automationRunConfig: {
        maxTurns: 50,
        seed: '',
        players: {
          player1: { profile: 'aggressive' },
          player2: { profile: 'defensive' }
        }
      },
      ...overrides
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    stub.awaitPaint = () => Promise.resolve()
    return stub
  }

  beforeEach(() => {
    clearTraceHistory(sessionStorage)
    sessionStorage.removeItem('hwg:simulation-builder-epoch')
  })

  afterEach(() => {
    clearTraceHistory(sessionStorage)
    sessionStorage.removeItem('hwg:simulation-builder-epoch')
  })

  it('watcher writes epoch equal to fingerprintLevelPackage(liveValidation.package)', () => {
    const stub = makeFullValidPlaytestStub()

    // The computed is accessible via the Proxy; invoke the watcher handler
    // directly to simulate what Vue fires on immediate:true.
    const fp = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp)

    const stored = readBuilderEpoch(sessionStorage)
    expect(stored).toBe(fp)
    // Must equal fingerprintLevelPackage of the validated (normalized) package.
    const v = stub.liveValidation
    expect(stored).toBe(fingerprintLevelPackage(v.package))
  })

  it('epoch updates when the fingerprint changes (e.g. a map cell edit)', () => {
    const stub = makeFullValidPlaytestStub()

    // Write the initial epoch.
    const fp1 = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp1)
    const stored1 = readBuilderEpoch(sessionStorage)
    expect(stored1).toBe(fp1)

    // Mutate the draft: change a terrain cell on the map.
    stub.generatedMap = [
      { q: 0, r: 0, terrain: { id: 'forest', name: 'Forest', color: '#2E7D32' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
      { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
      { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
      { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
    ]

    const fp2 = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp2)
    const stored2 = readBuilderEpoch(sessionStorage)

    expect(fp2).not.toBe(fp1)
    expect(stored2).toBe(fp2)
  })

  it('epoch after runAutomatedPlaytest matches the stored trace levelFingerprint (fresh run not stale)', async () => {
    const stub = makeFullValidPlaytestStub()

    // Write epoch to match current draft.
    const fp = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp)

    await call(stub, 'runAutomatedPlaytest')

    const index = readTraceHistoryIndex(sessionStorage)
    expect(index).toHaveLength(1)
    const record = index[0]

    const epoch = readBuilderEpoch(sessionStorage)
    // The epoch must equal the trace's levelFingerprint so a fresh run is NOT stale.
    expect(epoch).toBe(record.levelFingerprint)
    // And both must equal the normalized-package fingerprint.
    expect(epoch).toBe(fp)
  })
})

// ---------------------------------------------------------------------------
// Task #7: builder draft persistence across full browser reloads
// (imports hoisted to the top-of-file import block)
// ---------------------------------------------------------------------------
describe('LevelBuilder · draft persistence (Task #7)', () => {
  // A fully-valid builder vm whose state packages cleanly. Mirrors the
  // fullValidStub pattern used elsewhere in this file.
  function makeFullValidStub(overrides = {}) {
    const stub = makeBuilderVm({
      mapParams: { width: 2, height: 2, availableTerrain: ['plains'] },
      generatedMap: [
        { q: 0, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: false, player2Base: false },
        { q: 1, r: 0, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 0, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 1, r: 1, terrain: { id: 'plains', name: 'Plains', color: '#fff' }, player1Spawn: true, player1Base: true, player2Spawn: true, player2Base: true }
      ],
      currentLevelId: 'draft_persist_test',
      ...overrides
    })
    call(stub, 'ensureUnitsData')
    call(stub, 'addUnitToRoster', 'player1', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'addUnitToRoster', 'player2', DEFAULT_UNIT_IDS.infantry)
    call(stub, 'resetTurntableToDefault')
    // Restore/save bookkeeping that `created()` would normally install.
    stub._draftRestoreComplete = false
    stub._draftSaveTimer = null
    return stub
  }

  // A fresh, empty target the restore path can hydrate into. Provides the
  // createHex/updateMapDimensions stubs hydrateFromPackage relies on.
  function makeRestoreTarget() {
    const stub = makeBuilderVm({
      mapParams: { width: 0, height: 0, availableTerrain: [] },
      terrainTypes: [],
      generatedMap: [],
      currentLevelId: ''
    })
    stub.createHex = (q, r, terrain) => ({
      q, r,
      terrain: terrain || { id: 'plains' },
      player1Spawn: false, player1Base: false,
      player2Spawn: false, player2Base: false
    })
    stub.updateMapDimensions = vi.fn()
    stub._draftRestoreComplete = false
    stub._draftSaveTimer = null
    return stub
  }

  beforeEach(() => {
    localStorage.clear()
    window.$notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
    delete window.$notify
  })

  it('(a) restoreBuilderDraft hydrates the builder from a pre-seeded valid draft and fires the restore notice', () => {
    // Produce a real, loadable draft from a fully-valid source state.
    const source = makeFullValidStub({ currentLevelId: 'seeded_draft' })
    const pkg = call(source, 'buildPackageFromState')
    expect(saveBuilderDraftToStorage(localStorage, pkg, Date.now())).toEqual({ ok: true })

    const target = makeRestoreTarget()
    call(target, 'restoreBuilderDraft')

    // The draft drove the page state.
    expect(target.currentLevelId).toBe('seeded_draft')
    expect(target.generatedMap.length).toBe(4)
    expect(target.generatedMap.find(h => h.q === 0 && h.r === 0).player1Spawn).toBe(true)
    expect(target.unitsData.player1.units.length).toBeGreaterThan(0)
    // Restore notice fired, and saving is now unblocked.
    expect(window.$notify.success).toHaveBeenCalledTimes(1)
    expect(target._draftRestoreComplete).toBe(true)
  })

  it('(a) restoreBuilderDraft with no stored draft still unblocks saving and fires no notice', () => {
    const target = makeRestoreTarget()
    call(target, 'restoreBuilderDraft')
    expect(window.$notify.success).not.toHaveBeenCalled()
    expect(target._draftRestoreComplete).toBe(true)
  })

  it('(b) a draft-changing edit after restore triggers a debounced save writing a loadable draft', () => {
    vi.useFakeTimers()
    const stub = makeFullValidStub()
    stub._draftRestoreComplete = true

    // No draft persisted yet.
    expect(localStorage.getItem(BUILDER_DRAFT_STORAGE_KEY)).toBeNull()

    // Simulate the fingerprint watcher firing after an edit.
    const fp = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp)

    // Debounced — nothing written until the timer fires.
    expect(localStorage.getItem(BUILDER_DRAFT_STORAGE_KEY)).toBeNull()
    vi.advanceTimersByTime(750)

    const loaded = loadBuilderDraft(localStorage)
    expect(loaded).not.toBeNull()
    expect(loaded.package.id).toBe('draft_persist_test')
    expect(typeof loaded.savedAt).toBe('number')
  })

  it('(c) saveBuilderDraftNow swallows a buildPackageFromState throw and writes nothing', () => {
    const stub = makeFullValidStub()
    stub.buildPackageFromState = () => {
      throw new Error('incomplete draft')
    }
    expect(() => call(stub, 'saveBuilderDraftNow')).not.toThrow()
    expect(localStorage.getItem(BUILDER_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('(d) the watcher does not save before restore completes (stored draft is not clobbered on mount)', () => {
    vi.useFakeTimers()
    // A stored draft from a prior session.
    const prior = makeFullValidStub({ currentLevelId: 'prior_session' })
    const priorPkg = call(prior, 'buildPackageFromState')
    saveBuilderDraftToStorage(localStorage, priorPkg, 111)

    // A fresh instance whose restore step has NOT run yet.
    const stub = makeFullValidStub({ currentLevelId: 'fresh_mount_default' })
    stub._draftRestoreComplete = false

    // The immediate watcher fire during setup must NOT schedule a save.
    const fp = LevelBuilder.computed.builderLevelFingerprint.call(stub)
    LevelBuilder.watch.builderLevelFingerprint.handler.call(stub, fp)
    vi.advanceTimersByTime(750)

    // The prior draft is intact — restore would still win on the real mount.
    const loaded = loadBuilderDraft(localStorage)
    expect(loaded.package.id).toBe('prior_session')
    expect(loaded.savedAt).toBe(111)
  })
})
