/**
 * Experiment-only bot schemes that span the behavioral plane the built-in
 * doctrines do not. Engine is untouched; these are strategy functions of the
 * same (observation, legalCommands, rng) shape the runner already drives.
 *
 *  - cautiousStrategy: a genuine "defensive" archetype — retreat from the
 *    nearest enemy (the move/reverse that most increases min-distance), else
 *    hold. Produces D-coded commands the orientationBias doctrines never do.
 *  - mixStrategy(beta): retreat with probability beta, else play the aggressive
 *    heuristic. Sweeping beta yields a clean aMove ≈ 1-beta dose-response — the
 *    quantified "tune aggressiveness" lever for E2.
 *
 * @module domain/simulation/experimentStrategies
 */

import { hexDistanceOffset } from '@/domain/engine/hexUtils.js'
import { createHeuristicStrategy } from './strategies/heuristicStrategy.js'

function isHex(p) {
  return p && Number.isInteger(p.q) && Number.isInteger(p.r)
}

function minEnemyDistance(pos, enemies, distanceFn) {
  let min = Infinity
  for (const e of enemies) {
    const d = distanceFn(pos, e)
    if (d < min) min = d
  }
  return min
}

export function cautiousStrategy({ distanceFn = hexDistanceOffset } = {}) {
  return function chooseCautious(observation, legalCommands) {
    if (!Array.isArray(legalCommands) || legalCommands.length === 0) return null
    const endTurn = legalCommands.find(c => c && c.type === 'endTurn') || { type: 'endTurn' }
    const moves = legalCommands.filter(
      c => c && (c.type === 'move' || c.type === 'reverse') && c.payload && isHex(c.payload.to)
    )
    if (moves.length === 0) return endTurn
    const enemies = Array.isArray(observation && observation.enemyUnits)
      ? observation.enemyUnits.map(u => u && u.position).filter(isHex)
      : []
    if (enemies.length === 0) return endTurn
    const ownById = new Map((observation.ownUnits || []).filter(u => u && u.id != null).map(u => [u.id, u]))

    // Greedy evasion: among legal relocations pick the one that MAXIMIZES the
    // post-move distance to the nearest enemy. Retreats when it can; side-steps
    // to the least-exposed hex when every option closes (a pure "increase
    // distance or hold" rule self-corners against the back edge and never acts).
    let best = null
    let bestAfter = -Infinity
    let bestKey = ''
    for (const cmd of moves) {
      const unit = ownById.get(cmd.unitId)
      if (!unit || !isHex(unit.position)) continue
      const after = minEnemyDistance(cmd.payload.to, enemies, distanceFn)
      const key = `${cmd.unitId}:${cmd.payload.to.q},${cmd.payload.to.r}`
      if (best === null || after > bestAfter || (after === bestAfter && key < bestKey)) {
        best = cmd
        bestAfter = after
        bestKey = key
      }
    }
    return best || endTurn
  }
}

/**
 * Pure, DI-testable mixer: pick cautious with probability beta (rng.next()<beta),
 * else aggressive. Separated from mixStrategy so the coin-flip is testable
 * without instantiating the real heuristic.
 */
export function makeMixChooser(aggressiveFn, cautiousFn, beta) {
  const b = Math.max(0, Math.min(1, Number(beta) || 0))
  return function chooseMixed(observation, legalCommands, rng) {
    const useCautious = rng && typeof rng.next === 'function' ? rng.next() < b : false
    return (useCautious ? cautiousFn : aggressiveFn)(observation, legalCommands, rng)
  }
}

export function mixStrategy(beta, { profile = 'aggressive', maxTurns = null, distanceFn = hexDistanceOffset } = {}) {
  const aggressive = createHeuristicStrategy({ profile, maxTurns })
  const cautious = cautiousStrategy({ distanceFn })
  return makeMixChooser(aggressive, cautious, beta)
}
