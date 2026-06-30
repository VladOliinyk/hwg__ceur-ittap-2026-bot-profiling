// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isReactive } from 'vue'
import { mount } from '@vue/test-utils'
import { buildLevelArchiveBlob } from '../../domain/level/levelArchive.js'
import { makeMicroLevelPackage } from '../../domain/simulation/__tests__/fixtures.js'
import { GameState } from '@/domain/engine/gameState.js'
import {
  appendTraceToHistory,
  clearTraceHistory,
  readBuilderEpoch,
  readTraceFromHistory,
  readTraceHistoryIndex,
  writeBuilderEpoch
} from '../../domain/simulation/traceHistory.js'
import AutomatedPlayground from '../AutomatedPlayground.vue'

// Seed a trace into the capped history store the way the page now reads it
// (loadTrace/mount go through readTraceFromHistory, not raw getItem). The
// metadata only needs a traceId for the store; tests that assert run-record
// fields seed their own metadata.
function seedTrace(trace, traceId = 'trace-1', metadata = {}) {
  appendTraceToHistory(sessionStorage, {
    metadata: { id: traceId, traceId, ...metadata },
    trace
  })
  return trace
}
const BUILDER_STORAGE_KEY = 'hexWarBuilderPlaytestLevels'
const originalFetch = global.fetch
const routerLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="router-link-stub" :data-path="to.path" :data-step="to.query && to.query.step"><slot /></a>'
}

function frame(event, q) {
  const isInitial = event === 'initial'
  return {
    index: q,
    event,
    turnNumber: q + 1,
    currentPlayer: q % 2 === 0 ? 'player1' : 'player2',
    actingPlayer: isInitial ? null : q % 2 === 0 ? 'player1' : 'player2',
    diceResult: isInitial ? null : (q % 6) + 1,
    command: q === 0 || event === 'diceRoll' ? null : { type: 'move', unitId: 'u1' },
    engine: {
      hexes: [
        [
          '0,0',
          {
            q: 0,
            r: 0,
            points: '0,0 20,0 30,18 20,36 0,36 -10,18',
            center: { x: 10, y: 18 },
            terrain: { color: '#9ca3af' },
            player1Base: true,
            player2Base: false
          }
        ]
      ],
      units: [
        [
          'u1',
          {
            id: 'u1',
            type: 'infantry',
            name: 'Scout',
            player: 'player1',
            health: 100,
            maxHealth: 100,
            movement: 4,
            facing: q === 0 ? 1 : 3,
            isActive: true,
            position: { q: 0, r: 0 }
          }
        ]
      ],
      turnState: {
        u1: {
          actionsRemaining: q === 0 ? 4 : 2,
          isLoaded: true
        }
      },
      currentTurnActions: isInitial
        ? [{ type: 'startTurn', player: 'player1', turnNumber: 1 }]
        : event === 'diceRoll'
          ? [{ type: 'startTurn', player: 'player1', turnNumber: 1 }, { type: 'dice_roll', player: 'player1', result: 1 }]
        : [
            { type: 'startTurn', player: 'player1', turnNumber: 1 },
            { type: 'dice_roll', player: 'player1', result: 1 },
            { type: 'rotate', unitId: 'u1', cost: 1, from: { q: 0, r: 0, facing: 1 }, to: { q: 0, r: 0, facing: 3 } },
            { type: 'move', unitId: 'u1', cost: 1, to: { q: 0, r: 0, facing: 3 } }
          ]
    }
  }
}

function makeTrace() {
  return {
    kind: 'hwg/simulation-trace',
    schemaVersion: 1,
    createdAt: '2026-06-04T10:20:30.000Z',
    result: { winner: 'player1', reason: 'red_wiped', turns: 2 },
    runConfig: { seed: 'seed-1' },
    frames: [
      frame('initial', 0),
      { ...frame('diceRoll', 0), index: 1 },
      { ...frame('afterCommand', 1), index: 2 }
    ]
  }
}

function writeTrace() {
  return seedTrace(makeTrace())
}

function writeTraceWithoutSerializedGeometry() {
  const trace = {
    kind: 'hwg/simulation-trace',
    schemaVersion: 1,
    createdAt: '2026-06-04T10:20:30.000Z',
    result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
    runConfig: { seed: 'seed-geometry' },
    frames: [
      {
        ...frame('initial', 0),
        engine: {
          hexes: [
            [
              '0,0',
              {
                q: 0,
                r: 0,
                points: '',
                center: { x: 0, y: 0 },
                terrain: { color: '#9ca3af' },
                player1Base: true
              }
            ]
          ],
          units: [
            [
              'u1',
              {
                id: 'u1',
                name: 'Scout',
                player: 'player1',
                health: 100,
                isActive: true,
                position: { q: 0, r: 0 }
              }
            ]
          ]
        }
      }
    ]
  }
  return seedTrace(trace)
}

// schemaVersion-2 trace: per-frame engines carry DYNAMIC state only (no hexes),
// so the static board must be reconstructed once from `levelPackage`. Used by the
// playback-perf tests (#63) to prove the board is built once, not once per frame.
function makeSchemaV2Trace(frameCount = 4) {
  const pkg = makeMicroLevelPackage()
  const frames = []
  for (let i = 0; i < frameCount; i += 1) {
    const isInitial = i === 0
    frames.push({
      index: i,
      event: isInitial ? 'initial' : 'afterCommand',
      turnNumber: i + 1,
      currentPlayer: i % 2 === 0 ? 'player1' : 'player2',
      actingPlayer: isInitial ? null : i % 2 === 0 ? 'player1' : 'player2',
      diceResult: isInitial ? null : (i % 6) + 1,
      command: isInitial ? null : { type: 'move', unitId: 'u1' },
      engine: {
        width: 5,
        height: 3,
        currentPlayer: i % 2 === 0 ? 'player1' : 'player2',
        turnNumber: i + 1,
        gamePhase: 'MANOEUVRE',
        outcome: null,
        // No `hexes`: forces the level-package board reconstruction path.
        units: [
          [
            'u1',
            {
              id: 'u1',
              type: 'infantry',
              name: 'Scout',
              player: 'player1',
              health: 60,
              maxHealth: 60,
              movement: 4,
              // Position + facing change per frame so each frame's dynamic
              // engine differs (drives visual-parity assertions).
              facing: (i % 6) + 1,
              isActive: true,
              position: { q: Math.min(i, 4), r: 1 }
            }
          ]
        ],
        turnState: { u1: { actionsRemaining: Math.max(0, 4 - i), isLoaded: true } },
        currentTurnActions: [{ type: 'startTurn', player: 'player1', turnNumber: 1 }]
      }
    })
  }
  return {
    kind: 'hwg/simulation-trace',
    schemaVersion: 2,
    createdAt: '2026-06-04T10:20:30.000Z',
    result: { winner: 'player1', reason: 'red_wiped', turns: frameCount },
    runConfig: { seed: 'seed-v2-perf' },
    levelPackage: pkg,
    frames
  }
}

function defaultFetchResponse(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockDefaultLevelFetch() {
  const pkg = makeMicroLevelPackage()
  pkg.hexmap.parameters.schemaVersion = 1
  global.fetch = vi.fn(async url => {
    const text = String(url)
    if (text.includes('_hexmap.json')) return defaultFetchResponse(pkg.hexmap)
    if (text.includes('_terrain.json')) return defaultFetchResponse(pkg.terrain)
    if (text.includes('_units.json')) return defaultFetchResponse(pkg.units)
    if (text.includes('_turntable.json')) return defaultFetchResponse(pkg.turntable)
    if (text.includes('_objectives.json')) return { ok: false, status: 404, json: async () => null }
    return { ok: false, status: 404, json: async () => null }
  })
}

function mockDefaultLevelFetchFailure() {
  global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => null }))
}

async function flushAsync() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

function mountPage(trace = 'trace-1', router = { replace: vi.fn() }) {
  return mount(AutomatedPlayground, {
    global: {
      mocks: {
        $route: { query: trace == null ? {} : { trace } },
        $router: router,
        $t: key => key
      },
      stubs: {
        HeaderComponent: { template: '<nav />' },
        RouterLink: routerLinkStub,
        'router-link': routerLinkStub
      }
    }
  })
}

beforeEach(() => {
  mockDefaultLevelFetch()
})

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  delete window.$notify
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('AutomatedPlayground', () => {
  it('loads a trace from session storage and steps through frames', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.frames).toHaveLength(3)
    expect(wrapper.vm.currentFrame.event).toBe('initial')
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.find('.unit-body-icon').exists()).toBe(true)
    expect(wrapper.find('.unit-arrow-icon').exists()).toBe(true)
    expect(wrapper.findAll('.automated-playground__control-button').map(button => button.attributes('aria-label'))).toEqual([
      'automatedPlayground.first',
      'automatedPlayground.previous',
      'automatedPlayground.play',
      'automatedPlayground.next',
      'automatedPlayground.last'
    ])
    expect(wrapper.findAll('.automated-playground__trace-actions .automated-playground__trace-action').map(button => button.text())).toEqual([
      'automatedPlayground.exportTraceShort',
      'automatedPlayground.importTraceShort'
    ])
    expect(wrapper.find('.automated-playground__trace-hint').text()).toBe('automatedPlayground.traceActionsHint')

    await wrapper.findAll('.automated-playground__control-button')[3].trigger('click')

    expect(wrapper.vm.currentFrame.event).toBe('diceRoll')
    expect(wrapper.vm.commandLabel).toBe('roll:d1')

    await wrapper.findAll('.automated-playground__control-button')[3].trigger('click')

    expect(wrapper.vm.currentFrame.event).toBe('afterCommand')
    expect(wrapper.vm.commandLabel).toBe('move:u1')
  })

  it('shows the level setup board without fallback snapshot notice before any run', async () => {
    const wrapper = mountPage(null, { replace: vi.fn() })
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.frames).toHaveLength(0)
    expect(wrapper.vm.isUsingFallbackSnapshot).toBe(false)
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.find('.automated-playground__board-notice').exists()).toBe(false)
  })

  it('uses trace turnState and facing for unit previews', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    wrapper.vm.setFrameIndex(2)
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    const preview = wrapper.vm.unitGroups[0].previews[0]
    expect(preview.progress.normalizedActions).toBe(2)
    expect(preview.progress.normalizedMovement).toBe(4)
    expect(preview.arrowTransform).toBe('rotate(210deg)')
    expect(preview.title).toContain('Facing 3')
    expect(wrapper.find('.unit-arrow-icon').attributes('transform')).toContain('rotate(210')
    expect(wrapper.find('.engine-unit-card__arrow').attributes('style')).toContain('rotate(210deg)')
  })

  it('falls back to currentTurnActions when a trace frame omits top-level diceResult', async () => {
    const trace = writeTrace()
    delete trace.frames[0].diceResult
    trace.frames[0].engine.currentTurnActions = [
      { type: 'startTurn', player: 'player1', turnNumber: 1, turnStateSnapshot: {} },
      { type: 'dice_roll', result: 4 }
    ]
    seedTrace(trace)

    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.currentFrameDiceFace).toBe(4)
    expect(wrapper.vm.availableDiceLabel).toBe('d4')
  })

  it('labels standalone dice roll frames as roll actions', async () => {
    const diceFrame = {
      ...frame('diceRoll', 1),
      diceResult: 5,
      command: null,
      engine: {
        ...frame('diceRoll', 1).engine,
        currentTurnActions: [
          { type: 'startTurn', player: 'player1', turnNumber: 1 },
          { type: 'dice_roll', result: 5 }
        ]
      }
    }
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
      runConfig: { seed: 'seed-dice-frame' },
      frames: [frame('initial', 0), diceFrame]
    }
    seedTrace(trace)

    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    wrapper.vm.setFrameIndex(2)

    expect(wrapper.vm.currentFrame.event).toBe('diceRoll')
    expect(wrapper.vm.availableDiceLabel).toBe('d5')
    expect(wrapper.vm.commandLabel).toBe('roll:d5')
    expect(wrapper.vm.isUsingFallbackSnapshot).toBe(false)
  })

  it('exports the loaded automated trace as JSON', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    const downloads = []
    wrapper.vm.downloadBlob = (filename, blob) => {
      downloads.push({ filename, blob })
    }

    wrapper.vm.exportTrace()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toBe('hexwar-automated-trace-2026-06-04-10-20-30.json')
    // The loaded trace is what the history store round-trips back (the slim
    // trace carries a levelFingerprint; with no levelPackage it is ''), and
    // exportTrace serializes exactly that displayed trace.
    expect(JSON.parse(await downloads[0].blob.text())).toEqual(readTraceFromHistory(sessionStorage, 'trace-1'))
  })

  it('reconstructs board geometry from q/r when trace frames omit SVG points', async () => {
    writeTraceWithoutSerializedGeometry()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    const polygon = wrapper.find('.hex-cell')
    const unit = wrapper.find('.unit-body-icon')

    expect(polygon.attributes('points')).not.toBe('')
    expect(unit.attributes('x')).not.toBe('0')
    expect(unit.attributes('y')).not.toBe('0')
    expect(wrapper.vm.frameGameState.width).toBe(1)
  })

  it('renders schemaVersion 2 traces by merging static geometry with per-frame units', async () => {
    const pkg = makeMicroLevelPackage()
    const v2Frame = (event, index, position, facing) => ({
      index,
      event,
      turnNumber: 1,
      currentPlayer: 'player1',
      actingPlayer: event === 'initial' ? null : 'player1',
      diceResult: event === 'initial' ? null : 1,
      command: event === 'afterCommand' ? { type: 'move', unitId: 'u1' } : null,
      // schemaVersion 2: per-frame engine carries DYNAMIC state only — no hexes.
      engine: {
        width: 5,
        height: 3,
        currentPlayer: 'player1',
        turnNumber: 1,
        gamePhase: 'MANOEUVRE',
        outcome: null,
        units: [
          [
            'u1',
            {
              id: 'u1',
              type: 'infantry',
              name: 'Scout',
              player: 'player1',
              health: 60,
              maxHealth: 60,
              movement: 4,
              facing,
              isActive: true,
              position
            }
          ]
        ],
        turnState: { u1: { actionsRemaining: 4, isLoaded: true } },
        currentTurnActions: [{ type: 'startTurn', player: 'player1', turnNumber: 1 }]
      }
    })
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 2,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
      runConfig: { seed: 'seed-v2' },
      levelPackage: pkg,
      frames: [
        v2Frame('initial', 0, { q: 0, r: 1 }, 1),
        v2Frame('afterCommand', 1, { q: 1, r: 1 }, 3)
      ]
    }
    seedTrace(trace)

    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    // Static terrain geometry comes from trace.levelPackage (5x3 = 15 hexes),
    // not from the (geometry-free) per-frame engine snapshots.
    expect(wrapper.findAll('.hex-cell').length).toBe(15)
    // The board is reconstructed from the level package by design, so this is
    // NOT the degraded "no engine snapshot" fallback notice.
    expect(wrapper.vm.isUsingFallbackSnapshot).toBe(false)
    expect(wrapper.find('.automated-playground__board-notice').exists()).toBe(false)
    expect(wrapper.find('.unit-body-icon').exists()).toBe(true)

    // Initial frame: dynamic unit at its starting position/facing.
    expect(wrapper.vm.unitRows[0].position).toEqual({ q: 0, r: 1 })
    expect(wrapper.vm.unitRows[0].facing).toBe(1)

    // Step to the moved-unit frame: dynamic state must update per frame.
    const movedIndex = wrapper.vm.frames.findIndex(f => f.event === 'afterCommand')
    expect(movedIndex).toBeGreaterThan(0)
    wrapper.vm.setFrameIndex(movedIndex)
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.unitRows[0].position).toEqual({ q: 1, r: 1 })
    expect(wrapper.vm.unitRows[0].facing).toBe(3)
    expect(wrapper.findAll('.hex-cell').length).toBe(15)
  })

  it('hydrates legacy compact traces whose hexes omitted passable flags', async () => {
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'unitWipe', turns: 1 },
      runConfig: { seed: 'seed-legacy-passable' },
      frames: [
        {
          index: 0,
          event: 'afterCommand',
          turnNumber: 1,
          currentPlayer: 'player1',
          actingPlayer: 'player1',
          diceResult: 4,
          command: { type: 'move', unitId: 'u1', to: { q: 0, r: 0 }, cost: 4 },
          engine: {
            width: 1,
            height: 1,
            hexes: [
              ['0,0', {
                q: 0,
                r: 0,
                terrain: { id: 'water', name: 'Water', color: '#2b8fd8', terrainDifficulty: 4 }
              }]
            ],
            units: [
              ['u1', {
                id: 'u1',
                type: 'infantry',
                name: 'Scout',
                player: 'player1',
                health: 50,
                maxHealth: 50,
                movement: 4,
                facing: 2,
                isActive: true,
                position: { q: 0, r: 0 }
              }]
            ],
            turnState: { u1: { actionsRemaining: 0, isLoaded: true } },
            currentTurnActions: [{ type: 'dice_roll', result: 4 }]
          }
        }
      ]
    }
    seedTrace(trace)
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.frameGameState).toBeTruthy()
    expect(wrapper.vm.frameGameState.getHex(0, 0).passable).toBe(true)
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.find('.unit-body-icon').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('automatedPlayground.noBoard')
  })

  it('opens a read-only inspector when selecting a hex on the shared map', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    await wrapper.find('.hex-cell').trigger('click')

    expect(wrapper.vm.selectedFrameHex).toMatchObject({ q: 0, r: 0 })
    expect(wrapper.find('.selection-inspector').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('gameplay.inspector.moveForward')
    expect(wrapper.text()).not.toContain('gameplay.inspector.keyboardControls')
  })

  it('clears the selected playback hex on board right click', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    await wrapper.find('.hex-cell').trigger('click')
    expect(wrapper.vm.selectedFrameHex).toMatchObject({ q: 0, r: 0 })

    await wrapper.find('.automated-playground__board').trigger('contextmenu')

    expect(wrapper.vm.selectedFrameHex).toBeNull()
  })

  it('falls back to the previous board snapshot when the current frame has no engine snapshot', async () => {
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
      runConfig: { seed: 'seed-fallback' },
      frames: [
        frame('initial', 0),
        {
          index: 1,
          event: 'logOnly',
          turnNumber: 1,
          currentPlayer: 'player1',
          actingPlayer: 'player1',
          diceResult: 3,
          command: { type: 'turn', unitId: 'u1' }
        }
      ]
    }
    seedTrace(trace)
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    wrapper.vm.setFrameIndex(2)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.currentFrame.event).toBe('logOnly')
    expect(wrapper.vm.isUsingFallbackSnapshot).toBe(true)
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('automatedPlayground.boardSnapshotFallback')
  })

  it('uses the level setup board instead of looking ahead to a future board snapshot', async () => {
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
      runConfig: { seed: 'seed-no-lookahead' },
      levelPackage: makeMicroLevelPackage(),
      frames: [
        {
          index: 0,
          event: 'logOnly',
          turnNumber: 1,
          currentPlayer: 'player1',
          actingPlayer: 'player1',
          diceResult: 3,
          command: { type: 'turn', unitId: 'u1' }
        },
        frame('afterCommand', 1)
      ]
    }
    seedTrace(trace)
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    wrapper.vm.setFrameIndex(1)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.currentFrame.event).toBe('logOnly')
    expect(wrapper.vm.playbackSnapshotFrameIndex).toBe(-1)
    expect(wrapper.vm.frameGameState).toBeTruthy()
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('automatedPlayground.boardSnapshotFallback')
  })

  it('uses a later board snapshot as a last-resort fallback for legacy traces without a level package', async () => {
    mockDefaultLevelFetchFailure()
    const trace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T10:20:30.000Z',
      result: { winner: 'player1', reason: 'red_wiped', turns: 1 },
      runConfig: { seed: 'seed-legacy-no-package' },
      frames: [
        {
          index: 0,
          event: 'legacyLogOnly',
          turnNumber: 1,
          currentPlayer: 'player1',
          actingPlayer: 'player1',
          diceResult: 2,
          command: { type: 'turn', unitId: 'u1' }
        },
        frame('afterCommand', 1)
      ]
    }
    seedTrace(trace)
    const wrapper = mountPage()
    await flushAsync()
    await flushAsync()
    await wrapper.vm.$nextTick()

    wrapper.vm.setFrameIndex(1)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.currentFrame.event).toBe('legacyLogOnly')
    expect(wrapper.vm.playbackSnapshotFrameIndex).toBe(2)
    expect(wrapper.vm.frameGameState).toBeTruthy()
    expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('automatedPlayground.boardSnapshotFallback')
    expect(wrapper.text()).not.toContain('automatedPlayground.noBoard')
  })

  it('imports a trace into the capped history, routes to it, and lists it as an imported run', async () => {
    // A trace already in the capped history from an earlier run. Under the
    // unified-history model the import is APPENDED (FIFO cap 10), so a prior
    // in-cap trace is retained, not evicted (replacing the old evict-all model).
    const priorTrace = makeTrace()
    priorTrace.runConfig = { seed: 'prior-seed' }
    seedTrace(priorTrace, 'prior-1', { number: 1, source: 'automated' })

    const router = { replace: vi.fn() }
    const wrapper = mountPage('', router)
    await flushAsync()
    await wrapper.vm.$nextTick()
    // The prior run hydrated into the in-memory history on mount.
    expect(wrapper.vm.runHistory.map(r => r.traceId)).toEqual(['prior-1'])

    const importedTrace = {
      kind: 'hwg/simulation-trace',
      schemaVersion: 1,
      createdAt: '2026-06-04T11:00:00.000Z',
      result: { winner: 'player2', reason: 'maxTurns', turns: 4 },
      runConfig: { seed: 'imported-seed' },
      frames: [frame('initial', 0)]
    }

    expect(wrapper.vm.applyImportedTrace(importedTrace, 'imported-1')).toBe(true)

    expect(wrapper.vm.trace).toMatchObject({ runConfig: { seed: 'imported-seed' } })
    expect(wrapper.vm.traceError).toBe('')
    // Stored in the history store and retrievable (levelFingerprint added; no
    // levelPackage so it is '').
    expect(readTraceFromHistory(sessionStorage, 'imported-1')).toMatchObject({
      runConfig: { seed: 'imported-seed' }
    })
    // Append, not evict-all: the prior trace is STILL retrievable.
    expect(readTraceFromHistory(sessionStorage, 'prior-1')).toMatchObject({
      runConfig: { seed: 'prior-seed' }
    })
    // The import now joins the unified run history, tagged as imported.
    const importedRecord = wrapper.vm.runHistory.find(r => r.traceId === 'imported-1')
    expect(importedRecord).toMatchObject({ source: 'imported', winner: 'player2', reason: 'maxTurns' })
    expect(wrapper.vm.runHistory).toHaveLength(2)
    expect(router.replace).toHaveBeenCalledWith({
      path: '/AutomatedPlayground',
      query: { trace: 'imported-1' }
    })
  })

  it('keeps the current trace visible when an imported payload is invalid', async () => {
    writeTrace()
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()

    const currentTrace = wrapper.vm.trace

    expect(wrapper.vm.applyImportedTrace({ kind: 'not-a-trace' }, 'bad-1')).toBe(false)
    expect(wrapper.vm.trace).toBe(currentTrace)
    expect(wrapper.vm.traceError).toBe('')
    expect(wrapper.vm.importError).toBe('automatedPlayground.traceInvalid')
  })

  it('keeps the runnable workspace visible when an import fails without a selected trace', async () => {
    const wrapper = mountPage('')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.applyImportedTrace({ kind: 'not-a-trace' }, 'bad-1')).toBe(false)

    expect(wrapper.vm.trace).toBeNull()
    expect(wrapper.vm.traceError).toBe('')
    expect(wrapper.vm.importError).toBe('automatedPlayground.traceInvalid')
    expect(wrapper.find('.automated-playground__empty--trace').exists()).toBe(false)
  })

  it('uses the notification system for import failures when available', async () => {
    window.$notify = { error: vi.fn() }
    const wrapper = mountPage('')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.applyImportedTrace({ kind: 'not-a-trace' }, 'bad-1')).toBe(false)

    expect(window.$notify.error).toHaveBeenCalledWith(
      'automatedPlayground.traceImportFailedTitle',
      'automatedPlayground.traceInvalid'
    )
    expect(wrapper.vm.traceError).toBe('')
    expect(wrapper.vm.importError).toBe('')
  })

  it('shows an error when the selected trace is missing', async () => {
    const wrapper = mountPage('missing')
    await wrapper.vm.$nextTick()
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.trace).toBeNull()
    expect(wrapper.vm.traceError).toBe('automatedPlayground.traceMissing')
    expect(wrapper.find('.router-link-stub').attributes()).toMatchObject({
      'data-path': '/LevelBuilder',
      'data-step': 'review-export'
    })
  })

  it('loads the default level setup and prepares a random initial seed for the selected level', async () => {
    const wrapper = mountPage('')
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.traceError).toBe('')
    expect(wrapper.vm.selectedLevelKey).toBe('default:level_000')
    expect(wrapper.vm.defaultLevelPackage).toBeTruthy()
    expect(wrapper.vm.runConfig.seed).toMatch(/^automated-level_000-/)
    expect(wrapper.find('.automated-playground__setup').exists()).toBe(true)
    expect(wrapper.find('.automated-playground__level-row .automated-playground__level-upload-button').text()).toBe(
      'gameplay.engine.browseLevelZip'
    )
    const timelineActions = wrapper.findAll(
      '.automated-playground__games-timeline .automated-playground__setup-actions .automated-playground__action-button'
    )
    expect(timelineActions.map(button => button.text())).toEqual(['automatedPlayground.runMatch'])
    expect(wrapper.find('.automated-playground__setup .automated-playground__setup-actions').exists()).toBe(false)
    expect(wrapper.find('.automated-playground__setup-hint').exists()).toBe(false)
  })

  it('collapses the automated run setup to give game results more column space', async () => {
    const wrapper = mountPage('')
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.setupCollapsed).toBe(false)
    expect(wrapper.find('button[aria-controls="automated-run-setup"]').attributes('aria-expanded')).toBe('true')

    await wrapper.find('button[aria-controls="automated-run-setup"]').trigger('click')

    expect(wrapper.vm.setupCollapsed).toBe(true)
    expect(wrapper.find('button[aria-controls="automated-run-setup"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#automated-run-setup').attributes('style')).toContain('display: none')
  })

  it('renders match config controls inside the games timeline tab before any run', async () => {
    const wrapper = mountPage('')
    await flushAsync()
    await wrapper.vm.$nextTick()

    const timeline = wrapper.find('.automated-playground__games-timeline')
    expect(timeline.exists()).toBe(true)

    const config = timeline.find('.automated-playground__timeline-config')
    expect(config.exists()).toBe(true)
    // Blue + Red profile selects live in the timeline tab now.
    expect(config.findAll('select')).toHaveLength(2)
    expect(config.find('.automated-playground__seed-input').exists()).toBe(true)
    expect(config.find('.automated-playground__seed-lock').exists()).toBe(true)

    // Empty state text sits directly above the run action row.
    const emptyState = timeline.find('.automated-playground__selection-empty')
    expect(emptyState.text()).toBe('automatedPlayground.noGames')
    expect(emptyState.element.nextElementSibling).toBe(timeline.find('.automated-playground__setup-actions').element)
    const runButton = timeline.find('.automated-playground__action-button--primary')
    expect(runButton.text()).toBe('automatedPlayground.runMatch')

    // The setup panel keeps only the Level select; profiles and seed left it.
    expect(wrapper.findAll('.automated-playground__setup select')).toHaveLength(1)
    expect(wrapper.find('.automated-playground__setup .automated-playground__seed-input').exists()).toBe(false)
  })

  it('explains that max turns is only an automation safety cap', async () => {
    const wrapper = mountPage('')
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.automated-playground__max-turns-hint').text()).toBe(
      'automatedPlayground.maxTurnsHint'
    )
  })

  it('captures maxTurns and levelKey on each run record for replay', async () => {
    const wrapper = mountPage('', { replace: vi.fn() })
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 2)

    await wrapper.vm.runAutomatedMatch()

    expect(wrapper.vm.runHistory[0]).toMatchObject({
      maxTurns: 2,
      levelKey: 'default:level_000'
    })
  })

  it('replays a history game via Show and marks it as now showing', async () => {
    const router = { replace: vi.fn() }
    const wrapper = mountPage('', router)
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 2)

    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.$nextTick()

    const first = wrapper.vm.runHistory[0]
    const second = wrapper.vm.runHistory[1]
    expect(wrapper.vm.currentTraceId).toBe(second.traceId)
    // Exactly one badge (the current game), Show buttons on every other record.
    expect(wrapper.findAll('.automated-playground__run-record-badge')).toHaveLength(1)
    expect(wrapper.findAll('.automated-playground__show-run-button')).toHaveLength(1)

    await wrapper.vm.showRunRecord(first)
    await wrapper.vm.$nextTick()

    // The replay reproduces game #1 under its original trace id, no new record.
    expect(wrapper.vm.runHistory).toHaveLength(2)
    expect(wrapper.vm.currentTraceId).toBe(first.traceId)
    expect(wrapper.vm.trace.runConfig.seed).toBe(first.seed)
    expect(wrapper.vm.frames.length).toBe(first.frames)
    // The replayed trace is (re)stored in the capped history under its original
    // id and round-trips back matching the displayed trace.
    const replayedStored = readTraceFromHistory(sessionStorage, first.traceId)
    expect(replayedStored.runConfig.seed).toBe(first.seed)
    expect(replayedStored.frames.length).toBe(wrapper.vm.trace.frames.length)
    expect(router.replace).toHaveBeenLastCalledWith({
      path: '/AutomatedPlayground',
      query: { trace: first.traceId }
    })

    const badges = wrapper.findAll('.automated-playground__run-record-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0].text()).toBe('automatedPlayground.nowShowing')
  })

  it('reports an error when replaying a game whose level is gone', async () => {
    const wrapper = mountPage('', { replace: vi.fn() })
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 1)
    await wrapper.vm.runAutomatedMatch()
    const current = wrapper.vm.currentTraceId

    await wrapper.vm.showRunRecord({
      ...wrapper.vm.runHistory[0],
      traceId: 'automated-elsewhere',
      levelKey: 'zip:deleted_level'
    })

    // The $t stub echoes the key, so text(key, fallback) resolves to the fallback.
    expect(wrapper.vm.runError).toBe('The level for this game is no longer available.')
    expect(wrapper.vm.currentTraceId).toBe(current)
  })

  it('replays a hydrated builder run (empty levelKey) from the stored trace, not via reconstruction', async () => {
    const router = { replace: vi.fn() }
    const wrapper = mountPage('', router)
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 2)
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.$nextTick()

    const first = wrapper.vm.runHistory[0]
    // A builder-sourced run carries levelKey:'' — the levelOptions
    // reconstruction path would wrongly report "level unavailable", but its
    // trace IS in the capped store, so Show must replay straight from there.
    await wrapper.vm.showRunRecord({ ...first, source: 'builder', levelKey: '' })
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.runError).toBe('')
    expect(wrapper.vm.currentTraceId).toBe(first.traceId)
    expect(wrapper.vm.frames.length).toBe(first.frames)
  })

  it('runs one default-level match, stores the trace, and displays playback immediately', async () => {
    const router = { replace: vi.fn() }
    const wrapper = mountPage('', router)
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 2)

    await wrapper.vm.runAutomatedMatch()

    expect(wrapper.vm.trace).toMatchObject({ kind: 'hwg/simulation-trace' })
    expect(wrapper.vm.frames.length).toBeGreaterThan(0)
    expect(wrapper.vm.runResult).toBeTruthy()
    expect(wrapper.vm.runHistory).toHaveLength(1)
    expect(wrapper.vm.runHistory[0]).toMatchObject({
      number: 1,
      seed: wrapper.vm.runConfig.seed,
      winner: wrapper.vm.runResult.winner
    })
    expect(wrapper.vm.expandedRunId).toBe(wrapper.vm.runHistory[0].id)
    expect(wrapper.vm.formatRunRecordSubtitle({ winner: 'player1', reason: 'unitWipe' })).toBe('player1 / Army wiped out')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.automated-playground__run-again-button').exists()).toBe(false)
    const runButton = wrapper.find('.automated-playground__games-timeline .automated-playground__action-button--primary')
    expect(runButton.text()).toBe('automatedPlayground.runMatch')
    expect(runButton.attributes()).not.toHaveProperty('disabled')
    expect(wrapper.find('.automated-playground__run-record .engine-section__subtitle').text()).toBe(
      wrapper.vm.formatRunRecordSubtitle(wrapper.vm.runHistory[0])
    )
    expect(wrapper.find('.automated-playground__run-record-status').text()).toBe('')
    const traceId = wrapper.vm.currentTraceId
    expect(traceId).toMatch(/^automated-/)
    // The run's trace is in the capped history and round-trips back with its
    // levelPackage rehydrated (the store strips it to a fingerprint-keyed blob).
    const storedTrace = readTraceFromHistory(sessionStorage, traceId)
    expect(storedTrace).toMatchObject({ kind: 'hwg/simulation-trace' })
    expect(storedTrace.frames.length).toBe(wrapper.vm.trace.frames.length)
    expect(storedTrace.runConfig.seed).toBe(wrapper.vm.trace.runConfig.seed)
    // The run also entered the history index.
    expect(readTraceHistoryIndex(sessionStorage).map(e => e.traceId)).toContain(traceId)
    expect(router.replace).toHaveBeenCalledWith({
      path: '/AutomatedPlayground',
      query: { trace: traceId }
    })

    await runButton.trigger('click')
    // runAutomatedMatch is now async (yields a frame so the running state paints
    // before the blocking compute); let that yield + the run settle.
    await new Promise(resolve => setTimeout(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.runHistory).toHaveLength(2)
    expect(wrapper.vm.timelineRunHistory.map(record => record.number)).toEqual([2, 1])
    expect(wrapper.find('.automated-playground__run-record .engine-section__title').text()).toBe(
      'automatedPlayground.gameRun #2'
    )
  })

  it('keeps the run button enabled after a run and clears playback via the playback reset', async () => {
    const router = { replace: vi.fn() }
    const wrapper = mountPage('', router)
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()

    const primary = () => wrapper.find('.automated-playground__games-timeline .automated-playground__action-button--primary')
    const storedTraceKeys = () => {
      const keys = []
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i)
        if (typeof key === 'string' && key.startsWith('hwg:simulation-trace:')) keys.push(key)
      }
      return keys
    }
    expect(primary().attributes()).not.toHaveProperty('disabled')
    expect(wrapper.find('.automated-playground__reset-run-button').exists()).toBe(false)

    wrapper.vm.updateRunField('maxTurns', 1)
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.hasActivePlayback).toBe(true)
    // Regression guard: active playback must NOT disable the run button anymore.
    expect(primary().attributes()).not.toHaveProperty('disabled')
    expect(storedTraceKeys().length).toBeGreaterThan(0)
    const clearButton = wrapper.find('.automated-playground__reset-run-button')
    expect(clearButton.exists()).toBe(true)
    expect(clearButton.text()).toBe('automatedPlayground.clearPlayback')
    expect(clearButton.attributes('title')).toBe('automatedPlayground.clearPlaybackTitle')

    await clearButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.trace).toBeNull()
    expect(wrapper.vm.runResult).toBeNull()
    expect(wrapper.vm.runHistory).toHaveLength(1)
    expect(storedTraceKeys()).toHaveLength(0)
    expect(primary().attributes()).not.toHaveProperty('disabled')
    expect(wrapper.find('.automated-playground__reset-run-button').exists()).toBe(false)
    expect(router.replace).toHaveBeenLastCalledWith({ path: '/AutomatedPlayground' })
  })

  it('resets game history from the Game results header without clearing playback trace', async () => {
    const wrapper = mountPage('')
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()

    const resetButton = wrapper.find('.automated-playground__results-panel .automated-playground__text-button')
    expect(resetButton.text()).toBe('automatedPlayground.resetGameResults')
    expect(resetButton.attributes('title')).toBe('automatedPlayground.resetGameResultsTitle')
    expect(resetButton.attributes()).toHaveProperty('disabled')

    wrapper.vm.updateRunField('maxTurns', 1)
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.$nextTick()

    const trace = wrapper.vm.trace
    expect(wrapper.vm.runHistory).toHaveLength(1)
    expect(wrapper.vm.runSummary.games).toBe(1)
    expect(wrapper.find('.automated-playground__results-panel .automated-playground__text-button').attributes()).not.toHaveProperty('disabled')

    await wrapper.find('.automated-playground__results-panel .automated-playground__text-button').trigger('click')

    expect(wrapper.vm.runHistory).toHaveLength(0)
    expect(wrapper.vm.runSummary.games).toBe(0)
    expect(wrapper.vm.runResult).toBeNull()
    expect(wrapper.vm.trace).toBe(trace)
  })

  describe('capped trace-history store wiring (C2)', () => {
    it('appends each run to the history store instead of evicting the prior trace', async () => {
      const wrapper = mountPage('', { replace: vi.fn() })
      expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
      await flushAsync()
      await wrapper.vm.$nextTick()
      wrapper.vm.updateRunField('maxTurns', 1)

      await wrapper.vm.runAutomatedMatch()
      const firstTraceId = wrapper.vm.currentTraceId
      await wrapper.vm.runAutomatedMatch()
      const secondTraceId = wrapper.vm.currentTraceId

      expect(firstTraceId).not.toBe(secondTraceId)
      // The index gained BOTH runs (oldest -> newest).
      const index = readTraceHistoryIndex(sessionStorage)
      expect(index.map(e => e.traceId)).toEqual([firstTraceId, secondTraceId])
      // Old evict-all behavior is gone: BOTH traces remain retrievable.
      expect(readTraceFromHistory(sessionStorage, firstTraceId)).toBeTruthy()
      expect(readTraceFromHistory(sessionStorage, secondTraceId)).toBeTruthy()
      expect(wrapper.vm.runHistory.map(r => r.source)).toEqual(['automated', 'automated'])
    })

    it('hydrates runHistory from a pre-seeded index and defaults the board to the most recent run', async () => {
      const older = makeTrace()
      older.runConfig = { seed: 'seed-older' }
      seedTrace(older, 'automated-older', { number: 1, source: 'automated' })
      const newer = makeTrace()
      newer.runConfig = { seed: 'seed-newer' }
      seedTrace(newer, 'automated-newer', { number: 2, source: 'automated' })

      // No ?trace= in the route: the board must default to the latest run.
      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory.map(r => r.traceId)).toEqual(['automated-older', 'automated-newer'])
      expect(wrapper.vm.currentTraceId).toBe('automated-newer')
      expect(wrapper.vm.trace.runConfig.seed).toBe('seed-newer')
      expect(wrapper.vm.expandedRunId).toBe('automated-newer')
    })

    it('loadTrace reads ?trace= from the history store', async () => {
      const target = makeTrace()
      target.runConfig = { seed: 'seed-target' }
      seedTrace(target, 'automated-target', { number: 1, source: 'automated' })

      const wrapper = mountPage('automated-target', { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.currentTraceId).toBe('automated-target')
      expect(wrapper.vm.trace.runConfig.seed).toBe('seed-target')
      expect(wrapper.vm.traceError).toBe('')
    })

    it('resetRunHistory empties both runHistory and the store (index + trace blobs)', async () => {
      const wrapper = mountPage('', { replace: vi.fn() })
      expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
      await flushAsync()
      await wrapper.vm.$nextTick()
      wrapper.vm.updateRunField('maxTurns', 1)

      await wrapper.vm.runAutomatedMatch()
      const traceId = wrapper.vm.currentTraceId
      expect(readTraceHistoryIndex(sessionStorage).length).toBe(1)
      expect(readTraceFromHistory(sessionStorage, traceId)).toBeTruthy()

      wrapper.vm.resetRunHistory()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory).toHaveLength(0)
      expect(readTraceHistoryIndex(sessionStorage)).toEqual([])
      expect(readTraceFromHistory(sessionStorage, traceId)).toBeNull()
    })

    it('stores an imported trace in history and lists it with source imported', async () => {
      const wrapper = mountPage('', { replace: vi.fn() })
      await flushAsync()
      await wrapper.vm.$nextTick()

      const imported = makeTrace()
      imported.runConfig = { seed: 'seed-imported' }
      expect(wrapper.vm.applyImportedTrace(imported, 'imported-c2')).toBe(true)

      expect(readTraceFromHistory(sessionStorage, 'imported-c2')).toMatchObject({
        runConfig: { seed: 'seed-imported' }
      })
      const record = wrapper.vm.runHistory.find(r => r.traceId === 'imported-c2')
      expect(record).toBeTruthy()
      expect(record.source).toBe('imported')
    })
  })

  it('regenerates an unlocked seed for each run and preserves a locked seed', async () => {
    const wrapper = mountPage('')
    expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
    await flushAsync()
    await wrapper.vm.$nextTick()
    wrapper.vm.updateRunField('maxTurns', 1)

    await wrapper.vm.runAutomatedMatch()
    const firstSeed = wrapper.vm.runHistory[0].seed
    await wrapper.vm.runAutomatedMatch()
    const secondSeed = wrapper.vm.runHistory[1].seed

    expect(firstSeed).toMatch(/^automated-level_000-/)
    expect(secondSeed).toMatch(/^automated-level_000-/)
    expect(secondSeed).not.toBe(firstSeed)

    wrapper.vm.commitSeedInput('fixed-seed')
    await wrapper.vm.runAutomatedMatch()
    await wrapper.vm.runAutomatedMatch()

    expect(wrapper.vm.seedLocked).toBe(true)
    expect(wrapper.vm.runHistory[2].seed).toBe('fixed-seed')
    expect(wrapper.vm.runHistory[3].seed).toBe('fixed-seed')
    expect(wrapper.vm.runSummary.games).toBe(4)
  })

  it('lists persisted Builder playtest levels as run sources', async () => {
    localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify([
      {
        label: 'Builder Level One',
        package: makeMicroLevelPackage(),
        createdAt: '2026-06-05T10:00:00.000Z',
        updatedAt: '2026-06-05T10:00:00.000Z'
      }
    ]))

    const wrapper = mountPage('')
    await flushAsync()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.levelOptions.some(level => level.source === 'builder' && level.label === 'Builder Level One')).toBe(true)
  })

  it('registers an uploaded ZIP level and selects it for subsequent runs', async () => {
    const wrapper = mountPage('')
    await flushAsync()
    await wrapper.vm.$nextTick()
    const bytes = new Uint8Array(await buildLevelArchiveBlob(makeMicroLevelPackage(), 'uploaded_level').arrayBuffer())

    expect(wrapper.vm.registerUploadedLevel(bytes, 'uploaded_level.zip')).toBe(true)

    expect(wrapper.vm.selectedLevelOption).toMatchObject({
      id: 'uploaded_level',
      source: 'zip'
    })
    expect(wrapper.vm.selectedLevelPackage.id).toBe('uploaded_level')
  })

  describe('board/inspector layout splitter', () => {
    afterEach(() => {
      localStorage.removeItem('hexWarAutomatedLayout')
    })

    it('renders the splitter on desktop and clamps board/inspector widths on drag', async () => {
      const wrapper = mountPage('')
      await flushAsync()
      await wrapper.vm.$nextTick()

      await wrapper.setData({
        resizableLayoutViewportWidth: 1300,
        resizableLayout: {
          isReady: true,
          isCustom: false,
          columns: { board: 700, inspector: 360 },
          rows: {},
          columnRatios: { board: 0.66, inspector: 0.34 },
          rowRatios: {}
        }
      })

      const splitter = wrapper.vm.layoutSplitters.find(s => s.key === 'board-inspector')
      expect(splitter).toBeTruthy()

      wrapper.vm.applyLayoutColumnDelta(splitter, 200)
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.resizableLayout.columns.board).toBe(760)
      expect(wrapper.vm.resizableLayout.columns.inspector).toBe(300)
      expect(wrapper.vm.layoutGridStyle['--layout-board-width']).toBe('760px')
      expect(wrapper.vm.layoutGridStyle['--layout-inspector-width']).toBe('300px')
    })

    it('hides the splitter below the desktop breakpoint', async () => {
      const wrapper = mountPage('')
      await flushAsync()
      await wrapper.vm.$nextTick()

      await wrapper.setData({ resizableLayoutViewportWidth: 1024 })

      expect(wrapper.vm.layoutSplitters).toEqual([])
      expect(wrapper.vm.shouldShowLayoutReset).toBe(false)
    })

    it('resets custom layout state and clears the persisted entry', async () => {
      const wrapper = mountPage('')
      await flushAsync()
      await wrapper.vm.$nextTick()

      await wrapper.setData({ resizableLayoutViewportWidth: 1300 })
      wrapper.vm.resizableLayout.isCustom = true
      localStorage.setItem('hexWarAutomatedLayout', '{"version":1}')

      wrapper.vm.resetLayout()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.resizableLayout.isCustom).toBe(false)
      expect(localStorage.getItem('hexWarAutomatedLayout')).toBeNull()
    })
  })

  describe('loadTrace redundant-reload guard (#30)', () => {
    it('skips the second parse + normalize when the route watcher re-fires for the already-shown trace', async () => {
      writeTrace()
      const wrapper = mountPage('trace-1')
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // The initial mount has already displayed trace-1.
      expect(wrapper.vm.currentTraceId).toBe('trace-1')
      expect(wrapper.vm.trace).toBeTruthy()

      const displaySpy = vi.spyOn(wrapper.vm, 'displayTrace')
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

      // Simulate the `$route.query.trace` watcher firing for the SAME id
      // (exactly what displayTrace's $router.replace triggers).
      wrapper.vm.loadTrace()

      expect(displaySpy).not.toHaveBeenCalled()
      expect(getItemSpy).not.toHaveBeenCalled()
      // The guard must leave the displayed trace id unchanged.
      expect(wrapper.vm.currentTraceId).toBe('trace-1')
    })

    it('still performs a full load when the route navigates to a different (external) trace id', async () => {
      writeTrace()
      // A second stored trace to navigate to, in the same history store.
      const other = makeTrace()
      other.runConfig = { seed: 'seed-external' }
      seedTrace(other, 'trace-external')

      const wrapper = mountPage('trace-1')
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.currentTraceId).toBe('trace-1')

      const displaySpy = vi.spyOn(wrapper.vm, 'displayTrace')

      // External navigation: the query now points at a NEW trace id.
      wrapper.vm.$route.query.trace = 'trace-external'
      wrapper.vm.loadTrace()

      // The guard does NOT short-circuit: the full read + parse + display runs.
      expect(displaySpy).toHaveBeenCalledTimes(1)
      expect(displaySpy.mock.calls[0][1]).toBe('trace-external')
      expect(wrapper.vm.currentTraceId).toBe('trace-external')
      expect(wrapper.vm.trace.runConfig.seed).toBe('seed-external')
    })

    it('clears playback when the route navigates to no trace', async () => {
      writeTrace()
      const wrapper = mountPage('trace-1')
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.trace).toBeTruthy()

      wrapper.vm.$route.query.trace = ''
      wrapper.vm.loadTrace()

      expect(wrapper.vm.trace).toBeNull()
      expect(wrapper.vm.currentTraceId).toBe('')
    })
  })

  describe('runAutomatedMatch async running state (#31)', () => {
    it('paints the running state during the yield window and resets it after, guarding re-entry', async () => {
      const wrapper = mountPage('', { replace: vi.fn() })
      expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
      await flushAsync()
      await wrapper.vm.$nextTick()
      wrapper.vm.updateRunField('maxTurns', 1)

      // Start the run but do not await it yet.
      const running = wrapper.vm.runAutomatedMatch()
      // After the first microtask the flag is set and visible (the yield is in
      // progress, before the blocking compute).
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.automationRunning).toBe(true)

      // A second click while running is a no-op (the guard is now real).
      const blocked = wrapper.vm.runAutomatedMatch()
      await blocked

      // Let the first run settle.
      await running
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.automationRunning).toBe(false)
      // The guarded second call produced no extra record.
      expect(wrapper.vm.runHistory).toHaveLength(1)
    })
  })

  describe('handleTraceImport FileReader race after unmount (#32)', () => {
    function captureReader() {
      const readers = []
      class FakeFileReader {
        constructor() {
          this.onload = null
          this.onerror = null
          readers.push(this)
        }
        readAsText() {}
        abort() {
          this.aborted = true
        }
      }
      return { readers, FakeFileReader }
    }

    it('does not navigate or persist when the reader resolves after unmount', async () => {
      const { readers, FakeFileReader } = captureReader()
      const originalFileReader = global.FileReader
      global.FileReader = FakeFileReader
      try {
        const router = { replace: vi.fn() }
        const wrapper = mountPage('', router)
        await flushAsync()
        await wrapper.vm.$nextTick()

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        const fileInput = { value: 'x', files: [{ name: 'trace.json' }] }
        wrapper.vm.handleTraceImport({ target: fileInput })

        expect(readers).toHaveLength(1)
        const reader = readers[0]

        wrapper.unmount()

        // The read finishes only now, after the user navigated away.
        reader.onload({ target: { result: JSON.stringify(makeTrace()) } })

        expect(router.replace).not.toHaveBeenCalled()
        expect(setItemSpy).not.toHaveBeenCalled()
        // beforeUnmount aborts the in-flight reader.
        expect(reader.aborted).toBe(true)
      } finally {
        global.FileReader = originalFileReader
      }
    })

    it('navigates normally when the reader resolves before unmount (control)', async () => {
      const { readers, FakeFileReader } = captureReader()
      const originalFileReader = global.FileReader
      global.FileReader = FakeFileReader
      try {
        const router = { replace: vi.fn() }
        const wrapper = mountPage('', router)
        await flushAsync()
        await wrapper.vm.$nextTick()

        const fileInput = { value: 'x', files: [{ name: 'trace.json' }] }
        wrapper.vm.handleTraceImport({ target: fileInput })
        const reader = readers[0]

        reader.onload({ target: { result: JSON.stringify(makeTrace()) } })
        await wrapper.vm.$nextTick()

        expect(router.replace).toHaveBeenCalledWith(
          expect.objectContaining({ path: '/AutomatedPlayground' })
        )
        expect(wrapper.vm.trace).toBeTruthy()
      } finally {
        global.FileReader = originalFileReader
      }
    })
  })

  describe('normalized trace is non-reactive (#69)', () => {
    it('stores the loaded trace via markRaw so frame reads skip Vue proxies', async () => {
      writeTrace()
      const wrapper = mountPage()
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // markRaw: the trace object is NOT wrapped in a reactive proxy.
      expect(wrapper.vm.trace).toBeTruthy()
      expect(isReactive(wrapper.vm.trace)).toBe(false)
      // Deep frame fields are likewise raw (no per-frame proxying).
      expect(isReactive(wrapper.vm.trace.frames[0])).toBe(false)
      expect(isReactive(wrapper.vm.trace.frames[0].engine)).toBe(false)

      // Playback still works: frames render and stepping advances the board.
      expect(wrapper.vm.frames).toHaveLength(3)
      expect(wrapper.findComponent({ name: 'GameMapBlock' }).exists()).toBe(true)
      expect(wrapper.find('.unit-body-icon').exists()).toBe(true)
    })

    it('keeps an imported trace raw as well (markRaw at the shared assignment site)', async () => {
      const wrapper = mountPage('', { replace: vi.fn() })
      await flushAsync()
      await wrapper.vm.$nextTick()

      const imported = makeTrace()
      imported.runConfig = { seed: 'imported-raw' }
      expect(wrapper.vm.applyImportedTrace(imported, 'imported-raw')).toBe(true)
      await wrapper.vm.$nextTick()

      expect(isReactive(wrapper.vm.trace)).toBe(false)
      expect(wrapper.vm.frames.length).toBeGreaterThan(0)
    })
  })

  describe('static board reconstructed once per trace (#63)', () => {
    it('does NOT rebuild the level-package board on every frame step', async () => {
      // toJSON(false) is invoked exactly once per buildGameStateFromLevelPackage
      // (and nowhere else on the playback path), so it counts board rebuilds.
      const boardBuildSpy = vi.spyOn(GameState.prototype, 'toJSON')
      const boardBuilds = () => boardBuildSpy.mock.calls.filter(call => call[0] === false).length
      seedTrace(makeSchemaV2Trace(5))

      const wrapper = mountPage()
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // normalizeTraceForPlayback injects synthetic diceRoll frames, so the
      // playback frame count is >= the 5 source frames. The point of this test
      // is that the board build count does NOT scale with that frame count.
      const frameCount = wrapper.vm.frames.length
      expect(frameCount).toBeGreaterThanOrEqual(5)

      // Baseline after load; the per-frame board build is what we are guarding.
      const buildsBeforeStepping = boardBuilds()

      // Step through every remaining frame: the static board (its geometry,
      // identical for every frame) must NOT be rebuilt as the frame advances.
      for (let i = 1; i < frameCount; i += 1) {
        wrapper.vm.setFrameIndex(i)
        await wrapper.vm.$nextTick()
        await flushAsync()
        await wrapper.vm.$nextTick()
        // Read the hex geometry the way the template does, every frame.
        expect(wrapper.vm.frameHexEntries.length).toBe(15)
      }

      // Pre-fix: stepping rebuilt the board once PER FRAME (frameCount-1 extra
      // builds, since levelPackageSnapshotEngine depended on currentFrame). The
      // frame-independent static-board computed adds ZERO builds while stepping.
      expect(boardBuilds()).toBe(buildsBeforeStepping)
    })

    it('keeps per-frame dynamic state visually identical while sharing the static board', async () => {
      seedTrace(makeSchemaV2Trace(5))
      const wrapper = mountPage()
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // Static geometry: 5x3 = 15 hexes, identical on every frame.
      const hexKeys = entries => entries.map(([key]) => key).sort()
      const baseHexes = hexKeys(wrapper.vm.frameHexEntries)
      expect(wrapper.vm.frameHexEntries.length).toBe(15)

      const perFrame = []
      for (let i = 0; i < wrapper.vm.frames.length; i += 1) {
        wrapper.vm.setFrameIndex(i)
        await wrapper.vm.$nextTick()
        await flushAsync()
        await wrapper.vm.$nextTick()

        // Static board geometry is stable frame to frame.
        expect(hexKeys(wrapper.vm.frameHexEntries)).toEqual(baseHexes)

        const gs = wrapper.vm.frameGameState
        expect(gs).toBeTruthy()
        const unit = wrapper.vm.unitRows[0]
        perFrame.push({
          position: { ...unit.position },
          facing: unit.facing,
          currentPlayer: gs.currentPlayer,
          turnNumber: gs.turnNumber,
          actionsRemaining: gs.turnState.u1 ? gs.turnState.u1.actionsRemaining : null
        })
      }

      // Each frame reflects exactly the dynamic state that frame carried.
      perFrame.forEach((snapshot, i) => {
        const expectedFrame = wrapper.vm.frames[i]
        const expectedUnit = expectedFrame.engine.units[0][1]
        expect(snapshot.position).toEqual(expectedUnit.position)
        expect(snapshot.facing).toBe(expectedUnit.facing)
        expect(snapshot.actionsRemaining).toBe(expectedFrame.engine.turnState.u1.actionsRemaining)
        expect(snapshot.currentPlayer).toBe(wrapper.vm.frames[i].currentPlayer)
      })
      // Sanity: the unit actually moved across frames (parity is non-trivial).
      expect(perFrame[0].position).not.toEqual(perFrame[perFrame.length - 1].position)
    })

    it('keeps frameMapKey stable across frame steps yet feeds a fresh gameState per frame', async () => {
      seedTrace(makeSchemaV2Trace(4))
      const wrapper = mountPage()
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      const map = wrapper.findComponent({ name: 'GameMapBlock' })
      expect(map.exists()).toBe(true)

      const keys = []
      const gameStates = []
      for (let i = 0; i < wrapper.vm.frames.length; i += 1) {
        wrapper.vm.setFrameIndex(i)
        await wrapper.vm.$nextTick()
        await flushAsync()
        await wrapper.vm.$nextTick()
        keys.push(wrapper.vm.frameMapKey)
        gameStates.push(wrapper.findComponent({ name: 'GameMapBlock' }).props('gameState'))
      }

      // frameMapKey no longer encodes frameIndex: stable for the whole trace, so
      // GameMapBlock is NOT remounted (and its SVG geometry not rebuilt) per tick.
      expect(new Set(keys).size).toBe(1)
      // ...yet the gameState prop reference changes per frame, so the map's
      // gameState watcher re-syncs the board.
      const uniqueStates = new Set(gameStates)
      expect(uniqueStates.size).toBe(wrapper.vm.frames.length)
    })
  })

  describe('slider scrub rAF coalescing (#6a)', () => {
    let wrapper
    let capturedRafCallback = null
    let rafSpy
    let cafSpy

    beforeEach(async () => {
      writeTrace()
      // Stub rAF: capture the callback without auto-running it.
      rafSpy = vi.fn(cb => {
        capturedRafCallback = cb
        return 42 // sentinel handle
      })
      cafSpy = vi.fn()
      vi.stubGlobal('requestAnimationFrame', rafSpy)
      vi.stubGlobal('cancelAnimationFrame', cafSpy)

      wrapper = mountPage()
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()
    })

    afterEach(() => {
      // Unmount while the rAF spies are still active (so a leaked handle would
      // still hit cafSpy), then restore globals. Guard against the third test,
      // which unmounts in its own body, to avoid a double-unmount warning.
      if (wrapper) {
        wrapper.unmount()
        wrapper = null
      }
      vi.unstubAllGlobals()
    })

    it('coalesces multiple scrubFrameIndex calls into one rAF commit with the last value', () => {
      const initialIndex = wrapper.vm.frameIndex
      // Fire four scrub events — rAF should only be scheduled once.
      wrapper.vm.scrubFrameIndex(1)
      wrapper.vm.scrubFrameIndex(2)
      wrapper.vm.scrubFrameIndex(3)
      wrapper.vm.scrubFrameIndex(4)

      // No commit yet — frameIndex unchanged.
      expect(wrapper.vm.frameIndex).toBe(initialIndex)
      // rAF scheduled exactly once across all four calls.
      expect(rafSpy).toHaveBeenCalledTimes(1)

      // Flush the rAF — only the last value should be committed.
      capturedRafCallback()
      expect(wrapper.vm.frameIndex).toBe(Math.min(4, wrapper.vm.frameSliderMax))
    })

    it('synchronous setFrameIndex cancels a pending scrub and wins', () => {
      // Queue a scrub for frame 2.
      wrapper.vm.scrubFrameIndex(2)
      expect(rafSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.vm.frameIndex).not.toBe(2)

      // Synchronous jump to 0 must cancel the pending rAF and commit immediately.
      wrapper.vm.setFrameIndex(0)
      expect(cafSpy).toHaveBeenCalledWith(42)
      expect(wrapper.vm.frameIndex).toBe(0)

      // If the stale rAF callback fires anyway it must not overwrite frame 0.
      capturedRafCallback()
      expect(wrapper.vm.frameIndex).toBe(0)
    })

    it('cancels the pending scrub rAF on beforeUnmount', () => {
      // Queue a scrub so there is a live rAF handle.
      wrapper.vm.scrubFrameIndex(1)
      expect(rafSpy).toHaveBeenCalledTimes(1)

      // Unmounting should cancel the rAF.
      wrapper.unmount()
      expect(cafSpy).toHaveBeenCalledWith(42)

      // Calling the stale callback after unmount should be a harmless no-op.
      expect(() => capturedRafCallback()).not.toThrow()

      // Already unmounted above — clear so afterEach doesn't double-unmount.
      wrapper = null
    })
  })

  describe('humanized outcome reason labels (#2)', () => {
    // Mount with a $t that returns actual EN label strings for known reason keys,
    // so assertions are meaningful rather than tautological.
    function mountPageWithLabels(trace = 'trace-1', router = { replace: vi.fn() }) {
      const reasonLabels = {
        unitWipe: 'Army wiped out',
        baseCaptured: 'Base captured',
        baseProtected: 'Base held',
        surviveTurns: 'Survived the required turns',
        deadlineMissed: 'Objective deadline missed',
        maxTurns: 'Turn limit reached',
        materialDecision: 'Turn limit — decided on material',
        perTurnLimit: 'Per-turn action limit',
        conflictingObjectives: 'Conflicting objectives'
      }
      return mount(AutomatedPlayground, {
        global: {
          mocks: {
            $route: { query: trace == null ? {} : { trace } },
            $router: router,
            $t(key) {
              // Resolve known reason label keys; fall through for everything else.
              const prefix = 'automatedPlayground.reasonLabels.'
              if (key.startsWith(prefix)) {
                const code = key.slice(prefix.length)
                return code in reasonLabels ? reasonLabels[code] : key
              }
              return key
            }
          },
          stubs: {
            HeaderComponent: { template: '<nav />' },
            RouterLink: routerLinkStub,
            'router-link': routerLinkStub
          }
        }
      })
    }

    it('returns human-readable EN labels for known reason codes', () => {
      const wrapper = mountPageWithLabels(null, { replace: vi.fn() })
      expect(wrapper.vm.outcomeReasonLabel('unitWipe')).toBe('Army wiped out')
      expect(wrapper.vm.outcomeReasonLabel('materialDecision')).toBe('Turn limit — decided on material')
      expect(wrapper.vm.outcomeReasonLabel('maxTurns')).toBe('Turn limit reached')
    })

    it('falls back to the raw string for an unknown reason code', () => {
      const wrapper = mountPageWithLabels(null, { replace: vi.fn() })
      expect(wrapper.vm.outcomeReasonLabel('somethingUnknown')).toBe('somethingUnknown')
    })

    it('falls back to "-" for a null or undefined reason', () => {
      const wrapper = mountPageWithLabels(null, { replace: vi.fn() })
      expect(wrapper.vm.outcomeReasonLabel(null)).toBe('-')
      expect(wrapper.vm.outcomeReasonLabel(undefined)).toBe('-')
    })

    it('renders the human label in the run subtitle (not the raw code)', async () => {
      const wrapper = mountPageWithLabels(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // runResult is a data property; set it directly to simulate a completed run.
      await wrapper.setData({ runResult: { winner: 'player1', reason: 'unitWipe' } })
      await wrapper.vm.$nextTick()

      // The run subtitle lives inside .engine-section__subtitle.
      const subtitle = wrapper.find('.engine-section__subtitle')
      expect(subtitle.exists()).toBe(true)
      expect(subtitle.text()).toContain('Army wiped out')
      expect(subtitle.text()).not.toContain('unitWipe')
    })

    it('renders the human label in the history record facts (not the raw code)', async () => {
      const router = { replace: vi.fn() }
      const wrapper = mountPageWithLabels('', router)
      expect(await wrapper.vm.loadDefaultLevel()).toBe(true)
      await flushAsync()
      await wrapper.vm.$nextTick()

      wrapper.vm.updateRunField('maxTurns', 1)
      await wrapper.vm.runAutomatedMatch()
      await wrapper.vm.$nextTick()

      // Manually set a known reason on the history record to assert rendering.
      expect(wrapper.vm.runHistory.length).toBeGreaterThan(0)
      wrapper.vm.runHistory[0].reason = 'materialDecision'
      wrapper.vm.expandedRunId = wrapper.vm.runHistory[0].id
      await wrapper.vm.$nextTick()

      const facts = wrapper.find('.automated-playground__facts--compact')
      expect(facts.exists()).toBe(true)
      expect(facts.text()).toContain('Turn limit — decided on material')
      expect(facts.text()).not.toContain('materialDecision')
    })

    it('humanizes the reason in the run-history collapsed subtitle', () => {
      const wrapper = mountPageWithLabels('', { replace: vi.fn() })
      const subtitle = wrapper.vm.formatRunRecordSubtitle({ winner: 'blue', reason: 'unitWipe' })
      expect(subtitle).toContain('Army wiped out')
      expect(subtitle).not.toContain('unitWipe')
      expect(subtitle).toContain('blue')

      // Reason-only (no winner): humanized reason still shown, raw code absent.
      const reasonOnly = wrapper.vm.formatRunRecordSubtitle({ winner: null, reason: 'materialDecision' })
      expect(reasonOnly).toBe('Turn limit — decided on material')
    })
  })

  // -------------------------------------------------------------------------
  // C3b: builder-level-change epoch invalidation
  // -------------------------------------------------------------------------

  describe('AutomatedPlayground · builder epoch invalidation on mount (C3b)', () => {
    // Seed a builder-source trace whose levelFingerprint equals fpA.
    function seedBuilderTrace(fp, traceId = 'builder-epoch-test-1') {
      appendTraceToHistory(sessionStorage, {
        metadata: {
          id: traceId,
          traceId,
          source: 'builder',
          number: 1,
          createdAt: new Date().toISOString()
        },
        trace: {
          frames: [],
          createdAt: new Date().toISOString(),
          levelPackage: { id: 'test', hexmap: { cells: [], parameters: { width: 1, height: 1, schemaVersion: 1 } } }
        }
      })
      // Overwrite the stored levelFingerprint in the index entry to fp so the
      // invalidation condition is testable without a real package roundtrip.
      const index = readTraceHistoryIndex(sessionStorage)
      index[index.length - 1].levelFingerprint = fp
      sessionStorage.setItem('hwg:simulation-trace-index', JSON.stringify(index))
    }

    beforeEach(() => {
      clearTraceHistory(sessionStorage)
      sessionStorage.removeItem('hwg:simulation-builder-epoch')
    })

    it('clears history when a builder run levelFingerprint differs from the epoch', async () => {
      seedBuilderTrace('fp-A')
      writeBuilderEpoch(sessionStorage, 'different-fp')

      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory).toHaveLength(0)
      expect(readTraceHistoryIndex(sessionStorage)).toHaveLength(0)
    })

    it('keeps history when builder run levelFingerprint matches the epoch', async () => {
      seedBuilderTrace('fp-match')
      writeBuilderEpoch(sessionStorage, 'fp-match')

      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory).toHaveLength(1)
    })

    it('keeps automated-only history even if the epoch differs (no builder source)', async () => {
      appendTraceToHistory(sessionStorage, {
        metadata: {
          id: 'auto-1',
          traceId: 'auto-1',
          source: 'automated',
          number: 1,
          createdAt: new Date().toISOString()
        },
        trace: { frames: [], createdAt: new Date().toISOString() }
      })
      writeBuilderEpoch(sessionStorage, 'epoch-that-differs')

      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory).toHaveLength(1)
    })

    it('full-clears mixed history (stale builder + automated) when a builder run is stale', async () => {
      seedBuilderTrace('fp-A')
      appendTraceToHistory(sessionStorage, {
        metadata: {
          id: 'auto-keep',
          traceId: 'auto-keep',
          source: 'automated',
          number: 2,
          createdAt: new Date().toISOString()
        },
        trace: { frames: [], createdAt: new Date().toISOString() }
      })
      writeBuilderEpoch(sessionStorage, 'different-fp')

      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      // A single stale builder run wipes the whole history, including the
      // coexisting automated run (intended full-clear semantics).
      expect(wrapper.vm.runHistory).toHaveLength(0)
      expect(readTraceHistoryIndex(sessionStorage)).toHaveLength(0)
    })

    it('does not invalidate when epoch is empty string (unset)', async () => {
      seedBuilderTrace('fp-A')
      // epoch absent — readBuilderEpoch returns ''
      sessionStorage.removeItem('hwg:simulation-builder-epoch')

      const wrapper = mountPage(null, { replace: vi.fn() })
      await wrapper.vm.$nextTick()
      await flushAsync()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.runHistory).toHaveLength(1)
    })
  })
})
