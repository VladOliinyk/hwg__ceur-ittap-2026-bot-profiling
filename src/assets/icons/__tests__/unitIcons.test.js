import { Buffer } from 'node:buffer'
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FALLBACK_UNIT_ICON_KEY, UNIT_ICONS, getAvailableUnitTypes, getUnitIcon, hasUnitIcons } from '../index.js'

const UNIT_ICON_PICKER_PRIORITY = [
  'unknown',
  'armored',
  'infantry',
  'artillery',
  'scout'
]

function decodeBase64Utf8(value) {
  return Buffer.from(value, 'base64').toString('utf8')
}

function decodeSvgDataUrl(value) {
  expect(value).toMatch(/^data:image\/svg\+xml/)
  const [, metadata = '', payload = ''] = value.match(/^data:image\/svg\+xml([^,]*),(.*)$/) || []
  if (/;base64/i.test(metadata)) return decodeBase64Utf8(payload)
  return decodeURIComponent(payload)
}

function compareUnitIconKeys(a, b) {
  const aPriority = UNIT_ICON_PICKER_PRIORITY.indexOf(a)
  const bPriority = UNIT_ICON_PICKER_PRIORITY.indexOf(b)
  const aRank = aPriority === -1 ? UNIT_ICON_PICKER_PRIORITY.length : aPriority
  const bRank = bPriority === -1 ? UNIT_ICON_PICKER_PRIORITY.length : bPriority
  if (aRank !== bRank) return aRank - bRank
  return a.localeCompare(b)
}

function iconKeyFromFileName(fileName) {
  return fileName
    .replace(/^unit_/, '')
    .replace(/_body\.svg$/, '')
    .replace(/^tank$/, 'armored')
}

function expectedUnitIconKeysFromFolder() {
  return readdirSync(new URL('../units/', import.meta.url))
    .filter(fileName => /^unit_[^/]+_body\.svg$/.test(fileName))
    .map(iconKeyFromFileName)
    .sort(compareUnitIconKeys)
}

describe('unit icon catalog', () => {
  it('returns a fallback body icon for unknown custom unit types', () => {
    expect(hasUnitIcons('custom_unit')).toBe(false)
    expect(FALLBACK_UNIT_ICON_KEY).toBe('unknown')
    expect(getUnitIcon('custom_unit', 'body')).toBe(getUnitIcon(FALLBACK_UNIT_ICON_KEY, 'body'))
    expect(getUnitIcon('custom_unit', 'arrow')).toBe(getUnitIcon(FALLBACK_UNIT_ICON_KEY, 'arrow'))
  })

  it('keeps legacy generic icon keys as an alias for unknown', () => {
    expect(hasUnitIcons('generic')).toBe(false)
    expect(getUnitIcon('generic', 'body')).toBe(getUnitIcon('unknown', 'body'))
  })

  it('exposes every unit body icon from the units folder in the picker list', () => {
    expect(getAvailableUnitTypes()).toEqual(expectedUnitIconKeysFromFolder())
    expect(getAvailableUnitTypes()).toEqual([
      'unknown',
      'armored',
      'infantry',
      'artillery',
      'scout',
      'btr',
      'cavalry',
      'infantry2',
      'mlrs',
      'mortar',
      'truck_old'
    ])
  })

  it('keeps the legacy armored key mapped to the tank body icon file', () => {
    expect(hasUnitIcons('armored')).toBe(true)
    expect(hasUnitIcons('tank')).toBe(false)
    expect(getUnitIcon('tank', 'body')).toBe(getUnitIcon('armored', 'body'))
  })

  it('falls back to the bundled asset URL when raw svg source is unavailable', () => {
    const originalScoutSvg = UNIT_ICONS.scout.bodySvg
    UNIT_ICONS.scout.bodySvg = 'img/unit_scout_body.svg'

    try {
      expect(getUnitIcon('scout', 'body', { player: 'player1' })).toBe(getUnitIcon('scout', 'body'))
    } finally {
      UNIT_ICONS.scout.bodySvg = originalScoutSvg
    }
  })

  it('can tint body icons by player while leaving neutral icons in the neutral palette', () => {
    const neutral = getUnitIcon('armored', 'body')
    const player1 = getUnitIcon('armored', 'body', { player: 'player1' })
    const player2 = getUnitIcon('armored', 'body', { player: 'player2' })

    expect(player1).toMatch(/^data:image\/svg\+xml/)
    expect(player2).toMatch(/^data:image\/svg\+xml/)
    expect(neutral).not.toBe(player1)
    expect(neutral).not.toBe(player2)

    const neutralSvg = neutral.match(/^data:image\/svg\+xml/) ? decodeSvgDataUrl(neutral) : ''
    const player1Svg = decodeSvgDataUrl(player1)
    const player2Svg = decodeSvgDataUrl(player2)
    if (neutralSvg) {
      expect(neutralSvg).toMatch(/fill=['"]black['"]/)
      expect(neutralSvg).not.toMatch(/fill=['"]#2196F3['"]/)
      expect(neutralSvg).not.toMatch(/fill=['"]#DC3545['"]/)
    }
    expect(player1Svg).toContain('fill="#2196F3"')
    expect(player1Svg).toContain('fill="#07365B"')
    expect(player1Svg).not.toContain('fill="black"')
    expect(player2Svg).toContain('fill="#DC3545"')
    expect(player2Svg).toContain('fill="#652128"')
    expect(player2Svg).not.toContain('fill="black"')
  })
})
