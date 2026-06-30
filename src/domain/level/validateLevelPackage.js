/**
 * LevelPackage validator.
 *
 * Establishes the runtime contract for the split-file level shape that
 * Playground already consumes (`hexmap`, `terrain`, `units`, `turntable`).
 * Used by `loadLevelPackage` before any `GameState` is constructed so that
 * malformed level data fails loudly with structured errors instead of
 * silently producing a partial game.
 *
 * The validator is intentionally pure: it does not fetch, it does not throw
 * on invalid input — it returns `{ ok, errors, warnings, package }`. The
 * `package` field carries the normalized package on success: legacy typos
 * (`terrainDifficuly`, `maxTerrainDifficuly`) are migrated to canonical
 * spellings, and missing `schemaVersion` is treated as legacy v0 and
 * normalized to the current `LATEST_LEVEL_PACKAGE_SCHEMA_VERSION`.
 *
 * @module domain/level/validateLevelPackage
 */

import { ALL_ACTION_TYPES, normalizeActionType } from '../rules/actionTypes.js'
import {
  DEFAULT_UNIT_CATALOG,
  DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID,
  normalizeUnitTypeDef
} from '@/domain/engine/gameUnits.js'
import {
  DEFAULT_PACKAGE_LABEL_LOCALE,
  MAX_PACKAGE_LABEL_KEY_LENGTH,
  MAX_PACKAGE_LABEL_LENGTH,
  hasDefaultLocalizedLabel,
  normalizeLocalizedLabelMap,
  resolveLocalizedLabel
} from '../../utils/packageLabels.js'
import { isSupportedAttackAngle } from '@/domain/engine/hexUtils.js'
import {
  OBJECTIVE_TYPES,
  PLAYER_IDS,
  hasBaseForPlayer,
  opponentOf
} from '../objectives/objectives.js'

/**
 * Current LevelPackage schema version. Bump when an incompatible shape
 * change requires receivers to re-validate or migrate. Legacy packages
 * without a `schemaVersion` field are treated as v0 and normalized to
 * this version with a migration warning.
 */
export const LATEST_LEVEL_PACKAGE_SCHEMA_VERSION = 2

const MAX_BOARD_DIM = 200
const KNOWN_PLAYER_KEYS = ['player1', 'player2']
const KNOWN_UNITS_SECTION_KEYS = [...KNOWN_PLAYER_KEYS, 'unitTypes']
const NO_OP_TOKEN = '-'
const OVERLAY_FIELDS = ['player1Spawn', 'player1Base', 'player2Spawn', 'player2Base']
const MISSING_COORD_REPORT_CAP = 5
const NO_TERRAIN_REPORT_CAP = 3
const SAFE_LEVEL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const SAFE_UNIT_TYPE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const OBJECTIVE_TYPE_VALUES = Object.freeze(Object.values(OBJECTIVE_TYPES))
const LOS_MODE_VALUES = Object.freeze(['direct_fire', 'artillery'])
const UNSAFE_LABEL_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

function isNonNegativeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateLocalizedLabels(labels, path, result) {
  if (labels === undefined) return null
  if (!isPlainObject(labels)) {
    result.error(path, 'labels must be an object keyed by locale')
    return null
  }
  if (Object.keys(labels).length === 0) {
    result.error(path, 'labels must contain at least one locale label when present')
    return null
  }
  for (const [rawKey, rawValue] of Object.entries(labels)) {
    const key = String(rawKey).trim()
    if (!key || UNSAFE_LABEL_KEYS.has(key)) {
      result.error(`${path}.${rawKey}`, 'label locale key must be a safe non-empty string')
      continue
    }
    if (key.length > MAX_PACKAGE_LABEL_KEY_LENGTH) {
      result.error(`${path}.${key}`, `label locale key must be at most ${MAX_PACKAGE_LABEL_KEY_LENGTH} characters`)
      continue
    }
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      result.error(`${path}.${key}`, 'label value must be a non-empty string')
    } else if (rawValue.trim().length > MAX_PACKAGE_LABEL_LENGTH) {
      result.error(`${path}.${key}`, `label value must be at most ${MAX_PACKAGE_LABEL_LENGTH} characters`)
    }
  }
  return normalizeLocalizedLabelMap(labels)
}

class ResultBuilder {
  constructor() {
    this.errors = []
    this.warnings = []
  }
  error(path, message) {
    this.errors.push({ path, message })
  }
  warn(path, message) {
    this.warnings.push({ path, message })
  }
}

function validateHexmap(hexmap, terrainIds, result) {
  if (!isPlainObject(hexmap)) {
    result.error('hexmap', 'hexmap must be an object with `parameters` and `map`')
    return null
  }
  const params = hexmap.parameters
  if (!isPlainObject(params)) {
    result.error('hexmap.parameters', 'hexmap.parameters must be an object')
    return null
  }
  let width = params.width
  let height = params.height
  if (!isPositiveIntegerInRange(width, 1, MAX_BOARD_DIM)) {
    result.error('hexmap.parameters.width', `width must be an integer in [1..${MAX_BOARD_DIM}], got ${width}`)
    width = null
  }
  if (!isPositiveIntegerInRange(height, 1, MAX_BOARD_DIM)) {
    result.error('hexmap.parameters.height', `height must be an integer in [1..${MAX_BOARD_DIM}], got ${height}`)
    height = null
  }
  if (!Array.isArray(hexmap.map) || hexmap.map.length === 0) {
    result.error('hexmap.map', 'hexmap.map must be a non-empty array of hex cells')
    return null
  }
  const seenCoords = new Set()
  const validCells = []
  const cellsWithoutTerrain = []
  hexmap.map.forEach((cell, index) => {
    const cellPath = `hexmap.map[${index}]`
    if (!isPlainObject(cell)) {
      result.error(cellPath, 'hex cell must be an object')
      return
    }
    let coordOk = true
    if (!Number.isInteger(cell.q) || (width != null && (cell.q < 0 || cell.q >= width))) {
      result.error(`${cellPath}.q`, `q must be an integer in [0..${width != null ? width - 1 : '?'}], got ${cell.q}`)
      coordOk = false
    }
    if (!Number.isInteger(cell.r) || (height != null && (cell.r < 0 || cell.r >= height))) {
      result.error(`${cellPath}.r`, `r must be an integer in [0..${height != null ? height - 1 : '?'}], got ${cell.r}`)
      coordOk = false
    }
    if (coordOk) {
      const key = `${cell.q},${cell.r}`
      if (seenCoords.has(key)) {
        result.error(cellPath, `duplicate coordinates (q=${cell.q}, r=${cell.r})`)
      } else {
        seenCoords.add(key)
      }
    }
    if (cell.terrain != null) {
      if (typeof cell.terrain !== 'string' || !cell.terrain.trim()) {
        result.error(`${cellPath}.terrain`, 'terrain id must be a non-empty string')
      } else if (terrainIds && !terrainIds.has(cell.terrain)) {
        result.error(`${cellPath}.terrain`, `unknown terrain id "${cell.terrain}" (not present in terrain.terrainTypes)`)
      }
    } else if (coordOk) {
      cellsWithoutTerrain.push(`(${cell.q},${cell.r})`)
    }
    // GameState.initializeHexes coerces overlay flags with `!!`, so a string like
    // "false" would silently become truthy at runtime. Reject anything that is
    // not a strict boolean (absent fields are fine — they default to `false`).
    for (const field of OVERLAY_FIELDS) {
      if (field in cell && typeof cell[field] !== 'boolean') {
        result.error(`${cellPath}.${field}`, `${field} must be a strict boolean if present, got ${JSON.stringify(cell[field])}`)
      }
    }
    validCells.push(cell)
  })

  // Cells with null/absent terrain are skipped by the catalog check above,
  // but they are not free at runtime: GameState.initializeHexes falls back to
  // the package's `plains` terrain, or — when the catalog has no `plains`
  // entry — invents a synthetic `{ id: 'plains', terrainDifficulty: 0 }` that
  // exists nowhere in the package. The fallback is survivable (warn); the
  // synthetic terrain silently changes balance, so it fails loudly (error).
  // Either way the report is aggregated into a single message so a large
  // board cannot flood the result with thousands of per-cell entries.
  if (cellsWithoutTerrain.length > 0) {
    const sample = cellsWithoutTerrain.slice(0, NO_TERRAIN_REPORT_CAP).join(', ')
    const suffix = cellsWithoutTerrain.length > NO_TERRAIN_REPORT_CAP
      ? `, …+${cellsWithoutTerrain.length - NO_TERRAIN_REPORT_CAP} more`
      : ''
    if (terrainIds && terrainIds.has('plains')) {
      result.warn(
        'hexmap.map',
        `${cellsWithoutTerrain.length} cell(s) have no terrain: ${sample}${suffix}; engine will fall back to "plains"`
      )
    } else {
      result.error(
        'hexmap.map',
        `${cellsWithoutTerrain.length} cell(s) have no terrain: ${sample}${suffix}; terrain.terrainTypes has no "plains" entry, so the engine would invent a synthetic terrain that does not exist in the package`
      )
    }
  }

  // Completeness: every (q, r) in [0..width-1] × [0..height-1] must be present.
  // GameState.initializeHexes auto-fills missing cells with default `plains`
  // terrain, which masks incomplete level data and breaks balance assumptions.
  if (width != null && height != null) {
    const expected = width * height
    if (seenCoords.size < expected) {
      const missing = []
      for (let r = 0; r < height; r++) {
        for (let q = 0; q < width; q++) {
          if (!seenCoords.has(`${q},${r}`)) {
            missing.push(`(${q},${r})`)
            if (missing.length >= MISSING_COORD_REPORT_CAP) break
          }
        }
        if (missing.length >= MISSING_COORD_REPORT_CAP) break
      }
      const totalMissing = expected - seenCoords.size
      const suffix = totalMissing > missing.length ? `, …+${totalMissing - missing.length} more` : ''
      result.error(
        'hexmap.map',
        `missing ${totalMissing} cell(s) for a ${width}×${height} board: ${missing.join(', ')}${suffix}`
      )
    }
  }
  return { width, height, cells: validCells }
}

function validateTerrain(terrain, result) {
  if (!isPlainObject(terrain)) {
    result.error('terrain', 'terrain must be an object with `terrainTypes`')
    return { terrainIds: new Set(), normalized: null }
  }
  if (!Array.isArray(terrain.terrainTypes)) {
    result.error('terrain.terrainTypes', 'terrain.terrainTypes must be an array')
    return { terrainIds: new Set(), normalized: null }
  }
  const terrainIds = new Set()
  const normalized = []
  terrain.terrainTypes.forEach((entry, index) => {
    const path = `terrain.terrainTypes[${index}]`
    if (!isPlainObject(entry)) {
      result.error(path, 'terrain entry must be an object')
      return
    }
    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      result.error(`${path}.id`, 'terrain entry must have a non-empty string id')
      return
    }
    if (terrainIds.has(entry.id)) {
      result.error(path, `duplicate terrain id "${entry.id}"`)
      return
    }
    terrainIds.add(entry.id)

    // Strip the legacy `terrainDifficuly` key from the normalized output so
    // a downstream re-export (Builder saveMap, GameSnapshot embed) cannot
    // write the typo back to disk. Always warn when the legacy key is
    // present — even when canonical is also present — so dual-field data
    // is not silently preserved.
    const { terrainDifficuly: legacyDifficulty, labels, ...rest } = entry
    const normalizedEntry = { ...rest }
    const normalizedLabels = validateLocalizedLabels(labels, `${path}.labels`, result)
    if (normalizedLabels) normalizedEntry.labels = normalizedLabels
    const hasTerrainName = typeof normalizedEntry.name === 'string' && normalizedEntry.name.trim()
    if (normalizedLabels && !hasTerrainName && !hasDefaultLocalizedLabel(normalizedLabels)) {
      result.error(`${path}.name`, 'terrain entry requires name or labels must include en_US/en/default fallback')
    }
    if (legacyDifficulty !== undefined) {
      if (normalizedEntry.terrainDifficulty == null) {
        result.warn(
          `${path}.terrainDifficuly`,
          `legacy field name "terrainDifficuly" is migrated to "terrainDifficulty"; please update the source data`
        )
        normalizedEntry.terrainDifficulty = legacyDifficulty
      } else if (normalizedEntry.terrainDifficulty !== legacyDifficulty) {
        result.warn(
          `${path}.terrainDifficuly`,
          `legacy field "terrainDifficuly" (${JSON.stringify(legacyDifficulty)}) ignored — canonical "terrainDifficulty" (${JSON.stringify(normalizedEntry.terrainDifficulty)}) wins; remove the legacy key from source data`
        )
      } else {
        result.warn(
          `${path}.terrainDifficuly`,
          `legacy field "terrainDifficuly" duplicates canonical "terrainDifficulty"; please remove the legacy key from source data`
        )
      }
    }
    const diff = normalizedEntry.terrainDifficulty
    if (diff != null && !isNonNegativeFiniteNumber(diff)) {
      result.error(`${path}.terrainDifficulty`, `terrainDifficulty must be a non-negative finite number, got ${diff}`)
    }
    const generationWeight = normalizedEntry.generationWeight
    if (generationWeight != null && !isNonNegativeFiniteNumber(generationWeight)) {
      result.error(`${path}.generationWeight`, `generationWeight must be a non-negative finite number, got ${generationWeight}`)
    }
    // Optional `passable` opt-in: a terrain type may declare `passable: false`
    // to act as a wall — GameState.initializeHexes carries it onto every hex of
    // that terrain (via this normalized entry in the level's terrainTypes), and
    // it blocks direct_fire LOS, unit placement, and movement-as-wall. The field
    // is preserved through the `{ ...rest }` extras spread above; here we only
    // enforce that, when present, it is a strict boolean — a string like "false"
    // would silently become truthy at runtime. Absent → no field is added.
    if ('passable' in normalizedEntry && typeof normalizedEntry.passable !== 'boolean') {
      result.error(`${path}.passable`, `passable must be a strict boolean if present, got ${JSON.stringify(normalizedEntry.passable)}`)
    }
    normalized.push(normalizedEntry)
  })
  return { terrainIds, normalized: { terrainTypes: normalized } }
}

function countSpawnSlots(cells, player) {
  if (!Array.isArray(cells)) return 0
  const spawnKey = `${player}Spawn`
  const baseKey = `${player}Base`
  let count = 0
  for (const cell of cells) {
    if (cell && (cell[spawnKey] === true || cell[baseKey] === true)) count += 1
  }
  return count
}

function validateUnitStats(unit, basePath, result) {
  const checks = [
    { key: 'health', allowZero: false },
    { key: 'movement', allowZero: true },
    { key: 'attackRange', allowZero: true },
    { key: 'attackPower', allowZero: true }
  ]
  for (const { key, allowZero } of checks) {
    const value = unit[key]
    if (value == null) continue
    const ok = typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
    if (!ok) {
      result.error(`${basePath}.${key}`, `${key} must be a ${allowZero ? 'non-negative' : 'positive'} finite number, got ${value}`)
    }
  }
  if (unit.attackAngle != null) {
    if (!isSupportedAttackAngle(unit.attackAngle)) {
      result.error(`${basePath}.attackAngle`, `attackAngle must be an integer in [0..4], got ${unit.attackAngle}`)
    }
  }
}

function validateUnitCatalog(rawCatalog, result) {
  if (rawCatalog == null) {
    return {
      unitTypeIds: new Set(DEFAULT_UNIT_CATALOG.map(entry => entry.id)),
      normalizedCatalog: DEFAULT_UNIT_CATALOG.map(entry => ({ ...entry })),
      unitTypeAliases: DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID
    }
  }
  if (!Array.isArray(rawCatalog)) {
    result.error('units.unitTypes', 'units.unitTypes must be an array when present')
    return { unitTypeIds: new Set(), normalizedCatalog: [], unitTypeAliases: {} }
  }

  const unitTypeIds = new Set()
  const normalizedCatalog = []
  rawCatalog.forEach((entry, index) => {
    const path = `units.unitTypes[${index}]`
    if (!isPlainObject(entry)) {
      result.error(path, 'unit type entry must be an object')
      return
    }
    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      result.error(`${path}.id`, 'unit type id must be a non-empty string')
      return
    }
    const id = entry.id.trim()
    if (!SAFE_UNIT_TYPE_ID_PATTERN.test(id)) {
      result.error(`${path}.id`, 'unit type id must match /^[a-zA-Z0-9_-]+$/')
    }
    if (unitTypeIds.has(id)) {
      result.error(path, `duplicate unit type id "${id}"`)
      return
    }
    unitTypeIds.add(id)

    const normalizedLabels = validateLocalizedLabels(entry.labels, `${path}.labels`, result)
    const hasName = typeof entry.name === 'string' && entry.name.trim()
    if (!hasName && (!normalizedLabels || !hasDefaultLocalizedLabel(normalizedLabels))) {
      result.error(`${path}.name`, 'unit type name must be a non-empty string or labels must include en_US/en/default fallback')
    }
    validateUnitStats(entry, path, result)
    if (entry.health == null) {
      result.error(`${path}.health`, 'health is required for unit type entries')
    }
    if (entry.movement == null) {
      result.error(`${path}.movement`, 'movement is required for unit type entries')
    }
    if (entry.attackRange == null) {
      result.error(`${path}.attackRange`, 'attackRange is required for unit type entries')
    }
    if (entry.attackAngle == null) {
      result.error(`${path}.attackAngle`, 'attackAngle is required for unit type entries')
    }
    if (entry.attackPower == null) {
      result.error(`${path}.attackPower`, 'attackPower is required for unit type entries')
    }
    if (entry.maxTerrainDifficulty == null) {
      result.error(`${path}.maxTerrainDifficulty`, 'maxTerrainDifficulty is required for unit type entries')
    } else if (!isNonNegativeFiniteNumber(entry.maxTerrainDifficulty)) {
      result.error(
        `${path}.maxTerrainDifficulty`,
        `maxTerrainDifficulty must be a non-negative finite number, got ${entry.maxTerrainDifficulty}`
      )
    }
    if (!LOS_MODE_VALUES.includes(entry.losMode)) {
      result.error(`${path}.losMode`, `losMode must be one of ${LOS_MODE_VALUES.join(', ')}, got ${JSON.stringify(entry.losMode)}`)
    }
    if (entry.iconKey != null && typeof entry.iconKey !== 'string') {
      result.error(`${path}.iconKey`, `iconKey must be a string when present, got ${JSON.stringify(entry.iconKey)}`)
    }

    const normalizedEntry = { ...entry, id }
    if (normalizedLabels) {
      normalizedEntry.labels = normalizedLabels
      if (!hasName) {
        normalizedEntry.name = resolveLocalizedLabel(
          { labels: normalizedLabels, id },
          DEFAULT_PACKAGE_LABEL_LOCALE,
          id
        )
      }
    }
    // Preserve author extras (description, rotateUnitIcon, annotations, …)
    // the same way terrain entries do: spread the original entry first, then
    // let the canonical fields from `normalizeUnitTypeDef` win on top. The
    // legacy alias keys that `normalizeUnitTypeDef` consumes (`type`,
    // `maxHealth`, the `maxTerrainDifficuly` typo) are stripped so a
    // downstream re-export (Builder saveMap, GameSnapshot embed) cannot
    // write them back to disk.
    const entryExtras = { ...entry }
    delete entryExtras.type
    delete entryExtras.maxHealth
    delete entryExtras.maxTerrainDifficuly
    normalizedCatalog.push({ ...entryExtras, ...normalizeUnitTypeDef(normalizedEntry) })
  })

  return { unitTypeIds, normalizedCatalog, unitTypeAliases: {} }
}

function validateUnitsForPlayer(playerKey, roster, cells, unitTypeIds, result, unitTypeAliases = {}) {
  const basePath = `units.${playerKey}`
  if (!isPlainObject(roster)) {
    result.error(basePath, `${basePath} must be an object with a \`units\` array`)
    return { totalCount: 0, normalizedRoster: null }
  }
  if (!Array.isArray(roster.units)) {
    result.error(`${basePath}.units`, `${basePath}.units must be an array`)
    return { totalCount: 0, normalizedRoster: null }
  }
  const seenTypes = new Set()
  let totalCount = 0
  const normalizedUnits = []
  roster.units.forEach((unit, index) => {
    const path = `${basePath}.units[${index}]`
    if (!isPlainObject(unit)) {
      result.error(path, 'unit definition must be an object')
      return
    }
    if (typeof unit.type !== 'string' || !unit.type.trim()) {
      result.error(`${path}.type`, 'unit.type must be a non-empty string')
      return
    }
    const unitType = unit.type.trim()
    const normalizedUnitType = unitTypeIds.has(unitType) ? unitType : unitTypeAliases[unitType]
    if (!normalizedUnitType || !unitTypeIds.has(normalizedUnitType)) {
      const known = Array.from(unitTypeIds).join(', ')
      result.error(`${path}.type`, `unknown unit type "${unitType}" (known types: ${known})`)
    }
    if (seenTypes.has(normalizedUnitType || unitType)) {
      result.error(path, `duplicate unit type "${normalizedUnitType || unitType}" within ${basePath}.units`)
    } else {
      seenTypes.add(normalizedUnitType || unitType)
    }
    if (unit.count != null) {
      const count = unit.count
      if (!Number.isInteger(count) || count < 0) {
        result.error(`${path}.count`, `count must be a non-negative integer, got ${count}`)
      } else {
        totalCount += count
      }
    } else {
      totalCount += 1
    }
    validateUnitStats(unit, path, result)

    // Strip the legacy `maxTerrainDifficuly` key from the normalized output
    // and warn whenever it is present (single source of truth: canonical
    // wins, but dual-field data should not be silently preserved through
    // Builder re-export or snapshot embed).
    const { maxTerrainDifficuly: legacyMaxDifficulty, ...unitRest } = unit
    const normalizedUnit = { ...unitRest }
    normalizedUnit.type = normalizedUnitType || unitType
    if (legacyMaxDifficulty !== undefined) {
      if (normalizedUnit.maxTerrainDifficulty == null) {
        result.warn(
          `${path}.maxTerrainDifficuly`,
          `legacy field name "maxTerrainDifficuly" is migrated to "maxTerrainDifficulty"; please update the source data`
        )
        normalizedUnit.maxTerrainDifficulty = legacyMaxDifficulty
      } else if (normalizedUnit.maxTerrainDifficulty !== legacyMaxDifficulty) {
        result.warn(
          `${path}.maxTerrainDifficuly`,
          `legacy field "maxTerrainDifficuly" (${JSON.stringify(legacyMaxDifficulty)}) ignored — canonical "maxTerrainDifficulty" (${JSON.stringify(normalizedUnit.maxTerrainDifficulty)}) wins; remove the legacy key from source data`
        )
      } else {
        result.warn(
          `${path}.maxTerrainDifficuly`,
          `legacy field "maxTerrainDifficuly" duplicates canonical "maxTerrainDifficulty"; please remove the legacy key from source data`
        )
      }
    }
    const maxDiff = normalizedUnit.maxTerrainDifficulty
    if (maxDiff != null && !isNonNegativeFiniteNumber(maxDiff)) {
      result.error(
        `${path}.maxTerrainDifficulty`,
        `maxTerrainDifficulty must be a non-negative finite number, got ${maxDiff}`
      )
    }
    normalizedUnits.push(normalizedUnit)
  })

  const spawnSlots = countSpawnSlots(cells, playerKey)
  if (totalCount > 0 && spawnSlots === 0) {
    result.error(basePath, `${playerKey} has ${totalCount} unit instance(s) but no spawn or base hex on the map`)
  } else if (totalCount > spawnSlots) {
    result.error(basePath, `${playerKey} requires ${totalCount} spawn slot(s) but only ${spawnSlots} are available`)
  }
  return { totalCount, normalizedRoster: { ...roster, units: normalizedUnits } }
}

function validateUnits(units, cells, result) {
  if (!isPlainObject(units)) {
    result.error('units', 'units must be an object keyed by player (player1, player2)')
    return null
  }
  for (const key of Object.keys(units)) {
    if (!KNOWN_UNITS_SECTION_KEYS.includes(key)) {
      result.error(`units.${key}`, `unknown units key "${key}" (allowed: ${KNOWN_UNITS_SECTION_KEYS.join(', ')})`)
    }
  }
  const catalogOutcome = validateUnitCatalog(units.unitTypes, result)
  const normalized = { ...units }
  normalized.unitTypes = catalogOutcome.normalizedCatalog
  for (const playerKey of KNOWN_PLAYER_KEYS) {
    if (!(playerKey in units)) {
      // Both player rosters are always required, even when `units` is `{}`.
      // A roster with `count: 0` units is the supported way to declare an
      // unmanned side; an absent roster is a schema gap, not a scenario.
      result.error(`units.${playerKey}`, `missing roster for ${playerKey}`)
      continue
    }
    const outcome = validateUnitsForPlayer(
      playerKey,
      units[playerKey],
      cells,
      catalogOutcome.unitTypeIds,
      result,
      catalogOutcome.unitTypeAliases
    )
    if (outcome && outcome.normalizedRoster) {
      normalized[playerKey] = outcome.normalizedRoster
    }
  }
  return normalized
}

function validateOperationsBlock(blockKey, operations, result) {
  const path = `turntable.${blockKey}`
  if (!Array.isArray(operations)) {
    result.error(path, `${path} must be an array of phase operations`)
    return
  }
  operations.forEach((operation, opIndex) => {
    const opPath = `${path}[${opIndex}]`
    if (!isPlainObject(operation)) {
      result.error(opPath, 'phase operation must be an object')
      return
    }
    if (typeof operation.title !== 'string' || !operation.title.trim()) {
      result.error(`${opPath}.title`, 'phase title must be a non-empty string')
    }
    if (!Array.isArray(operation.moves)) {
      result.error(`${opPath}.moves`, 'phase.moves must be an array')
      return
    }
    operation.moves.forEach((move, moveIndex) => {
      const movePath = `${opPath}.moves[${moveIndex}]`
      if (!isPlainObject(move)) {
        result.error(movePath, 'move entry must be an object')
        return
      }
      if (!Array.isArray(move.dice)) {
        result.error(`${movePath}.dice`, 'move.dice must be an array')
        return
      }
      if (move.dice.length !== 6) {
        result.error(`${movePath}.dice`, `move.dice must have exactly 6 rows (one per D6 face), got ${move.dice.length}`)
        return
      }
      move.dice.forEach((row, rowIndex) => {
        const rowPath = `${movePath}.dice[${rowIndex}]`
        if (!Array.isArray(row)) {
          result.error(rowPath, 'dice row must be an array of action tokens')
          return
        }
        const seenTokens = new Set()
        row.forEach((token, tokenIndex) => {
          if (typeof token !== 'string') {
            result.error(`${rowPath}[${tokenIndex}]`, 'action token must be a string')
            return
          }
          const normalized = normalizeActionType(token)
          if (token === NO_OP_TOKEN || normalized === NO_OP_TOKEN) return
          if (normalized) {
            if (seenTokens.has(normalized)) {
              result.error(
                `${rowPath}[${tokenIndex}]`,
                `duplicate turntable action token "${token}" in the same D6 row`
              )
            } else {
              seenTokens.add(normalized)
            }
          }
          if (!ALL_ACTION_TYPES.includes(normalized)) {
            result.warn(`${rowPath}[${tokenIndex}]`, `unknown turntable action token "${token}"`)
          }
        })
      })
    })
  })
}

function normalizeObjectiveId(condition, index, type) {
  if (typeof condition.id === 'string' && condition.id.trim()) return condition.id.trim()
  return `${type}_${index + 1}`
}

function validateObjectiveWinner(condition, path, result) {
  if (condition.winner == null) return null
  if (PLAYER_IDS.includes(condition.winner) || condition.winner === 'draw') {
    return condition.winner
  }
  result.error(`${path}.winner`, `winner must be one of ${PLAYER_IDS.join(', ')} or "draw", got ${JSON.stringify(condition.winner)}`)
  return null
}

function normalizeObjectiveDeadline(value, path, result, { required = false } = {}) {
  if (value == null) {
    if (required) result.error(path, 'deadlineTurns is required')
    return null
  }
  if (!Number.isInteger(value) || value < 2) {
    result.error(path, `deadlineTurns must be an integer >= 2, got ${JSON.stringify(value)}`)
    return null
  }
  return value
}

function validatePrimaryBlueObjective(primary, cells, result) {
  const path = 'objectives.primary'
  if (!isPlainObject(primary)) {
    result.error(path, 'objectives.primary must be an object')
    return null
  }

  const type = typeof primary.type === 'string' ? primary.type.trim() : ''
  if (!OBJECTIVE_TYPE_VALUES.includes(type)) {
    result.error(`${path}.type`, `type must be one of ${OBJECTIVE_TYPE_VALUES.join(', ')}, got ${JSON.stringify(primary.type)}`)
    return null
  }

  const player = PLAYER_IDS.includes(primary.player) ? primary.player : null
  if (player !== 'player1') {
    result.error(`${path}.player`, 'player must be "player1" for primaryBlue objectives')
    return null
  }

  const normalized = {
    id: typeof primary.id === 'string' && primary.id.trim() ? primary.id.trim() : 'blue_primary',
    type,
    player
  }

  if (type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    if (!PLAYER_IDS.includes(primary.targetPlayer)) {
      result.error(`${path}.targetPlayer`, `targetPlayer must be one of ${PLAYER_IDS.join(', ')}`)
      return null
    }
    if (primary.targetPlayer === player) {
      result.error(`${path}.targetPlayer`, 'targetPlayer must be the opposing player for eliminateUnits')
    }
    normalized.targetPlayer = primary.targetPlayer
    const deadline = normalizeObjectiveDeadline(primary.deadlineTurns, `${path}.deadlineTurns`, result)
    if (deadline != null) normalized.deadlineTurns = deadline
    return normalized
  }

  if (type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    if (!PLAYER_IDS.includes(primary.targetPlayer)) {
      result.error(`${path}.targetPlayer`, `targetPlayer must be one of ${PLAYER_IDS.join(', ')}`)
      return null
    }
    if (primary.targetPlayer === player) {
      result.error(`${path}.targetPlayer`, 'targetPlayer must be the opposing player for occupyBase')
    }
    const basePlayer = PLAYER_IDS.includes(primary.basePlayer) ? primary.basePlayer : primary.targetPlayer
    if (!hasBaseForPlayer(cells || [], basePlayer)) {
      result.error(`${path}.basePlayer`, `${basePlayer} has no base hex on the map`)
    }
    normalized.targetPlayer = primary.targetPlayer
    normalized.basePlayer = basePlayer
    const deadline = normalizeObjectiveDeadline(primary.deadlineTurns, `${path}.deadlineTurns`, result)
    if (deadline != null) normalized.deadlineTurns = deadline
    return normalized
  }

  if (type === OBJECTIVE_TYPES.PROTECT_BASE) {
    const basePlayer = PLAYER_IDS.includes(primary.basePlayer) ? primary.basePlayer : player
    if (basePlayer !== player) {
      result.error(`${path}.basePlayer`, 'basePlayer must be "player1" for protectBase')
    }
    if (!hasBaseForPlayer(cells || [], basePlayer)) {
      result.error(`${path}.basePlayer`, `${basePlayer} has no base hex on the map`)
    }
    normalized.basePlayer = basePlayer
    const deadline = normalizeObjectiveDeadline(primary.deadlineTurns, `${path}.deadlineTurns`, result, { required: true })
    if (deadline != null) normalized.deadlineTurns = deadline
    return normalized
  }

  if (type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    const deadline = normalizeObjectiveDeadline(primary.deadlineTurns, `${path}.deadlineTurns`, result, { required: true })
    if (deadline != null) normalized.deadlineTurns = deadline
    return normalized
  }

  return null
}

function isBlueLegacyCondition(condition) {
  if (!condition) return false
  if (condition.winner === 'player1') return true
  if (condition.player === 'player1') return true
  if (condition.actorPlayer === 'player1') return true
  return false
}

function legacyConditionToPrimary(condition) {
  if (condition.type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    return {
      id: condition.id,
      type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
      player: 'player1',
      targetPlayer: condition.targetPlayer
    }
  }
  if (condition.type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    return {
      id: condition.id,
      type: OBJECTIVE_TYPES.OCCUPY_BASE,
      player: 'player1',
      targetPlayer: condition.targetPlayer,
      basePlayer: condition.targetPlayer
    }
  }
  if (condition.type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    return {
      id: condition.id,
      type: OBJECTIVE_TYPES.SURVIVE_TURNS,
      player: 'player1',
      // Defensive clamp: `validateLegacyObjectives` already raises turns < 2
      // (with a warning), but the canonical contract (deadlineTurns >= 2) is
      // enforced here too so this mapper can never emit a primary that fails
      // its own re-validation (e.g. on GameSnapshot import).
      deadlineTurns: Math.max(2, condition.turns)
    }
  }
  return null
}

function validateLegacyObjectives(objectives, cells, result) {
  if (objectives.mode != null && objectives.mode !== 'firstSatisfied') {
    result.error('objectives.mode', 'legacy objectives.mode supports only "firstSatisfied"')
  }

  if (!Array.isArray(objectives.conditions) || objectives.conditions.length === 0) {
    result.error('objectives.conditions', 'objectives.conditions must be a non-empty array')
    return null
  }

  const normalizedConditions = []
  const seenIds = new Set()

  objectives.conditions.forEach((condition, index) => {
    const path = `objectives.conditions[${index}]`
    if (!isPlainObject(condition)) {
      result.error(path, 'objective condition must be an object')
      return
    }

    const type = typeof condition.type === 'string' ? condition.type.trim() : ''
    if (!OBJECTIVE_TYPE_VALUES.includes(type)) {
      result.error(`${path}.type`, `type must be one of ${OBJECTIVE_TYPE_VALUES.join(', ')}, got ${JSON.stringify(condition.type)}`)
      return
    }

    const id = normalizeObjectiveId(condition, index, type)
    if (seenIds.has(id)) {
      result.error(`${path}.id`, `duplicate objective condition id "${id}"`)
    } else {
      seenIds.add(id)
    }

    const winner = validateObjectiveWinner(condition, path, result)
    const normalized = { id, type }
    if (winner) normalized.winner = winner

    // `protectBase` is a valid v2 objective type, so it passes the type
    // membership check above, but the legacy `conditions[]` migration has no
    // semantics for it. Inventing a mapping could silently change who wins,
    // so the condition is dropped with a loud warning instead — in contrast
    // to unknown types, which stay a hard error.
    if (type === OBJECTIVE_TYPES.PROTECT_BASE) {
      const idSuffix = typeof condition.id === 'string' && condition.id.trim() ? ` (id "${id}")` : ''
      result.warn(
        path,
        `legacy objectives condition "protectBase"${idSuffix} is not supported by the legacy migration and was dropped`
      )
      return
    }

    if (type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
      if (!PLAYER_IDS.includes(condition.targetPlayer)) {
        result.error(`${path}.targetPlayer`, `targetPlayer must be one of ${PLAYER_IDS.join(', ')}`)
        return
      }
      normalized.targetPlayer = condition.targetPlayer
      normalized.winner = normalized.winner || opponentOf(condition.targetPlayer)
      normalizedConditions.push(normalized)
      return
    }

    if (type === OBJECTIVE_TYPES.OCCUPY_BASE) {
      if (!PLAYER_IDS.includes(condition.actorPlayer)) {
        result.error(`${path}.actorPlayer`, `actorPlayer must be one of ${PLAYER_IDS.join(', ')}`)
        return
      }
      if (!PLAYER_IDS.includes(condition.targetPlayer)) {
        result.error(`${path}.targetPlayer`, `targetPlayer must be one of ${PLAYER_IDS.join(', ')}`)
        return
      }
      if (condition.actorPlayer === condition.targetPlayer) {
        result.error(`${path}.targetPlayer`, 'targetPlayer must be the opposing player for occupyBase')
      }
      if (!hasBaseForPlayer(cells || [], condition.targetPlayer)) {
        result.error(`${path}.targetPlayer`, `${condition.targetPlayer} has no base hex on the map`)
      }
      normalized.actorPlayer = condition.actorPlayer
      normalized.targetPlayer = condition.targetPlayer
      normalized.winner = normalized.winner || condition.actorPlayer
      normalizedConditions.push(normalized)
      return
    }

    if (type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
      const player = PLAYER_IDS.includes(condition.player) ? condition.player : condition.winner
      if (!PLAYER_IDS.includes(player)) {
        result.error(`${path}.player`, `player must be one of ${PLAYER_IDS.join(', ')}`)
        return
      }
      let turns = condition.turns
      if (turns == null && condition.rounds != null) {
        result.warn(`${path}.rounds`, 'rounds is accepted as an alias but normalized to turns')
        turns = condition.rounds
      }
      if (!Number.isInteger(turns) || turns <= 0) {
        result.error(`${path}.turns`, `turns must be a positive integer, got ${JSON.stringify(turns)}`)
        return
      }
      // Canonical surviveTurns requires deadlineTurns >= 2, so a legacy
      // turns=1 would migrate into a primary that fails its own
      // re-validation (GameSnapshot import re-validates the embedded
      // package). Raise it at migration time instead of rejecting historic
      // data; the legacy acceptance threshold (turns >= 1) stays unchanged.
      if (turns < 2) {
        result.warn(
          `${path}.turns`,
          `legacy surviveTurns turns=${turns} raised to deadlineTurns=2 (canonical deadlineTurns must be >= 2)`
        )
        turns = 2
      }
      normalized.player = player
      normalized.turns = turns
      normalized.winner = normalized.winner || player
      normalizedConditions.push(normalized)
    }
  })

  const bluePrimary = normalizedConditions.find(isBlueLegacyCondition)
  if (!bluePrimary) {
    result.warn('objectives.conditions', 'legacy objectives had no Blue condition; defaulting to Blue eliminateUnits')
    return {
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
        player: 'player1',
        targetPlayer: 'player2'
      }
    }
  }
  if (normalizedConditions.filter(isBlueLegacyCondition).length > 1) {
    result.warn('objectives.conditions', 'legacy objectives had multiple Blue conditions; keeping the first one as primary')
  }
  result.warn('objectives', 'legacy objective conditions were migrated to primaryBlue')
  return {
    mode: 'primaryBlue',
    primary: legacyConditionToPrimary(bluePrimary)
  }
}

function validateObjectives(objectives, cells, result) {
  if (!isPlainObject(objectives)) {
    result.error('objectives', 'objectives must be an object')
    return null
  }

  if (objectives.mode === 'primaryBlue' || isPlainObject(objectives.primary)) {
    if (objectives.mode !== 'primaryBlue') {
      result.error('objectives.mode', 'objectives.mode must be "primaryBlue"')
    }
    const primary = validatePrimaryBlueObjective(objectives.primary, cells, result)
    return primary
      ? { mode: 'primaryBlue', primary }
      : null
  }

  if (Array.isArray(objectives.conditions) || objectives.mode === 'firstSatisfied') {
    return validateLegacyObjectives(objectives, cells, result)
  }

  result.error('objectives.mode', 'objectives.mode must be "primaryBlue"')
  return null
}

/**
 * Validate a LevelPackage shape.
 *
 * @param {*} pkg
 * @returns {{ ok: boolean, errors: Array<{path:string, message:string}>, warnings: Array<{path:string, message:string}>, package: object|null }}
 */
export function validateLevelPackage(pkg) {
  const result = new ResultBuilder()
  if (!isPlainObject(pkg)) {
    result.error('', 'level package must be a plain object')
    return { ok: false, errors: result.errors, warnings: result.warnings, package: null }
  }

  const normalizedId = typeof pkg.id === 'string' ? pkg.id.trim() : ''
  if (!normalizedId) {
    result.error('id', 'package id must be a non-empty string')
  } else if (!SAFE_LEVEL_ID_PATTERN.test(normalizedId)) {
    result.error('id', 'package id must match /^[a-zA-Z0-9_-]+$/')
  }

  // schemaVersion: absent → legacy v0, normalize to LATEST with warning.
  // Anything other than a positive integer in [1..LATEST] is an error so
  // a forward-version package from a newer build cannot silently load
  // under the current rules.
  let normalizedSchemaVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
  if (pkg.schemaVersion == null) {
    result.warn(
      'schemaVersion',
      `legacy LevelPackage has no schemaVersion field; migrating to v${LATEST_LEVEL_PACKAGE_SCHEMA_VERSION}`
    )
  } else if (
    !Number.isInteger(pkg.schemaVersion) ||
    pkg.schemaVersion < 1 ||
    pkg.schemaVersion > LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
  ) {
    result.error(
      'schemaVersion',
      `unsupported schemaVersion ${JSON.stringify(pkg.schemaVersion)}; this build understands [1..${LATEST_LEVEL_PACKAGE_SCHEMA_VERSION}]`
    )
  } else {
    normalizedSchemaVersion = pkg.schemaVersion
  }

  const requiredSections = ['hexmap', 'terrain', 'units', 'turntable']
  for (const key of requiredSections) {
    if (pkg[key] == null) {
      result.error(key, `missing required section "${key}"`)
    }
  }
  const hasAllSections = requiredSections.every(k => pkg[k] != null)

  const terrainOutcome = pkg.terrain != null
    ? validateTerrain(pkg.terrain, result)
    : { terrainIds: new Set(), normalized: null }

  const hexmapOutcome = pkg.hexmap != null
    ? validateHexmap(pkg.hexmap, terrainOutcome.terrainIds, result)
    : null

  let normalizedUnits = null
  if (pkg.units != null) {
    normalizedUnits = validateUnits(pkg.units, hexmapOutcome ? hexmapOutcome.cells : null, result)
  }

  if (pkg.turntable != null) {
    if (!isPlainObject(pkg.turntable)) {
      result.error('turntable', 'turntable must be an object with Our_operations and Enemy_operations arrays')
    } else {
      if (!('Our_operations' in pkg.turntable) || pkg.turntable.Our_operations == null) {
        result.error('turntable.Our_operations', 'turntable.Our_operations is required')
      } else {
        validateOperationsBlock('Our_operations', pkg.turntable.Our_operations, result)
      }
      if (!('Enemy_operations' in pkg.turntable) || pkg.turntable.Enemy_operations == null) {
        result.error('turntable.Enemy_operations', 'turntable.Enemy_operations is required')
      } else {
        validateOperationsBlock('Enemy_operations', pkg.turntable.Enemy_operations, result)
      }
    }
  }

  const normalizedObjectives = pkg.objectives != null
    ? validateObjectives(pkg.objectives, hexmapOutcome ? hexmapOutcome.cells : null, result)
    : null

  const ok = result.errors.length === 0
  let normalizedPackage = null
  if (ok && hasAllSections) {
    normalizedPackage = {
      ...pkg,
      id: normalizedId,
      schemaVersion: normalizedSchemaVersion,
      terrain: terrainOutcome.normalized || pkg.terrain,
      units: normalizedUnits || pkg.units
    }
    if (normalizedObjectives) normalizedPackage.objectives = normalizedObjectives
  }
  return {
    ok,
    errors: result.errors,
    warnings: result.warnings,
    package: normalizedPackage
  }
}
