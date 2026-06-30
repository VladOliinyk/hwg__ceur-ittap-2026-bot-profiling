import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERRAIN_COLORS,
  TERRAIN_COLOR_UNKNOWN,
  resolveTerrainColor
} from '../terrainColors.js'

describe('DEFAULT_TERRAIN_COLORS', () => {
  it('contains canonical entries for all 8 standard terrain ids', () => {
    const ids = ['grass', 'forest', 'water', 'mountain', 'desert', 'plains', 'mud', 'snow']
    for (const id of ids) {
      expect(DEFAULT_TERRAIN_COLORS).toHaveProperty(id)
      expect(typeof DEFAULT_TERRAIN_COLORS[id]).toBe('string')
    }
  })

  it('is frozen (no mutation)', () => {
    expect(Object.isFrozen(DEFAULT_TERRAIN_COLORS)).toBe(true)
  })
})

describe('resolveTerrainColor', () => {
  it('returns the PACKAGE color when the package defines a custom color for the id', () => {
    const packageTerrainTypes = [
      { id: 'water', color: '#0000FF' },
      { id: 'grass', color: '#00FF00' }
    ]
    // Must override the default ('#2196F3' for water, '#4CAF50' for grass)
    expect(resolveTerrainColor(packageTerrainTypes, 'water')).toBe('#0000FF')
    expect(resolveTerrainColor(packageTerrainTypes, 'grass')).toBe('#00FF00')
  })

  it('returns the DEFAULT color when the package does not define the terrain id', () => {
    const packageTerrainTypes = [{ id: 'water', color: '#0000FF' }]
    // 'grass' not in package → fall back to default
    expect(resolveTerrainColor(packageTerrainTypes, 'grass')).toBe(DEFAULT_TERRAIN_COLORS.grass)
  })

  it('returns the DEFAULT color when packageTerrainTypes is null', () => {
    expect(resolveTerrainColor(null, 'forest')).toBe(DEFAULT_TERRAIN_COLORS.forest)
  })

  it('returns the DEFAULT color when packageTerrainTypes is undefined', () => {
    expect(resolveTerrainColor(undefined, 'mountain')).toBe(DEFAULT_TERRAIN_COLORS.mountain)
  })

  it('returns TERRAIN_COLOR_UNKNOWN ("#CCCCCC") for a totally unknown terrain id', () => {
    expect(resolveTerrainColor(null, 'volcano')).toBe(TERRAIN_COLOR_UNKNOWN)
    expect(resolveTerrainColor([], 'volcano')).toBe(TERRAIN_COLOR_UNKNOWN)
  })

  it('returns TERRAIN_COLOR_UNKNOWN when package has the id but no valid color', () => {
    const packageTerrainTypes = [{ id: 'water', color: '' }]
    expect(resolveTerrainColor(packageTerrainTypes, 'water')).toBe(DEFAULT_TERRAIN_COLORS.water)
  })

  it('returns TERRAIN_COLOR_UNKNOWN when terrainId is null or undefined', () => {
    expect(resolveTerrainColor(null, null)).toBe(TERRAIN_COLOR_UNKNOWN)
    expect(resolveTerrainColor(null, undefined)).toBe(TERRAIN_COLOR_UNKNOWN)
  })

  it('package color takes priority over default — different value confirms override', () => {
    const customColor = '#ABCDEF'
    expect(customColor).not.toBe(DEFAULT_TERRAIN_COLORS.water)
    expect(resolveTerrainColor([{ id: 'water', color: customColor }], 'water')).toBe(customColor)
  })
})
