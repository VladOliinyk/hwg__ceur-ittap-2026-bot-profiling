// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import GameEngineBlock from '../GameEngineBlock.vue'

vi.mock('@/assets/dice_animation/dice0.svg', () => ({ default: 'dice0.svg' }))
vi.mock('@/assets/dice_animation/dice1.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice2.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice3.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice4.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice5.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice6.json', () => ({ default: {} }))

/**
 * Focused watcher tests for the three dice intent props
 * (diceRollIntent / diceRollRightIntent / diceCancelIntent).
 *
 * These props replace the old `$refs.gameEngineBlock.onDiceClick()` /
 * `.onDiceRightClick()` / `.cancelDiceRoll()` calls from Playground.
 * Bumping a prop's `seq` should invoke the corresponding local method.
 */

function makeGameState(overrides = {}) {
  return {
    currentTurnActions: [],
    history: [],
    hasRolledDice: vi.fn(() => false),
    getCurrentDiceResult: vi.fn(() => null),
    ...overrides
  }
}

function makeController() {
  return {
    drawDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'drawDice', face: 3 } })),
    commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 3 } }))
  }
}

function mountEngine(props = {}) {
  return mount(GameEngineBlock, {
    props: {
      gameState: null,
      mapData: null,
      levelOptions: [{ id: 'level_000', label: 'level_000', source: 'default' }],
      selectedLevelId: 'level_000',
      seed: 'level_000-seed-1',
      loadedPackage: null,
      loadedSource: null,
      loadedWarnings: [],
      isRestoring: false,
      isInitializingGlobal: false,
      isStartingGame: false,
      diceRollIntent: { seq: 0 },
      diceRollRightIntent: { seq: 0 },
      diceCancelIntent: { seq: 0 },
      ...props
    },
    global: {
      stubs: {
        Vue3Lottie: { template: '<div />' },
        SelectionInspectorPanel: { template: '<div />' }
      }
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GameEngineBlock dice intent props (watcher wiring)', () => {
  it('bumping diceRollIntent.seq calls onDiceClick', async () => {
    const gameState = makeGameState()
    const controller = makeController()
    const wrapper = mountEngine({ gameState, gameController: controller })
    const spy = vi.spyOn(wrapper.vm, 'onDiceClick')

    await wrapper.setProps({ diceRollIntent: { seq: 1 } })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('bumping diceRollIntent.seq twice calls onDiceClick for each bump', async () => {
    const gameState = makeGameState()
    const controller = makeController()
    const wrapper = mountEngine({ gameState, gameController: controller })
    const spy = vi.spyOn(wrapper.vm, 'onDiceClick')

    await wrapper.setProps({ diceRollIntent: { seq: 1 } })
    await wrapper.setProps({ diceRollIntent: { seq: 2 } })

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('bumping diceRollRightIntent.seq calls onDiceRightClick', async () => {
    const gameState = makeGameState()
    const controller = makeController()
    const wrapper = mountEngine({ gameState, gameController: controller })
    const spy = vi.spyOn(wrapper.vm, 'onDiceRightClick')

    await wrapper.setProps({ diceRollRightIntent: { seq: 1 } })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('bumping diceCancelIntent.seq calls cancelDiceRoll', async () => {
    const gameState = makeGameState()
    const controller = makeController()
    const wrapper = mountEngine({ gameState, gameController: controller })

    // Put the component into rolling state first so cancelDiceRoll has work to do.
    await wrapper.setProps({ diceRollIntent: { seq: 1 } })
    expect(wrapper.vm.isRolling).toBe(true)

    const spy = vi.spyOn(wrapper.vm, 'cancelDiceRoll')

    await wrapper.setProps({ diceCancelIntent: { seq: 1 } })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.isRolling).toBe(false)
  })

  it('diceRollIntent watcher does NOT trigger on initial render (no immediate)', async () => {
    const gameState = makeGameState()
    const controller = makeController()

    // Mount with a non-zero initial seq — the watcher should NOT fire for
    // the initial prop value (watchers are not `immediate` in the real component).
    const wrapper = mountEngine({
      gameState,
      gameController: controller,
      diceRollIntent: { seq: 5 }
    })
    const spy = vi.spyOn(wrapper.vm, 'onDiceClick')

    // Give Vue one tick to settle.
    await wrapper.vm.$nextTick()

    expect(spy).not.toHaveBeenCalled()
  })
})
