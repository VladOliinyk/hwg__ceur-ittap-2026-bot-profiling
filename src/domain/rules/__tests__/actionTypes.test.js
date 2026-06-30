import { describe, expect, it } from 'vitest'
import {
  ACTION_TYPES,
  ACTION_TYPE_PHASE,
  ALL_ACTION_TYPES,
  DEFAULT_ACTION_COST,
  PHASES,
  isKnownActionType,
  normalizeActionType
} from '../actionTypes.js'

describe('ACTION_TYPES enum', () => {
  it('matches the lowercase strings used by level_*_turntable.json', () => {
    expect(ACTION_TYPES.MOVE).toBe('move')
    expect(ACTION_TYPES.REVERSE).toBe('reverse')
    expect(ACTION_TYPES.TURN).toBe('turn')
    expect(ACTION_TYPES.FIRE).toBe('fire')
    expect(ACTION_TYPES.RELOAD).toBe('reload')
  })

  it('PHASES match canonical turntable operation titles', () => {
    expect(PHASES.MANOEUVRE).toBe('MANOEUVRE')
    expect(PHASES.ATTACK).toBe('ATTACK')
  })

  it('ACTION_TYPE_PHASE maps each known action type to a phase', () => {
    for (const type of ALL_ACTION_TYPES) {
      expect(Object.values(PHASES)).toContain(ACTION_TYPE_PHASE[type])
    }
  })

  it('DEFAULT_ACTION_COST covers single-AP non-path actions', () => {
    expect(DEFAULT_ACTION_COST[ACTION_TYPES.TURN]).toBe(1)
    expect(DEFAULT_ACTION_COST[ACTION_TYPES.FIRE]).toBe(1)
    expect(DEFAULT_ACTION_COST[ACTION_TYPES.RELOAD]).toBe(1)
  })
})

describe('isKnownActionType / normalizeActionType', () => {
  it('returns true for known canonical types', () => {
    expect(isKnownActionType('move')).toBe(true)
    expect(isKnownActionType('FIRE')).toBe(true)
    expect(isKnownActionType('  Reload  ')).toBe(true)
  })

  it('returns false for unknown or non-string input', () => {
    expect(isKnownActionType('teleport')).toBe(false)
    expect(isKnownActionType('')).toBe(false)
    expect(isKnownActionType(null)).toBe(false)
    expect(isKnownActionType(42)).toBe(false)
  })

  it('normalizeActionType lowercases and trims input', () => {
    expect(normalizeActionType('  MOVE  ')).toBe('move')
    expect(normalizeActionType('Fire')).toBe('fire')
    expect(normalizeActionType(null)).toBe('')
  })

  it('ACTION_TYPES is frozen', () => {
    expect(Object.isFrozen(ACTION_TYPES)).toBe(true)
    expect(Object.isFrozen(PHASES)).toBe(true)
    expect(Object.isFrozen(ACTION_TYPE_PHASE)).toBe(true)
  })
})
