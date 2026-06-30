/**
 * Behavioral-profile metrics for the "dual-channel behavioral-profile
 * verification" method (research harness, not part of the game build graph).
 *
 * Pure functions over a bot's command stream:
 *  - classifyCommand: code one command A (aggressive) / D (cautious) / N (neutral)
 *    A = fire, or a move/reverse that REDUCES distance to the nearest enemy.
 *    D = a move/reverse that INCREASES that distance.
 *    N = turn, reload, lateral move, or a move with no living enemy to measure against.
 *  - extractCodedSequence: the bot side's coded command stream from onFrame frames.
 *  - aggressiveness: aMove = toward/(toward+away) over moves only (the doctrine
 *    signal, since firing is unconditional in the engine); aAll = A/(A+D) overall.
 *  - consistency: c = 1 - s/s0 where s is the A/D switch rate and s0 = 2p(1-p)
 *    is the switch rate expected under an i.i.d. Bernoulli(p=p(A)) null.
 *    c>0 streakier than chance, c≈0 random-like, c<0 anti-persistent (alternating).
 *  - runLengths: maximal-run distribution + fraction of actions inside runs >=3.
 *
 * @module domain/simulation/experimentMetrics
 */

import { hexDistanceOffset } from '@/domain/engine/hexUtils.js'

const MOVE_TYPES = new Set(['move', 'reverse'])

function nearestDistance(pos, positions, distanceFn) {
  let min = Infinity
  for (const p of positions) {
    const d = distanceFn(pos, p)
    if (d < min) min = d
  }
  return min
}

/**
 * Code a single bot command as A / D / N.
 * @param {object} command applied command record ({type, unitId, from?, to?})
 * @param {Array<{q:number,r:number}>} enemyPositions living-enemy hexes in the frame
 * @param {(a:object,b:object)=>number} [distanceFn] hex distance (default real)
 * @returns {'A'|'D'|'N'}
 */
export function classifyCommand(command, enemyPositions, distanceFn = hexDistanceOffset) {
  if (!command || typeof command.type !== 'string') return 'N'
  const type = command.type
  if (type === 'fire') return 'A'
  if (!MOVE_TYPES.has(type)) return 'N' // turn, reload, endTurn, anything else
  const { from, to } = command
  if (!from || !to) return 'N'
  if (!Array.isArray(enemyPositions) || enemyPositions.length === 0) return 'N'
  const before = nearestDistance(from, enemyPositions, distanceFn)
  const after = nearestDistance(to, enemyPositions, distanceFn)
  if (after < before) return 'A'
  if (after > before) return 'D'
  return 'N'
}

function livingEnemyPositions(engine, botPlayer) {
  const out = []
  const units = engine && engine.units
  if (!Array.isArray(units)) return out
  for (const entry of units) {
    const unit = Array.isArray(entry) ? entry[1] : entry
    if (!unit || unit.player == null || unit.player === botPlayer) continue
    const alive = unit.health == null ? true : unit.health > 0
    if (!alive || !unit.position) continue
    out.push(unit.position)
  }
  return out
}

/**
 * Extract the bot side's coded command stream from a list of onFrame frames.
 * Keeps only `afterCommand` frames acted by `botPlayer`, dropping endTurn.
 * @returns {Array<{type:string, code:'A'|'D'|'N'}>}
 */
export function extractCodedSequence(frames, botPlayer, options = {}) {
  const distanceFn = options.distanceFn || hexDistanceOffset
  const coded = []
  if (!Array.isArray(frames)) return coded
  for (const f of frames) {
    if (!f || f.event !== 'afterCommand' || f.actingPlayer !== botPlayer) continue
    const command = f.command
    if (!command || typeof command.type !== 'string' || command.type === 'endTurn') continue
    const enemyPositions = livingEnemyPositions(f.engine, botPlayer)
    coded.push({ type: command.type, code: classifyCommand(command, enemyPositions, distanceFn) })
  }
  return coded
}

/**
 * Aggressiveness indices from a coded sequence.
 * aMove = toward/(toward+away) over move/reverse only; aAll = A/(A+D) overall.
 * Either is null when its denominator is 0.
 */
export function aggressiveness(coded) {
  let A = 0, D = 0, neutral = 0, fires = 0, towardMoves = 0, awayMoves = 0
  for (const c of coded) {
    if (c.code === 'A') A += 1
    else if (c.code === 'D') D += 1
    else neutral += 1
    if (c.type === 'fire') fires += 1
    if (MOVE_TYPES.has(c.type)) {
      if (c.code === 'A') towardMoves += 1
      else if (c.code === 'D') awayMoves += 1
    }
  }
  const moveDenom = towardMoves + awayMoves
  const allDenom = A + D
  return {
    A,
    D,
    neutral,
    fires,
    towardMoves,
    awayMoves,
    aMove: moveDenom > 0 ? towardMoves / moveDenom : null,
    aAll: allDenom > 0 ? A / allDenom : null
  }
}

/**
 * Consistency c = 1 - s/s0 over the A/D sub-sequence (N dropped).
 * Returns c=1 for a constant streak (s0=0) and c=null for sequences shorter than 2.
 */
export function consistency(adSequence) {
  const seq = Array.isArray(adSequence) ? adSequence.filter(x => x === 'A' || x === 'D') : []
  const n = seq.length
  if (n < 2) return { c: null, n, switches: 0, switchRate: null, p: null, s0: null }
  let switches = 0
  let countA = seq[0] === 'A' ? 1 : 0
  for (let i = 1; i < n; i++) {
    if (seq[i] !== seq[i - 1]) switches += 1
    if (seq[i] === 'A') countA += 1
  }
  const switchRate = switches / (n - 1)
  const p = countA / n
  const s0 = 2 * p * (1 - p)
  const c = s0 === 0 ? 1 : 1 - switchRate / s0
  return { c, n, switches, switchRate, p, s0 }
}

/**
 * Maximal-run distribution over the A/D sub-sequence.
 * @returns {{lengths:number[], maxRun:number, fractionInRunsGTE3:number}}
 */
export function runLengths(adSequence) {
  const seq = Array.isArray(adSequence) ? adSequence.filter(x => x === 'A' || x === 'D') : []
  const lengths = []
  let i = 0
  while (i < seq.length) {
    let j = i + 1
    while (j < seq.length && seq[j] === seq[i]) j += 1
    lengths.push(j - i)
    i = j
  }
  const maxRun = lengths.length ? Math.max(...lengths) : 0
  const inGTE3 = lengths.filter(l => l >= 3).reduce((s, l) => s + l, 0)
  return {
    lengths,
    maxRun,
    fractionInRunsGTE3: seq.length > 0 ? inGTE3 / seq.length : 0
  }
}

/**
 * Mean, sample sd (n-1) and 95% normal-approx CI half-width over a list of
 * per-match values. Nulls / non-finite values are dropped (a match where a
 * ratio was undefined does not contribute). ci95 is null for n<2.
 * @param {Array<number|null>} values
 * @returns {{n:number, mean:number|null, sd:number|null, ci95:number|null}}
 */
export function meanCI(values) {
  const v = Array.isArray(values) ? values.filter(x => x != null && Number.isFinite(x)) : []
  const n = v.length
  if (n === 0) return { n: 0, mean: null, sd: null, ci95: null }
  const mean = v.reduce((s, x) => s + x, 0) / n
  if (n === 1) return { n: 1, mean, sd: 0, ci95: null }
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  return { n, mean, sd, ci95: 1.96 * sd / Math.sqrt(n) }
}
