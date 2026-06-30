import { describe, it, expect, vi } from 'vitest'
import {
  UNIT_CARD_HEX_POINTS,
  isUnitAlive,
  normalizeUnitHealth,
  getUnitIconPath,
  unitFacingDegrees,
  formatOperationTitle,
  getMoveDiceActions,
  operationDiceGroups,
  actionChips,
  computeUnitProgress,
  computeUnitPreview
} from '../unitPreview.js'

// Deterministic icon resolution so preview-icon assertions do not depend on
// Vite asset URL resolution. getUnitIconPath delegates here.
vi.mock('../../assets/icons/index.js', () => ({
  getUnitIcon: (type, iconType) => `icon:${type || 'none'}:${iconType}`
}))

describe('unitPreview UNIT_CARD_HEX_POINTS', () => {
  it('is a non-empty polygon point string', () => {
    expect(typeof UNIT_CARD_HEX_POINTS).toBe('string')
    expect(UNIT_CARD_HEX_POINTS.length).toBeGreaterThan(0)
    // Six vertices => six "x,y" coordinate pairs.
    expect(UNIT_CARD_HEX_POINTS.trim().split(/\s+/)).toHaveLength(6)
  })
})

describe('unitPreview.isUnitAlive', () => {
  it('returns false for nullish units', () => {
    expect(isUnitAlive(null)).toBe(false)
    expect(isUnitAlive(undefined)).toBe(false)
  })

  it('delegates to a unit isAlive() method when present', () => {
    expect(isUnitAlive({ isAlive: () => true })).toBe(true)
    expect(isUnitAlive({ isAlive: () => false })).toBe(false)
  })

  it('falls back to isActive + health when no isAlive method', () => {
    expect(isUnitAlive({ isActive: true, health: 5 })).toBe(true)
    expect(isUnitAlive({ isActive: false, health: 5 })).toBe(false)
    expect(isUnitAlive({ isActive: true, health: 0 })).toBe(false)
    // Missing health defaults to 1 (alive).
    expect(isUnitAlive({ isActive: true })).toBe(true)
  })
})

describe('unitPreview.normalizeUnitHealth', () => {
  it('returns full health when health is absent (NaN) and max defaults to 100', () => {
    // An object with no health field: Number(undefined) is NaN, so health
    // falls back to max (100).
    expect(normalizeUnitHealth({})).toEqual({ health: 100, max: 100, percent: 100 })
  })

  it('treats an explicit null unit as zero health (Number(null) === 0)', () => {
    // `unit && unit.health` short-circuits to null; Number(null) is 0, which is
    // finite, so health clamps to 0 — distinct from the missing-field case.
    expect(normalizeUnitHealth(null)).toEqual({ health: 0, max: 100, percent: 0 })
  })

  it('computes the percentage from health/max', () => {
    expect(normalizeUnitHealth({ health: 30, maxHealth: 60 })).toEqual({
      health: 30,
      max: 60,
      percent: 50
    })
  })

  it('clamps health into the [0, max] range', () => {
    expect(normalizeUnitHealth({ health: -5, maxHealth: 40 })).toEqual({
      health: 0,
      max: 40,
      percent: 0
    })
    expect(normalizeUnitHealth({ health: 999, maxHealth: 40 })).toEqual({
      health: 40,
      max: 40,
      percent: 100
    })
  })

  it('defaults a non-positive or non-finite max to 100', () => {
    expect(normalizeUnitHealth({ health: 25, maxHealth: 0 })).toEqual({
      health: 25,
      max: 100,
      percent: 25
    })
    expect(normalizeUnitHealth({ health: 25, maxHealth: 'nope' })).toEqual({
      health: 25,
      max: 100,
      percent: 25
    })
  })
})

describe('unitPreview.getUnitIconPath', () => {
  it('resolves an icon from a unit object using iconKey then type', () => {
    expect(getUnitIconPath({ iconKey: 'scout', type: 'infantry' }, 'body')).toBe('icon:scout:body')
    expect(getUnitIconPath({ type: 'infantry' }, 'arrow')).toBe('icon:infantry:arrow')
  })

  it('resolves an icon from a bare type string and defaults to body', () => {
    expect(getUnitIconPath('armored')).toBe('icon:armored:body')
  })

  it('returns null when no type can be derived', () => {
    expect(getUnitIconPath(null)).toBeNull()
    expect(getUnitIconPath({})).toBeNull()
  })
})

describe('unitPreview.unitFacingDegrees', () => {
  it('maps facing 0..5 to 30 + 60*facing degrees', () => {
    expect(unitFacingDegrees(0)).toBe(30)
    expect(unitFacingDegrees(3)).toBe(210)
    expect(unitFacingDegrees(5)).toBe(330)
  })

  it('wraps out-of-range and treats non-integers as 0', () => {
    expect(unitFacingDegrees(6)).toBe(30)
    expect(unitFacingDegrees(-1)).toBe(330)
    expect(unitFacingDegrees('x')).toBe(30)
    expect(unitFacingDegrees(null)).toBe(30)
  })
})

describe('unitPreview.formatOperationTitle', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(formatOperationTitle('manoeuvre')).toBe('Manoeuvre')
    expect(formatOperationTitle('ATTACK')).toBe('Attack')
  })

  it('returns an empty string for blank/nullish input', () => {
    expect(formatOperationTitle('')).toBe('')
    expect(formatOperationTitle('   ')).toBe('')
    expect(formatOperationTitle(null)).toBe('')
  })
})

describe('unitPreview.getMoveDiceActions', () => {
  const move = { dice: [['move'], ['turn'], []] }

  it('returns the action list for a valid dice index', () => {
    expect(getMoveDiceActions(move, 0)).toEqual(['move'])
    expect(getMoveDiceActions(move, 2)).toEqual([])
  })

  it('returns an empty array for invalid inputs', () => {
    expect(getMoveDiceActions(null, 0)).toEqual([])
    expect(getMoveDiceActions({}, 0)).toEqual([])
    expect(getMoveDiceActions(move, -1)).toEqual([])
    expect(getMoveDiceActions(move, 1.5)).toEqual([])
  })
})

describe('unitPreview.operationDiceGroups', () => {
  it('returns a single empty group when the operation has no moves', () => {
    const groups = operationDiceGroups({ id: 'op1', moves: [] }, 2)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'op1-empty-2', title: '-', showTitle: false, actions: [] })
  })

  it('maps each move to a group, hiding the title for a single move', () => {
    const groups = operationDiceGroups(
      { id: 'op1', moves: [{ id: 'm1', title: 'Drive', dice: [['move']] }] },
      0
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'op1-move-m1-0', title: 'Drive', showTitle: false, actions: ['move'] })
  })

  it('shows the title when an operation has multiple moves', () => {
    const groups = operationDiceGroups(
      {
        id: 'op1',
        moves: [
          { id: 'm1', title: 'Drive', dice: [['move']] },
          { id: 'm2', title: 'Spin', dice: [['turn']] }
        ]
      },
      0
    )
    expect(groups).toHaveLength(2)
    expect(groups.every(group => group.showTitle)).toBe(true)
    expect(groups[1]).toMatchObject({ id: 'op1-move-m2-0', title: 'Spin', actions: ['turn'] })
  })
})

describe('unitPreview.actionChips', () => {
  it('maps actions to chips without priority by default', () => {
    expect(actionChips(['move', 'fire'], false)).toEqual([
      { key: '0-move', label: 'move', priority: null },
      { key: '1-fire', label: 'fire', priority: null }
    ])
  })

  it('assigns 1-based priorities when requested', () => {
    expect(actionChips(['move', 'fire'], true)).toEqual([
      { key: '0-move', label: 'move', priority: 1 },
      { key: '1-fire', label: 'fire', priority: 2 }
    ])
  })

  it('tolerates a non-array input', () => {
    expect(actionChips(null, true)).toEqual([])
  })
})

describe('unitPreview.computeUnitProgress', () => {
  const unit = { id: 'u1', movement: 4 }

  it('reads actionsRemaining from the supplied turnState row', () => {
    const progress = computeUnitProgress(unit, { u1: { actionsRemaining: 2 } })
    expect(progress.normalizedMovement).toBe(4)
    expect(progress.normalizedActions).toBe(2)
  })

  it('falls back to the unit movement when the turnState row is absent', () => {
    const progress = computeUnitProgress(unit, {})
    expect(progress.normalizedActions).toBe(4)
  })

  it('falls back when turnState is null/undefined', () => {
    expect(computeUnitProgress(unit, null).normalizedActions).toBe(4)
    expect(computeUnitProgress(unit, undefined).normalizedActions).toBe(4)
  })

  it('caps the segment count at 16', () => {
    const big = computeUnitProgress({ id: 'u1', movement: 40 }, { u1: { actionsRemaining: 40 } })
    expect(big.segmentCount).toBe(16)
    expect(big.filledCount).toBe(16)
  })

  it('produces the same shape regardless of which page supplies turnState', () => {
    // GEB passes gameState.turnState, AP passes snapshotEngine.turnState — the
    // function only sees a plain object, so identical rows give identical output.
    const fromGeb = computeUnitProgress(unit, { u1: { actionsRemaining: 1 } })
    const fromAp = computeUnitProgress(unit, { u1: { actionsRemaining: 1 } })
    expect(fromGeb).toEqual(fromAp)
  })
})

describe('unitPreview.computeUnitPreview', () => {
  const unit = {
    id: 7,
    type: 'infantry',
    player: 'player2',
    movement: 4,
    facing: 3,
    health: 50,
    maxHealth: 100,
    isActive: true,
    position: { q: 1, r: 2 }
  }

  it('builds the full 12-field preview object', () => {
    const preview = computeUnitPreview(unit, {
      turnState: { 7: { actionsRemaining: 2 } },
      isSelected: true,
      title: 'Custom title',
      progressLabel: 'Actions 2/4'
    })

    expect(Object.keys(preview).sort()).toEqual(
      [
        'arrowIcon',
        'arrowTransform',
        'bodyIcon',
        'healthLabel',
        'healthPercent',
        'id',
        'isAlive',
        'isSelected',
        'playerClass',
        'progress',
        'progressLabel',
        'title',
        'unit'
      ].sort()
    )

    expect(preview.id).toBe('7')
    expect(preview.unit).toBe(unit)
    expect(preview.title).toBe('Custom title')
    expect(preview.progress.normalizedActions).toBe(2)
    expect(preview.progressLabel).toBe('Actions 2/4')
    expect(preview.healthLabel).toBe('50/100')
    expect(preview.healthPercent).toBe(50)
    expect(preview.bodyIcon).toBe('icon:infantry:body')
    expect(preview.arrowIcon).toBe('icon:infantry:arrow')
    expect(preview.arrowTransform).toBe('rotate(210deg)')
    expect(preview.playerClass).toBe('is-player2')
    expect(preview.isSelected).toBe(true)
    expect(preview.isAlive).toBe(true)
  })

  it('maps player1 units to the is-player1 hex class', () => {
    const preview = computeUnitPreview({ ...unit, player: 'player1' }, {})
    expect(preview.playerClass).toBe('is-player1')
  })

  it('coerces isSelected to a boolean and defaults options', () => {
    const preview = computeUnitPreview(unit)
    expect(preview.isSelected).toBe(false)
    expect(preview.title).toBe('')
  })

  it('synthesizes a default progressLabel when none is supplied', () => {
    const preview = computeUnitPreview(unit, { turnState: { 7: { actionsRemaining: 1 } } })
    expect(preview.progressLabel).toBe('Actions 1/4')
  })

  it('marks a destroyed unit as not alive', () => {
    const preview = computeUnitPreview({ ...unit, isActive: false, health: 0 }, {})
    expect(preview.isAlive).toBe(false)
  })
})
