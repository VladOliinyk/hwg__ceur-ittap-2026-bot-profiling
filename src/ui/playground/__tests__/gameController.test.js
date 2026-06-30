import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGameController } from '../gameController.js'

function makeStubGameState(overrides = {}) {
  return {
    turnNumber: 1,
    currentPlayer: 'player1',
    rollDice: vi.fn(),
    drawDiceFaceFromRng: vi.fn(() => 4),
    rollDiceFromRng: vi.fn(() => 4),
    moveUnit: vi.fn(),
    updateUnitFacing: vi.fn(),
    performAttack: vi.fn(() => 3),
    performReload: vi.fn(),
    endTurn: vi.fn(),
    revertTo: vi.fn(() => true),
    loadHistoryJSON: vi.fn(() => true),
    ...overrides
  }
}

describe('createGameController', () => {
  it('throws if getGameState is missing', () => {
    expect(() => createGameController({})).toThrow(/getGameState/)
  })

  describe('NO_GAMESTATE guard', () => {
    let controller
    beforeEach(() => {
      controller = createGameController({ getGameState: () => null })
    })

    it.each([
      ['commitDiceRoll', [4]],
      ['drawDiceFromEngine', []],
      ['rollDiceFromEngine', []],
      ['moveUnit', [{ unitId: 'u1', q: 0, r: 0 }]],
      ['updateUnitFacing', [{ unitId: 'u1', facing: 1 }]],
      ['performAttack', [{ unitId: 'u1', target: { q: 0, r: 0 }, diceResult: 5 }]],
      ['performReload', [{ unitId: 'u1', diceResult: 5 }]],
      ['endTurn', []],
      ['revertTo', [{ turnIndex: 0, actionIndex: 0 }]],
      ['importHistory', ['{}']]
    ])('%s returns NO_GAMESTATE when gameState is null', (method, args) => {
      const result = controller[method](...args)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('NO_GAMESTATE')
      expect(typeof result.message).toBe('string')
    })
  })

  describe('commitDiceRoll', () => {
    it('delegates the face to gameState.rollDice and wraps success', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.commitDiceRoll(3)
      expect(gs.rollDice).toHaveBeenCalledWith(3)
      expect(result.ok).toBe(true)
      expect(result.result).toEqual({ type: 'rollDice', face: 3 })
    })

    it('surfaces engine throws as DICE_REJECTED', () => {
      const gs = makeStubGameState({
        rollDice: vi.fn(() => {
          throw new Error('Dice already rolled this turn.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.commitDiceRoll(2)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('DICE_REJECTED')
      expect(result.message).toBe('Dice already rolled this turn.')
    })
  })

  describe('rollDiceFromEngine', () => {
    it('delegates to gameState.rollDiceFromRng and wraps the returned face', () => {
      const gs = makeStubGameState({
        rollDiceFromRng: vi.fn(() => 5)
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.rollDiceFromEngine()
      expect(gs.rollDiceFromRng).toHaveBeenCalledTimes(1)
      expect(result.ok).toBe(true)
      expect(result.result).toEqual({ type: 'rollDice', face: 5 })
    })

    it('does not call gameState.rollDice directly (face source is the engine RNG, not the caller)', () => {
      const gs = makeStubGameState({
        rollDiceFromRng: vi.fn(() => 2)
      })
      const controller = createGameController({ getGameState: () => gs })
      controller.rollDiceFromEngine()
      expect(gs.rollDice).not.toHaveBeenCalled()
    })

    it('surfaces engine throws as DICE_REJECTED', () => {
      const gs = makeStubGameState({
        rollDiceFromRng: vi.fn(() => {
          throw new Error('Dice already rolled this turn.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.rollDiceFromEngine()
      expect(result.ok).toBe(false)
      expect(result.code).toBe('DICE_REJECTED')
      expect(result.message).toBe('Dice already rolled this turn.')
    })
  })

  describe('drawDiceFromEngine', () => {
    it('delegates to gameState.drawDiceFaceFromRng and wraps the returned face without committing', () => {
      const gs = makeStubGameState({
        drawDiceFaceFromRng: vi.fn(() => 6)
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.drawDiceFromEngine()
      expect(gs.drawDiceFaceFromRng).toHaveBeenCalledTimes(1)
      expect(gs.rollDice).not.toHaveBeenCalled()
      expect(result.ok).toBe(true)
      expect(result.result).toEqual({ type: 'drawDice', face: 6 })
    })

    it('surfaces engine throws as DICE_REJECTED', () => {
      const gs = makeStubGameState({
        drawDiceFaceFromRng: vi.fn(() => {
          throw new Error('Dice already rolled this turn.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.drawDiceFromEngine()
      expect(result.ok).toBe(false)
      expect(result.code).toBe('DICE_REJECTED')
      expect(result.message).toBe('Dice already rolled this turn.')
    })
  })

  describe('moveUnit', () => {
    it('forwards (default) calls gameState.moveUnit without meta', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.moveUnit({ unitId: 'u1', q: 2, r: 3 })
      expect(gs.moveUnit).toHaveBeenCalledWith('u1', 2, 3, undefined)
      expect(result.ok).toBe(true)
      expect(result.result).toEqual({
        type: 'moveUnit',
        unitId: 'u1',
        q: 2,
        r: 3,
        motionKind: 'forward'
      })
    })

    it('reverse calls gameState.moveUnit with motionKind reverse meta', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.moveUnit({ unitId: 'u1', q: 1, r: 1, motionKind: 'reverse' })
      expect(gs.moveUnit).toHaveBeenCalledWith('u1', 1, 1, { motionKind: 'reverse' })
      expect(result.ok).toBe(true)
      expect(result.result.motionKind).toBe('reverse')
    })

    it('surfaces engine throws as MOVE_REJECTED', () => {
      const gs = makeStubGameState({
        moveUnit: vi.fn(() => {
          throw new Error('Unit cannot move.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.moveUnit({ unitId: 'u1', q: 0, r: 0 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('MOVE_REJECTED')
      expect(result.message).toBe('Unit cannot move.')
    })
  })

  describe('updateUnitFacing', () => {
    it('delegates to gameState.updateUnitFacing', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.updateUnitFacing({ unitId: 'u1', facing: 4 })
      expect(gs.updateUnitFacing).toHaveBeenCalledWith('u1', 4)
      expect(result.ok).toBe(true)
      expect(result.result).toEqual({ type: 'rotate', unitId: 'u1', facing: 4 })
    })

    it('surfaces engine throws as ROTATE_REJECTED', () => {
      const gs = makeStubGameState({
        updateUnitFacing: vi.fn(() => {
          throw new Error('Cannot rotate now.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.updateUnitFacing({ unitId: 'u1', facing: 0 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('ROTATE_REJECTED')
      expect(result.message).toBe('Cannot rotate now.')
    })
  })

  describe('performAttack', () => {
    it('rejects when target is missing', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performAttack({ unitId: 'u1', diceResult: 5 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('FIRE_REJECTED')
      expect(gs.performAttack).not.toHaveBeenCalled()
    })

    it('passes target coords and diceResult into the engine and returns damage', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performAttack({
        unitId: 'u1',
        target: { q: 5, r: 6 },
        diceResult: 6
      })
      expect(gs.performAttack).toHaveBeenCalledWith('u1', 5, 6, { diceResult: 6 })
      expect(result.ok).toBe(true)
      expect(result.result.damage).toBe(3)
      expect(result.result.target).toEqual({ q: 5, r: 6 })
    })

    it('surfaces engine throws as FIRE_REJECTED', () => {
      const gs = makeStubGameState({
        performAttack: vi.fn(() => {
          throw new Error('Out of LOF.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performAttack({
        unitId: 'u1',
        target: { q: 0, r: 0 },
        diceResult: 3
      })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('FIRE_REJECTED')
      expect(result.message).toBe('Out of LOF.')
    })
  })

  describe('performReload', () => {
    it('delegates to gameState.performReload', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performReload({ unitId: 'u1', diceResult: 4 })
      expect(gs.performReload).toHaveBeenCalledWith('u1', { diceResult: 4 })
      expect(result.ok).toBe(true)
    })

    it('surfaces engine throws as RELOAD_REJECTED', () => {
      const gs = makeStubGameState({
        performReload: vi.fn(() => {
          throw new Error('Already loaded.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performReload({ unitId: 'u1', diceResult: 4 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('RELOAD_REJECTED')
      expect(result.message).toBe('Already loaded.')
    })
  })

  describe('endTurn', () => {
    it('delegates and reports new turnNumber/currentPlayer', () => {
      const gs = makeStubGameState({
        endTurn: vi.fn(function () {
          this.turnNumber = 2
          this.currentPlayer = 'player2'
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.endTurn()
      expect(gs.endTurn).toHaveBeenCalled()
      expect(result.ok).toBe(true)
      expect(result.result.turnNumber).toBe(2)
      expect(result.result.currentPlayer).toBe('player2')
    })

    it('surfaces engine throws as END_TURN_REJECTED', () => {
      const gs = makeStubGameState({
        endTurn: vi.fn(() => {
          throw new Error('Cannot end turn now.')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.endTurn()
      expect(result.ok).toBe(false)
      expect(result.code).toBe('END_TURN_REJECTED')
    })
  })

  describe('revertTo', () => {
    it('delegates and returns success on engine true', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.revertTo({ turnIndex: 1, actionIndex: 2 })
      expect(gs.revertTo).toHaveBeenCalledWith(1, 2)
      expect(result.ok).toBe(true)
    })

    it('returns REVERT_REJECTED when engine returns false', () => {
      const gs = makeStubGameState({ revertTo: vi.fn(() => false) })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.revertTo({ turnIndex: 0, actionIndex: 0 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('REVERT_REJECTED')
    })

    it('surfaces engine throws as REVERT_REJECTED', () => {
      const gs = makeStubGameState({
        revertTo: vi.fn(() => {
          throw new Error('boom')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.revertTo({ turnIndex: 0, actionIndex: 0 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('REVERT_REJECTED')
      expect(result.message).toBe('boom')
    })
  })

  describe('importHistory', () => {
    it('delegates raw JSON to gameState.loadHistoryJSON', () => {
      const gs = makeStubGameState()
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.importHistory('{"some":"json"}')
      expect(gs.loadHistoryJSON).toHaveBeenCalledWith('{"some":"json"}')
      expect(result.ok).toBe(true)
    })

    it('returns IMPORT_REJECTED when engine returns false', () => {
      const gs = makeStubGameState({ loadHistoryJSON: vi.fn(() => false) })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.importHistory('{}')
      expect(result.ok).toBe(false)
      expect(result.code).toBe('IMPORT_REJECTED')
    })

    it('surfaces engine throws as IMPORT_REJECTED', () => {
      const gs = makeStubGameState({
        loadHistoryJSON: vi.fn(() => {
          throw new Error('bad json')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.importHistory('not-json')
      expect(result.ok).toBe(false)
      expect(result.code).toBe('IMPORT_REJECTED')
      expect(result.message).toBe('bad json')
    })
  })

  describe('hostile throwables', () => {
    it('does not let a throwing .message getter escape the controller', () => {
      const hostile = {}
      Object.defineProperty(hostile, 'message', {
        get() {
          throw new Error('boom from message getter')
        }
      })
      const gs = makeStubGameState({
        moveUnit: vi.fn(() => {
          throw hostile
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.moveUnit({ unitId: 'u1', q: 0, r: 0 })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('MOVE_REJECTED')
      expect(typeof result.message).toBe('string')
    })

    it('formats Symbol throws into a readable message', () => {
      const gs = makeStubGameState({
        rollDice: vi.fn(() => {
          throw Symbol('reroll')
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.commitDiceRoll(3)
      expect(result.ok).toBe(false)
      expect(result.code).toBe('DICE_REJECTED')
      expect(result.message).toContain('Symbol')
    })

    it('handles a throwing toString safely', () => {
      const hostile = {
        toString() {
          throw new Error('toString blew up')
        }
      }
      const gs = makeStubGameState({
        performAttack: vi.fn(() => {
          throw hostile
        })
      })
      const controller = createGameController({ getGameState: () => gs })
      const result = controller.performAttack({
        unitId: 'u1',
        target: { q: 0, r: 0 },
        diceResult: 3
      })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('FIRE_REJECTED')
      expect(typeof result.message).toBe('string')
    })
  })

  describe('reactive getGameState', () => {
    it('always reads the latest gameState from the getter', () => {
      const gs1 = makeStubGameState()
      const gs2 = makeStubGameState()
      let current = gs1
      const controller = createGameController({ getGameState: () => current })
      controller.commitDiceRoll(1)
      expect(gs1.rollDice).toHaveBeenCalledWith(1)
      expect(gs2.rollDice).not.toHaveBeenCalled()
      current = gs2
      controller.commitDiceRoll(2)
      expect(gs2.rollDice).toHaveBeenCalledWith(2)
    })
  })
})
