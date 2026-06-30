/**
 * Heuristic strategy: turntable-respecting executor with a thin doctrine layer.
 *
 * Decision order per call:
 *   1. FIRE — if any fire command is legal, pick the best target (valuation).
 *   2. REPOSITION — pick the single turn/move/reverse that most improves the
 *      unit's position/facing toward its active target (enemy↔home pole, blended
 *      by the doctrine's orientationBias plus anti-stall drift). turntable
 *      priority is the tie-break among equally-good options.
 *   3. RELOAD — if a unit is unloaded and nothing above was productive.
 *   4. endTurn — only when no action is net-positive (prevents both the stall
 *      and pointless oscillation).
 *
 * The turntable (level data) already gates which action TYPES are legal per die;
 * this chooser never overrides that, it only resolves what the turntable leaves
 * open. AI numbers live in aiConfig.js, not level data.
 *
 * @module domain/simulation/strategies/heuristicStrategy
 */

import {
  hexDistanceOffset,
  hexFacingToward,
  normalizeHexFacing
} from '@/domain/engine/hexUtils.js'
import { resolveDoctrineConfig } from '../aiConfig.js'

export const HEURISTIC_PROFILES = Object.freeze({
  DEFENSIVE: 'defensive',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive'
})

function isHexPosition(value) {
  return value && Number.isInteger(value.q) && Number.isInteger(value.r)
}

function unitById(units, id) {
  return Array.isArray(units) ? (units.find(u => u && u.id === id) || null) : null
}

function commandKey(command) {
  if (!command || typeof command !== 'object') return ''
  return JSON.stringify({
    type: command.type || '',
    unitId: command.unitId || '',
    payload: command.payload || null
  })
}

function primaryObjective(observation) {
  const objectives = observation && observation.objectives
  return objectives && objectives.primary && typeof objectives.primary === 'object'
    ? objectives.primary
    : null
}

function facingDistance(a, b) {
  const diff = Math.abs(normalizeHexFacing(a) - normalizeHexFacing(b))
  return Math.min(diff, 6 - diff)
}

function centroid(positions) {
  const pts = positions.filter(isHexPosition)
  if (pts.length === 0) return null
  let q = 0
  let r = 0
  for (const p of pts) {
    q += p.q
    r += p.r
  }
  return { q: Math.round(q / pts.length), r: Math.round(r / pts.length) }
}

function baseCentroid(observation, player) {
  const bases = observation && observation.bases && Array.isArray(observation.bases[player])
    ? observation.bases[player]
    : []
  return centroid(bases)
}

function homeCentroid(observation, unit) {
  const own = Array.isArray(observation && observation.ownUnits)
    ? observation.ownUnits.map(u => u && u.position)
    : []
  return centroid(own) || (isHexPosition(unit.position) ? { q: unit.position.q, r: unit.position.r } : null)
}

function nearestEnemyPos(unit, observation) {
  const enemies = Array.isArray(observation && observation.enemyUnits) ? observation.enemyUnits : []
  let best = null
  let bestId = ''
  let bestDist = Infinity
  for (const enemy of enemies) {
    if (!enemy || !isHexPosition(enemy.position)) continue
    const distance = hexDistanceOffset(unit.position, enemy.position)
    if (distance < bestDist || (distance === bestDist && String(enemy.id) < String(bestId))) {
      best = { q: enemy.position.q, r: enemy.position.r }
      bestId = enemy.id
      bestDist = distance
    }
  }
  return best
}

// Notional horizon used for anti-stall drift when a caller supplies no finite
// turn cap (horizon === Infinity) — e.g. the Playground "auto-play turn" feature
// runs an unbounded game. It mirrors runMatch's DEFAULT_MAX_TURNS so an
// uncapped game commits on the same schedule as a default-length match: a
// doctrine reaches full enemy orientation after `UNBOUNDED_DRIFT_HORIZON *
// driftWindowFraction` idle player-turns. Without this, an infinite horizon
// froze the effective bias at the base forever, so a balanced/defensive bot
// advanced to the midfield and then stood still for the rest of the game.
export const UNBOUNDED_DRIFT_HORIZON = 100

export function computeEffectiveBias(baseBias, turnsSinceLastDamage, horizon, driftWindowFraction) {
  const b = Number.isFinite(baseBias) ? Math.max(0, Math.min(1, baseBias)) : 0.5
  const idle = Number.isFinite(turnsSinceLastDamage) ? Math.max(0, turnsSinceLastDamage) : 0
  const frac = Number.isFinite(driftWindowFraction) && driftWindowFraction > 0 ? driftWindowFraction : 0.5
  // A finite, non-positive horizon explicitly disables drift. An unbounded
  // (non-finite) horizon instead falls back to an absolute idle window derived
  // from UNBOUNDED_DRIFT_HORIZON, so anti-stall still engages without a cap.
  if (Number.isFinite(horizon) && horizon <= 0) return b
  const effectiveHorizon = Number.isFinite(horizon) ? horizon : UNBOUNDED_DRIFT_HORIZON
  const window = frac * effectiveHorizon
  if (window <= 0) return b
  const ramp = Math.max(0, Math.min(1, idle / window))
  return Math.max(0, Math.min(1, b + (1 - b) * ramp))
}

export function lerpRound(a, b, t) {
  return { q: Math.round(a.q + t * (b.q - a.q)), r: Math.round(a.r + t * (b.r - a.r)) }
}

function activeTarget(observation, unit, effectiveBias) {
  const objective = primaryObjective(observation)
  const me = observation && observation.perspective
  if (objective && me === objective.player) {
    if (objective.type === 'occupyBase') {
      const base = baseCentroid(observation, objective.basePlayer || objective.targetPlayer)
      if (base) return base
    }
    if (objective.type === 'protectBase') {
      const base = baseCentroid(observation, objective.basePlayer || objective.player)
      if (base) return base
    }
  }
  const enemy = nearestEnemyPos(unit, observation)
  const home = homeCentroid(observation, unit)
  if (!enemy) return home
  if (!home) return enemy
  return lerpRound(home, enemy, effectiveBias)
}

function repositionValue(command, unit, target) {
  if (!target || !isHexPosition(unit.position)) return 0
  if (command.type === 'turn') {
    const facing = command.payload && command.payload.facing
    if (!Number.isInteger(facing) || !Number.isInteger(unit.facing)) return 0
    const desired = hexFacingToward(unit.position, target)
    return facingDistance(unit.facing, desired) - facingDistance(facing, desired)
  }
  if (command.type === 'move' || command.type === 'reverse') {
    const to = command.payload && command.payload.to
    if (!isHexPosition(to)) return 0
    return hexDistanceOffset(unit.position, target) - hexDistanceOffset(to, target)
  }
  return 0
}

export function chooseFireTarget(fireCommands, observation, valuation) {
  let best = null
  let bestScore = -Infinity
  let bestKey = ''
  for (const command of fireCommands) {
    const unit = unitById(observation.ownUnits, command.unitId)
    const targetId = command.payload && command.payload.target && command.payload.target.unitId
    const target = unitById(observation.enemyUnits, targetId)
    if (!unit || !target) continue
    const attackPower = Number(unit.attackPower) || 0
    const health = Number(target.health) || 0
    const danger = Number(target.attackPower) || 0
    const score =
      (attackPower >= health ? valuation.kill : 0) +
      Math.min(attackPower, health) * valuation.damage +
      danger * valuation.danger
    const key = commandKey(command)
    if (best === null || score > bestScore || (score === bestScore && key < bestKey)) {
      best = command
      bestScore = score
      bestKey = key
    }
  }
  return best || fireCommands[0] || null
}

function commandPriority(command) {
  return Number.isInteger(command.turntablePriority) ? command.turntablePriority : Infinity
}

export function createHeuristicStrategy({
  profile = HEURISTIC_PROFILES.BALANCED,
  config = null,
  maxTurns = null
} = {}) {
  const doctrine = resolveDoctrineConfig(profile, config)
  const baseBias = doctrine.orientationBias
  const driftWindowFraction = doctrine.driftWindowFraction
  const valuation = doctrine.targetValuation

  return function chooseHeuristicCommand(observation, legalCommands) {
    if (!Array.isArray(legalCommands) || legalCommands.length === 0) return null
    const actions = legalCommands.filter(c => c && c.type !== 'endTurn')
    const endTurnCommand = legalCommands.find(c => c && c.type === 'endTurn') || { type: 'endTurn' }
    if (actions.length === 0) return endTurnCommand

    // 1. FIRE whenever the turntable allows it and a target exists.
    const fires = actions.filter(c => c.type === 'fire')
    if (fires.length) return chooseFireTarget(fires, observation, valuation)

    // Horizon for anti-stall drift: objective deadline if any, else maxTurns.
    const objective = primaryObjective(observation)
    const deadline = objective && Number.isInteger(objective.deadlineTurns) ? objective.deadlineTurns : null
    const horizon = deadline != null
      ? deadline
      : (Number.isInteger(maxTurns) && maxTurns > 0 ? maxTurns : Infinity)
    const idle = Number(observation && observation.turnsSinceLastDamage) || 0
    const effectiveBias = computeEffectiveBias(baseBias, idle, horizon, driftWindowFraction)

    // 2. REPOSITION: best net-positive turn/move toward the active target.
    let best = null
    let bestVal = 0
    let bestKey = ''
    let bestPri = Infinity
    for (const command of actions) {
      if (command.type !== 'turn' && command.type !== 'move' && command.type !== 'reverse') continue
      const unit = unitById(observation.ownUnits, command.unitId)
      if (!unit || !isHexPosition(unit.position)) continue
      const target = activeTarget(observation, unit, effectiveBias)
      if (!target) continue
      const value = repositionValue(command, unit, target)
      if (value <= 0) continue
      const key = commandKey(command)
      const pri = commandPriority(command)
      if (
        best === null ||
        value > bestVal ||
        (value === bestVal && (pri < bestPri || (pri === bestPri && key < bestKey)))
      ) {
        best = command
        bestVal = value
        bestKey = key
        bestPri = pri
      }
    }
    if (best) return best

    // 3. RELOAD to prepare a future shot (only offered when unit is unloaded).
    const reloads = actions.filter(c => c.type === 'reload')
    if (reloads.length) {
      return reloads.slice().sort((a, b) => {
        const pa = commandPriority(a)
        const pb = commandPriority(b)
        if (pa !== pb) return pa - pb
        const ka = commandKey(a)
        const kb = commandKey(b)
        return ka < kb ? -1 : ka > kb ? 1 : 0
      })[0]
    }

    // 4. Break a stalemate. When fully committed (effectiveBias maxed out by a
    //    long no-damage streak) but no strictly-positive action exists, a unit
    //    that just holds freezes until the turn cap — exactly the endgame where
    //    one side can't quite corner the last enemy. Allow the best NON-NEGATIVE
    //    reposition (never retreat / never worsen aim) so units keep circling for
    //    a firing lane; any damage resets the idle clock and ends the probing.
    //    Early game (bias < 1) still holds cleanly — no oscillation.
    if (effectiveBias >= 1) {
      let probe = null
      let probeVal = -Infinity
      let probeKey = ''
      let probePri = Infinity
      for (const command of actions) {
        if (command.type !== 'turn' && command.type !== 'move' && command.type !== 'reverse') continue
        const unit = unitById(observation.ownUnits, command.unitId)
        if (!unit || !isHexPosition(unit.position)) continue
        const target = activeTarget(observation, unit, effectiveBias)
        if (!target) continue
        const value = repositionValue(command, unit, target)
        if (value < 0) continue
        // Prefer relocation (move/reverse) over a pure turn so the unit actually
        // changes hex and exposes a new firing lane.
        const ranked = value + (command.type === 'move' || command.type === 'reverse' ? 0.5 : 0)
        const key = commandKey(command)
        const pri = commandPriority(command)
        if (
          probe === null ||
          ranked > probeVal ||
          (ranked === probeVal && (pri < probePri || (pri === probePri && key < probeKey)))
        ) {
          probe = command
          probeVal = ranked
          probeKey = key
          probePri = pri
        }
      }
      if (probe) return probe
    }

    // 5. Nothing productive — hold (do not oscillate).
    return endTurnCommand
  }
}
