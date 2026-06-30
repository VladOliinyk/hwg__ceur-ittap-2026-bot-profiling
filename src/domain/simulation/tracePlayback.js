/**
 * Trace-format / playback helpers that understand the simulation-trace schema.
 *
 * These functions know the on-disk shape of a `hwg/simulation-trace`
 * (kind, frame `engine` snapshots, the v1-vs-v2 `schemaVersion` split where
 * v1 frames embed per-frame `hexes`/`units` and v2 frames carry DYNAMIC state
 * only) and how to massage frames for UI playback. They live next to the
 * schema owner (`simulationTrace.js`) so a future schema bump updates the
 * format logic in one place instead of in a hidden copy inside the Vue page.
 *
 * No Vue, no DOM — pure data in, pure data out. `buildGameStateFromLevelPackage`
 * reconstructs a static board snapshot from the trace's bundled `levelPackage`;
 * passing the trace's seed makes that reconstruction deterministic (otherwise
 * `placeUnitsFromLevel` shuffles spawns/units via `Math.random`).
 *
 * @module domain/simulation/tracePlayback
 */

import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from './rng.js'
import { normalizeDiceFaceForUi } from '../../utils/diceUi.js'

export function isSimulationTrace(payload) {
  return Boolean(payload && payload.kind === 'hwg/simulation-trace' && Array.isArray(payload.frames))
}

// A "dynamic snapshot" is a per-frame engine that carries unit state. Static
// board geometry (hexes) is NOT part of this check: schemaVersion 2 traces keep
// the immutable map once at the trace root (levelPackage) and emit only dynamic
// state per frame, so detecting a usable frame by `units` (not `hexes`) is what
// keeps both legacy (v1, hexes-per-frame) and v2 traces rendering correctly.
export function hasEngineDynamicSnapshot(engine) {
  return Boolean(engine && Array.isArray(engine.units) && engine.units.length > 0)
}

export function hasFrameDynamicSnapshot(frame) {
  return hasEngineDynamicSnapshot(frame && frame.engine)
}

export function buildGameStateFromLevelPackage(levelPackage, frame = {}, seed = undefined) {
  if (!levelPackage || !levelPackage.hexmap || !levelPackage.hexmap.parameters) return null
  // A seeded RNG makes `placeUnitsFromLevel` deterministic: the fallback board
  // snapshot reproduces the same spawn/unit layout the trace's seed produced,
  // instead of a fresh `Math.random()` shuffle on every recompute. When no seed
  // is supplied we preserve today's behavior (GameState falls back to
  // `Math.random()` internally).
  const rng = seed != null ? createRng(seed) : undefined
  const state = new GameState({
    width: levelPackage.hexmap.parameters.width,
    height: levelPackage.hexmap.parameters.height,
    currentPlayer: frame.currentPlayer || frame.actingPlayer || 'player1',
    turnNumber: frame.turnNumber || 1,
    mapData: levelPackage.hexmap,
    terrainTypes: levelPackage.terrain && Array.isArray(levelPackage.terrain.terrainTypes)
      ? levelPackage.terrain.terrainTypes
      : [],
    unitsData: levelPackage.units,
    turntableData: levelPackage.turntable || null,
    objectivesData: levelPackage.objectives || null,
    rng
  })
  const engine = state.toJSON(false)
  const actions = Array.isArray(state.currentTurnActions) ? [...state.currentTurnActions] : []
  const diceResult = normalizeDiceFaceForUi(frame.diceResult)
  if (diceResult != null && !actions.some(action => action && action.type === 'dice_roll')) {
    actions.push({ type: 'dice_roll', result: diceResult })
  }
  return {
    ...engine,
    currentTurnActions: actions
  }
}

export function diceFaceFromActions(actions) {
  if (!Array.isArray(actions)) return null
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (!action || action.type !== 'dice_roll') continue
    const face = normalizeDiceFaceForUi(action.result)
    if (face != null) return face
  }
  return null
}

export function clonePlaybackValue(value, fallback = value) {
  try {
    if (value === undefined || value === null) return fallback
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

export function diceRollFrameKey(frame) {
  if (!frame || typeof frame !== 'object') return ''
  const engine = frame.engine && typeof frame.engine === 'object' ? frame.engine : {}
  const face = normalizeDiceFaceForUi(frame.diceResult) || diceFaceFromActions(engine.currentTurnActions)
  if (face == null) return ''
  const player = frame.actingPlayer || frame.currentPlayer || engine.currentPlayer || ''
  const turn = Number.isInteger(frame.turnNumber)
    ? frame.turnNumber
    : Number.isInteger(engine.turnNumber)
      ? engine.turnNumber
      : ''
  return `${player}:${turn}:d${face}`
}

export function stripDiceRollFromFrame(frame) {
  const clone = clonePlaybackValue(frame, { ...frame })
  clone.diceResult = null
  if (clone.engine && Array.isArray(clone.engine.currentTurnActions)) {
    clone.engine.currentTurnActions = clone.engine.currentTurnActions.filter(action => {
      return !action || action.type !== 'dice_roll'
    })
  }
  return clone
}

export function makePlaybackDiceRollFrame(sourceFrame, baseFrame = null) {
  const sourceEngine = sourceFrame && sourceFrame.engine && typeof sourceFrame.engine === 'object'
    ? sourceFrame.engine
    : {}
  const face = normalizeDiceFaceForUi(sourceFrame && sourceFrame.diceResult) || diceFaceFromActions(sourceEngine.currentTurnActions)
  if (face == null) return null

  const baseEngine = baseFrame && baseFrame.engine && typeof baseFrame.engine === 'object'
    ? clonePlaybackValue(baseFrame.engine, {})
    : clonePlaybackValue(sourceEngine, {})
  const player = sourceFrame.actingPlayer ||
    sourceFrame.currentPlayer ||
    baseEngine.currentPlayer ||
    sourceEngine.currentPlayer ||
    'player1'
  const actions = Array.isArray(baseEngine.currentTurnActions)
    ? baseEngine.currentTurnActions.filter(action => !action || action.type !== 'dice_roll')
    : []
  actions.push({ type: 'dice_roll', player, result: face })

  return {
    ...clonePlaybackValue(sourceFrame, { ...sourceFrame }),
    event: 'diceRoll',
    actingPlayer: player,
    currentPlayer: player,
    diceResult: face,
    command: null,
    forcedEnd: false,
    label: `Rolled D6 for ${player}`,
    engine: {
      ...baseEngine,
      currentPlayer: player,
      currentTurnActions: actions
    }
  }
}

export function normalizeTraceForPlayback(trace) {
  if (!isSimulationTrace(trace)) return trace
  const frames = Array.isArray(trace.frames) ? trace.frames : []
  if (frames.some(frame => frame && frame.event === 'diceRoll')) {
    return trace
  }
  const normalized = []
  const emittedDiceFrames = new Set()

  for (const frame of frames) {
    const clonedFrame = clonePlaybackValue(frame, frame)
    const key = diceRollFrameKey(clonedFrame)

    if (clonedFrame && clonedFrame.event === 'diceRoll') {
      if (key) emittedDiceFrames.add(key)
      normalized.push(clonedFrame)
      continue
    }

    if (
      clonedFrame &&
      clonedFrame.event === 'initial' &&
      !clonedFrame.command &&
      key &&
      !emittedDiceFrames.has(key)
    ) {
      const initialFrame = stripDiceRollFromFrame(clonedFrame)
      normalized.push(initialFrame)
      const diceFrame = makePlaybackDiceRollFrame(clonedFrame, initialFrame)
      if (diceFrame) {
        emittedDiceFrames.add(key)
        normalized.push(diceFrame)
      }
      continue
    }

    if (
      clonedFrame &&
      clonedFrame.command &&
      key &&
      !emittedDiceFrames.has(key)
    ) {
      const diceFrame = makePlaybackDiceRollFrame(clonedFrame, normalized[normalized.length - 1] || null)
      if (diceFrame) {
        emittedDiceFrames.add(key)
        normalized.push(diceFrame)
      }
    }

    normalized.push(clonedFrame)
  }

  return {
    ...trace,
    frames: normalized.map((frame, index) => ({
      ...frame,
      index
    }))
  }
}
