import { describe, expect, it } from 'vitest'
import { runMatch } from '../runMatch.js'
import { loadLevelPackage } from '../../level/loadLevelPackage.js'
import { makeMicroLevelPackage, fetchFromPublic } from './fixtures.js'

const pass = () => ({ type: 'endTurn' })

describe('turn-limit material decision', () => {
  it('declares the materially-ahead side the winner at the turn cap (not a hollow maxTurns)', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    const r = runMatch({
      levelPackage: loaded.package,
      strategies: { player1: pass, player2: pass },
      seed: 'cap-1',
      maxTurns: 3
    })
    // Both sides pass, so no combat — level_000 ships player2 with 5 units vs
    // player1's 4, so player2 leads on material at the cap.
    expect(r.reason).toBe('materialDecision')
    expect(r.winner).toBe('player2')
  })

  it('reports a draw at the cap when material is even', () => {
    const pkg = makeMicroLevelPackage() // symmetric 1v1
    const r = runMatch({
      levelPackage: pkg,
      strategies: { player1: pass, player2: pass },
      seed: 'cap-2',
      maxTurns: 3
    })
    expect(r.reason).toBe('materialDecision')
    expect(r.winner).toBe('draw')
  })

  it('never reports the hollow maxTurns reason', () => {
    const pkg = makeMicroLevelPackage()
    const r = runMatch({
      levelPackage: pkg,
      strategies: { player1: pass, player2: pass },
      seed: 'cap-3',
      maxTurns: 2
    })
    expect(r.reason).not.toBe('maxTurns')
  })
})
