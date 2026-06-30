// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { loadLevelPackage } from '../../domain/level/loadLevelPackage'
import { loadLevelArchivePackage } from '../../domain/level/loadLevelArchivePackage'
import {
  BUILDER_PLAYTEST_QUERY_KEY,
  BUILDER_PLAYTEST_SOURCE,
  BUILDER_PLAYTEST_STORAGE_KEY,
  createBuilderPlaytestHandoff
} from '../../domain/level/builderPlaytestLevels'
import { clearGameState } from '../../utils/gamePersistence'
import Playground from '../Playground.vue'

vi.mock('../../domain/level/loadLevelPackage', () => ({
  loadLevelPackage: vi.fn()
}))

vi.mock('../../domain/level/loadLevelArchivePackage', () => ({
  loadLevelArchivePackage: vi.fn()
}))

/**
 * Component-level test for the sidebar dispatch flow:
 *
 *   SelectionBlock emit
 *     -> Playground.onEngine*
 *     -> gameController (which calls gameState.*)
 *     -> commandSeq increment
 *     -> GameMapBlock prop update
 *
 * Heavy children are stubbed so the test stays scoped to the
 * playground's wiring, not the map renderer or the dice Lottie. The
 * `gameState` is a hand-rolled stub with spy methods so we can assert
 * the engine API was called with the right payload.
 */

function makeStubGameState(overrides = {}) {
  // Vue's reactive proxy does not preserve `Map` instance identity when
  // the host component's `data` setter touches the field (it converts
  // the Map's interface into plain property access). The test stub
  // therefore uses a plain object with a `get` method that matches
  // `GameState.units.get(id)` shape. This is a test-only adjustment;
  // production `GameState` keeps a real `Map`.
  const unitsStore = { u1: { id: 'u1', player: 'player1', facing: 2, position: { q: 3, r: 4 } } }
  const units = {
    get(id) {
      return unitsStore[id]
    },
    values() {
      return Object.values(unitsStore)
    }
  }
  return {
    turnNumber: 1,
    currentPlayer: 'player1',
    gamePhase: 'MANOEUVRE',
    width: 8,
    height: 8,
    units,
    turnState: { u1: { isLoaded: true } },
    getAllUnits: vi.fn(() => Object.values(unitsStore)),
    moveUnit: vi.fn(),
    updateUnitFacing: vi.fn(),
    performAttack: vi.fn(() => 4),
    performReload: vi.fn(),
    rollDice: vi.fn(),
    endTurn: vi.fn(function () {
      this.turnNumber += 1
    }),
    revertTo: vi.fn(() => true),
    loadHistoryJSON: vi.fn(() => true),
    toJSON: vi.fn(() => ({ width: 8, height: 8, hexes: [], units: [] })),
    ...overrides
  }
}

const stubChildComponents = {
  HeaderComponent: {
    name: 'HeaderComponent',
    props: ['showResetLayout'],
    emits: ['reset-layout'],
    template: '<div data-testid="header-stub" />'
  },
  MovesTableBlock: {
    props: ['movesData', 'gameState'],
    template: '<div data-testid="moves-table-stub" />'
  },
  TimelineBlock: {
    name: 'TimelineBlock',
    props: ['gameState', 'levelPackage', 'rngSeed', 'isDiceRolling'],
    emits: ['end-turn', 'revert-game', 'import-history', 'show-outcome-dialog', 'roll-dice', 'instant-roll-dice'],
    template: '<div data-testid="timeline-stub" />'
  },
  GameMapBlock: {
    name: 'GameMapBlock',
    props: [
      'mapData',
      'terrainTypes',
      'gameState',
      'gameController',
      'selectedHexDropdownPosition',
      'showFloatingPanel',
      'commandSeq',
      'attackTargetShiftIntent',
      'deselectIntent',
      'unitPreviewHoverIntent',
      'unitPreviewSelectIntent',
      'actionsDisabled'
    ],
    emits: [
      'hex-selected',
      'game-state-updated',
      'update-selected-hex-dropdown-position',
      'update:showFloatingPanel',
      'selection-inspector-bridge'
    ],
    template: '<div data-testid="game-map-stub" />'
  },
  GameEngineBlock: {
    name: 'GameEngineBlock',
    props: [
      'selectedHex',
      'mapData',
      'gameState',
      'movesData',
      'gameController',
      'isRestoring',
      'isInitializingGlobal',
      'showFloatingPanel',
      'selectionInspectorBridge',
      'levelOptions',
      'selectedLevelId',
      'seed',
      'loadedPackage',
      'loadedSource',
      'loadedWarnings',
      'builderExportLevelId',
      'canDeleteSelectedLevel',
      'isStartingGame',
      'externalDiceRolling',
      'diceRollIntent',
      'diceRollRightIntent',
      'diceCancelIntent'
    ],
    emits: [
      'level-selected',
      'seed-updated',
      'load-selected-level',
      'upload-archive',
      'export-loaded-builder-level',
      'delete-selected-level',
      'start-game',
      'game-state-updated',
      'reset-game',
      'dice-rolling-changed',
      'end-turn',
      'restart-game',
      'deselect',
      'update:showFloatingPanel',
      'move-unit-forward',
      'move-unit-reverse',
      'rotate-unit-clockwise',
      'rotate-unit-counterclockwise',
      'fire',
      'reload',
      'attack-target-shift',
      'unit-preview-hover',
      'unit-preview-select'
    ],
    methods: {
      onDiceClick() {
        this.$emit('dice-rolling-changed', true)
      },
      onDiceRightClick() {
        this.$emit('game-state-updated', this.gameState)
      },
      cancelDiceRoll() {
        this.$emit('dice-rolling-changed', false)
      }
    },
    watch: {
      diceRollIntent() { this.onDiceClick() },
      diceRollRightIntent() { this.onDiceRightClick() },
      diceCancelIntent() { this.cancelDiceRoll() }
    },
    template: '<div data-testid="engine-stub" />'
  },
  SelectionBlock: {
    name: 'SelectionBlock',
    props: [
      'selectedHex',
      'gameState',
      'showFloatingPanel',
      'selectionInspectorBridge',
      'actionsDisabled'
    ],
    emits: [
      'deselect',
      'update:showFloatingPanel',
      'move-unit-forward',
      'move-unit-reverse',
      'rotate-unit-clockwise',
      'rotate-unit-counterclockwise',
      'fire',
      'reload',
      'attack-target-shift'
    ],
    template: '<div data-testid="selection-stub" />'
  }
}

const sidebarBridge = (overrides = {}) => ({
  selectedUnitId: 'u1',
  canMoveForward: true,
  canMoveReverse: true,
  canRotate: true,
  canFire: true,
  canReload: true,
  validAttackTargets: [{ q: 7, r: 7 }],
  selectedTargetIndex: 0,
  moveForwardTarget: { q: 4, r: 4 },
  moveReverseTarget: { q: 2, r: 4 },
  currentDiceResultForUi: 5,
  ...overrides
})

function makeLevelPackage() {
  return {
    hexmap: {
      parameters: { width: 3, height: 3 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 2, r: 0, terrain: 'plains' },
        { q: 0, r: 1, terrain: 'plains' },
        { q: 1, r: 1, terrain: 'plains' },
        { q: 2, r: 1, terrain: 'plains' },
        { q: 0, r: 2, terrain: 'plains' },
        { q: 1, r: 2, terrain: 'plains' },
        { q: 2, r: 2, terrain: 'plains', player2Spawn: true }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4caf50', terrainDifficulty: 0 }
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

async function mountPlayground(initial = {}) {
  const wrapper = mount(Playground, {
    global: { stubs: stubChildComponents }
  })
  // `markRaw` the stub `gameState` so Vue does not deep-proxy the
  // `units` Map (which would obscure intent in the test by yielding
  // reactive value wrappers from `units.get`). Production `GameState`
  // is also effectively raw in the same way (it is not built from
  // reactive primitives).
  if (initial.gameState !== undefined) {
    const raw = initial.gameState == null ? initial.gameState : markRaw(initial.gameState)
    await wrapper.setData({ gameState: raw })
  }
  if (initial.bridge !== undefined) await wrapper.setData({ selectionInspectorBridge: initial.bridge })
  return wrapper
}

let notifySpy
beforeEach(() => {
  // Each Playground mount runs `loadSavedGameState()` against
  // `localStorage`. happy-dom retains localStorage across tests in the
  // same worker, so earlier tests' `saveCurrentGameState` writes can
  // leak into a later mount and trigger spurious restore warnings
  // (e.g. legacy-RNG warning on the stub `toJSON` payload). Clear it
  // here so each test sees a cold app start.
  clearGameState()
  window.localStorage.removeItem('hexWarPlaygroundLayout')
  window.localStorage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  loadLevelPackage.mockReset()
  loadLevelArchivePackage.mockReset()
  notifySpy = {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  }
  // eslint-disable-next-line no-undef
  window.$notify = notifySpy
})
afterEach(() => {
  window.localStorage.removeItem('hexWarPlaygroundLayout')
  window.localStorage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // eslint-disable-next-line no-undef
  delete window.$notify
})

describe('Playground sidebar dispatch flow', () => {
  it('load-then-start with a seed creates a seeded GameState without Math.random on dice', async () => {
    loadLevelPackage.mockResolvedValue({ ok: true, warnings: [], package: makeLevelPackage() })
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const wrapper = await mountPlayground()

    const loaded = await wrapper.vm.loadLevelById({ levelId: 'level_seed', seed: 'ui-seed-1', source: 'default' })
    expect(loaded).toBe(true)
    wrapper.vm.startLoadedLevel({ seed: 'ui-seed-1' })

    expect(loadLevelPackage).toHaveBeenCalledWith('level_seed')
    expect(wrapper.vm.levelId).toBe('level_seed')
    expect(wrapper.vm.rngSeed).toBe('ui-seed-1')
    expect(wrapper.vm.gameState).toBeTruthy()

    wrapper.vm.gameState.rollDiceFromRng()
    expect(randomSpy).not.toHaveBeenCalled()
  })

  it('loads a level package without starting the game, then starts from the loaded package', async () => {
    loadLevelPackage.mockResolvedValue({ ok: true, warnings: [], package: makeLevelPackage() })
    const wrapper = await mountPlayground()

    const loaded = await wrapper.vm.loadLevelById({
      levelId: 'level_loaded_only',
      seed: 'loaded-seed',
      source: 'default'
    })

    expect(loaded).toBe(true)
    expect(loadLevelPackage).toHaveBeenCalledWith('level_loaded_only')
    expect(wrapper.vm.loadedLevelPackage).toBeTruthy()
    expect(wrapper.vm.levelId).toBe('level_loaded_only')
    expect(wrapper.vm.rngSeed).toBe('loaded-seed')
    expect(wrapper.vm.currentMapData).toBeTruthy()
    expect(wrapper.vm.gameState).toBe(null)
    expect(wrapper.vm.isGameLoaded).toBe(false)

    const started = wrapper.vm.startLoadedLevel({ seed: 'loaded-seed' })

    expect(started).toBe(true)
    expect(wrapper.vm.gameState).toBeTruthy()
    expect(wrapper.vm.isGameLoaded).toBe(true)
    expect(wrapper.vm.levelId).toBe('level_loaded_only')
  })

  it('reset from an active game keeps the loaded level ready to start again', async () => {
    loadLevelPackage.mockResolvedValue({ ok: true, warnings: [], package: makeLevelPackage() })
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = await mountPlayground()

    await wrapper.vm.loadLevelById({
      levelId: 'level_reset_ready',
      seed: 'reset-seed',
      source: 'default'
    })
    const loadedPackage = wrapper.vm.loadedLevelPackage
    const started = wrapper.vm.startLoadedLevel({ seed: 'reset-seed' })

    expect(started).toBe(true)
    expect(wrapper.vm.gameState).toBeTruthy()
    expect(wrapper.vm.isGameLoaded).toBe(true)

    wrapper.vm.resetGame()

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.vm.gameState).toBe(null)
    expect(wrapper.vm.isGameLoaded).toBe(false)
    expect(wrapper.vm.loadedLevelPackage).toBe(loadedPackage)
    expect(wrapper.vm.currentMapData).toBeTruthy()
    expect(wrapper.vm.levelId).toBe('level_reset_ready')
    expect(wrapper.vm.levelIdInput).toBe('level_reset_ready')
    expect(notifySpy.success).toHaveBeenCalledWith(
      'Game reset',
      'Game progress cleared. Loaded level is ready to start again.'
    )
  })

  it('loads an uploaded level archive without starting the game', async () => {
    const zipPackage = { ...makeLevelPackage(), id: 'level_zip' }
    loadLevelArchivePackage.mockReturnValue({
      ok: true,
      errors: [],
      warnings: [{ path: 'hexmap', message: 'legacy schema version' }],
      package: zipPackage,
      archiveId: 'level_zip'
    })
    const wrapper = await mountPlayground()
    const bytes = new Uint8Array([80, 75, 3, 4])
    const file = {
      name: 'level_zip.zip',
      arrayBuffer: vi.fn(async () => bytes.buffer)
    }

    const loaded = await wrapper.vm.onUploadArchive(file)

    expect(loaded).toBe(true)
    expect(file.arrayBuffer).toHaveBeenCalledTimes(1)
    expect(loadLevelArchivePackage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { sourceName: 'level_zip.zip' }
    )
    expect(wrapper.vm.loadedLevelPackage.id).toBe('level_zip')
    expect(wrapper.vm.loadedLevelSource).toBe('zip')
    expect(wrapper.vm.loadedLevelWarnings).toHaveLength(1)
    expect(wrapper.vm.levelIdInput).toBe('level_zip')
    expect(wrapper.vm.levelOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'level_zip', source: 'zip' })
    ]))
    expect(wrapper.vm.currentMapData).toBeTruthy()
    expect(wrapper.vm.gameState).toBe(null)
    expect(wrapper.vm.isGameLoaded).toBe(false)
    expect(notifySpy.warning).toHaveBeenCalledWith('Archive warnings', expect.stringContaining('legacy schema version'))
    expect(notifySpy.success).toHaveBeenCalledWith('Archive loaded', expect.stringContaining('level_zip'))

    const started = wrapper.vm.startLoadedLevel({ seed: 'zip-seed' })

    expect(started).toBe(true)
    expect(wrapper.vm.gameState).toBeTruthy()
    expect(wrapper.vm.rngSeed).toBe('zip-seed')
  })

  it('consumes a Builder playtest handoff before saved-game restore', async () => {
    const builderPackage = { ...makeLevelPackage(), id: 'builder_level_2026-06-03_14-25-09' }
    const token = createBuilderPlaytestHandoff({
      package: builderPackage,
      warnings: [{ path: 'schemaVersion', message: 'legacy package' }]
    })
    const routerReplace = vi.fn(() => Promise.resolve())

    const wrapper = mount(Playground, {
      global: {
        stubs: stubChildComponents,
        mocks: {
          $route: { query: { [BUILDER_PLAYTEST_QUERY_KEY]: token } },
          $router: { replace: routerReplace }
        }
      }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.loadedLevelPackage.id).toBe(builderPackage.id)
    expect(wrapper.vm.loadedLevelSource).toBe(BUILDER_PLAYTEST_SOURCE)
    expect(wrapper.vm.gameState).toBe(null)
    expect(wrapper.vm.levelOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: builderPackage.id, source: BUILDER_PLAYTEST_SOURCE, removable: true })
    ]))
    expect(routerReplace).toHaveBeenCalledWith({ path: '/Playground', query: {} })
    expect(notifySpy.success).toHaveBeenCalledWith('Builder level loaded', expect.stringContaining(builderPackage.id))
  })

  it('loads persisted Builder playtest levels into the dropdown and can delete them', async () => {
    const builderPackage = { ...makeLevelPackage(), id: 'builder_cached_2026-06-03_14-25-09' }
    createBuilderPlaytestHandoff({ package: builderPackage, warnings: [] })

    const wrapper = await mountPlayground()

    expect(wrapper.vm.levelOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: builderPackage.id, source: BUILDER_PLAYTEST_SOURCE, removable: true })
    ]))

    wrapper.vm.onSetupLevelIdInput(builderPackage.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.canDeleteSelectedLevel).toBe(true)
    expect(wrapper.vm.onDeleteSelectedLevel()).toBe(true)
    expect(wrapper.vm.levelOptions.some(option => option.id === builderPackage.id)).toBe(false)
    expect(wrapper.vm.levelIdInput).toBe('level_000')
  })

  it('exports the loaded Builder playtest package from Playground', async () => {
    const builderPackage = { ...makeLevelPackage(), id: 'builder_export_2026-06-03_14-25-09' }
    const wrapper = await mountPlayground()
    wrapper.vm.applyBuilderPlaytestLevel({
      id: builderPackage.id,
      label: builderPackage.id,
      package: builderPackage,
      warnings: []
    })

    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const clicked = []
    const originalCreateElement = document.createElement.bind(document)
    URL.createObjectURL = vi.fn(() => 'blob:builder-export')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName)
      if (tagName === 'a') {
        el.click = vi.fn(() => clicked.push(el.download))
      }
      return el
    })

    try {
      expect(wrapper.vm.onExportLoadedBuilderLevel()).toBe(true)
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }

    expect(clicked).toEqual([`${builderPackage.id}.zip`])
    expect(notifySpy.success).toHaveBeenCalledWith('Builder level exported', expect.stringContaining(`${builderPackage.id}.zip`))
  })

  it('resizes Playground layout tracks within bounds and exposes header reset', async () => {
    const wrapper = await mountPlayground()
    await wrapper.setData({
      resizableLayoutViewportWidth: 1300,
      resizableLayout: {
        ...wrapper.vm.resizableLayout,
        isReady: true,
        isCustom: false,
        columns: { engine: 300, moves: 360, map: 420, selection: 220 },
        rows: { main: 420, timeline: 260 },
        columnRatios: { engine: 300 / 1300, moves: 360 / 1300, map: 420 / 1300, selection: 220 / 1300 },
        rowRatios: { main: 420 / 680, timeline: 260 / 680 }
      }
    })

    const header = wrapper.findComponent({ name: 'HeaderComponent' })
    const splitter = wrapper.vm.layoutSplitters.find(item => item.key === 'engine-moves')
    expect(header.props('showResetLayout')).toBe(false)

    wrapper.vm.applyLayoutColumnDelta(splitter, -200)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resizableLayout.columns.engine).toBe(240)
    expect(wrapper.vm.resizableLayout.columns.moves).toBe(420)
    expect(header.props('showResetLayout')).toBe(true)

    wrapper.vm.applyLayoutColumnDelta(splitter, 500)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resizableLayout.columns.engine).toBe(380)
    expect(wrapper.vm.resizableLayout.columns.moves).toBe(280)

    await header.vm.$emit('reset-layout')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.isLayoutDirty).toBe(false)
    expect(header.props('showResetLayout')).toBe(false)
  })

  it('hides Playground layout reset and splitters below the desktop breakpoint', async () => {
    const wrapper = await mountPlayground()
    await wrapper.setData({
      resizableLayoutViewportWidth: 1024,
      resizableLayout: {
        ...wrapper.vm.resizableLayout,
        isReady: true,
        isCustom: true
      }
    })

    const header = wrapper.findComponent({ name: 'HeaderComponent' })

    expect(wrapper.vm.isLayoutResizable).toBe(false)
    expect(wrapper.vm.layoutSplitters).toEqual([])
    expect(header.props('showResetLayout')).toBe(false)

    await wrapper.setData({ resizableLayoutViewportWidth: 1300 })

    expect(wrapper.vm.isLayoutResizable).toBe(true)
    expect(wrapper.vm.layoutSplitters.length).toBeGreaterThan(0)
    expect(header.props('showResetLayout')).toBe(true)
  })

  it('move-unit-forward emit -> controller.moveUnit -> commandSeq bump -> GameMapBlock prop update', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    const engine = wrapper.findComponent({ name: 'SelectionBlock' })
    const map = wrapper.findComponent({ name: 'GameMapBlock' })
    expect(map.props('commandSeq')).toBe(0)

    await engine.vm.$emit('move-unit-forward')

    expect(gs.moveUnit).toHaveBeenCalledWith('u1', 4, 4, undefined)
    expect(wrapper.vm.commandSeq).toBe(1)
    expect(map.props('commandSeq')).toBe(1)
  })

  it('game engine state update bumps commandSeq for dice-driven changes', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const map = wrapper.findComponent({ name: 'GameMapBlock' })

    await wrapper.findComponent({ name: 'GameEngineBlock' }).vm.$emit('game-state-updated', gs)

    expect(wrapper.vm.commandSeq).toBe(1)
    expect(map.props('commandSeq')).toBe(1)
  })

  it('move-unit-reverse emit dispatches moveUnit with motionKind reverse', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('move-unit-reverse')

    expect(gs.moveUnit).toHaveBeenCalledWith('u1', 2, 4, { motionKind: 'reverse' })
    expect(wrapper.vm.commandSeq).toBe(1)
  })

  it('rotate-unit-clockwise reads facing from engine and dispatches updateUnitFacing', async () => {
    const gs = makeStubGameState() // unit facing = 2
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('rotate-unit-clockwise')

    expect(gs.updateUnitFacing).toHaveBeenCalledWith('u1', 3)
    expect(wrapper.vm.commandSeq).toBe(1)
  })

  it('rotate-unit-counterclockwise wraps facing modulo 6', async () => {
    const gs = makeStubGameState()
    // unitsStore object → mutate facing on the same reference returned by `get('u1')`.
    gs.units.get('u1').facing = 0
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('rotate-unit-counterclockwise')

    expect(gs.updateUnitFacing).toHaveBeenCalledWith('u1', 5)
  })

  it('fire emit dispatches performAttack and surfaces damage notification', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('fire')

    expect(gs.performAttack).toHaveBeenCalledWith('u1', 7, 7, { diceResult: 5 })
    expect(notifySpy.success).toHaveBeenCalledWith('Fire', expect.stringContaining('Damage: 4'))
    expect(wrapper.vm.commandSeq).toBe(1)
  })

  it('reload emit dispatches performReload with current dice', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('reload')

    expect(gs.performReload).toHaveBeenCalledWith('u1', { diceResult: 5 })
    expect(notifySpy.success).toHaveBeenCalledWith('Reload', 'Weapon loaded.')
  })

  it('blocks dispatch and warns when bridge says canMoveForward is false', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({
      gameState: gs,
      bridge: sidebarBridge({ canMoveForward: false })
    })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('move-unit-forward')

    expect(gs.moveUnit).not.toHaveBeenCalled()
    expect(notifySpy.warning).toHaveBeenCalledWith('Move forward', expect.stringContaining('Cannot move forward'))
    expect(wrapper.vm.commandSeq).toBe(0)
  })

  it('blocks fire dispatch and shows "Weapon is not loaded" when canFire=false and isLoaded=false', async () => {
    const gs = makeStubGameState()
    gs.turnState.u1.isLoaded = false
    const wrapper = await mountPlayground({
      gameState: gs,
      bridge: sidebarBridge({ canFire: false })
    })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('fire')

    expect(gs.performAttack).not.toHaveBeenCalled()
    expect(notifySpy.warning).toHaveBeenCalledWith('Fire', expect.stringContaining('Weapon is not loaded'))
  })

  it('deselect emit bumps deselectIntent prop on the map', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    const map = wrapper.findComponent({ name: 'GameMapBlock' })
    expect(map.props('deselectIntent')).toBe(0)

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('deselect')

    expect(map.props('deselectIntent')).toBe(1)
  })

  it('attack-target-shift emit forwards through the intent prop', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    const map = wrapper.findComponent({ name: 'GameMapBlock' })
    const start = map.props('attackTargetShiftIntent')
    expect(start.seq).toBe(0)

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('attack-target-shift', 1)

    const after = map.props('attackTargetShiftIntent')
    expect(after.seq).toBe(1)
    expect(after.delta).toBe(1)
  })

  it('unit preview hover/select emits from GameEngineBlock forward through map intent props', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const map = wrapper.findComponent({ name: 'GameMapBlock' })
    const engine = wrapper.findComponent({ name: 'GameEngineBlock' })

    expect(map.props('unitPreviewHoverIntent')).toEqual({ unitId: null, seq: 0 })
    expect(map.props('unitPreviewSelectIntent')).toEqual({ unitId: null, seq: 0 })

    await engine.vm.$emit('unit-preview-hover', 'u1')
    expect(map.props('unitPreviewHoverIntent')).toEqual({ unitId: 'u1', seq: 1 })

    await engine.vm.$emit('unit-preview-hover', null)
    expect(map.props('unitPreviewHoverIntent')).toEqual({ unitId: null, seq: 2 })

    await engine.vm.$emit('unit-preview-select', 'u1')
    expect(map.props('unitPreviewSelectIntent')).toEqual({ unitId: 'u1', seq: 1 })

    await engine.vm.$emit('unit-preview-select', null)
    expect(map.props('unitPreviewSelectIntent')).toEqual({ unitId: null, seq: 2 })
  })

  it('end-turn emit from TimelineBlock dispatches via the same dispatchEngineCommand pipe', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'TimelineBlock' }).vm.$emit('end-turn')

    expect(gs.endTurn).toHaveBeenCalled()
    expect(wrapper.vm.commandSeq).toBe(1)
    expect(notifySpy.success).toHaveBeenCalledWith('Turn ended', expect.stringContaining('Started turn'))
  })

  it('roll-dice emit from TimelineBlock bumps diceRollIntent and triggers the dice animation', async () => {
    const gs = makeStubGameState({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 }
      ]
    })
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const timeline = wrapper.findComponent({ name: 'TimelineBlock' })
    const engine = wrapper.findComponent({ name: 'GameEngineBlock' })

    expect(wrapper.vm.diceRollIntent.seq).toBe(0)
    // Spy placed AFTER initial render so we only see the bump-driven call.
    const diceClickSpy = vi.spyOn(engine.vm, 'onDiceClick')

    await timeline.vm.$emit('roll-dice')
    await wrapper.vm.$nextTick()

    // Playground bumped the intent prop instead of calling $refs directly.
    expect(wrapper.vm.diceRollIntent.seq).toBe(1)
    // The stub's watcher invoked onDiceClick, which emitted dice-rolling-changed.
    expect(diceClickSpy).toHaveBeenCalledTimes(1)
    expect(gs.rollDice).not.toHaveBeenCalled()
    expect(wrapper.vm.isDiceRolling).toBe(true)
    expect(timeline.props('isDiceRolling')).toBe(true)
  })

  it('instant-roll-dice emit from TimelineBlock bumps diceRollRightIntent', async () => {
    const gs = makeStubGameState({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 }
      ]
    })
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const timeline = wrapper.findComponent({ name: 'TimelineBlock' })
    const engine = wrapper.findComponent({ name: 'GameEngineBlock' })

    expect(wrapper.vm.diceRollRightIntent.seq).toBe(0)
    const instantSpy = vi.spyOn(engine.vm, 'onDiceRightClick')

    await timeline.vm.$emit('instant-roll-dice')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.diceRollRightIntent.seq).toBe(1)
    expect(instantSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.isDiceRolling).toBe(false)
  })

  it('ignores instant-roll-dice while a D6 result is already recorded', async () => {
    const gs = makeStubGameState({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 },
        { type: 'dice_roll', player: 'player1', turnNumber: 1, result: 4 },
        { type: 'move', unitId: 'u1', from: { q: 3, r: 4 }, to: { q: 4, r: 4 } }
      ]
    })
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const timeline = wrapper.findComponent({ name: 'TimelineBlock' })

    const seqBefore = wrapper.vm.diceRollRightIntent.seq

    await timeline.vm.$emit('instant-roll-dice', { actionIndex: 1 })
    await wrapper.vm.$nextTick()

    expect(gs.revertTo).not.toHaveBeenCalled()
    // Guard prevents the intent from being bumped when a dice roll already exists.
    expect(wrapper.vm.diceRollRightIntent.seq).toBe(seqBefore)
  })

  it('end-turn emit from TimelineBlock bumps diceCancelIntent before ending the turn', async () => {
    const gs = makeStubGameState({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 }
      ]
    })
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const timeline = wrapper.findComponent({ name: 'TimelineBlock' })

    // Start a dice roll via the intent channel.
    await timeline.vm.$emit('roll-dice')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isDiceRolling).toBe(true)

    const cancelSeqBefore = wrapper.vm.diceCancelIntent.seq

    await timeline.vm.$emit('end-turn')
    await wrapper.vm.$nextTick()

    // cancelDiceRollAnimation bumped diceCancelIntent.
    expect(wrapper.vm.diceCancelIntent.seq).toBe(cancelSeqBefore + 1)
    expect(gs.endTurn).toHaveBeenCalled()
    expect(gs.rollDice).not.toHaveBeenCalled()
    expect(wrapper.vm.isDiceRolling).toBe(false)
    expect(wrapper.vm.commandSeq).toBe(1)
  })

  it('end-turn emit from GameEngineBlock dispatches through the same pipe', async () => {
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'GameEngineBlock' }).vm.$emit('end-turn')

    expect(gs.endTurn).toHaveBeenCalled()
    expect(wrapper.vm.commandSeq).toBe(1)
    expect(notifySpy.success).toHaveBeenCalledWith('Turn ended', expect.stringContaining('Started turn'))
  })

  it('shows a game outcome popup when the engine reports a finished game', async () => {
    const gs = makeStubGameState({
      turnNumber: 21,
      history: [[
        { type: 'startTurn', player: 'player1', turnNumber: 20 },
        { type: 'dice_roll', player: 'player1', turnNumber: 20, result: 6 },
        { type: 'attack', player: 'player1', unitId: 'p1_Inf1', targetUnitId: 'p2_tank1', damage: 0 },
        { type: 'reload', player: 'player1', unitId: 'p1_Inf1' },
        { type: 'endTurn', player: 'player1', turnNumber: 20 }
      ]],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 21 },
        { type: 'attack', player: 'player1', unitId: 'p1_Inf1', targetUnitId: 'p2_Inf1', damage: 60 }
      ],
      initialState: {
        units: [
          ['p1_Inf1', { id: 'p1_Inf1', player: 'player1', health: 60, isActive: true }],
          ['p2_Inf1', { id: 'p2_Inf1', player: 'player2', health: 60, isActive: true }],
          ['p2_tank1', { id: 'p2_tank1', player: 'player2', health: 100, isActive: true }]
        ]
      },
      getAllUnits: vi.fn(() => [
        { id: 'p1_Inf1', player: 'player1', health: 60, isActive: true, isAlive: () => true }
      ]),
      outcome: {
        status: 'ended',
        winner: 'player1',
        reason: 'unitWipe',
        conditionId: 'player1_eliminate_player2',
        message: 'player2 has no active units.'
      }
    })
    const wrapper = await mountPlayground({ gameState: null, bridge: sidebarBridge() })
    await wrapper.setData({ levelId: 'level_alpha', rngSeed: 'seed-7' })

    wrapper.vm.onGameStateUpdated(gs)
    await wrapper.vm.$nextTick()

    const dialog = wrapper.find('[data-test="game-outcome-dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('player1 wins')
    expect(dialog.text()).toContain('player2 has no active units.')
    expect(dialog.text()).toContain('Turns to victory')
    expect(dialog.text()).toContain('21')
    expect(dialog.text()).toContain('Actions')
    expect(dialog.text()).toContain('4')
    const playerStats = wrapper.find('[data-test="game-outcome-player-stats"]')
    expect(playerStats.exists()).toBe(true)
    expect(playerStats.text()).toContain('Statistic')
    expect(playerStats.text()).toContain('Player 1')
    expect(playerStats.text()).toContain('Player 2')
    expect(playerStats.text()).toContain('Units alive/all')
    expect(playerStats.text()).toContain('1 / 1')
    expect(playerStats.text()).toContain('0 / 2')
    expect(playerStats.text()).toContain('Damage')
    expect(playerStats.text()).toContain('60')
    expect(dialog.text()).not.toContain('Player 1 Units alive/all')
    expect(dialog.text()).not.toContain('Player 2 Units alive/all')
    expect(dialog.text()).not.toContain('Final action')
    expect(dialog.text()).not.toContain('Attacks / misses / reloads')
    expect(dialog.text()).not.toContain('losses / alive')
    expect(dialog.text()).toContain('level_alpha')
    expect(dialog.text()).toContain('seed-7')
    expect(wrapper.find('[data-test="playground-outcome"]').exists()).toBe(false)

    await wrapper.find('[data-test="game-outcome-dialog-close"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="game-outcome-dialog"]').exists()).toBe(false)
  })

  it('reopens the game outcome popup from the timeline outcome card event', async () => {
    const gs = makeStubGameState({
      outcome: {
        status: 'ended',
        winner: 'player1',
        reason: 'unitWipe',
        conditionId: 'player1_eliminate_player2',
        message: 'player2 has no active units.'
      }
    })
    const wrapper = await mountPlayground({ gameState: null, bridge: sidebarBridge() })

    wrapper.vm.onGameStateUpdated(gs)
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="game-outcome-dialog-close"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="game-outcome-dialog"]').exists()).toBe(false)

    await wrapper.findComponent({ name: 'TimelineBlock' }).vm.$emit('show-outcome-dialog')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="game-outcome-dialog"]').exists()).toBe(true)
  })

  it('restart-game emit confirms and restarts the loaded match', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const gs = makeStubGameState()
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })
    const engine = wrapper.findComponent({ name: 'GameEngineBlock' })
    const startSpy = vi.spyOn(wrapper.vm, 'startLoadedLevel').mockReturnValue(true)

    await engine.vm.$emit('restart-game')
    await wrapper.vm.$nextTick()

    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.vm.selectedHex).toBe(null)
    expect(wrapper.vm.selectionInspectorBridge).toMatchObject({
      selectedUnitId: null,
      currentDiceResultForUi: null
    })
    expect(wrapper.vm.deselectIntent).toBe(1)
    expect(startSpy).toHaveBeenCalledWith({ seed: wrapper.vm.matchSetupSeed, notify: false })
    expect(notifySpy.success).toHaveBeenCalledWith('Game restarted', expect.stringContaining('Restarted level'))
  })

  it('controller rejection surfaces an error notification but does not bump commandSeq', async () => {
    const gs = makeStubGameState({
      moveUnit: vi.fn(() => {
        throw new Error('No AP left.')
      })
    })
    const wrapper = await mountPlayground({ gameState: gs, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('move-unit-forward')

    expect(notifySpy.error).toHaveBeenCalledWith('Move failed', expect.stringContaining('No AP left'))
    expect(wrapper.vm.commandSeq).toBe(0)
  })

  it('rejection from a null gameState (NO_GAMESTATE) is silent', async () => {
    const wrapper = await mountPlayground({ gameState: null, bridge: sidebarBridge() })

    await wrapper.findComponent({ name: 'SelectionBlock' }).vm.$emit('move-unit-forward')

    // canMoveForward is true in bridge, but controller short-circuits on null gameState.
    // Since the controller wraps moveUnit, NO_GAMESTATE returns early without notifying.
    expect(notifySpy.error).not.toHaveBeenCalled()
    expect(notifySpy.warning).not.toHaveBeenCalled()
    expect(wrapper.vm.commandSeq).toBe(0)
  })
})
