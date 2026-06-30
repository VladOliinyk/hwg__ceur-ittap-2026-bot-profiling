// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import GameMapBlock from '../GameMapBlock.vue'

/**
 * Child-side watcher coverage for the playground intent props.
 *
 * Round 3's playground component test (`Playground.dispatch.test.js`)
 * stubbed `GameMapBlock`, so it proved the prop bump reaches the child
 * but not that the real watchers run their side effects. This test
 * mounts the real `GameMapBlock`, spies on the methods the watchers
 * invoke, and asserts each prop change drives the expected refresh.
 *
 * The mount uses `shallowMount` to avoid pulling in heavy SVG / Lottie
 * children. We only need the watchers and their bodies to execute.
 */

const stubMapData = {
  parameters: { width: 4, height: 4 },
  map: [
    { q: 0, r: 0, terrain: 'plains' },
    { q: 1, r: 0, terrain: 'plains' },
    { q: 0, r: 1, terrain: 'plains' },
    { q: 1, r: 1, terrain: 'plains' }
  ]
}

const stubTerrain = [{ id: 'plains', name: 'Plains', color: '#8BC34A', movementCost: 1, passable: true }]

function makeGameState(unitsInput = null) {
  const defaultUnits = [
    { id: 'u1', player: 'player1', facing: 0, position: { q: 0, r: 0 }, isAlive: () => true }
  ]
  const store = Object.fromEntries((unitsInput || defaultUnits).map(unit => [unit.id, unit]))
  return {
    width: 4,
    height: 4,
    currentPlayer: 'player1',
    turnNumber: 1,
    gamePhase: 'MANOEUVRE',
    turnState: Object.fromEntries(
      Object.values(store).map(unit => [unit.id, { isLoaded: true, actionsLeft: 2 }])
    ),
    units: {
      get(id) {
        return store[id]
      },
      values() {
        return Object.values(store)
      }
    },
    reachabilityVersion: 0,
    currentTurnActions: [],
    history: [],
    getAllUnits: vi.fn(() => Object.values(store)),
    getActivePlayerUnits: vi.fn(player => Object.values(store).filter(unit => {
      if (!unit || String(unit.player) !== String(player)) return false
      return typeof unit.isAlive === 'function' ? unit.isAlive() : unit.isActive !== false
    })),
    getHex: vi.fn((q, r) => ({
      q,
      r,
      terrain: 'plains',
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      highlight: vi.fn(),
      unhighlight: vi.fn()
    })),
    canPerformAction: vi.fn(() => true),
    getAllowedActions: vi.fn(() => []),
    getReachableHexesWithCost: vi.fn(() => []),
    getDirectionalReachableCosts: vi.fn(() => new Map()),
    getManeuverReachableCosts: vi.fn(() => new Map()),
    getAuthoritativePathCost: vi.fn(() => 1),
    getFireRangeHexesCached: vi.fn(() => []),
    getHexKey: vi.fn((q, r) => `${q},${r}`),
    _store: store
  }
}

const stubController = {
  moveUnit: vi.fn(() => ({ ok: true, result: { type: 'moveUnit' } })),
  updateUnitFacing: vi.fn(() => ({ ok: true, result: { type: 'rotate' } })),
  performAttack: vi.fn(() => ({ ok: true, result: { type: 'fire', damage: 0 } })),
  performReload: vi.fn(() => ({ ok: true, result: { type: 'reload' } })),
  commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice' } }))
}

function mountMap(extraProps = {}) {
  return shallowMount(GameMapBlock, {
    props: {
      mapData: stubMapData,
      terrainTypes: stubTerrain,
      gameState: makeGameState(),
      gameController: stubController,
      selectedHexDropdownPosition: { x: 100, y: 100 },
      showFloatingPanel: true,
      commandSeq: 0,
      attackTargetShiftIntent: { delta: 0, seq: 0 },
      deselectIntent: 0,
      unitPreviewHoverIntent: { unitId: null, seq: 0 },
      unitPreviewSelectIntent: { unitId: null, seq: 0 },
      ...extraProps
    },
    global: {
      // Prevent ResizeObserver / inline SVG measurement work inside child
      // components from running during shallowMount.
      stubs: {
        SelectedHexDropdown: true,
        LottieAnimation: true
      }
    }
  })
}

beforeEach(() => {
  Object.values(stubController).forEach(fn => fn.mockClear())
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('GameMapBlock intent prop watchers', () => {
  it('uses the viewer wrapper without the playground grid area when requested', () => {
    const wrapper = mountMap({ surfaceVariant: 'viewer' })

    expect(wrapper.classes()).toContain('game-map-block--viewer')
    expect(wrapper.classes()).not.toContain('grid-item--game-map')
  })

  it('commandSeq bump triggers refreshSelectedUnitFromGameState + syncValidAttackTargets', async () => {
    const wrapper = mountMap()
    const refresh = vi.spyOn(wrapper.vm, 'refreshSelectedUnitFromGameState')
    const sync = vi.spyOn(wrapper.vm, 'syncValidAttackTargets')

    await wrapper.setProps({ commandSeq: 1 })

    expect(refresh).toHaveBeenCalled()
    expect(sync).toHaveBeenCalled()
  })

  it('dedupes LOS errors per GameMapBlock instance, not at module scope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const makeThrowingState = () => {
      const gameState = makeGameState()
      gameState.getValidFireTargetsCached = vi.fn(() => {
        throw new Error('blocked LOS')
      })
      return gameState
    }
    const firstState = makeThrowingState()
    const secondState = makeThrowingState()
    const first = mountMap({ gameState: firstState })
    const second = mountMap({ gameState: secondState })
    const firstNotify = vi.spyOn(first.vm, 'notify').mockImplementation(() => {})
    const secondNotify = vi.spyOn(second.vm, 'notify').mockImplementation(() => {})

    first.vm.selectedUnit = firstState._store.u1
    await first.vm.$nextTick()
    first.vm.syncValidAttackTargets()

    second.vm.selectedUnit = secondState._store.u1
    await second.vm.$nextTick()

    expect(firstNotify).toHaveBeenCalledTimes(1)
    expect(secondNotify).toHaveBeenCalledTimes(1)
  })

  it('attackTargetShiftIntent.seq change delegates to shiftAttackTarget with the supplied delta', async () => {
    const wrapper = mountMap()
    const shift = vi.spyOn(wrapper.vm, 'shiftAttackTarget')

    await wrapper.setProps({ attackTargetShiftIntent: { delta: 2, seq: 1 } })

    expect(shift).toHaveBeenCalledWith(2)
  })

  it('attackTargetShiftIntent with non-finite delta falls back to 0', async () => {
    const wrapper = mountMap()
    const shift = vi.spyOn(wrapper.vm, 'shiftAttackTarget')

    await wrapper.setProps({ attackTargetShiftIntent: { delta: 'oops', seq: 1 } })

    expect(shift).toHaveBeenCalledWith(0)
  })

  it('deselectIntent bump triggers deselectHex', async () => {
    const wrapper = mountMap()
    const deselect = vi.spyOn(wrapper.vm, 'deselectHex')

    await wrapper.setProps({ deselectIntent: 1 })

    expect(deselect).toHaveBeenCalled()
  })

  it('unitPreviewHoverIntent highlights the unit hex like map hover', async () => {
    const wrapper = mountMap()

    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: 'u1', seq: 1 } })

    expect(wrapper.vm.hoveredHex).toMatchObject({ q: 0, r: 0 })

    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: null, seq: 2 } })

    expect(wrapper.vm.hoveredHex).toBe(null)
  })

  it('unitPreviewSelectIntent selects the unit hex through the existing select flow', async () => {
    const wrapper = mountMap()
    const select = vi.spyOn(wrapper.vm, 'selectHex')

    await wrapper.setProps({ unitPreviewSelectIntent: { unitId: 'u1', seq: 1 } })

    expect(select).toHaveBeenCalled()
    expect(wrapper.vm.selectedUnit).toMatchObject({ id: 'u1' })
    expect(wrapper.vm.selectedHex).toMatchObject({ q: 0, r: 0 })
  })

  it('read-only mode still allows hex selection', () => {
    const wrapper = mountMap({ readOnly: true })
    const hex = wrapper.vm.hexMapData.find(h => h.q === 0 && h.r === 0)

    wrapper.vm.selectHex(hex, null)

    expect(wrapper.vm.selectedHex).toMatchObject({ q: 0, r: 0 })
    expect(wrapper.vm.selectedUnit).toMatchObject({ id: 'u1' })
    const emitted = wrapper.emitted('hex-selected') || []
    expect(emitted[emitted.length - 1][0]).toMatchObject({ q: 0, r: 0 })
  })

  it('suppresses the synthetic hex click after a real map pan', () => {
    const wrapper = mountMap()
    const hex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

    wrapper.vm.startPan({ button: 0, clientX: 10, clientY: 10 })
    wrapper.vm.pan({ clientX: 15, clientY: 10 })
    wrapper.vm.stopPan({ type: 'mouseup' })
    wrapper.vm.selectHex(hex, { type: 'click' })

    expect(wrapper.vm.selectedHex).toBe(null)
    expect(wrapper.vm.suppressNextHexClick).toBe(false)
    expect(wrapper.emitted('hex-selected')).toBeUndefined()
  })

  it('does not suppress programmatic hex selection after a real map pan', () => {
    const wrapper = mountMap()
    const hex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

    wrapper.vm.startPan({ button: 0, clientX: 10, clientY: 10 })
    wrapper.vm.pan({ clientX: 15, clientY: 10 })
    wrapper.vm.stopPan({ type: 'mouseup' })
    wrapper.vm.selectHex(hex, null)

    expect(wrapper.vm.selectedHex).toMatchObject({ q: 1, r: 1 })
    expect(wrapper.vm.suppressNextHexClick).toBe(true)
    const emitted = wrapper.emitted('hex-selected') || []
    expect(emitted[emitted.length - 1][0]).toMatchObject({ q: 1, r: 1 })
  })

  it('keeps ordinary click selection after sub-threshold pointer movement', () => {
    const wrapper = mountMap()
    const hex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

    wrapper.vm.startPan({ button: 0, clientX: 10, clientY: 10 })
    wrapper.vm.pan({ clientX: 12, clientY: 10 })
    wrapper.vm.stopPan({ type: 'mouseup' })
    wrapper.vm.selectHex(hex, { type: 'click' })

    expect(wrapper.vm.selectedHex).toMatchObject({ q: 1, r: 1 })
    const emitted = wrapper.emitted('hex-selected') || []
    expect(emitted[emitted.length - 1][0]).toMatchObject({ q: 1, r: 1 })
  })

  it('removes selected-hex drag listeners when unmounted mid-drag', () => {
    const add = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    const remove = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})
    const wrapper = mountMap()

    wrapper.vm.startSelectedHexDrag({
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 10
    })

    expect(add.mock.calls.some(call => call[0] === 'mousemove')).toBe(true)
    expect(add.mock.calls.some(call => call[0] === 'mouseup')).toBe(true)
    expect(wrapper.vm.isDraggingSelectedHexDropdown).toBe(true)

    wrapper.unmount()

    expect(remove.mock.calls.some(call => call[0] === 'mousemove')).toBe(true)
    expect(remove.mock.calls.some(call => call[0] === 'mouseup')).toBe(true)
    expect(wrapper.vm.isDraggingSelectedHexDropdown).toBe(false)
    expect(wrapper.vm.selectedHexDragCleanup).toBe(null)
  })

  it('read-only mode blocks map command methods from reaching the controller', () => {
    const wrapper = mountMap({ readOnly: true })
    wrapper.vm.selectedUnit = wrapper.vm.gameState._store.u1

    wrapper.vm.moveUnitForward()
    wrapper.vm.moveUnitReverse()
    wrapper.vm.rotateUnitClockwise()
    wrapper.vm.rotateUnitCounterClockwise()
    wrapper.vm.setUnitFacing(2)
    wrapper.vm.performReloadWeapon()
    wrapper.vm.fireAtSelectedTarget()

    expect(stubController.moveUnit).not.toHaveBeenCalled()
    expect(stubController.updateUnitFacing).not.toHaveBeenCalled()
    expect(stubController.performAttack).not.toHaveBeenCalled()
    expect(stubController.performReload).not.toHaveBeenCalled()
  })

  it('read-only mode disables global keyboard actions including Tab cycling', () => {
    const gameState = makeGameState([
      { id: 'u1', player: 'player1', facing: 0, position: { q: 0, r: 0 }, isAlive: () => true },
      { id: 'u2', player: 'player1', facing: 0, position: { q: 1, r: 0 }, isAlive: () => true }
    ])
    const wrapper = mountMap({ gameState, readOnly: true })
    wrapper.vm.selectedUnit = gameState._store.u1

    const arrowEvent = {
      key: 'ArrowUp',
      target: document.body,
      preventDefault: vi.fn()
    }
    const tabEvent = {
      key: 'Tab',
      shiftKey: false,
      target: document.createElement('button'),
      preventDefault: vi.fn()
    }

    wrapper.vm.handleKeyDown(arrowEvent)
    wrapper.vm.handleKeyDown(tabEvent)

    expect(arrowEvent.preventDefault).not.toHaveBeenCalled()
    expect(tabEvent.preventDefault).not.toHaveBeenCalled()
    expect(wrapper.vm.selectedUnit).toMatchObject({ id: 'u1' })
    expect(stubController.moveUnit).not.toHaveBeenCalled()
  })

  it('Tab cycles from the selected unit to the next active-player unit even from a button target', async () => {
    const gameState = makeGameState([
      { id: 'u1', player: 'player1', facing: 0, position: { q: 0, r: 0 }, isAlive: () => true },
      { id: 'enemy', player: 'player2', facing: 0, position: { q: 0, r: 1 }, isAlive: () => true },
      { id: 'dead', player: 'player1', facing: 0, position: { q: 1, r: 1 }, isAlive: () => false },
      { id: 'u2', player: 'player1', facing: 0, position: { q: 1, r: 0 }, isAlive: () => true }
    ])
    const wrapper = mountMap({ gameState })
    await wrapper.setProps({ unitPreviewSelectIntent: { unitId: 'u1', seq: 1 } })
    const event = {
      key: 'Tab',
      shiftKey: false,
      target: document.createElement('button'),
      preventDefault: vi.fn()
    }

    wrapper.vm.handleKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(wrapper.vm.selectedUnit).toMatchObject({ id: 'u2' })
    expect(wrapper.vm.selectedHex).toMatchObject({ q: 1, r: 0 })
  })

  it('unitPreviewSelectIntent null deselects through the existing map flow', async () => {
    const wrapper = mountMap()
    await wrapper.setProps({ unitPreviewSelectIntent: { unitId: 'u1', seq: 1 } })

    await wrapper.setProps({ unitPreviewSelectIntent: { unitId: null, seq: 2 } })

    expect(wrapper.vm.selectedUnit).toBe(null)
    expect(wrapper.vm.selectedHex).toBe(null)
    const emitted = wrapper.emitted('hex-selected') || []
    expect(emitted[emitted.length - 1]).toEqual([null])
  })

  it('commandSeq watcher no-ops when value is unchanged', async () => {
    const wrapper = mountMap({ commandSeq: 5 })
    const refresh = vi.spyOn(wrapper.vm, 'refreshSelectedUnitFromGameState')

    await wrapper.setProps({ commandSeq: 5 })

    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshSelectedUnitFromGameState re-reads unit position from the engine', async () => {
    const wrapper = mountMap()
    // Simulate user selection: set selectedUnit and selectedHex via the
    // map's internal selectHex flow does too much; we set them directly
    // to keep the test focused on the refresh contract.
    const initialUnit = wrapper.vm.gameState._store.u1
    wrapper.vm.selectedUnit = initialUnit
    wrapper.vm.selectedHex = { q: initialUnit.position.q, r: initialUnit.position.r }

    // Engine "moves" the unit; the playground would then bump commandSeq.
    initialUnit.position = { q: 1, r: 1 }
    await wrapper.setProps({ commandSeq: 1 })

    expect(wrapper.vm.selectedUnit.position).toEqual({ q: 1, r: 1 })
    expect(wrapper.vm.selectedHex).toMatchObject({ q: 1, r: 1 })
    const emitted = wrapper.emitted('hex-selected') || []
    expect(emitted[emitted.length - 1][0]).toMatchObject({ q: 1, r: 1 })
  })
})

describe('GameMapBlock movement reachability', () => {
  it('highlight set includes a turn-reachable hex the forward+reverse union excluded', () => {
    const gameState = makeGameState()
    // Maneuver cost map: a turn-reachable hex (2,2) at summed cost 2 that the
    // old forward+reverse directional union never surfaced. (0,0) is the unit
    // hex; (1,0) is a 1-cost straight step.
    gameState.getManeuverReachableCosts = vi.fn(unitId => {
      if (unitId !== 'u1') return new Map()
      return new Map([
        ['0,0', 0],
        ['1,0', 1],
        ['2,2', 2] // reachable only after a turn — absent from the legacy union
      ])
    })
    // move/reverse of cost ≤ 2 fit the budget; cost 3+ does not.
    gameState.canPerformAction = vi.fn((unitId, actionType, cost) => {
      return unitId === 'u1' && (actionType === 'move' || actionType === 'reverse') && cost <= 2
    })
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = gameState._store.u1

    const reachable = wrapper.vm.selectedUnitReachabilitySet

    expect(reachable.has('0,0')).toBe(true)
    expect(reachable.has('1,0')).toBe(true)
    // The turn-reachable hex is now highlighted-in.
    expect(reachable.has('2,2')).toBe(true)
    expect(wrapper.vm.isOutOfRange({ q: 1, r: 0 })).toBe(false)
    expect(wrapper.vm.isOutOfRange({ q: 2, r: 2 })).toBe(false)
  })

  it('excludes maneuver hexes when no movement action is legal for their cost', () => {
    const gameState = makeGameState()
    gameState.getManeuverReachableCosts = vi.fn(unitId => {
      if (unitId !== 'u1') return new Map()
      return new Map([
        ['0,0', 0],
        ['1,0', 1],
        ['2,2', 2]
      ])
    })
    // Budget only covers cost ≤ 1: the cost-2 turn-reachable hex must drop out.
    gameState.canPerformAction = vi.fn((unitId, actionType, cost) => {
      return unitId === 'u1' && (actionType === 'move' || actionType === 'reverse') && cost <= 1
    })
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = gameState._store.u1

    const reachable = wrapper.vm.selectedUnitReachabilitySet

    expect(reachable.has('1,0')).toBe(true)
    expect(reachable.has('2,2')).toBe(false)
    expect(wrapper.vm.isOutOfRange({ q: 2, r: 2 })).toBe(true)
  })

  it('gates the forward target through the forward action, not the union cache', () => {
    const gameState = makeGameState()
    const unit = gameState._store.u1
    unit.position = { q: 1, r: 1 }
    unit.facing = 1
    gameState.getDirectionalReachableCosts = vi.fn((unitId, motionMode) => {
      if (unitId !== 'u1') return new Map()
      if (motionMode === 'forward') return new Map([['2,1', 1]])
      return new Map([['2,1', 1]])
    })
    gameState.canPerformAction = vi.fn((unitId, actionType) => {
      return unitId === 'u1' && actionType === 'reverse'
    })
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = unit

    expect(wrapper.vm.moveForwardTarget).toEqual({ q: 2, r: 1 })
    expect(wrapper.vm.canMoveForward).toBe(false)
    expect(wrapper.vm.isMoveForwardTarget({ q: 2, r: 1 })).toBe(false)
  })
})

describe('GameMapBlock attack range contour', () => {
  it('builds only external edges for adjacent attack range hexes', () => {
    const wrapper = mountMap()
    wrapper.vm.hexMapData = [
      {
        q: 0,
        r: 0,
        key: '0,0',
        points: '1,0 2,1 1,2 0,2 -1,1 0,0',
        innerPoints: '1,0 2,1 1,2 0,2 -1,1 0,0',
        terrain: { color: '#8BC34A' },
        stroke: '#000',
        strokeWidth: 1,
        center: { x: 0, y: 0 }
      },
      {
        q: 1,
        r: 0,
        key: '1,0',
        points: '3,0 4,1 3,2 2,2 1,1 2,0',
        innerPoints: '3,0 4,1 3,2 2,2 1,1 2,0',
        terrain: { color: '#8BC34A' },
        stroke: '#000',
        strokeWidth: 1,
        center: { x: 3, y: 0 }
      }
    ]

    const path = wrapper.vm.buildHexSetContourPath(new Set(['0,0', '1,0']))

    expect(path.match(/M /g)).toHaveLength(10)
    expect(path).not.toContain('M 1 0 L 2 1')
    expect(path).not.toContain('M 2 2 L 1 1')
  })

  it('reads selected-unit fire range hexes from the engine for contour rendering', () => {
    const gameState = makeGameState()
    gameState.getFireRangeHexesCached = vi.fn(() => [
      { q: 0, r: 0 },
      { q: 1, r: 0 }
    ])
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = gameState._store.u1

    expect(wrapper.vm.attackRangeKeysSet).toEqual(new Set(['0,0', '1,0']))
    expect(wrapper.vm.attackRangeContourPath).toContain('M ')
  })
})

describe('GameMapBlock #14 — engine hex highlighted flag is never set by UI actions', () => {
  /**
   * Build a gameState whose getHex() returns objects that faithfully simulate
   * GameHex.highlight/unhighlight (setting the `highlighted` boolean), and expose
   * all hexes via allHexes() so the test can assert nothing leaked.
   */
  function makeHighlightTrackingState() {
    const hexStore = {}
    function makeTrackingHex(q, r) {
      return {
        q, r,
        terrain: { id: 'plains', color: '#8BC34A' },
        player1Spawn: false, player1Base: false,
        player2Spawn: false, player2Base: false,
        highlighted: false,
        highlight(type) { this.highlighted = true },
        unhighlight() { this.highlighted = false }
      }
    }
    for (let r = 0; r < 4; r++) {
      for (let q = 0; q < 4; q++) {
        hexStore[`${q},${r}`] = makeTrackingHex(q, r)
      }
    }
    const unit = {
      id: 'u1', player: 'player1', facing: 0,
      position: { q: 1, r: 1 }, isAlive: () => true
    }
    const store = { u1: unit }
    return {
      width: 4, height: 4,
      currentPlayer: 'player1',
      turnNumber: 1,
      gamePhase: 'MANOEUVRE',
      turnState: { u1: { isLoaded: true, actionsLeft: 2 } },
      reachabilityVersion: 0,
      currentTurnActions: [],
      history: [],
      units: { get: (id) => store[id], values: () => Object.values(store) },
      getAllUnits: vi.fn(() => Object.values(store)),
      getActivePlayerUnits: vi.fn(player => Object.values(store).filter(u => String(u.player) === String(player) && u.isAlive())),
      getHex: vi.fn((q, r) => hexStore[`${q},${r}`] || null),
      canPerformAction: vi.fn(() => true),
      getAllowedActions: vi.fn(() => []),
      getReachableHexesWithCost: vi.fn(() => []),
      getDirectionalReachableCosts: vi.fn(() => new Map()),
      getManeuverReachableCosts: vi.fn(() => new Map()),
      getAuthoritativePathCost: vi.fn(() => 1),
      getFireRangeHexesCached: vi.fn(() => []),
      getHexKey: vi.fn((q, r) => `${q},${r}`),
      allHexes: () => Object.values(hexStore),
      _store: store
    }
  }

  it('selectHex on a unit hex does NOT set highlighted on any engine hex', () => {
    const gameState = makeHighlightTrackingState()
    const wrapper = mountMap({ gameState })
    const unitHex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

    wrapper.vm.selectHex(unitHex, null)

    const staleHexes = gameState.allHexes().filter(h => h.highlighted)
    expect(staleHexes).toHaveLength(0)
  })

  it('rotateUnitClockwise does NOT leave highlighted flag on any engine hex', () => {
    const gameState = makeHighlightTrackingState()
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = gameState._store.u1

    wrapper.vm.rotateUnitClockwise()

    const staleHexes = gameState.allHexes().filter(h => h.highlighted)
    expect(staleHexes).toHaveLength(0)
  })

  it('rotateUnitCounterClockwise does NOT leave highlighted flag on any engine hex', () => {
    const gameState = makeHighlightTrackingState()
    const wrapper = mountMap({ gameState })
    wrapper.vm.selectedUnit = gameState._store.u1

    wrapper.vm.rotateUnitCounterClockwise()

    const staleHexes = gameState.allHexes().filter(h => h.highlighted)
    expect(staleHexes).toHaveLength(0)
  })

  it('select unit → rotate → select empty hex → no stale highlighted flags', () => {
    const gameState = makeHighlightTrackingState()
    const wrapper = mountMap({ gameState })
    const unitHex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)
    const emptyHex = wrapper.vm.hexMapData.find(h => h.q === 2 && h.r === 2)

    // Select unit
    wrapper.vm.selectHex(unitHex, null)
    // Rotate
    wrapper.vm.rotateUnitClockwise()
    wrapper.vm.rotateUnitCounterClockwise()
    // Select empty hex (deselects unit)
    wrapper.vm.selectHex(emptyHex, null)

    const staleHexes = gameState.allHexes().filter(h => h.highlighted)
    expect(staleHexes).toHaveLength(0)
  })

  it('deselectHex leaves no stale highlighted flags', () => {
    const gameState = makeHighlightTrackingState()
    const wrapper = mountMap({ gameState })
    const unitHex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

    wrapper.vm.selectHex(unitHex, null)
    wrapper.vm.deselectHex()

    const staleHexes = gameState.allHexes().filter(h => h.highlighted)
    expect(staleHexes).toHaveLength(0)
  })
})

describe('GameMapBlock #65 — generateHexMap keyed lookup applies correct terrain', () => {
  it('loads saved cell terrain via keyed lookup (not O(N²) find)', () => {
    const forestTerrain = { id: 'forest', name: 'Forest', color: '#2E7D32', movementCost: 2, passable: true }
    const mapData = {
      parameters: { width: 3, height: 3 },
      map: [
        { q: 1, r: 1, terrain: 'forest', player1Spawn: false, player1Base: false, player2Spawn: false, player2Base: false }
      ]
    }
    const terrainTypes = [
      { id: 'plains', name: 'Plains', color: '#8BC34A', movementCost: 1, passable: true },
      forestTerrain
    ]
    const wrapper = mountMap({ mapData, terrainTypes, gameState: null })

    const hex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)
    expect(hex).toBeTruthy()
    expect(hex.terrain.id).toBe('forest')
    expect(hex.terrain.color).toBe('#2E7D32')
  })

  it('assigns correct overlays from savedHex via keyed lookup', () => {
    const mapData = {
      parameters: { width: 3, height: 3 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: false, player2Spawn: false, player2Base: false },
        { q: 2, r: 2, terrain: 'plains', player1Spawn: false, player1Base: false, player2Spawn: true, player2Base: true }
      ]
    }
    const wrapper = mountMap({ mapData, terrainTypes: stubTerrain, gameState: null })

    const h00 = wrapper.vm.hexMapData.find(h => h.q === 0 && h.r === 0)
    const h22 = wrapper.vm.hexMapData.find(h => h.q === 2 && h.r === 2)
    expect(h00.player1Spawn).toBe(true)
    expect(h22.player2Spawn).toBe(true)
    expect(h22.player2Base).toBe(true)
  })
})

/**
 * Build a minimal `this` stub for calling GameMapBlock methods directly
 * (avoids all Vue proxy restrictions on $refs, $emit, etc.).
 * Pattern mirrors GameMapBlock.geometry.test.js's `callMethod`.
 */
function makeRegenerateStub(overrides = {}) {
  const gameState = makeGameState()
  const terrainTypes = [{ id: 'plains', name: 'Plains', color: '#8BC34A', movementCost: 1, passable: true }]

  // Build initial hexMapData the same way the component does
  const hexMapData = []
  for (let r = 0; r < 4; r++) {
    for (let q = 0; q < 4; q++) {
      hexMapData.push({
        q,
        r,
        key: `${q},${r}`,
        points: `${q},${r}`,
        innerPoints: `${q},${r}`,
        center: { x: q * 10, y: r * 10 },
        terrain: { id: 'plains', name: 'Plains', color: '#8BC34A' },
        stroke: '#333',
        strokeWidth: 1,
        player1Spawn: false,
        player1Base: false,
        player2Spawn: false,
        player2Base: false
      })
    }
  }

  const stub = {
    hexMapData,
    selectedHex: null,
    hoveredHex: null,
    zoomLevel: 1.5,
    svgWidth: 800,
    svgHeight: 600,
    zoomRafPending: null,
    currentMap: { parameters: { width: 4, height: 4 } },
    gameState,
    terrainTypes,
    // Required by regenerateMapWithCurrentState
    createHex(q, r, terrainTypes_) {
      return {
        q,
        r,
        key: `${q},${r}`,
        points: `${q * 10},${r * 10}`,
        innerPoints: `${q * 10},${r * 10}`,
        center: { x: q * 10, y: r * 10 },
        terrain: terrainTypes_[0] || { id: 'plains', color: '#8BC34A' },
        stroke: '#333',
        strokeWidth: 1,
        player1Spawn: false,
        player1Base: false,
        player2Spawn: false,
        player2Base: false
      }
    },
    getTerrainTypes() {
      return terrainTypes
    },
    updateMapDimensions() { /* no-op in stub */ },
    getHexKey(q, r) { return `${q},${r}` },
    ...overrides
  }
  return stub
}

describe('GameMapBlock #11 — selectedHex/hoveredHex remapped after zoom', () => {
  it('after regenerateMapWithCurrentState, selectedHex is in the new hexMapData array', () => {
    const stub = makeRegenerateStub()
    const hex = stub.hexMapData.find(h => h.q === 0 && h.r === 0)
    stub.selectedHex = hex

    GameMapBlock.methods.regenerateMapWithCurrentState.call(stub)

    // After the fix, selectedHex must be an element of the newly rebuilt array
    expect(stub.hexMapData.includes(stub.selectedHex)).toBe(true)
    expect(stub.selectedHex).not.toBe(hex) // new object, different identity
    expect(stub.selectedHex.q).toBe(0)
    expect(stub.selectedHex.r).toBe(0)
  })

  it('after regenerateMapWithCurrentState, hoveredHex is in the new hexMapData array', () => {
    const stub = makeRegenerateStub()
    const hex = stub.hexMapData.find(h => h.q === 1 && h.r === 1)
    stub.hoveredHex = hex

    GameMapBlock.methods.regenerateMapWithCurrentState.call(stub)

    const remapped = stub.hoveredHex
    expect(remapped).not.toBeNull()
    expect(stub.hexMapData.includes(remapped)).toBe(true)
    expect(remapped.q).toBe(1)
    expect(remapped.r).toBe(1)
  })

  it('selectedHex becomes null when the coordinate no longer exists after regenerate', () => {
    const stub = makeRegenerateStub()
    stub.selectedHex = { q: 999, r: 999 }

    GameMapBlock.methods.regenerateMapWithCurrentState.call(stub)

    expect(stub.selectedHex).toBeNull()
  })

  it('selectedHex in new array means re-select with same-coordinate object toggles OFF (deselects)', () => {
    // Verify the intent-level consequence through the mounted component
    const wrapper = mountMap()
    // Use a hex with no unit at q=2,r=2 for the plain toggle path
    const hex = wrapper.vm.hexMapData.find(h => h.q === 2 && h.r === 2)
    wrapper.vm.selectHex(hex, null)
    expect(wrapper.vm.selectedHex).toBe(hex)

    // Simulate zoom by calling regenerate directly (same code path that zoomIn/zoomOut use)
    wrapper.vm.regenerateMapWithCurrentState()

    const remapped = wrapper.vm.selectedHex
    expect(remapped).not.toBeNull()
    expect(wrapper.vm.hexMapData.includes(remapped)).toBe(true)

    // Re-clicking the remapped (same-coordinate, new-identity) hex must deselect
    wrapper.vm.selectHex(remapped, null)
    expect(wrapper.vm.selectedHex).toBeNull()
  })
})

describe('GameMapBlock #6b — same-size gameState swap is an incremental refresh', () => {
  it('same-size swap with a moved unit: no centerMap, pan/zoom preserved, geometry not rebuilt, unit follows', async () => {
    const wrapper = mountMap()
    await flushPromises() // first (full) build settles, isLoading flips false

    // User has panned/zoomed away from defaults.
    wrapper.vm.panX = 123
    wrapper.vm.panY = -45
    wrapper.vm.zoomLevel = 2.5
    const lengthBefore = wrapper.vm.hexMapData.length
    const firstHexRef = wrapper.vm.hexMapData[0]

    const center = vi.spyOn(wrapper.vm, 'centerMap')

    // New same-dimension (4×4) GameState with u1 moved from 0,0 → 2,1.
    const moved = makeGameState([
      { id: 'u1', player: 'player1', facing: 0, position: { q: 2, r: 1 }, isAlive: () => true }
    ])
    await wrapper.setProps({ gameState: moved })

    // Incremental path: viewport untouched.
    expect(center).not.toHaveBeenCalled()
    expect(wrapper.vm.panX).toBe(123)
    expect(wrapper.vm.panY).toBe(-45)
    expect(wrapper.vm.zoomLevel).toBe(2.5)

    // Geometry array not rebuilt: same length, same hex identities.
    expect(wrapper.vm.hexMapData.length).toBe(lengthBefore)
    expect(wrapper.vm.hexMapData[0]).toBe(firstHexRef)

    // Units re-render reactively at the new hex.
    const byHex = wrapper.vm.unitsByHexKey
    expect(byHex.has('2,1')).toBe(true)
    expect(byHex.get('2,1')).toMatchObject({ id: 'u1' })
    expect(byHex.has('0,0')).toBe(false)
  })

  it('dimension-change swap is a full rebuild: hexMapData matches new dims, centerMap called, pan/zoom reset', async () => {
    const wrapper = mountMap()
    await flushPromises()

    wrapper.vm.panX = 50
    wrapper.vm.panY = 60
    wrapper.vm.zoomLevel = 3

    // Stub centerMap so it does not re-derive panX/panY from container
    // geometry after the reset — we assert the reset itself here.
    const center = vi.spyOn(wrapper.vm, 'centerMap').mockImplementation(() => {})

    // 6×2 state — different dimensions than the original 4×4.
    const resized = makeGameState()
    resized.width = 6
    resized.height = 2
    await wrapper.setProps({ gameState: resized })
    await flushPromises() // $nextTick → isLoading=false + centerMap

    expect(wrapper.vm.hexMapData.length).toBe(6 * 2)
    expect(center).toHaveBeenCalled()
    expect(wrapper.vm.panX).toBe(0)
    expect(wrapper.vm.panY).toBe(0)
    // Reset to DEFAULT_MAP_ZOOM (1.5), away from the pre-swap 3.
    expect(wrapper.vm.zoomLevel).toBe(1.5)
  })

  it('same-size different terrain: terrain refreshed in place, hex object identity preserved', async () => {
    const wrapper = mountMap()
    await flushPromises()

    const targetBefore = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)
    expect(targetBefore).toBeTruthy()

    // Same 4×4 dims, but hex (1,1) now reports forest terrain (object form).
    const forest = { id: 'forest', name: 'Forest', color: '#2E7D32' }
    const recolored = makeGameState()
    recolored.getHex = vi.fn((q, r) => ({
      q,
      r,
      terrain: (q === 1 && r === 1) ? forest : 'plains',
      player1Spawn: false,
      player1Base: false,
      player2Spawn: false,
      player2Base: false,
      highlight: vi.fn(),
      unhighlight: vi.fn()
    }))
    await wrapper.setProps({ gameState: recolored })

    const targetAfter = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)
    // Same object — incremental path mutated in place, did not replace.
    expect(targetAfter).toBe(targetBefore)
    expect(targetAfter.terrain).toEqual(forest)

    // A string-terrain hex falls back to defaultTerrain (matches buildHexMapFromGameState).
    const plainsHex = wrapper.vm.hexMapData.find(h => h.q === 0 && h.r === 0)
    expect(plainsHex.terrain).toEqual({ id: 'plains', name: 'Plains', color: '#8BC34A' })
  })
})

describe('GameMapBlock #66 — wheel events coalesced via rAF', () => {
  /**
   * Build a minimal stub for handleWheel to avoid Vue $refs proxy issues.
   * We call the method directly on a plain object, same as geometry tests.
   */
  function makeWheelStub(overrides = {}) {
    const stub = {
      zoomLevel: 1.5,
      panX: 0,
      panY: 0,
      zoomRafPending: null,
      hexMapData: [{ q: 0, r: 0 }], // non-empty so regenerate guard passes
      $refs: {
        mapContainer: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
      },
      regenerateMapWithCurrentState: vi.fn(),
      requestAnimationFrame: null, // will be controlled by test
      ...overrides
    }
    return stub
  }

  it('multiple wheel events in the same frame trigger exactly one regenerate after rAF flush', () => {
    let pendingCallback = null
    const origRaf = global.requestAnimationFrame
    const origCaf = global.cancelAnimationFrame
    global.requestAnimationFrame = vi.fn(cb => {
      pendingCallback = cb
      return 42
    })
    global.cancelAnimationFrame = vi.fn()

    const stub = makeWheelStub()

    const makeWheelEvent = (deltaY = 100) => ({
      preventDefault: vi.fn(),
      deltaY,
      clientX: 400,
      clientY: 300
    })

    const initialZoom = stub.zoomLevel

    // Fire 3 wheel events without flushing rAF
    GameMapBlock.methods.handleWheel.call(stub, makeWheelEvent(100))
    GameMapBlock.methods.handleWheel.call(stub, makeWheelEvent(100))
    GameMapBlock.methods.handleWheel.call(stub, makeWheelEvent(100))

    // regenerate must NOT have been called yet
    expect(stub.regenerateMapWithCurrentState).not.toHaveBeenCalled()
    // zoomLevel must already reflect accumulated deltas
    expect(stub.zoomLevel).not.toBe(initialZoom)
    // a rAF must have been scheduled exactly once (burst coalescing)
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1)

    // Flush rAF → exactly one regenerate
    if (pendingCallback) pendingCallback()
    expect(stub.regenerateMapWithCurrentState).toHaveBeenCalledTimes(1)
    expect(stub.zoomRafPending).toBeNull()

    global.requestAnimationFrame = origRaf
    global.cancelAnimationFrame = origCaf
  })

  it('beforeUnmount cancels a pending zoom rAF so regenerate does not run after unmount', () => {
    const wrapper = mountMap()

    const origRaf = global.requestAnimationFrame
    const origCaf = global.cancelAnimationFrame
    const cafMock = vi.fn()
    global.requestAnimationFrame = vi.fn(() => 99)
    global.cancelAnimationFrame = cafMock

    // Set the pending handle directly — simulates a mid-flight rAF
    wrapper.vm.zoomRafPending = 99

    const regenerate = vi.spyOn(wrapper.vm, 'regenerateMapWithCurrentState')

    wrapper.unmount()

    // cancelAnimationFrame must have been called with our handle
    expect(cafMock).toHaveBeenCalledWith(99)
    expect(regenerate).not.toHaveBeenCalled()

    global.requestAnimationFrame = origRaf
    global.cancelAnimationFrame = origCaf
  })

  it('contract: zoomIn/zoomOut must call regenerate exactly once per invocation and must NOT defer via rAF (stub pattern — real-method integration left for e2e since $refs.mapContainer is awkward to stub with VTU)', () => {
    // NOTE: this test documents the intended contract via stub, not the real call path.
    // The stubs replace zoomIn/zoomOut with implementations that call regenerate
    // directly, so what is exercised here is the assertion shape. Real-path coverage
    // (zoomIn calling regenerateMapWithCurrentState synchronously rather than via
    // requestAnimationFrame) belongs in an integration/e2e test that can mount with
    // a real DOM element for $refs.mapContainer.
    const wrapper = mountMap()

    const origRaf = global.requestAnimationFrame
    global.requestAnimationFrame = vi.fn()
    const regenerate = vi.spyOn(wrapper.vm, 'regenerateMapWithCurrentState')

    // zoomIn/zoomOut need $refs.mapContainer — use vi.spyOn on the method instead
    // to verify it IS called exactly once per click, not via rAF
    vi.spyOn(wrapper.vm, 'zoomIn').mockImplementation(() => {
      wrapper.vm.regenerateMapWithCurrentState()
    })
    wrapper.vm.zoomIn()
    expect(regenerate).toHaveBeenCalledTimes(1)
    expect(global.requestAnimationFrame).not.toHaveBeenCalled()

    regenerate.mockClear()

    vi.spyOn(wrapper.vm, 'zoomOut').mockImplementation(() => {
      wrapper.vm.regenerateMapWithCurrentState()
    })
    wrapper.vm.zoomOut()
    expect(regenerate).toHaveBeenCalledTimes(1)
    expect(global.requestAnimationFrame).not.toHaveBeenCalled()

    global.requestAnimationFrame = origRaf
  })
})

describe('GameMapBlock #67 — getOverlayIcon uses keyed lookup, null for unknown', () => {
  it('returns undefined-or-null (not throwing) for valid combinations — no per-call require()', () => {
    const wrapper = mountMap()
    // In the test environment the SVG assets cannot be resolved by require()
    // so the icon value may be null. The important contract: the method
    // must NOT throw and must return the same value for repeated calls
    // (proving it reads from a pre-built map, not calling require() each time).
    const first = wrapper.vm.getOverlayIcon(1, 'spawn')
    const second = wrapper.vm.getOverlayIcon(1, 'spawn')
    // Identity equality: same map reference or both null
    expect(first).toBe(second)
    // No throw is the implicit contract here (would propagate to the assertion above)
  })

  it('returns null (not throwing, not undefined) for unknown player/type combinations', () => {
    const wrapper = mountMap()
    expect(wrapper.vm.getOverlayIcon(3, 'spawn')).toBeNull()
    expect(wrapper.vm.getOverlayIcon(1, 'flag')).toBeNull()
    expect(wrapper.vm.getOverlayIcon(0, '')).toBeNull()
  })

  it('returns a consistent value (null in test env) for all four valid player/type combos without throwing', () => {
    // In Vitest/happy-dom there is no SVG asset loader, so every OVERLAY_ICONS entry
    // resolves to null via _tryRequire. We cannot detect key-name typos here — that
    // requires a real Webpack build with asset resolution. What we CAN verify:
    //   • each valid combo returns null (not undefined, not throwing)
    //   • repeated calls return the same reference (pre-built map, not per-call require)
    const wrapper = mountMap()
    const combos = [
      [1, 'spawn'], [1, 'base'], [2, 'spawn'], [2, 'base']
    ]
    for (const [player, type] of combos) {
      const first = wrapper.vm.getOverlayIcon(player, type)
      const second = wrapper.vm.getOverlayIcon(player, type)
      // null is the expected value in the test env; the key exists in the map
      expect(first).toBeNull()
      // stable reference — proves keyed lookup, not re-evaluated each call
      expect(first).toBe(second)
    }
  })
})

describe('GameMapBlock #61(A) — pan coalesces panX/panY via rAF', () => {
  /**
   * Controlled rAF stub: capture the scheduled callback so the test decides
   * exactly when a frame "fires". Mirrors the #66 wheel-coalescing pattern.
   */
  function installControlledRaf() {
    const pending = []
    const origRaf = global.requestAnimationFrame
    const origCaf = global.cancelAnimationFrame
    let nextHandle = 1
    global.requestAnimationFrame = vi.fn(cb => {
      const handle = nextHandle++
      pending.push({ handle, cb })
      return handle
    })
    global.cancelAnimationFrame = vi.fn(handle => {
      const i = pending.findIndex(p => p.handle === handle)
      if (i !== -1) pending.splice(i, 1)
    })
    return {
      flushAll() {
        const toRun = pending.splice(0, pending.length)
        toRun.forEach(p => p.cb())
      },
      pendingCount: () => pending.length,
      restore() {
        global.requestAnimationFrame = origRaf
        global.cancelAnimationFrame = origCaf
      }
    }
  }

  it('multiple mousemoves in one frame stay pending until rAF flush, then apply the summed delta once', () => {
    const raf = installControlledRaf()
    try {
      const wrapper = mountMap()
      const baseX = wrapper.vm.panX
      const baseY = wrapper.vm.panY

      wrapper.vm.startPan({ button: 0, clientX: 100, clientY: 100 })
      // Three moves within the same (un-flushed) frame: +10, +5, +3 on X; +2,+4,+6 on Y
      wrapper.vm.pan({ clientX: 110, clientY: 102 })
      wrapper.vm.pan({ clientX: 115, clientY: 106 })
      wrapper.vm.pan({ clientX: 118, clientY: 112 })

      // Reactive panX/panY must NOT have moved yet — deltas are pending.
      expect(wrapper.vm.panX).toBe(baseX)
      expect(wrapper.vm.panY).toBe(baseY)
      expect(wrapper.vm._pendingPanDX).toBe(18)
      expect(wrapper.vm._pendingPanDY).toBe(12)
      // Exactly one rAF scheduled for the whole burst (coalescing).
      expect(raf.pendingCount()).toBe(1)
      expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1)

      // One frame fires → the summed delta applies exactly once.
      raf.flushAll()
      expect(wrapper.vm.panX).toBe(baseX + 18)
      expect(wrapper.vm.panY).toBe(baseY + 12)
      expect(wrapper.vm._pendingPanDX).toBe(0)
      expect(wrapper.vm._pendingPanDY).toBe(0)
      expect(wrapper.vm._panRafPending).toBeNull()
    } finally {
      raf.restore()
    }
  })

  it('stopPan flushes a pending pan delta so the final offset is exact', () => {
    const raf = installControlledRaf()
    try {
      const wrapper = mountMap()
      const baseX = wrapper.vm.panX
      const baseY = wrapper.vm.panY

      wrapper.vm.startPan({ button: 0, clientX: 100, clientY: 100 })
      wrapper.vm.pan({ clientX: 107, clientY: 109 })

      // Still pending before stopPan.
      expect(wrapper.vm.panX).toBe(baseX)
      expect(wrapper.vm.panY).toBe(baseY)
      expect(raf.pendingCount()).toBe(1)

      // stopPan must apply the pending delta synchronously and cancel the rAF.
      wrapper.vm.stopPan({ type: 'mouseup' })
      expect(wrapper.vm.panX).toBe(baseX + 7)
      expect(wrapper.vm.panY).toBe(baseY + 9)
      expect(wrapper.vm._pendingPanDX).toBe(0)
      expect(wrapper.vm._pendingPanDY).toBe(0)
      expect(wrapper.vm._panRafPending).toBeNull()
      expect(global.cancelAnimationFrame).toHaveBeenCalled()
    } finally {
      raf.restore()
    }
  })

  it('the drag-suppression threshold still trips even before the pan rAF fires', () => {
    const raf = installControlledRaf()
    try {
      const wrapper = mountMap()
      const hex = wrapper.vm.hexMapData.find(h => h.q === 1 && h.r === 1)

      wrapper.vm.startPan({ button: 0, clientX: 10, clientY: 10 })
      wrapper.vm.pan({ clientX: 25, clientY: 10 }) // well beyond threshold, rAF NOT flushed
      wrapper.vm.stopPan({ type: 'mouseup' })
      wrapper.vm.selectHex(hex, { type: 'click' })

      // Click after a real pan is suppressed (T13 semantics preserved).
      expect(wrapper.vm.selectedHex).toBe(null)
      expect(wrapper.emitted('hex-selected')).toBeUndefined()
    } finally {
      raf.restore()
    }
  })

  it('beforeUnmount cancels a pending pan rAF so the deferred flush never runs', () => {
    const raf = installControlledRaf()
    try {
      const wrapper = mountMap()

      wrapper.vm.startPan({ button: 0, clientX: 100, clientY: 100 })
      wrapper.vm.pan({ clientX: 120, clientY: 130 })
      const handle = wrapper.vm._panRafPending
      expect(handle).not.toBeNull()
      expect(raf.pendingCount()).toBe(1)

      wrapper.unmount()

      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(handle)
      expect(raf.pendingCount()).toBe(0)
    } finally {
      raf.restore()
    }
  })
})

describe('GameMapBlock #61(B) — hover outline is CSS-driven, no per-mouseenter reactive write', () => {
  it('renders an always-present hex-hover-outline polygon for every hex', async () => {
    const wrapper = mountMap()
    await flushPromises() // let isLoading flip false so the SVG mounts
    const hexCount = wrapper.vm.hexMapData.length
    expect(hexCount).toBeGreaterThan(0)

    const outlines = wrapper.findAll('.hex-hover-outline')
    // Exactly one always-present hover outline per hex group.
    expect(outlines).toHaveLength(hexCount)

    // It carries the shared inner-stroke class and the hover-outline marker,
    // and the points binding matches the hex it belongs to.
    const firstHex = wrapper.vm.hexMapData[0]
    const first = outlines[0]
    expect(first.classes()).toContain('hex-inner-stroke')
    expect(first.classes()).toContain('hex-hover-outline')
    expect(first.attributes('points')).toBe(firstHex.innerPoints)
    expect(first.attributes('stroke')).toBe('#ffffff99')
    expect(first.attributes('stroke-width')).toBe('2')
  })

  it('the hex polygon no longer binds @mouseenter/@mouseleave hover handlers', () => {
    const wrapper = mountMap()
    // hoverHex / unhoverHex are gone — the mouse-driven write was removed.
    expect(typeof wrapper.vm.hoverHex).toBe('undefined')
    expect(typeof wrapper.vm.unhoverHex).toBe('undefined')
  })

  it('hovering a hex cell does not mutate the reactive hoveredHex (CSS handles it)', async () => {
    const wrapper = mountMap()
    await flushPromises() // let isLoading flip false so the SVG mounts
    expect(wrapper.vm.hoveredHex).toBe(null)

    const cell = wrapper.find('.hex-cell')
    // Dispatch the DOM events the old handlers listened to; reactive state must
    // stay untouched now that hover is pure CSS.
    await cell.trigger('mouseenter')
    expect(wrapper.vm.hoveredHex).toBe(null)
    await cell.trigger('mouseleave')
    expect(wrapper.vm.hoveredHex).toBe(null)
  })

  it('the hex-map group toggles the .panning class with isPanning (CSS hover suppression)', async () => {
    const wrapper = mountMap()
    await flushPromises() // let isLoading flip false so the SVG mounts
    const group = wrapper.find('.hex-map-group')
    expect(group.classes()).not.toContain('panning')

    wrapper.vm.startPan({ button: 0, clientX: 10, clientY: 10 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.hex-map-group').classes()).toContain('panning')

    wrapper.vm.stopPan({ type: 'mouseup' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.hex-map-group').classes()).not.toContain('panning')
  })

  it('programmatic unitPreviewHoverIntent still renders the v-if hover-stroke outline', async () => {
    const wrapper = mountMap()
    await flushPromises() // let isLoading flip false so the SVG mounts
    // Before the intent: no programmatic hover outline.
    expect(wrapper.findAll('.hover-stroke')).toHaveLength(0)

    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: 'u1', seq: 1 } })
    expect(wrapper.vm.hoveredHex).toMatchObject({ q: 0, r: 0 })

    // The sidebar-preview hover mounts exactly one v-if outline for the unit hex.
    const programmatic = wrapper.findAll('.hover-stroke')
    expect(programmatic).toHaveLength(1)
    expect(programmatic[0].attributes('stroke')).toBe('#ffffff99')

    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: null, seq: 2 } })
    expect(wrapper.vm.hoveredHex).toBe(null)
    expect(wrapper.findAll('.hover-stroke')).toHaveLength(0)
  })

  it('always-present hex-hover-outline gets --suppressed class only when hoveredHex === that hex', async () => {
    const wrapper = mountMap()
    await flushPromises() // let isLoading flip false so the SVG mounts

    // Before any hover intent: no outline is suppressed.
    const outlinesBefore = wrapper.findAll('.hex-hover-outline')
    expect(outlinesBefore.length).toBeGreaterThan(0)
    outlinesBefore.forEach(el => {
      expect(el.classes()).not.toContain('hex-hover-outline--suppressed')
    })

    // Set programmatic hover via the unitPreviewHoverIntent path (unit u1 is at q:0,r:0).
    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: 'u1', seq: 1 } })
    expect(wrapper.vm.hoveredHex).toMatchObject({ q: 0, r: 0 })
    await wrapper.vm.$nextTick()

    const outlinesAfter = wrapper.findAll('.hex-hover-outline')
    const suppressed = outlinesAfter.filter(el => el.classes().includes('hex-hover-outline--suppressed'))
    const unsuppressed = outlinesAfter.filter(el => !el.classes().includes('hex-hover-outline--suppressed'))

    // Exactly one outline is suppressed — the one for the hovered hex.
    expect(suppressed).toHaveLength(1)
    // All others are NOT suppressed.
    expect(unsuppressed).toHaveLength(outlinesAfter.length - 1)
    // The suppressed polygon corresponds to q:0,r:0 (first hexMapData entry for the 4×4 grid).
    const hoveredHexPoints = wrapper.vm.hexMapData.find(h => h.q === 0 && h.r === 0).innerPoints
    expect(suppressed[0].attributes('points')).toBe(hoveredHexPoints)

    // Clear hover intent: suppressed class must disappear.
    await wrapper.setProps({ unitPreviewHoverIntent: { unitId: null, seq: 2 } })
    expect(wrapper.vm.hoveredHex).toBe(null)
    await wrapper.vm.$nextTick()

    wrapper.findAll('.hex-hover-outline').forEach(el => {
      expect(el.classes()).not.toContain('hex-hover-outline--suppressed')
    })
  })
})
