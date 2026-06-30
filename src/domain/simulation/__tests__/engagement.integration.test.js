import { describe, expect, it } from 'vitest'
import { loadLevelPackage } from '../../level/loadLevelPackage.js'
import { runConfiguredMatch } from '../runConfiguredMatch.js'
import { fetchFromPublic } from './fixtures.js'

async function loadReal() {
  const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
  expect(loaded.ok).toBe(true)
  return loaded.package
}

function run(pkg, profile, seed, maxTurns = 100) {
  return runConfiguredMatch({
    levelPackage: pkg,
    runConfig: {
      seed,
      maxTurns,
      players: { player1: { profile }, player2: { profile } }
    }
  })
}

describe('engagement integration (level_000)', () => {
  it('defensive vs defensive ends by real combat, not maxTurns', async () => {
    const pkg = await loadReal()
    const out = run(pkg, 'defensive', 'engagement-def-1')
    expect(out.result.reason).not.toBe('maxTurns')
    expect(out.result.turns).toBeLessThan(100)
  })

  it('balanced vs balanced fires and resolves under the cap', async () => {
    const pkg = await loadReal()
    const out = run(pkg, 'balanced', 'engagement-bal-1')
    const fires = out.result.metrics.actionsByType.fire
    expect(fires).toBeGreaterThan(0)
    expect(out.result.reason).not.toBe('maxTurns')
  })

  it('aggressive vs aggressive resolves and deals damage', async () => {
    const pkg = await loadReal()
    const out = run(pkg, 'aggressive', 'engagement-agg-1')
    const totalDamage = out.result.metrics.damageByPlayer.player1 + out.result.metrics.damageByPlayer.player2
    expect(totalDamage).toBeGreaterThan(0)
    expect(out.result.reason).not.toBe('maxTurns')
  })

  it('is deterministic for a fixed seed', async () => {
    const pkg = await loadReal()
    const a = run(pkg, 'balanced', 'engagement-determinism')
    const b = run(pkg, 'balanced', 'engagement-determinism')
    expect(a.result).toEqual(b.result)
  })

  it('EVERY match ends with a real verdict — never the hollow maxTurns reason', async () => {
    const pkg = await loadReal()
    const profiles = ['defensive', 'balanced', 'aggressive']
    for (let i = 0; i < 18; i += 1) {
      const a = profiles[i % 3]
      const b = profiles[(i + 1) % 3]
      const out = runConfiguredMatch({
        levelPackage: pkg,
        runConfig: { seed: `every-${i}`, maxTurns: 100, players: { player1: { profile: a }, player2: { profile: b } } }
      })
      // The decisive guarantee: no match is left as a hollow "ran out of turns".
      // Either a terminal objective fired (elimination/base/deadline) or the cap
      // was resolved as a material verdict — always a real winner or an explicit draw.
      expect(out.result.reason).not.toBe('maxTurns')
      expect(['player1', 'player2', 'draw']).toContain(out.result.winner)
    }
  })
})
