import artilleryBodyIcon from './units/unit_artillery_body.svg?url'
import artilleryBodySvg from './units/unit_artillery_body.svg?raw'
import btrBodyIcon from './units/unit_btr_body.svg?url'
import btrBodySvg from './units/unit_btr_body.svg?raw'
import cavalryBodyIcon from './units/unit_cavalry_body.svg?url'
import cavalryBodySvg from './units/unit_cavalry_body.svg?raw'
import infantryBodyIcon from './units/unit_infantry_body.svg?url'
import infantryBodySvg from './units/unit_infantry_body.svg?raw'
import infantry2BodyIcon from './units/unit_infantry2_body.svg?url'
import infantry2BodySvg from './units/unit_infantry2_body.svg?raw'
import mlrsBodyIcon from './units/unit_mlrs_body.svg?url'
import mlrsBodySvg from './units/unit_mlrs_body.svg?raw'
import mortarBodyIcon from './units/unit_mortar_body.svg?url'
import mortarBodySvg from './units/unit_mortar_body.svg?raw'
import scoutBodyIcon from './units/unit_scout_body.svg?url'
import scoutBodySvg from './units/unit_scout_body.svg?raw'
import tankBodyIcon from './units/unit_tank_body.svg?url'
import tankBodySvg from './units/unit_tank_body.svg?raw'
import truckOldBodyIcon from './units/unit_truck_old_body.svg?url'
import truckOldBodySvg from './units/unit_truck_old_body.svg?raw'
import unknownBodyIcon from './units/unit_unknown_body.svg?url'
import unknownBodySvg from './units/unit_unknown_body.svg?raw'
import unitArrowIcon from './unit_arrow.svg?url'

export const FALLBACK_UNIT_ICON_KEY = 'unknown'

const UNIT_ICON_ALIASES = Object.freeze({
  generic: FALLBACK_UNIT_ICON_KEY,
  tank: 'armored'
})

const UNIT_ICON_PICKER_PRIORITY = Object.freeze([
  FALLBACK_UNIT_ICON_KEY,
  'armored',
  'infantry',
  'artillery',
  'scout'
])

const UNIT_ICON_VARIANTS = Object.freeze({
  neutral: Object.freeze({
    fill: 'black',
    outlineFill: 'white',
    outlineStroke: null
  }),
  player1: Object.freeze({
    fill: '#2196F3',
    outlineFill: '#07365B',
    outlineStroke: 'white'
  }),
  player2: Object.freeze({
    fill: '#DC3545',
    outlineFill: '#652128',
    outlineStroke: 'white'
  })
})

function compareUnitIconKeys(a, b) {
  const aPriority = UNIT_ICON_PICKER_PRIORITY.indexOf(a)
  const bPriority = UNIT_ICON_PICKER_PRIORITY.indexOf(b)
  const aRank = aPriority === -1 ? UNIT_ICON_PICKER_PRIORITY.length : aPriority
  const bRank = bPriority === -1 ? UNIT_ICON_PICKER_PRIORITY.length : bPriority
  if (aRank !== bRank) return aRank - bRank
  return a.localeCompare(b)
}

export const UNIT_ICONS = {
  unknown: {
    body: unknownBodyIcon,
    bodySvg: unknownBodySvg,
    arrow: unitArrowIcon
  },
  armored: {
    body: tankBodyIcon,
    bodySvg: tankBodySvg,
    arrow: unitArrowIcon
  },
  infantry: {
    body: infantryBodyIcon,
    bodySvg: infantryBodySvg,
    arrow: unitArrowIcon
  },
  artillery: {
    body: artilleryBodyIcon,
    bodySvg: artilleryBodySvg,
    arrow: unitArrowIcon
  },
  scout: {
    body: scoutBodyIcon,
    bodySvg: scoutBodySvg,
    arrow: unitArrowIcon
  },
  btr: {
    body: btrBodyIcon,
    bodySvg: btrBodySvg,
    arrow: unitArrowIcon
  },
  cavalry: {
    body: cavalryBodyIcon,
    bodySvg: cavalryBodySvg,
    arrow: unitArrowIcon
  },
  infantry2: {
    body: infantry2BodyIcon,
    bodySvg: infantry2BodySvg,
    arrow: unitArrowIcon
  },
  mlrs: {
    body: mlrsBodyIcon,
    bodySvg: mlrsBodySvg,
    arrow: unitArrowIcon
  },
  mortar: {
    body: mortarBodyIcon,
    bodySvg: mortarBodySvg,
    arrow: unitArrowIcon
  },
  truck_old: {
    body: truckOldBodyIcon,
    bodySvg: truckOldBodySvg,
    arrow: unitArrowIcon
  }
}

const tintedUnitIconCache = new Map()
const SVG_SOURCE_RE = /^\s*<svg\b/i

function resolveUnitIconKey(unitType) {
  const key = typeof unitType === 'string' ? unitType.trim() : ''
  if (key in UNIT_ICONS) return key
  const alias = UNIT_ICON_ALIASES[key]
  if (alias && alias in UNIT_ICONS) return alias
  return FALLBACK_UNIT_ICON_KEY
}

function normalizeIconVariant(value) {
  if (value === 1 || value === '1') return 'player1'
  if (value === 2 || value === '2') return 'player2'
  const key = typeof value === 'string' ? value.trim() : ''
  if (key === 'player1' || key === 'player2') return key
  return 'neutral'
}

function isSvgSource(value) {
  return typeof value === 'string' && SVG_SOURCE_RE.test(value)
}

function utf8ToBinaryString(value) {
  return encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, byte) =>
    String.fromCharCode(Number.parseInt(byte, 16))
  )
}

function svgToDataUrl(svg) {
  const normalizedSvg = String(svg).trim()
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(utf8ToBinaryString(normalizedSvg))}`
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalizedSvg)}`
}

function applySvgFill(svg, palette) {
  let firstWhitePathRecolored = false
  const withOutline = String(svg).replace(/<path\b([^>]*?)\/>/gi, (match, attrs) => {
    if (firstWhitePathRecolored || !/\sfill=(["'])white\1/i.test(attrs)) return match
    firstWhitePathRecolored = true
    let nextAttrs = attrs.replace(/\sfill=(["'])white\1/i, ` fill="${palette.outlineFill}"`)
    if (palette.outlineStroke) {
      if (/\sstroke=(["'])[^"']*\1/i.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(/\sstroke=(["'])[^"']*\1/i, ` stroke="${palette.outlineStroke}"`)
      } else {
        nextAttrs += ` stroke="${palette.outlineStroke}"`
      }
    }
    return `<path${nextAttrs}/>`
  })

  return withOutline
    .replace(/fill=(["'])#DC3545\1/gi, `fill="${palette.fill}"`)
    .replace(/fill=(["'])#2196F3\1/gi, `fill="${palette.fill}"`)
    .replace(/fill=(["'])black\1/gi, `fill="${palette.fill}"`)
    .replace(/stroke=(["'])#DC3545\1/gi, `stroke="${palette.fill}"`)
    .replace(/stroke=(["'])#2196F3\1/gi, `stroke="${palette.fill}"`)
    .replace(/stroke=(["'])black\1/gi, `stroke="${palette.fill}"`)
}

function getTintedUnitBodyIcon(unitIcons, key, variant) {
  const svg = unitIcons.bodySvg
  if (variant === 'neutral' || !isSvgSource(svg)) return unitIcons.body

  const cacheKey = `${key}:${variant}`
  if (!tintedUnitIconCache.has(cacheKey)) {
    const palette = UNIT_ICON_VARIANTS[variant] || UNIT_ICON_VARIANTS.neutral
    tintedUnitIconCache.set(cacheKey, svgToDataUrl(applySvgFill(svg, palette)))
  }
  return tintedUnitIconCache.get(cacheKey)
}

export function getUnitIcon(unitType, iconType = 'body', options = {}) {
  const key = resolveUnitIconKey(unitType)
  const unitIcons = UNIT_ICONS[key] || UNIT_ICONS[FALLBACK_UNIT_ICON_KEY]

  if (iconType === 'body') {
    const variant = normalizeIconVariant(options.player || options.variant)
    return getTintedUnitBodyIcon(unitIcons, key, variant)
  }

  return unitIcons[iconType] || unitIcons.body
}

export function getAvailableUnitTypes() {
  return Object.keys(UNIT_ICONS).sort(compareUnitIconKeys)
}

export function hasUnitIcons(unitType) {
  return typeof unitType === 'string' && unitType.trim() in UNIT_ICONS
}

export default UNIT_ICONS
