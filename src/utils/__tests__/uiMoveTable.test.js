import { describe, expect, it } from 'vitest'
import {
  normalizeActionList,
  normalizeOperations,
  getMaxDiceRows,
  isSameActionList
} from '../uiMoveTable'

describe('uiMoveTable', () => {
  it('normalizes action list, strips placeholders, and removes duplicate actions', () => {
    const result = normalizeActionList([
      ' fire ',
      '-',
      'reload',
      'fire',
      '<img src=x onerror=alert(1)>',
      'RELOAD',
      42
    ])
    expect(result).toEqual(['fire', 'reload', '<img src=x onerror=alert(1)>'])
  })

  it('normalizes malformed operations shape without throwing', () => {
    const result = normalizeOperations(
      [{ title: '', moves: [{ title: '', dice: [null, [' move ', '-']] }] }, null],
      'our'
    )
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('UNNAMED')
    expect(result[0].moves[0].title).toBe('-')
    expect(result[0].moves[0].dice[0]).toEqual([])
    expect(result[0].moves[0].dice[1]).toEqual(['move'])
  })

  it('computes max dice rows safely', () => {
    const ops = normalizeOperations([
      { title: 'A', moves: [{ title: 'x', dice: [['move'], ['turn'], ['fire']] }] },
      { title: 'B', moves: [{ title: 'y', dice: [['reload']] }] }
    ])
    expect(getMaxDiceRows(ops)).toBe(3)
    expect(getMaxDiceRows(null)).toBe(0)
  })

  it('compares action lists deterministically', () => {
    expect(isSameActionList(['move', 'turn'], ['move', 'turn'])).toBe(true)
    expect(isSameActionList(['move'], ['turn'])).toBe(false)
    expect(isSameActionList(null, ['turn'])).toBe(false)
  })
})
