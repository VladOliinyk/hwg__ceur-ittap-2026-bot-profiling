import { normalizeHexFacing } from './hexUtils.js'

const MINIMAL_MOVE_COST = 1
const HEX_DIRECTIONS_COUNT = 6

const hexKey = ({ q, r }) => `${q},${r}`
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value)
const toNonNegativeNumber = (value, fallback = 0) =>
{
  const numericValue =
    typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : fallback
}
const hasValidNonNegativeCost = (value) => {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) && numericValue >= 0
}
const normalizeFacing = normalizeHexFacing
const stateKey = (q, r, facing) => `${q},${r},${facing}`

const bumpHexMin = (hexMinByPosition, q, r, cost) => {
  const posKey = `${q},${r}`
  const prev = hexMinByPosition.get(posKey)
  if (prev == null || cost < prev) hexMinByPosition.set(posKey, cost)
}

const heapPush = (heap, node) => {
  heap.push(node)
  let index = heap.length - 1
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (heap[parent].cost <= heap[index].cost) break
    [heap[parent], heap[index]] = [heap[index], heap[parent]]
    index = parent
  }
}
const heapPopMin = heap => {
  if (heap.length === 0) return null
  const min = heap[0]
  const tail = heap.pop()
  if (heap.length > 0 && tail) {
    heap[0] = tail
    let index = 0
    let needsHeapify = true
    while (needsHeapify) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < heap.length && heap[left].cost < heap[smallest].cost) smallest = left
      if (right < heap.length && heap[right].cost < heap[smallest].cost) smallest = right
      if (smallest === index) {
        needsHeapify = false
        continue
      }
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]]
      index = smallest
    }
  }
  return min
}

export function stepCostToEnter(unit, toHex, boardState) {
  if (!toHex || !isFiniteNumber(toHex.q) || !isFiniteNumber(toHex.r)) {
    return Infinity
  }

  const key = hexKey(toHex)
  const terrain = boardState?.terrainByHex?.[key]

  if (!terrain) return Infinity
  if (terrain.passable === false) return Infinity
  if (boardState?.occupiedHexes?.has?.(key)) return Infinity

  const terrainType = terrain.type
  const blockedTerrainTypes = Array.isArray(unit?.blockedTerrainTypes)
    ? unit.blockedTerrainTypes
    : []
  if (blockedTerrainTypes.includes(terrainType)) return Infinity

  const terrainDifficulty = toNonNegativeNumber(terrain.terrainDifficulty, 0)
  const maxTerrainDifficulty = unit?.maxTerrainDifficulty
  const safeMaxTerrainDifficulty = isFiniteNumber(maxTerrainDifficulty)
    ? maxTerrainDifficulty
    : Infinity

  if (terrainDifficulty > safeMaxTerrainDifficulty) return Infinity

  return MINIMAL_MOVE_COST + terrainDifficulty
}

export function rotationCost(fromFacing, toFacing) {
  if (!Number.isInteger(fromFacing) || !Number.isInteger(toFacing)) {
    return Infinity
  }

  const normalizedFrom =
    ((fromFacing % HEX_DIRECTIONS_COUNT) + HEX_DIRECTIONS_COUNT) %
    HEX_DIRECTIONS_COUNT
  const normalizedTo =
    ((toFacing % HEX_DIRECTIONS_COUNT) + HEX_DIRECTIONS_COUNT) %
    HEX_DIRECTIONS_COUNT

  const clockwise =
    (normalizedTo - normalizedFrom + HEX_DIRECTIONS_COUNT) %
    HEX_DIRECTIONS_COUNT
  const counterClockwise =
    (normalizedFrom - normalizedTo + HEX_DIRECTIONS_COUNT) %
    HEX_DIRECTIONS_COUNT

  return Math.min(clockwise, counterClockwise)
}

export function canPerformAction({
  action,
  turnStateEntry,
  allowedActionTypes = [],
}) {
  if (!action || !turnStateEntry) return false
  if (!Array.isArray(allowedActionTypes)) return false
  if (!hasValidNonNegativeCost(action.cost)) return false
  if (!allowedActionTypes.includes(action.type)) return false

  const actionCost = toNonNegativeNumber(action.cost, 0)
  const actionsRemaining = toNonNegativeNumber(turnStateEntry.actionsRemaining, 0)
  if (actionsRemaining < actionCost) return false

  if (action.type === 'fire') return turnStateEntry.isLoaded === true
  if (action.type === 'reload') return turnStateEntry.isLoaded === false

  return true
}

export function applyActionEffects({ action, turnStateEntry }) {
  if (!hasValidNonNegativeCost(action?.cost)) {
    return { turnStateEntry: { ...turnStateEntry } }
  }

  const actionCost = toNonNegativeNumber(action?.cost, 0)
  const actionsRemaining = toNonNegativeNumber(
    turnStateEntry?.actionsRemaining,
    0
  )

  const nextState = {
    ...turnStateEntry,
    actionsRemaining: Math.max(0, actionsRemaining - actionCost),
  }

  if (action?.type === 'fire') nextState.isLoaded = false
  if (action?.type === 'reload') nextState.isLoaded = true

  return { turnStateEntry: nextState }
}

const ALLOWED_MOTION_MODES = new Set(['both', 'forward', 'reverse', 'maneuver'])

// Flat cost to rotate to ANY other facing in `'maneuver'` mode. Matches the
// live game's TURN action: applyCommand charges `updateUnitFacing(..., cost: 1)`
// to reorient fully (one turn reaches any 0..5 facing). So a maneuver rotation
// edge connects `(q,r,f)` → `(q,r,f')` for every `f' !== f` at a flat +1 — it is
// NOT per-step and NOT terrain-scaled.
const MANEUVER_ROTATION_COST = 1

/**
 * @param {Object} params
 * @param {Object} params.unit
 * @param {Object} params.boardState
 * @param {number} params.actionsRemaining
 * @param {Set<string>} [params.targetSet]
 * @param {Map<string, number>} [params.costMap]
 * @param {'both'|'forward'|'reverse'|'maneuver'} [params.motionMode='both']
 *   `'forward'`  — only fixed-facing forward steps are explored (move turntable action).
 *   `'reverse'`  — only fixed-facing backward steps are explored (reverse turntable action).
 *   `'both'`     — fixed-facing forward/backward union.
 *   `'maneuver'` — forward/backward union PLUS flat-cost rotation edges to every
 *                  other facing (cost `MANEUVER_ROTATION_COST` per turn). Used
 *                  ONLY by the GameMapBlock highlight overlay — NOT by the
 *                  simulation/legality path, which stays directional.
 * @returns {{ keysSet: Set<string>, costMap: Map<string, number> }}
 *   `costMap` values are min total cost over facing; only hexes with minCost ≤ budget.
 */
export function computeReachableHexes({
  unit,
  boardState,
  actionsRemaining,
  targetSet = new Set(),
  costMap: costMapOption,
  motionMode = 'both',
}) {
  targetSet.clear()
  const costMap = costMapOption instanceof Map ? costMapOption : new Map()
  costMap.clear()
  const safeMotionMode = ALLOWED_MOTION_MODES.has(motionMode) ? motionMode : 'both'

  if (!unit || !unit.position || !boardState) {
    return { keysSet: targetSet, costMap }
  }

  const startQ = Number(unit.position.q)
  const startR = Number(unit.position.r)
  if (!Number.isFinite(startQ) || !Number.isFinite(startR)) {
    return { keysSet: targetSet, costMap }
  }

  const width = Number(boardState.width)
  const height = Number(boardState.height)
  const hasBounds = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
  const budget = toNonNegativeNumber(actionsRemaining, 0)
  const startFacing = normalizeFacing(unit.facing)

  const distances = new Map()
  const hexMinByPosition = new Map()
  const open = []
  heapPush(open, { q: startQ, r: startR, facing: startFacing, cost: 0 })
  distances.set(stateKey(startQ, startR, startFacing), 0)
  bumpHexMin(hexMinByPosition, startQ, startR, 0)

  while (open.length > 0) {
    const current = heapPopMin(open)
    if (!current) continue
    if (current.cost > budget) continue

    const currentStateKey = stateKey(current.q, current.r, current.facing)
    const bestDist = distances.get(currentStateKey)
    if (bestDist == null || current.cost > bestDist) continue

    const directions = boardState.getDirectionsForRow?.(current.r)
    if (!Array.isArray(directions) || directions.length !== HEX_DIRECTIONS_COUNT) {
      continue
    }

    const forwardDelta = directions[current.facing]
    const backwardFacing = normalizeFacing(current.facing + 3)
    const backwardDelta = directions[backwardFacing]
    // `'maneuver'` translates exactly like `'both'` (forward + backward union);
    // its extra reach comes from the rotation edges pushed below.
    const movementTransitions =
      safeMotionMode === 'forward'
        ? [forwardDelta]
        : safeMotionMode === 'reverse'
          ? [backwardDelta]
          : [forwardDelta, backwardDelta]

    movementTransitions.forEach(delta => {
      if (!delta) return
      const nextQ = current.q + delta.q
      const nextR = current.r + delta.r
      if (
        hasBounds &&
        (nextQ < 0 || nextQ >= width || nextR < 0 || nextR >= height)
      ) {
        return
      }

      const nextHex = { q: nextQ, r: nextR }
      const enterCost = stepCostToEnter(unit, nextHex, boardState)
      if (!Number.isFinite(enterCost)) return

      const nextCost = current.cost + enterCost
      if (nextCost > budget) return

      const key = stateKey(nextQ, nextR, current.facing)
      const known = distances.get(key)
      if (known == null || nextCost < known) {
        distances.set(key, nextCost)
        bumpHexMin(hexMinByPosition, nextQ, nextR, nextCost)
        heapPush(open, { q: nextQ, r: nextR, facing: current.facing, cost: nextCost })
      }
    })

    // `'maneuver'` only: rotation edges to every OTHER facing at a flat +1.
    // Rotation stays on the same hex, so it never lowers this position's min
    // cost (the step that delivered us here already recorded a cost ≤ this one);
    // we deliberately do NOT bumpHexMin. What it unlocks is the rotated state
    // translating in a NEW direction on later pops — reaching hexes off the
    // current forward/backward axis.
    if (safeMotionMode === 'maneuver') {
      for (let nextFacing = 0; nextFacing < HEX_DIRECTIONS_COUNT; nextFacing++) {
        if (nextFacing === current.facing) continue
        const rotatedCost = current.cost + MANEUVER_ROTATION_COST
        if (rotatedCost > budget) continue
        const rotatedKey = stateKey(current.q, current.r, nextFacing)
        const knownRotated = distances.get(rotatedKey)
        if (knownRotated == null || rotatedCost < knownRotated) {
          distances.set(rotatedKey, rotatedCost)
          heapPush(open, { q: current.q, r: current.r, facing: nextFacing, cost: rotatedCost })
        }
      }
    }
  }

  for (const [posKey, minCost] of hexMinByPosition) {
    if (minCost <= budget) {
      costMap.set(posKey, minCost)
      targetSet.add(posKey)
    }
  }

  return { keysSet: targetSet, costMap }
}
