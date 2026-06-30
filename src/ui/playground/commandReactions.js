/**
 * Shared UI command reactions for the playground.
 *
 * Both `Playground` (sidebar dispatch) and `GameMapBlock`
 * (in-map keyboard / click dispatch) drive the same engine commands
 * through `gameController`. To prevent the two surfaces from drifting
 * — duplicate guard text, divergent rejection notifications, missed
 * special cases (e.g. `INVALID_LINE_OF_FIRE_MESSAGE`) — every command
 * goes through one function here.
 *
 * Each reaction returns a uniform shape:
 *   - `dispatched: false` when a precondition gated the dispatch
 *     (and a warning was already shown via `notify`).
 *   - `dispatched: true, result: <controllerResult>` when the
 *     controller was called.
 *
 * Callers are responsible only for post-success view-state updates
 * (e.g. bumping `commandSeq` in the playground, or
 * `refreshSelectedUnitFromGameState()` in the map).
 *
 * Reactions never read from Vue refs and never touch `GameState`
 * directly; everything they need flows through the `ctx` argument
 * and the `controller` reference. This keeps them unit-testable
 * without mounting a component tree.
 *
 * @module ui/playground/commandReactions
 */

import { INVALID_LINE_OF_FIRE_MESSAGE } from '../../constants/combat.js'

/**
 * Wrap a `notify` callback so reactions can call `n('warning', ...)`
 * regardless of whether the caller supplied a real notifier. A missing
 * notifier silently no-ops — important for unit tests and for the
 * brief window before `window.$notify` is registered.
 *
 * @param {Function} notify
 */
function safeNotifier(notify) {
  return (level, title, message) => {
    if (typeof notify !== 'function') return
    try {
      notify(level, title, message)
    } catch (_) {
      // Notifier errors must not break command dispatch.
    }
  }
}

function safeReactionText(value, fallback = '') {
  if (typeof value === 'string' && value.length > 0) return value
  if (value != null && typeof value !== 'string') return String(value)
  return typeof fallback === 'string' ? fallback : String(fallback || '')
}

function reactionText(ctx, key, fallback = '', params = {}) {
  const safeFallback = safeReactionText(fallback)
  if (!key || typeof key !== 'string') return safeFallback
  const formatter = ctx && (ctx.uiText || ctx.text)
  if (typeof formatter === 'function') {
    try {
      const translated = formatter(key, safeFallback, params)
      return safeReactionText(translated, safeFallback)
    } catch (_) {
      return safeFallback
    }
  }
  return safeFallback
}

/**
 * Common rejection branch: log to console for diagnostics and surface
 * a notification unless the rejection is one of the inert codes
 * (`NO_GAMESTATE` / `NO_CONTROLLER`) which represent “controller not
 * ready yet, nothing to do” rather than a true command failure.
 *
 * @param {{ok:boolean, code?:string, message?:string}} result
 * @param {{logPrefix:string, errorTitle:string, fallback?:string, formatMessage?:(msg:string)=>string}} opts
 * @param {(level:string,title:string,message:string)=>void} n
 */
function reportRejection(result, opts, n, ctx = null) {
  const code = result && result.code
  const config = opts || {}
  if (code === 'NO_GAMESTATE' || code === 'NO_CONTROLLER') return
  const resultMessage = result && result.message != null ? safeReactionText(result.message) : ''
  const msg = resultMessage ||
    reactionText(ctx, config.fallbackKey, config.fallback || 'Action rejected.')
  // Diagnostics: always go to console regardless of notifier presence.
  // eslint-disable-next-line no-console
  console.error(`${config.logPrefix || 'Command rejected'}:`, msg)
  const displayMessage = typeof config.formatMessage === 'function' ? config.formatMessage(msg, ctx) : msg
  const title = reactionText(ctx, config.errorTitleKey, config.errorTitle || 'Action rejected')
  n('error', title, displayMessage)
}

/**
 * Move the unit one hex forward along its current facing.
 *
 * @param {object} ctx
 * @param {string|null} ctx.selectedUnitId
 * @param {boolean} ctx.canMoveForward
 * @param {{q:number,r:number}|null} ctx.moveForwardTarget
 * @param {object} controller `gameController`
 * @param {Function} notify `(level,title,message)`
 * @returns {{dispatched:boolean, result?:object}}
 */
export function reactMoveForward(ctx, controller, notify) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  if (!ctx.canMoveForward) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.moveForward.title', 'Move forward'),
      reactionText(ctx, 'gameplay.commands.moveForward.blocked', 'Cannot move forward: target hex is out of range, occupied, or terrain is too difficult.')
    )
    return { dispatched: false }
  }
  const target = ctx.moveForwardTarget
  if (!target) return { dispatched: false }
  const result = controller.moveUnit({
    unitId: ctx.selectedUnitId,
    q: target.q,
    r: target.r
  })
  if (!result.ok) {
    reportRejection(result, {
      logPrefix: 'Error moving unit forward',
      errorTitleKey: 'gameplay.commands.moveForward.failedTitle',
      errorTitle: 'Move failed',
      fallbackKey: 'gameplay.commands.moveForward.fallback',
      fallback: 'Cannot move unit forward.',
      formatMessage: (msg, localCtx) => reactionText(localCtx, 'gameplay.commands.moveForward.failedWithReason', `Cannot move unit forward: ${msg}`, { message: msg })
    }, n, ctx)
  }
  return { dispatched: true, result }
}

/**
 * Move the unit one hex behind its current facing (turntable
 * `reverse` action).
 */
export function reactMoveReverse(ctx, controller, notify) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  if (!ctx.canMoveReverse) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.reverse.title', 'Reverse'),
      reactionText(ctx, 'gameplay.commands.reverse.blocked', 'Cannot reverse: target hex is unreachable, or reverse is not allowed for current dice/phase/budget.')
    )
    return { dispatched: false }
  }
  const target = ctx.moveReverseTarget
  if (!target) return { dispatched: false }
  const result = controller.moveUnit({
    unitId: ctx.selectedUnitId,
    q: target.q,
    r: target.r,
    motionKind: 'reverse'
  })
  if (!result.ok) {
    reportRejection(result, {
      logPrefix: 'Error reversing unit',
      errorTitleKey: 'gameplay.commands.reverse.failedTitle',
      errorTitle: 'Move failed',
      fallbackKey: 'gameplay.commands.reverse.fallback',
      fallback: 'Cannot reverse.',
      formatMessage: (msg, localCtx) => reactionText(localCtx, 'gameplay.commands.reverse.failedWithReason', `Cannot reverse: ${msg}`, { message: msg })
    }, n, ctx)
  }
  return { dispatched: true, result }
}

/**
 * Rotate the unit by `step` (`+1` clockwise, `-1` counter-clockwise).
 * The caller passes the unit's current facing so the reaction does
 * not have to know about `GameState`.
 *
 * @param {{selectedUnitId:string|null, canRotate:boolean, currentFacing:number}} ctx
 * @param {object} controller
 * @param {Function} notify
 * @param {number} step
 */
export function reactRotate(ctx, controller, notify, step) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  if (!ctx.canRotate) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.turn.title', 'Turn'),
      reactionText(ctx, 'gameplay.commands.turn.blocked', 'Cannot rotate: no actions remaining, or turn is not allowed for current dice/phase or budget.')
    )
    return { dispatched: false }
  }
  const currentFacing = Number.isInteger(ctx.currentFacing) ? ctx.currentFacing : 0
  const safeStep = Number.isFinite(step) ? step : 0
  const newFacing = (((currentFacing + safeStep) % 6) + 6) % 6
  const result = controller.updateUnitFacing({
    unitId: ctx.selectedUnitId,
    facing: newFacing
  })
  if (!result.ok) {
    reportRejection(result, {
      logPrefix: 'Error rotating unit',
      errorTitleKey: 'gameplay.commands.turn.failedTitle',
      errorTitle: 'Turn failed',
      fallbackKey: 'gameplay.commands.turn.fallback',
      fallback: 'Cannot rotate.',
      formatMessage: (msg, localCtx) => reactionText(localCtx, 'gameplay.commands.turn.failedWithReason', `Cannot rotate: ${msg}`, { message: msg })
    }, n, ctx)
  }
  return { dispatched: true, result, facing: newFacing }
}

/**
 * Rotate the unit to an explicit facing index (0..5). Used by the
 * compass-style facing picker in the map. Same gating as `reactRotate`.
 */
export function reactSetFacing(ctx, controller, notify, facing) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  if (!ctx.canRotate) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.turn.title', 'Turn'),
      reactionText(ctx, 'gameplay.commands.turn.blocked', 'Cannot rotate: no actions remaining, or turn is not allowed for current dice/phase or budget.')
    )
    return { dispatched: false }
  }
  const target = Number.isInteger(facing) ? ((facing % 6) + 6) % 6 : 0
  const result = controller.updateUnitFacing({
    unitId: ctx.selectedUnitId,
    facing: target
  })
  if (!result.ok) {
    reportRejection(result, {
      logPrefix: 'Error setting unit facing',
      errorTitleKey: 'gameplay.commands.turn.failedTitle',
      errorTitle: 'Turn failed',
      fallbackKey: 'gameplay.commands.turn.fallback',
      fallback: 'Cannot rotate.',
      formatMessage: (msg, localCtx) => reactionText(localCtx, 'gameplay.commands.turn.failedWithReason', `Cannot rotate: ${msg}`, { message: msg })
    }, n, ctx)
  }
  return { dispatched: true, result, facing: target }
}

/**
 * Fire at the currently selected attack target.
 *
 * @param {object} ctx
 * @param {string|null} ctx.selectedUnitId
 * @param {boolean} ctx.canFire
 * @param {Array<{q:number,r:number}>} ctx.validAttackTargets
 * @param {number} ctx.selectedTargetIndex
 * @param {number|null} ctx.dice  Current-turn die face for the engine.
 * @param {boolean} ctx.isLoaded  Source of the “weapon not loaded”
 *   warning shown when `canFire` is false for the loaded reason.
 */
export function reactFire(ctx, controller, notify) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  const targets = Array.isArray(ctx.validAttackTargets) ? ctx.validAttackTargets : []
  if (targets.length === 0) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
      reactionText(ctx, 'gameplay.commands.fire.noTargets', 'No valid targets in line of fire.')
    )
    return { dispatched: false }
  }
  const idxRaw = Number(ctx.selectedTargetIndex)
  const idx = Number.isFinite(idxRaw) ? Math.max(0, Math.min(Math.floor(idxRaw), targets.length - 1)) : 0
  const t = targets[idx]
  if (!t) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
      reactionText(ctx, 'gameplay.commands.fire.missingTarget', 'Selected target entry is missing - try switching target.')
    )
    return { dispatched: false }
  }
  if (!ctx.canFire) {
    if (ctx.isLoaded !== true) {
      n(
        'warning',
        reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
        reactionText(ctx, 'gameplay.commands.fire.weaponNotLoaded', 'Weapon is not loaded. Reload before firing.')
      )
    } else {
      n(
        'warning',
        reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
        reactionText(ctx, 'gameplay.commands.fire.blocked', 'Cannot fire: no actions left, dice does not allow fire in this phase, or other restrictions.')
      )
    }
    return { dispatched: false }
  }
  if (ctx.dice == null) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
      reactionText(ctx, 'gameplay.commands.fire.rollDiceFirst', 'Roll the dice first.')
    )
    return { dispatched: false }
  }
  const result = controller.performAttack({
    unitId: ctx.selectedUnitId,
    target: { q: t.q, r: t.r },
    diceResult: ctx.dice
  })
  if (result.ok) {
    const dmg = result.result && result.result.damage != null ? String(result.result.damage) : '-'
    n(
      'success',
      reactionText(ctx, 'gameplay.commands.fire.title', 'Fire'),
      reactionText(ctx, 'gameplay.commands.fire.resolved', `Attack resolved. Damage: ${dmg}.`, { damage: dmg })
    )
  } else {
    reportRejection(result, {
      logPrefix: 'Fire failed',
      errorTitleKey: 'gameplay.commands.fire.failedTitle',
      errorTitle: 'Fire failed',
      fallbackKey: 'gameplay.commands.fire.fallback',
      fallback: 'Cannot fire.',
      formatMessage: (msg, localCtx) =>
        msg === INVALID_LINE_OF_FIRE_MESSAGE
          ? reactionText(localCtx, 'gameplay.commands.fire.invalidLineOfFire', 'Target is outside the valid attack zone (line of fire).')
          : (msg || reactionText(localCtx, 'gameplay.commands.fire.fallback', 'Cannot fire.'))
    }, n, ctx)
  }
  return { dispatched: true, result }
}

/**
 * Reload the unit's weapon.
 *
 * `isLoaded === true` is what differentiates the “already full”
 * warning from the generic “no actions left / dice / phase” one.
 */
export function reactReload(ctx, controller, notify) {
  const n = safeNotifier(notify)
  if (!ctx || !ctx.selectedUnitId) return { dispatched: false }
  if (!ctx.canReload) {
    if (ctx.isLoaded === true) {
      n(
        'warning',
        reactionText(ctx, 'gameplay.commands.reload.title', 'Reload'),
        reactionText(ctx, 'gameplay.commands.reload.alreadyFull', 'Magazine is already full - nothing to reload.')
      )
    } else {
      n(
        'warning',
        reactionText(ctx, 'gameplay.commands.reload.title', 'Reload'),
        reactionText(ctx, 'gameplay.commands.reload.blocked', 'Cannot reload: no actions left, dice does not allow reload in this phase, or other restrictions.')
      )
    }
    return { dispatched: false }
  }
  if (ctx.dice == null) {
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.reload.title', 'Reload'),
      reactionText(ctx, 'gameplay.commands.reload.rollDiceFirst', 'Roll the dice first.')
    )
    return { dispatched: false }
  }
  const result = controller.performReload({
    unitId: ctx.selectedUnitId,
    diceResult: ctx.dice
  })
  if (result.ok) {
    n(
      'success',
      reactionText(ctx, 'gameplay.commands.reload.title', 'Reload'),
      reactionText(ctx, 'gameplay.commands.reload.loaded', 'Weapon loaded.')
    )
  } else {
    reportRejection(result, {
      logPrefix: 'Reload failed',
      errorTitleKey: 'gameplay.commands.reload.failedTitle',
      errorTitle: 'Reload failed',
      fallbackKey: 'gameplay.commands.reload.fallback',
      fallback: 'Cannot reload.'
    }, n, ctx)
  }
  return { dispatched: true, result }
}

/**
 * Ask the engine to roll and commit a dice face from its own RNG.
 * The first argument is retained for older callers, but ignored: the
 * caller must not provide the random face anymore.
 */
export function reactDiceRoll(face, controller, notify, ctx = null) {
  void face
  const n = safeNotifier(notify)
  const result =
    controller && typeof controller.rollDiceFromEngine === 'function'
      ? controller.rollDiceFromEngine()
      : { ok: false, code: 'NO_CONTROLLER', message: 'Game controller is not available.' }
  if (!result.ok) {
    if (result.code === 'NO_GAMESTATE' || result.code === 'NO_CONTROLLER') {
      return { dispatched: true, result }
    }
    n(
      'warning',
      reactionText(ctx, 'gameplay.commands.dice.title', 'Dice'),
      result.message || reactionText(ctx, 'gameplay.commands.dice.rejected', 'Dice roll rejected.')
    )
  }
  return { dispatched: true, result }
}
