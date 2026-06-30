import { describe, it, expect } from 'vitest'
import { createStrategyFromConfig, STRATEGY_PROFILES } from '../strategyProfiles.js'
import { createRng } from '../rng.js'

// Wiring for the live Playground doctrine picker: cautious/random are first-class
// profiles that dispatch to the experiment strategies instead of heuristic doctrines.
describe('createStrategyFromConfig — cautious/random dispatch', () => {
  it('exposes cautious and random as selectable profiles', () => {
    expect(STRATEGY_PROFILES.CAUTIOUS).toBe('cautious')
    expect(STRATEGY_PROFILES.RANDOM).toBe('random')
  })

  it('builds a callable cautious strategy that ignores rng', () => {
    const strategy = createStrategyFromConfig({ profile: STRATEGY_PROFILES.CAUTIOUS })
    expect(typeof strategy).toBe('function')
    // No enemies and no relocations → falls back to endTurn, no rng required.
    const cmd = strategy({ ownUnits: [], enemyUnits: [] }, [{ type: 'endTurn' }])
    expect(cmd).toEqual({ type: 'endTurn' })
  })

  it('builds a callable random strategy that consumes an rng', () => {
    const strategy = createStrategyFromConfig({ profile: STRATEGY_PROFILES.RANDOM })
    expect(typeof strategy).toBe('function')
    const rng = createRng('dispatch-test-seed')
    const legal = [{ type: 'move' }, { type: 'fire' }, { type: 'endTurn' }]
    const cmd = strategy({}, legal, rng)
    expect(legal).toContain(cmd)
  })

  it('random strategy throws without an rng (why live auto-play injects one)', () => {
    const strategy = createStrategyFromConfig({ profile: STRATEGY_PROFILES.RANDOM })
    expect(() => strategy({}, [{ type: 'move' }])).toThrow(/rng/i)
  })

  it('still builds heuristic strategies for the three orientationBias doctrines', () => {
    for (const profile of [STRATEGY_PROFILES.DEFENSIVE, STRATEGY_PROFILES.BALANCED, STRATEGY_PROFILES.AGGRESSIVE]) {
      const strategy = createStrategyFromConfig({ profile }, { playerId: 'player1' })
      expect(typeof strategy).toBe('function')
    }
  })
})
