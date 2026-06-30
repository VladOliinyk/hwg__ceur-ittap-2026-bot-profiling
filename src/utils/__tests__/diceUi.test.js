import { describe, expect, it } from 'vitest'
import { getDiceResultForUi, normalizeDiceFaceForUi } from '../diceUi'

describe('diceUi', () => {
  it('normalizeDiceFaceForUi accepts 1–6 and rejects edge cases', () => {
    expect(normalizeDiceFaceForUi(3)).toBe(3)
    expect(normalizeDiceFaceForUi('4')).toBe(4)
    expect(normalizeDiceFaceForUi(null)).toBeNull()
    expect(normalizeDiceFaceForUi(NaN)).toBeNull()
    expect(normalizeDiceFaceForUi(0)).toBeNull()
    expect(normalizeDiceFaceForUi(7)).toBeNull()
  })

  it('getDiceResultForUi returns null without gameState', () => {
    expect(getDiceResultForUi(null, 0)).toBeNull()
  })

  it('getDiceResultForUi normalizes engine value', () => {
    const gs = {
      currentTurnActions: [],
      getCurrentDiceResult() {
        return '2'
      }
    }
    expect(getDiceResultForUi(gs, 1)).toBe(2)
  })
})
