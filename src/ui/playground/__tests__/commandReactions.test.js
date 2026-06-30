import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  reactMoveForward,
  reactMoveReverse,
  reactRotate,
  reactSetFacing,
  reactFire,
  reactReload,
  reactDiceRoll
} from '../commandReactions.js'
import { INVALID_LINE_OF_FIRE_MESSAGE } from '../../../constants/combat.js'

function makeController(overrides = {}) {
  return {
    moveUnit: vi.fn(() => ({ ok: true, result: { type: 'moveUnit' } })),
    updateUnitFacing: vi.fn(() => ({ ok: true, result: { type: 'rotate' } })),
    performAttack: vi.fn(() => ({ ok: true, result: { type: 'fire', damage: 3 } })),
    performReload: vi.fn(() => ({ ok: true, result: { type: 'reload' } })),
    commitDiceRoll: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 3 } })),
    rollDiceFromEngine: vi.fn(() => ({ ok: true, result: { type: 'rollDice', face: 3 } })),
    ...overrides
  }
}

let consoleErrorSpy
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('reactMoveForward', () => {
  it('returns dispatched:false when no unit is selected', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactMoveForward(
      { selectedUnitId: null, canMoveForward: true, moveForwardTarget: { q: 1, r: 1 } },
      controller,
      notify
    )
    expect(result.dispatched).toBe(false)
    expect(controller.moveUnit).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('warns and skips dispatch when canMoveForward is false', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: false, moveForwardTarget: { q: 1, r: 1 } },
      controller,
      notify
    )
    expect(result.dispatched).toBe(false)
    expect(controller.moveUnit).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('warning', 'Move forward', expect.stringContaining('Cannot move forward'))
  })

  it('skips dispatch when moveForwardTarget is missing', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: true, moveForwardTarget: null },
      controller,
      notify
    )
    expect(result.dispatched).toBe(false)
    expect(controller.moveUnit).not.toHaveBeenCalled()
  })

  it('dispatches controller.moveUnit with payload on success', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: true, moveForwardTarget: { q: 4, r: 2 } },
      controller,
      notify
    )
    expect(controller.moveUnit).toHaveBeenCalledWith({ unitId: 'u1', q: 4, r: 2 })
    expect(result.dispatched).toBe(true)
    expect(result.result.ok).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })

  it('reports error notify on controller rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      moveUnit: vi.fn(() => ({ ok: false, code: 'MOVE_REJECTED', message: 'No AP' }))
    })
    const result = reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: true, moveForwardTarget: { q: 1, r: 1 } },
      controller,
      notify
    )
    expect(result.dispatched).toBe(true)
    expect(result.result.ok).toBe(false)
    expect(notify).toHaveBeenCalledWith('error', 'Move failed', 'Cannot move unit forward: No AP')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('does not notify for NO_GAMESTATE / NO_CONTROLLER rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      moveUnit: vi.fn(() => ({ ok: false, code: 'NO_GAMESTATE', message: 'init' }))
    })
    reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: true, moveForwardTarget: { q: 1, r: 1 } },
      controller,
      notify
    )
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('reactMoveReverse', () => {
  it('warns and skips dispatch when canMoveReverse is false', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactMoveReverse(
      { selectedUnitId: 'u1', canMoveReverse: false, moveReverseTarget: { q: 1, r: 1 } },
      controller,
      notify
    )
    expect(result.dispatched).toBe(false)
    expect(controller.moveUnit).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('warning', 'Reverse', expect.stringContaining('Cannot reverse'))
  })

  it('dispatches with motionKind reverse', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactMoveReverse(
      { selectedUnitId: 'u1', canMoveReverse: true, moveReverseTarget: { q: 3, r: 0 } },
      controller,
      notify
    )
    expect(controller.moveUnit).toHaveBeenCalledWith({
      unitId: 'u1',
      q: 3,
      r: 0,
      motionKind: 'reverse'
    })
  })
})

describe('reactRotate', () => {
  it('warns when canRotate is false', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactRotate(
      { selectedUnitId: 'u1', canRotate: false, currentFacing: 2 },
      controller,
      notify,
      1
    )
    expect(result.dispatched).toBe(false)
    expect(controller.updateUnitFacing).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('warning', 'Turn', expect.stringContaining('Cannot rotate'))
  })

  it('wraps facing mod 6 with positive step', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactRotate(
      { selectedUnitId: 'u1', canRotate: true, currentFacing: 5 },
      controller,
      notify,
      1
    )
    expect(controller.updateUnitFacing).toHaveBeenCalledWith({ unitId: 'u1', facing: 0 })
  })

  it('wraps facing mod 6 with negative step', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactRotate(
      { selectedUnitId: 'u1', canRotate: true, currentFacing: 0 },
      controller,
      notify,
      -1
    )
    expect(controller.updateUnitFacing).toHaveBeenCalledWith({ unitId: 'u1', facing: 5 })
  })

  it('reports Turn Failed on rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      updateUnitFacing: vi.fn(() => ({ ok: false, code: 'ROTATE_REJECTED', message: 'No AP' }))
    })
    reactRotate(
      { selectedUnitId: 'u1', canRotate: true, currentFacing: 0 },
      controller,
      notify,
      1
    )
    expect(notify).toHaveBeenCalledWith('error', 'Turn failed', 'Cannot rotate: No AP')
  })
})

describe('reactSetFacing', () => {
  it('dispatches updateUnitFacing to the explicit target facing', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactSetFacing(
      { selectedUnitId: 'u1', canRotate: true },
      controller,
      notify,
      3
    )
    expect(controller.updateUnitFacing).toHaveBeenCalledWith({ unitId: 'u1', facing: 3 })
  })

  it('clamps non-integer facing to 0', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactSetFacing(
      { selectedUnitId: 'u1', canRotate: true },
      controller,
      notify,
      'bad'
    )
    expect(controller.updateUnitFacing).toHaveBeenCalledWith({ unitId: 'u1', facing: 0 })
  })
})

describe('reactFire', () => {
  const baseCtx = () => ({
    selectedUnitId: 'u1',
    canFire: true,
    validAttackTargets: [{ q: 5, r: 6 }],
    selectedTargetIndex: 0,
    dice: 4,
    isLoaded: true
  })

  it('warns when there are no targets', () => {
    const notify = vi.fn()
    const controller = makeController()
    const ctx = baseCtx()
    ctx.validAttackTargets = []
    const result = reactFire(ctx, controller, notify)
    expect(result.dispatched).toBe(false)
    expect(notify).toHaveBeenCalledWith('warning', 'Fire', 'No valid targets in line of fire.')
  })

  it('warns about weapon not loaded when canFire is false and isLoaded is false', () => {
    const notify = vi.fn()
    const controller = makeController()
    const ctx = baseCtx()
    ctx.canFire = false
    ctx.isLoaded = false
    reactFire(ctx, controller, notify)
    expect(notify).toHaveBeenCalledWith('warning', 'Fire', expect.stringContaining('Weapon is not loaded'))
  })

  it('warns generic restriction when canFire is false but isLoaded is true', () => {
    const notify = vi.fn()
    const controller = makeController()
    const ctx = baseCtx()
    ctx.canFire = false
    reactFire(ctx, controller, notify)
    expect(notify).toHaveBeenCalledWith('warning', 'Fire', expect.stringContaining('no actions left'))
  })

  it('warns when dice is null', () => {
    const notify = vi.fn()
    const controller = makeController()
    const ctx = baseCtx()
    ctx.dice = null
    reactFire(ctx, controller, notify)
    expect(notify).toHaveBeenCalledWith('warning', 'Fire', 'Roll the dice first.')
  })

  it('calls controller.performAttack with target+dice on success and reports damage', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactFire(baseCtx(), controller, notify)
    expect(controller.performAttack).toHaveBeenCalledWith({
      unitId: 'u1',
      target: { q: 5, r: 6 },
      diceResult: 4
    })
    expect(notify).toHaveBeenCalledWith('success', 'Fire', expect.stringContaining('Damage: 3'))
  })

  it('uses the LOF-specific message for INVALID_LINE_OF_FIRE_MESSAGE rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      performAttack: vi.fn(() => ({
        ok: false,
        code: 'FIRE_REJECTED',
        message: INVALID_LINE_OF_FIRE_MESSAGE
      }))
    })
    reactFire(baseCtx(), controller, notify)
    expect(notify).toHaveBeenCalledWith('error', 'Fire failed', expect.stringContaining('outside the valid attack zone'))
  })

  it('passes through other engine errors verbatim', () => {
    const notify = vi.fn()
    const controller = makeController({
      performAttack: vi.fn(() => ({ ok: false, code: 'FIRE_REJECTED', message: 'No AP' }))
    })
    reactFire(baseCtx(), controller, notify)
    expect(notify).toHaveBeenCalledWith('error', 'Fire failed', 'No AP')
  })

  it('clamps selectedTargetIndex into valid range', () => {
    const notify = vi.fn()
    const controller = makeController()
    const ctx = baseCtx()
    ctx.validAttackTargets = [{ q: 1, r: 1 }, { q: 2, r: 2 }]
    ctx.selectedTargetIndex = 99
    reactFire(ctx, controller, notify)
    expect(controller.performAttack).toHaveBeenCalledWith(expect.objectContaining({
      target: { q: 2, r: 2 }
    }))
  })
})

describe('reactReload', () => {
  it('warns "already full" when canReload is false and isLoaded is true', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactReload(
      { selectedUnitId: 'u1', canReload: false, isLoaded: true, dice: 3 },
      controller,
      notify
    )
    expect(notify).toHaveBeenCalledWith('warning', 'Reload', expect.stringContaining('already full'))
  })

  it('warns generic restriction when canReload is false and not loaded', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactReload(
      { selectedUnitId: 'u1', canReload: false, isLoaded: false, dice: 3 },
      controller,
      notify
    )
    expect(notify).toHaveBeenCalledWith('warning', 'Reload', expect.stringContaining('no actions left'))
  })

  it('warns when dice is null even if canReload is true', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactReload(
      { selectedUnitId: 'u1', canReload: true, isLoaded: false, dice: null },
      controller,
      notify
    )
    expect(notify).toHaveBeenCalledWith('warning', 'Reload', 'Roll the dice first.')
  })

  it('dispatches performReload with diceResult on success', () => {
    const notify = vi.fn()
    const controller = makeController()
    reactReload(
      { selectedUnitId: 'u1', canReload: true, isLoaded: false, dice: 6 },
      controller,
      notify
    )
    expect(controller.performReload).toHaveBeenCalledWith({ unitId: 'u1', diceResult: 6 })
    expect(notify).toHaveBeenCalledWith('success', 'Reload', 'Weapon loaded.')
  })

  it('reports Reload Failed on rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      performReload: vi.fn(() => ({ ok: false, code: 'RELOAD_REJECTED', message: 'Already loaded.' }))
    })
    reactReload(
      { selectedUnitId: 'u1', canReload: true, isLoaded: false, dice: 6 },
      controller,
      notify
    )
    expect(notify).toHaveBeenCalledWith('error', 'Reload failed', 'Already loaded.')
  })
})

describe('reactDiceRoll', () => {
  it('dispatches rollDiceFromEngine and ignores caller-supplied faces', () => {
    const notify = vi.fn()
    const controller = makeController()
    const result = reactDiceRoll(4, controller, notify)
    expect(controller.rollDiceFromEngine).toHaveBeenCalledTimes(1)
    expect(controller.commitDiceRoll).not.toHaveBeenCalled()
    expect(result.dispatched).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })

  it('warns on engine rejection', () => {
    const notify = vi.fn()
    const controller = makeController({
      rollDiceFromEngine: vi.fn(() => ({ ok: false, code: 'DICE_REJECTED', message: 'Already rolled.' }))
    })
    reactDiceRoll(4, controller, notify)
    expect(notify).toHaveBeenCalledWith('warning', 'Dice', 'Already rolled.')
  })

  it('silently skips notify for NO_GAMESTATE', () => {
    const notify = vi.fn()
    const controller = makeController({
      rollDiceFromEngine: vi.fn(() => ({ ok: false, code: 'NO_GAMESTATE', message: '' }))
    })
    reactDiceRoll(4, controller, notify)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('safeNotifier', () => {
  it('tolerates absent notify', () => {
    const controller = makeController()
    expect(() => reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: false, moveForwardTarget: null },
      controller,
      null
    )).not.toThrow()
  })

  it('tolerates a notify that throws', () => {
    const controller = makeController()
    const throwingNotify = () => { throw new Error('notifier blew up') }
    expect(() => reactMoveForward(
      { selectedUnitId: 'u1', canMoveForward: false, moveForwardTarget: null },
      controller,
      throwingNotify
    )).not.toThrow()
  })
})
