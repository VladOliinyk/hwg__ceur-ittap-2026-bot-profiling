import { describe, expect, it } from 'vitest'
import {
  TABLE_SCOPES,
  getTableScopeForPlayer,
  getTurntableOperationsKeyForPlayer,
  calculateActiveHighlight
} from '../movesTableScope'

describe('movesTableScope', () => {
  describe('getTableScopeForPlayer', () => {
    it('maps player1 to OUR and player2 to ENEMY', () => {
      expect(getTableScopeForPlayer('player1')).toBe(TABLE_SCOPES.OUR)
      expect(getTableScopeForPlayer('player2')).toBe(TABLE_SCOPES.ENEMY)
    })

    it('maps any non-player2 id to OUR (same tier as player1)', () => {
      expect(getTableScopeForPlayer('player1')).toBe(getTableScopeForPlayer('other'))
    })
  })

  describe('scope vs JSON keys (decoupling)', () => {
    it('keeps render scope distinct from turntable JSON keys for the same player', () => {
      expect(getTableScopeForPlayer('player1')).not.toBe(getTurntableOperationsKeyForPlayer('player1'))
      expect(getTableScopeForPlayer('player2')).not.toBe(getTurntableOperationsKeyForPlayer('player2'))
      expect(getTurntableOperationsKeyForPlayer('player1')).toBe('Our_operations')
      expect(getTurntableOperationsKeyForPlayer('player2')).toBe('Enemy_operations')
    })
  })

  describe('calculateActiveHighlight', () => {
    it('returns matching 1-based row index when player, roll, and table scope align', () => {
      expect(
        calculateActiveHighlight('player1', 4, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: 4 })

      expect(
        calculateActiveHighlight('player2', 2, TABLE_SCOPES.ENEMY, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: 2 })
    })

    it('returns inactive with no highlight when tableScope is not a valid UI scope', () => {
      expect(calculateActiveHighlight('player1', 3, 'oops', 6)).toEqual({
        isTableActive: false,
        highlightRowIndex: null
      })
    })

    it('returns null highlight when currentRoll is null or undefined', () => {
      expect(
        calculateActiveHighlight('player1', null, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
      expect(
        calculateActiveHighlight('player1', undefined, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
    })

    it('returns null highlight when currentRoll is not a valid D6 face', () => {
      expect(
        calculateActiveHighlight('player1', 7, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
      expect(
        calculateActiveHighlight('player1', 0, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
    })

    it('returns null highlight when currentRoll exceeds maxDiceRows', () => {
      expect(
        calculateActiveHighlight('player1', 6, TABLE_SCOPES.OUR, 4)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
    })

    it('returns null highlight when maxDiceRows is 0 or NaN', () => {
      expect(
        calculateActiveHighlight('player1', 3, TABLE_SCOPES.OUR, 0)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
      expect(
        calculateActiveHighlight('player1', 3, TABLE_SCOPES.OUR, NaN)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
    })

    it('floors fractional maxDiceRows when comparing to roll', () => {
      expect(
        calculateActiveHighlight('player1', 5, TABLE_SCOPES.OUR, 5.9)
      ).toEqual({ isTableActive: true, highlightRowIndex: 5 })
      expect(
        calculateActiveHighlight('player1', 6, TABLE_SCOPES.OUR, 5.9)
      ).toEqual({ isTableActive: true, highlightRowIndex: null })
    })

    it('sets isTableActive true only for the current player table scope', () => {
      expect(
        calculateActiveHighlight('player1', 3, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: 3 })

      expect(
        calculateActiveHighlight('player1', 3, TABLE_SCOPES.ENEMY, 6)
      ).toEqual({ isTableActive: false, highlightRowIndex: null })

      expect(
        calculateActiveHighlight('player2', 3, TABLE_SCOPES.ENEMY, 6)
      ).toEqual({ isTableActive: true, highlightRowIndex: 3 })

      expect(
        calculateActiveHighlight('player2', 3, TABLE_SCOPES.OUR, 6)
      ).toEqual({ isTableActive: false, highlightRowIndex: null })
    })
  })
})
