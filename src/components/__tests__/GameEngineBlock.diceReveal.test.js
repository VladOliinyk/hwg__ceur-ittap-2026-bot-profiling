// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import GameEngineBlock from '../GameEngineBlock.vue'

function makeGameState() {
  return {
    currentTurnActions: [],
    history: [],
    hasRolledDice: vi.fn(() => false),
    getCurrentDiceResult: vi.fn(() => null)
  }
}

function makeEngineVm({ gameState = makeGameState(), controller } = {}) {
  const emitted = {}
  const vm = {
    gameState,
    gameController: controller || {
      drawDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'drawDice', face: 4 } })),
      commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 4 } }))
    },
    isRolling: false,
    diceRollLocked: false,
    currentDice: 1,
    diceKey: 0,
    diceRollId: 0,
    diceLoadTimeoutId: null,
    localDicePreview: null,
    $emit: vi.fn((event, payload) => {
      if (!emitted[event]) emitted[event] = []
      emitted[event].push([payload])
    }),
    emitted: () => emitted
  }

  for (const [name, fn] of Object.entries(GameEngineBlock.methods)) {
    vm[name] = fn.bind(vm)
  }

  return vm
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GameEngineBlock D6 reveal timing', () => {
  it('draws the engine RNG face on click but commits it only after animation complete', () => {
    const gameState = makeGameState()
    const controller = {
      drawDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'drawDice', face: 5 } })),
      commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 5 } }))
    }
    const vm = makeEngineVm({ gameState, controller })

    vm.onDiceClick()

    expect(controller.drawDiceFromEngine).toHaveBeenCalledTimes(1)
    expect(controller.commitDiceRoll).not.toHaveBeenCalled()
    expect(vm.emitted()['game-state-updated']).toBeUndefined()
    expect(vm.isRolling).toBe(true)
    expect(vm.currentDice).toBe(5)

    vm.onDiceComplete()

    expect(controller.commitDiceRoll).toHaveBeenCalledWith(5)
    expect(vm.emitted()['game-state-updated']).toHaveLength(1)
    expect(vm.emitted()['game-state-updated'][0][0]).toBe(gameState)
    expect(vm.isRolling).toBe(false)
  })

  it('keeps right-click as an instant roll and commit path', () => {
    const controller = {
      drawDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'drawDice', face: 2 } })),
      commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 2 } }))
    }
    const vm = makeEngineVm({ controller })

    vm.onDiceRightClick()

    expect(controller.drawDiceFromEngine).toHaveBeenCalledTimes(1)
    expect(controller.commitDiceRoll).toHaveBeenCalledWith(2)
    expect(vm.emitted()['game-state-updated']).toHaveLength(1)
    expect(vm.isRolling).toBe(false)
  })

  it('cancels a pending dice animation without committing the drawn face', () => {
    const controller = {
      drawDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'drawDice', face: 6 } })),
      commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 6 } }))
    }
    const vm = makeEngineVm({ controller })

    vm.onDiceClick()
    expect(vm.isRolling).toBe(true)
    expect(controller.drawDiceFromEngine).toHaveBeenCalledTimes(1)

    vm.cancelDiceRoll()
    vm.onDiceComplete()

    expect(vm.isRolling).toBe(false)
    expect(vm.diceLoadTimeoutId).toBe(null)
    expect(controller.commitDiceRoll).not.toHaveBeenCalled()
    expect(vm.emitted()['game-state-updated']).toBeUndefined()
  })
})
