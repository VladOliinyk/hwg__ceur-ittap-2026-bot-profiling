// @vitest-environment happy-dom
/**
 * T23 / Finding #48 — damage attribution via action.player (primary path)
 *
 * Verifies that outcomeStats attributes damage to action.player regardless of unitId shape,
 * and that the removed regex fallback is no longer engaged for ids that would have matched it
 * but lack action.player AND are absent from unitPlayerMap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { loadLevelPackage } from '../../domain/level/loadLevelPackage'
import { loadLevelArchivePackage } from '../../domain/level/loadLevelArchivePackage'
import { clearGameState } from '../../utils/gamePersistence'
import {
  BUILDER_PLAYTEST_STORAGE_KEY
} from '../../domain/level/builderPlaytestLevels'
import Playground from '../Playground.vue'

vi.mock('../../domain/level/loadLevelPackage', () => ({ loadLevelPackage: vi.fn() }))
vi.mock('../../domain/level/loadLevelArchivePackage', () => ({ loadLevelArchivePackage: vi.fn() }))

const stubChildren = {
  HeaderComponent: { name: 'HeaderComponent', props: ['showResetLayout'], emits: ['reset-layout'], template: '<div />' },
  MovesTableBlock: { props: ['movesData', 'gameState'], template: '<div />' },
  TimelineBlock: {
    name: 'TimelineBlock',
    props: ['gameState', 'levelPackage', 'rngSeed', 'isDiceRolling'],
    emits: ['end-turn', 'revert-game', 'import-history', 'show-outcome-dialog', 'roll-dice', 'instant-roll-dice'],
    template: '<div />'
  },
  GameMapBlock: {
    name: 'GameMapBlock',
    props: ['mapData', 'terrainTypes', 'gameState', 'gameController', 'selectedHexDropdownPosition',
      'showFloatingPanel', 'commandSeq', 'attackTargetShiftIntent', 'deselectIntent',
      'unitPreviewHoverIntent', 'unitPreviewSelectIntent', 'actionsDisabled'],
    emits: ['hex-selected', 'game-state-updated', 'update-selected-hex-dropdown-position',
      'update:showFloatingPanel', 'selection-inspector-bridge'],
    template: '<div />'
  },
  GameEngineBlock: {
    name: 'GameEngineBlock',
    props: ['selectedHex', 'mapData', 'gameState', 'movesData', 'gameController', 'isRestoring',
      'isInitializingGlobal', 'showFloatingPanel', 'selectionInspectorBridge', 'levelOptions',
      'selectedLevelId', 'seed', 'loadedPackage', 'loadedSource', 'loadedWarnings',
      'builderExportLevelId', 'canDeleteSelectedLevel', 'isStartingGame',
      'externalDiceRolling', 'diceRollIntent', 'diceRollRightIntent', 'diceCancelIntent'],
    emits: ['level-selected', 'seed-updated', 'load-selected-level',
      'upload-archive', 'export-loaded-builder-level', 'delete-selected-level', 'start-game',
      'game-state-updated', 'reset-game', 'dice-rolling-changed', 'end-turn', 'revert-game',
      'import-history', 'restart-game', 'deselect', 'update:showFloatingPanel',
      'move-unit-forward', 'move-unit-reverse', 'rotate-unit-clockwise', 'rotate-unit-counterclockwise',
      'fire', 'reload', 'attack-target-shift', 'unit-preview-hover', 'unit-preview-select'],
    methods: {
      onDiceClick() { this.$emit('dice-rolling-changed', true) },
      onDiceRightClick() { this.$emit('game-state-updated', this.gameState) },
      cancelDiceRoll() { this.$emit('dice-rolling-changed', false) }
    },
    watch: {
      diceRollIntent() { this.onDiceClick() },
      diceRollRightIntent() { this.onDiceRightClick() },
      diceCancelIntent() { this.cancelDiceRoll() }
    },
    template: '<div />'
  },
  SelectionBlock: {
    name: 'SelectionBlock',
    props: ['selectedHex', 'gameState', 'showFloatingPanel', 'selectionInspectorBridge', 'actionsDisabled'],
    emits: ['deselect', 'update:showFloatingPanel', 'move-unit-forward', 'move-unit-reverse',
      'rotate-unit-clockwise', 'rotate-unit-counterclockwise', 'fire', 'reload', 'attack-target-shift'],
    template: '<div />'
  }
}

beforeEach(() => {
  clearGameState()
  window.localStorage.removeItem('hexWarPlaygroundLayout')
  window.localStorage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  loadLevelPackage.mockReset()
  loadLevelArchivePackage.mockReset()
  window.$notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
})
afterEach(() => {
  window.localStorage.removeItem('hexWarPlaygroundLayout')
  window.localStorage.removeItem(BUILDER_PLAYTEST_STORAGE_KEY)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.$notify
})

async function mountPlayground(gameState) {
  const wrapper = mount(Playground, { global: { stubs: stubChildren } })
  if (gameState !== undefined) {
    await wrapper.setData({ gameState: markRaw(gameState) })
  }
  return wrapper
}

describe('Playground outcomeStats — attribution via action.player (#48)', () => {
  it('attributes damage to player2 when action.player is "player2" regardless of unitId shape', async () => {
    // unit id 'strange-unit-xyz' does NOT match any regex pattern and
    // IS in initialState with player:'player2' — primary path: action.player
    const gs = {
      turnNumber: 5,
      history: [[
        { type: 'attack', player: 'player2', unitId: 'strange-unit-xyz', damage: 42 }
      ]],
      currentTurnActions: [],
      initialState: {
        units: [
          ['strange-unit-xyz', { id: 'strange-unit-xyz', player: 'player2', health: 100, isActive: true }]
        ]
      },
      getAllUnits: vi.fn(() => []),
      outcome: { status: 'ended', winner: 'player2', reason: 'unitWipe', message: '' }
    }
    const wrapper = await mountPlayground(gs)
    const stats = wrapper.vm.outcomeStats
    expect(stats.damageByPlayer.player2).toBe(42)
    expect(stats.damageByPlayer.player1).toBe(0)
  })

  it('primary path: action.player overrides unitId — even if unitId looks like player1 prefix', async () => {
    // unitId 'p1_tank' would have matched the removed regex for player1,
    // but action.player says player2 → player2 wins.
    const gs = {
      turnNumber: 3,
      history: [[
        { type: 'attack', player: 'player2', unitId: 'p1_tank', damage: 20 }
      ]],
      currentTurnActions: [],
      initialState: { units: [] },
      getAllUnits: vi.fn(() => []),
      outcome: { status: 'ended', winner: 'player2', reason: 'unitWipe', message: '' }
    }
    const wrapper = await mountPlayground(gs)
    const stats = wrapper.vm.outcomeStats
    expect(stats.damageByPlayer.player2).toBe(20)
    expect(stats.damageByPlayer.player1).toBe(0)
  })

  it('foreign action with no action.player and unknown unitId gets no per-player attribution', async () => {
    // Removed regex: a unit whose id would match /^p2[_-]/i pattern but has no
    // action.player AND is not in unitPlayerMap — no attribution (acceptable).
    const gs = {
      turnNumber: 2,
      history: [[
        // no .player field, unknown unitId (not in initialState)
        { type: 'attack', unitId: 'p2-ghost', damage: 99 }
      ]],
      currentTurnActions: [],
      initialState: { units: [] },
      getAllUnits: vi.fn(() => []),
      outcome: { status: 'ended', winner: 'player1', reason: 'unitWipe', message: '' }
    }
    const wrapper = await mountPlayground(gs)
    const stats = wrapper.vm.outcomeStats
    // With regex removed: damage goes unattributed
    expect(stats.damageByPlayer.player1).toBe(0)
    expect(stats.damageByPlayer.player2).toBe(0)
  })

  it('unitPlayerMap (from initialState) is still used when action.player is absent but unitId is known', async () => {
    // This is the secondary path (unitPlayerMap lookup, not regex).
    // It continues to work for foreign payloads that have a known unit in initialState.
    const gs = {
      turnNumber: 2,
      history: [[
        { type: 'attack', unitId: 'known-unit', damage: 15 }  // no .player
      ]],
      currentTurnActions: [],
      initialState: {
        units: [['known-unit', { id: 'known-unit', player: 'player1', health: 100, isActive: true }]]
      },
      getAllUnits: vi.fn(() => []),
      outcome: { status: 'ended', winner: 'player1', reason: 'unitWipe', message: '' }
    }
    const wrapper = await mountPlayground(gs)
    const stats = wrapper.vm.outcomeStats
    expect(stats.damageByPlayer.player1).toBe(15)
    expect(stats.damageByPlayer.player2).toBe(0)
  })
})
