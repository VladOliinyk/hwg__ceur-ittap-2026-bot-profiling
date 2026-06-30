import { describe, expect, it } from 'vitest'
import { createStrategyFromConfig } from '../strategyProfiles.js'

// Anti-stall drift scenario: defensive doctrine, no-damage streak, one plain
// advance available for the LEAD unit. Two own units make the centroid lag
// behind the lead, so the lead sits on the midpoint and whether it advances
// depends ONLY on the effective bias — i.e. on the drift horizon. This pins two
// things: (1) maxTurns is threaded through createStrategyFromConfig into the
// horizon, and (2) an uncapped (infinite-horizon) strategy still anti-stalls via
// the absolute fallback window instead of freezing forever.
// (No objective deadline here — a deadline would override the horizon.)
function idleObservation(idle) {
  return {
    perspective: 'player1',
    turnsSinceLastDamage: idle,
    ownUnits: [
      { id: 'lead', player: 'player1', position: { q: 0, r: 3 }, facing: 0, attackPower: 30, isLoaded: true },
      { id: 'rear', player: 'player1', position: { q: 0, r: 7 }, facing: 0, attackPower: 30, isLoaded: true }
    ],
    enemyUnits: [{ id: 'e1', player: 'player2', position: { q: 0, r: 0 }, health: 60, attackPower: 30 }],
    bases: { player1: [], player2: [] },
    objectives: { mode: 'primaryBlue', primary: { id: 'x', type: 'eliminateUnits', player: 'player1', targetPlayer: 'player2' } }
  }
}

const ADVANCE = { type: 'move', unitId: 'lead', payload: { to: { q: 0, r: 2 } } }
const LEGAL = [ADVANCE, { type: 'endTurn' }]

describe('createStrategyFromConfig maxTurns wiring', () => {
  it('falls back to endTurn when endTurn is the only legal command (smoke)', () => {
    const strategy = createStrategyFromConfig({ profile: 'aggressive' }, { playerId: 'player1', maxTurns: 100 })
    expect(typeof strategy).toBe('function')
    expect(strategy({ perspective: 'player1', ownUnits: [], enemyUnits: [] }, [{ type: 'endTurn' }]))
      .toEqual({ type: 'endTurn' })
  })

  it('threads maxTurns into the drift horizon: a tight cap commits sooner than the uncapped fallback', () => {
    // defensive frac 0.15. Cap 20 -> window 3 turns; idle 5 saturates -> advance.
    const capped = createStrategyFromConfig({ profile: 'defensive' }, { playerId: 'player1', maxTurns: 20 })
    expect(capped(idleObservation(5), LEGAL)).toBe(ADVANCE)

    // Uncapped -> infinite horizon -> absolute window UNBOUNDED_DRIFT_HORIZON*0.15
    // = 15 turns; at idle 5 the bias has not drifted far enough, so it still holds.
    const uncapped = createStrategyFromConfig({ profile: 'defensive' }, { playerId: 'player1' })
    expect(uncapped(idleObservation(5), LEGAL)).toEqual({ type: 'endTurn' })
  })

  it('an uncapped strategy still anti-stalls (drifts to advance) given a long enough quiet streak', () => {
    const uncapped = createStrategyFromConfig({ profile: 'defensive' }, { playerId: 'player1' })
    expect(uncapped(idleObservation(50), LEGAL)).toBe(ADVANCE)
  })
})
