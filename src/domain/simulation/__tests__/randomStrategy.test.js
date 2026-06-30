import { describe, expect, it } from 'vitest'
import { randomStrategy } from '../strategies/randomStrategy.js'
import { createRng } from '../rng.js'

describe('randomStrategy', () => {
  it('returns null when legalCommands is empty', () => {
    const strat = randomStrategy()
    expect(strat({}, [], createRng('rs'))).toBeNull()
  })

  it('throws when rng has no nextInt()', () => {
    const strat = randomStrategy()
    expect(() => strat({}, [{ type: 'endTurn' }], {})).toThrow()
  })

  it('is deterministic for a fixed rng + command list', () => {
    const commands = [
      { type: 'move', unitId: 'a', payload: { to: { q: 0, r: 0 } } },
      { type: 'move', unitId: 'b', payload: { to: { q: 0, r: 0 } } },
      { type: 'fire', unitId: 'c', payload: { target: { q: 0, r: 0, unitId: 'x' } } },
      { type: 'endTurn' }
    ]
    const seqA = []
    const seqB = []
    const stratA = randomStrategy()
    const stratB = randomStrategy()
    const rngA = createRng('strat')
    const rngB = createRng('strat')
    for (let i = 0; i < 20; i++) {
      seqA.push(stratA({}, commands, rngA))
      seqB.push(stratB({}, commands, rngB))
    }
    expect(seqA).toEqual(seqB)
  })

  it('default preferAction: true skips endTurn when other commands exist', () => {
    const strat = randomStrategy()
    const rng = createRng('skip-end')
    const commands = [
      { type: 'move', unitId: 'a', payload: { to: { q: 0, r: 0 } } },
      { type: 'endTurn' }
    ]
    for (let i = 0; i < 30; i++) {
      const picked = strat({}, commands, rng)
      expect(picked.type).not.toBe('endTurn')
    }
  })

  it('preferAction: true falls back to endTurn when it is the only option', () => {
    const strat = randomStrategy()
    const rng = createRng('only-end')
    const picked = strat({}, [{ type: 'endTurn' }], rng)
    expect(picked.type).toBe('endTurn')
  })

  it('preferAction: false picks endTurn uniformly with other commands', () => {
    const strat = randomStrategy({ preferAction: false })
    const rng = createRng('uniform')
    const commands = [
      { type: 'move', unitId: 'a', payload: { to: { q: 0, r: 0 } } },
      { type: 'endTurn' }
    ]
    let endTurnCount = 0
    for (let i = 0; i < 1000; i++) {
      if (strat({}, commands, rng).type === 'endTurn') endTurnCount += 1
    }
    // Without the bias, expect roughly half of picks to be endTurn.
    expect(endTurnCount).toBeGreaterThan(400)
    expect(endTurnCount).toBeLessThan(600)
  })
})
