/**
 * Структури даних для ігрових юнітів
 */

import { normalizeAttackAngle, normalizeHexFacing } from './hexUtils.js'
import {
  DEFAULT_PACKAGE_LABEL_LOCALE,
  normalizeLocalizedLabelMap,
  resolveLocalizedLabel
} from '@/utils/packageLabels.js'

/**
 * Клас для представлення ігрового юніта
 */
const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return Boolean(value)
}

const LOS_MODES = new Set(['direct_fire', 'artillery'])

function normalizeLosMode(value, fallback = 'direct_fire') {
  const raw = value == null ? '' : String(value).trim()
  if (LOS_MODES.has(raw)) return raw
  return LOS_MODES.has(fallback) ? fallback : 'direct_fire'
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
}

function finiteNumber(value, fallback, { positive = false } = {}) {
  const n = Number(value)
  if (Number.isFinite(n) && (positive ? n > 0 : n >= 0)) return n
  return fallback
}

function nameFromId(id) {
  return String(id || 'unit')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, letter => letter.toUpperCase())
}

export class GameUnit {
  constructor(options = {}) {
    this.id = options.id || this.generateId()
    this.type = options.type || 'armored'
    this.name = options.name || `Unit ${this.id}`
    this.player = options.player || 'player1'
    
    // Позиція та напрямок
    this.position = options.position || { q: 0, r: 0 }
    this.facing = normalizeHexFacing(
      options.facing !== undefined && options.facing !== null ? options.facing : 0
    ) // 0-5, де 0 = направо наверх в pointy-top орієнтації
    
    // Статистики
    this.health = options.health ?? 100
    this.maxHealth = options.maxHealth ?? this.health ?? 100
    this.movement = options.movement ?? 2 // максимальна відстань за хід
    this.attackRange = options.attackRange ?? 1
    this.attackPower = options.attackPower ?? 50
    /** 0 = facing only; 1/2 = facing +/- N sectors; 3/4 = full circle. See `allowedFacingDirections`. */
    this.attackAngle =
      options.attackAngle !== undefined && options.attackAngle !== null
        ? normalizeAttackAngle(options.attackAngle)
        : normalizeAttackAngle(UNIT_TYPES[this.type]?.attackAngle ?? 0)
    this.losMode = normalizeLosMode(options.losMode, UNIT_TYPES[this.type]?.losMode || 'direct_fire')
    this.iconKey = options.iconKey || UNIT_TYPES[this.type]?.iconKey || this.type
    
    // Стан
    this.isLoaded = parseBoolean(options.isLoaded, true)
    this.isActive = options.isActive !== undefined ? options.isActive : true
    
    // Прохідність террейну (з конфігу рівня): maxTerrainDifficulty >= terrain.terrainDifficulty.
    // The validator gate (`validateLevelPackage`) normalizes the legacy
    // misspellings before data reaches here, but constructors may also be
    // called from direct fixtures, so we still accept the legacy input
    // name as a fallback. Storage and serialization use the canonical spelling.
    this.maxTerrainDifficulty =
      options.maxTerrainDifficulty ?? options.maxTerrainDifficuly ?? null

    // Додаткові властивості
    this.metadata = options.metadata || {}
  }
  
  /**
   * Генерує унікальний ID для юніта
   */
  generateId() {
    return `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  /**
   * Переміщує юніта на нову позицію
   * @param {Object} newPosition - нова позиція {q, r}
   */
  moveTo(newPosition) {
    this.position = { ...newPosition }
  }
  
  /**
   * Повертає юніта в заданому напрямку
   * @param {number} direction - напрямок (0-5)
   */
  turnTo(direction) {
    this.facing = direction % 6
  }
  
  /**
   * Повертає юніта на заданий кут
   * @param {number} angle - кут повороту в градусах
   */
  turnBy(angle) {
    const steps = Math.round(angle / 60)
    this.facing = (this.facing + steps + 6) % 6
  }
  
  /**
   * Атакує ціль
   * @param {GameUnit} target - ціль для атаки
   * @returns {number} нанесена шкода
   */
  attack(target) {
    const damage = this.attackPower
    target.takeDamage(damage)
    return damage
  }
  
  /**
   * Наносить шкоду юніту
   * @param {number} damage - кількість шкоди
   */
  takeDamage(damage) {
    this.health = Math.max(0, this.health - damage)
    if (this.health === 0) {
      this.isActive = false
    }
  }
  
  /**
   * Відновлює здоров'я
   * @param {number} amount - кількість здоров'я для відновлення
   */
  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount)
  }
  
  /**
   * Скидає стан ходу
   */
  resetTurn() {
    // Volatile turn state now lives in GameState.turnState.
  }
  
  /**
   * Перевіряє чи може юніт переміщуватись
   */
  canMove() {
    return this.isActive
  }
  
  /**
   * Перевіряє чи може юніт атакувати
   */
  canAttack() {
    return this.isActive
  }
  
  /**
   * Перевіряє чи живий юніт
   */
  isAlive() {
    return this.isActive && this.health > 0
  }
  
  /**
   * Перевіряє чи повертати іконку юніта разом з facing
   */
  shouldRotateIcon() {
    const unitType = UNIT_TYPES[this.type]
    return unitType ? unitType.rotateUnitIcon : false
  }
  
  /**
   * Перевіряє чи може юніт рухатись по заданому террейну.
   * Очікується об'єкт террейну (як gameHex.terrain) з полем terrainDifficulty.
   * Правило: unit.maxTerrainDifficulty >= terrain.terrainDifficulty (дані з конфігу рівня).
   * @param {Object} terrain - об'єкт террейну { id, terrainDifficulty, ... }
   * @returns {boolean} чи може рухатись
   */
  canMoveOnTerrain(terrain) {
    if (terrain == null || typeof terrain !== 'object') {
      return true
    }
    const max = this.maxTerrainDifficulty
    const diff = terrain.terrainDifficulty
    if (typeof max === 'number' && typeof diff === 'number') {
      return max >= diff
    }
    return true
  }
  
  /**
   * Клонує юніта
   */
  clone() {
    return new GameUnit({
      id: this.id,
      type: this.type,
      name: this.name,
      player: this.player,
      position: { ...this.position },
      facing: this.facing,
      health: this.health,
      maxHealth: this.maxHealth,
      movement: this.movement,
      attackRange: this.attackRange,
      attackPower: this.attackPower,
      attackAngle: this.attackAngle,
      losMode: this.losMode,
      iconKey: this.iconKey,
      maxTerrainDifficulty: this.maxTerrainDifficulty,
      isLoaded: this.isLoaded,
      isActive: this.isActive,
      metadata: { ...this.metadata }
    })
  }
  
  /**
   * Серіалізує юніта в JSON
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      player: this.player,
      position: this.position,
      facing: this.facing,
      health: this.health,
      maxHealth: this.maxHealth,
      movement: this.movement,
      attackRange: this.attackRange,
      attackPower: this.attackPower,
      attackAngle: this.attackAngle,
      losMode: this.losMode,
      iconKey: this.iconKey,
      maxTerrainDifficulty: this.maxTerrainDifficulty,
      isLoaded: this.isLoaded,
      isActive: this.isActive,
      metadata: this.metadata
    }
  }
  
  /**
   * Створює юніта з JSON
   */
  static fromJSON(data) {
    return new GameUnit(data)
  }
}

/**
 * Типи юнітів з базовими характеристиками
 */
/** Короткий код типу для ID юніта (p1_inf1, p2_arm2, …). */
export const UNIT_TYPE_SHORT_CODE = {
  infantry: 'inf',
  armored: 'arm',
  artillery: 'art',
  scout: 'sco',
  default_unit_infantry: 'inf',
  default_unit_armored: 'arm',
  default_unit_artillery: 'art',
  default_unit_scout: 'sco'
}

export const DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID = Object.freeze({
  armored: 'default_unit_armored',
  infantry: 'default_unit_infantry',
  artillery: 'default_unit_artillery',
  scout: 'default_unit_scout'
})

export const LEGACY_UNIT_TYPE_ID_BY_DEFAULT_ID = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID).map(([legacyId, defaultId]) => [defaultId, legacyId])
  )
)

/**
 * Стабільний читабельний id: гравець + тип + порядковий номер серед юнітів того ж типу у гравця.
 * @param {'player1'|'player2'|string} player
 * @param {string} type — ключ з UNIT_TYPES
 * @param {number} instanceIndex1Based — 1, 2, … для кожного типу окремо
 */
export function makePlacementUnitId(player, type, instanceIndex1Based) {
  const p =
    player === 'player1' ? 'p1' : player === 'player2' ? 'p2' : String(player).replace(/^player/i, 'p')
  const short = UNIT_TYPE_SHORT_CODE[type] || String(type).replace(/[^a-z]/gi, '').slice(0, 3).toLowerCase() || 'unt'
  return `${p}_${short}${instanceIndex1Based}`
}

export const UNIT_TYPES = {
  armored: {
    name: 'Tank',
    maxHealth: 100,
    movement: 2,
    attackRange: 1,
    attackAngle: 1,
    attackPower: 50,
    losMode: 'direct_fire',
    iconKey: 'armored',
    description: 'Броньована бойова машина',
    rotateUnitIcon: false
  },
  infantry: {
    name: 'Infantry',
    maxHealth: 60,
    movement: 3,
    attackRange: 1,
    attackAngle: 1,
    attackPower: 30,
    losMode: 'direct_fire',
    iconKey: 'infantry',
    description: 'Піхотний підрозділ',
    rotateUnitIcon: false
  },
  artillery: {
    name: 'Artillery',
    maxHealth: 80,
    movement: 1,
    attackRange: 3,
    attackAngle: 0,
    attackPower: 70,
    losMode: 'artillery',
    iconKey: 'artillery',
    description: 'Артилерійська установка',
    rotateUnitIcon: false
  },
  scout: {
    name: 'Scout',
    maxHealth: 40,
    movement: 4,
    attackRange: 1,
    attackAngle: 1,
    attackPower: 20,
    losMode: 'direct_fire',
    iconKey: 'scout',
    description: 'Розвідувальний підрозділ',
    rotateUnitIcon: false
  }
}

const DEFAULT_UNIT_CATALOG_OVERRIDES = Object.freeze({
  infantry: Object.freeze({ health: 60, movement: 4, maxTerrainDifficulty: 10 }),
  armored: Object.freeze({ health: 100, movement: 3, maxTerrainDifficulty: 2 }),
  artillery: Object.freeze({ health: 80, movement: 2, maxTerrainDifficulty: 1 }),
  scout: Object.freeze({ health: 40, movement: 4, maxTerrainDifficulty: 10 })
})

export function normalizeUnitTypeDef(raw, fallback = {}) {
  const source = isPlainObject(raw) ? raw : {}
  const base = isPlainObject(fallback) ? fallback : {}
  const id = String(
    firstDefined(source.id, source.type, base.id, base.type, 'custom_unit')
  ).trim()
  const labels = normalizeLocalizedLabelMap(firstDefined(source.labels, base.labels))
  const labelFallback = labels
    ? resolveLocalizedLabel({ labels, id }, DEFAULT_PACKAGE_LABEL_LOCALE, nameFromId(id))
    : nameFromId(id)
  const name = String(firstDefined(source.name, base.name, labelFallback)).trim() || nameFromId(id)
  const health = finiteNumber(
    firstDefined(source.health, source.maxHealth, base.health, base.maxHealth),
    100,
    { positive: true }
  )

  const normalized = {
    id,
    name,
    health,
    movement: finiteNumber(firstDefined(source.movement, base.movement), 2),
    attackRange: finiteNumber(firstDefined(source.attackRange, base.attackRange), 1),
    attackAngle: normalizeAttackAngle(firstDefined(source.attackAngle, base.attackAngle, 0)),
    attackPower: finiteNumber(firstDefined(source.attackPower, base.attackPower), 50),
    maxTerrainDifficulty: finiteNumber(
      firstDefined(
        source.maxTerrainDifficulty,
        source.maxTerrainDifficuly,
        base.maxTerrainDifficulty,
        base.maxTerrainDifficuly
      ),
      10
    ),
    losMode: normalizeLosMode(firstDefined(source.losMode, base.losMode), 'direct_fire'),
    iconKey: String(firstDefined(source.iconKey, base.iconKey, id)).trim() || id
  }
  if (labels) normalized.labels = labels
  return normalized
}

function unitTypeTemplateToCatalogEntry(legacyId, unitType = {}, catalogId = legacyId) {
  const overrides = DEFAULT_UNIT_CATALOG_OVERRIDES[legacyId] || {}
  return normalizeUnitTypeDef({
    id: catalogId,
    name: unitType.name || nameFromId(catalogId),
    health: overrides.health ?? unitType.health ?? unitType.maxHealth ?? 100,
    movement: overrides.movement ?? unitType.movement ?? 2,
    attackRange: unitType.attackRange ?? 1,
    attackAngle: unitType.attackAngle ?? 0,
    attackPower: unitType.attackPower ?? 50,
    maxTerrainDifficulty: overrides.maxTerrainDifficulty ?? unitType.maxTerrainDifficulty ?? 10,
    losMode: unitType.losMode || (legacyId === 'artillery' ? 'artillery' : 'direct_fire'),
    iconKey: unitType.iconKey || legacyId
  })
}

export function buildLegacyUnitCatalogFromUnitTypes(unitTypes = UNIT_TYPES) {
  return Object.keys(unitTypes).map(id => unitTypeTemplateToCatalogEntry(id, unitTypes[id], id))
}

export function buildDefaultUnitCatalogFromUnitTypes(unitTypes = UNIT_TYPES) {
  return Object.keys(unitTypes).map(id =>
    unitTypeTemplateToCatalogEntry(id, unitTypes[id], DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID[id] || id)
  )
}

export const DEFAULT_UNIT_CATALOG = Object.freeze(
  buildDefaultUnitCatalogFromUnitTypes().map(entry => Object.freeze({ ...entry }))
)

export function normalizeUnitCatalog(rawCatalog, options = {}) {
  const fallbackCatalog = Array.isArray(options.fallbackCatalog)
    ? options.fallbackCatalog
    : DEFAULT_UNIT_CATALOG
  const source = Array.isArray(rawCatalog) ? rawCatalog : fallbackCatalog
  const normalized = []
  const seen = new Set()
  source.forEach(entry => {
    const normalizedEntry = normalizeUnitTypeDef(entry)
    if (!normalizedEntry.id || seen.has(normalizedEntry.id)) return
    seen.add(normalizedEntry.id)
    normalized.push(normalizedEntry)
  })
  return normalized
}

export function unitCatalogToMap(catalog) {
  const normalized = normalizeUnitCatalog(catalog)
  return new Map(normalized.map(entry => [entry.id, entry]))
}

export function resolveUnitTypeDef(type, catalogById) {
  const id = type == null ? '' : String(type).trim()
  if (!id) return null
  const resolve = candidateId => {
    if (!candidateId) return null
    if (catalogById && typeof catalogById.get === 'function') {
      return catalogById.get(candidateId) || null
    }
    if (Array.isArray(catalogById)) {
      return catalogById.find(entry => entry && entry.id === candidateId) || null
    }
    return null
  }
  const direct = resolve(id)
  if (direct) return direct
  const defaultAlias = DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID[id]
  if (defaultAlias) return resolve(defaultAlias)
  const legacyAlias = LEGACY_UNIT_TYPE_ID_BY_DEFAULT_ID[id]
  if (legacyAlias) return resolve(legacyAlias)
  return null
}

export function createUnitFromDefinition(definition = {}, options = {}) {
  const type = String(firstDefined(options.type, definition.type, definition.id, 'armored')).trim()
  const health = firstDefined(options.health, definition.health, definition.maxHealth, 100)
  return new GameUnit({
    id: options.id,
    type,
    name: firstDefined(options.name, definition.name, nameFromId(type)),
    health,
    maxHealth: firstDefined(options.maxHealth, health),
    player: options.player,
    position: options.position,
    facing: options.facing,
    movement: firstDefined(options.movement, definition.movement),
    attackRange: firstDefined(options.attackRange, definition.attackRange),
    attackAngle: firstDefined(options.attackAngle, definition.attackAngle),
    attackPower: firstDefined(options.attackPower, definition.attackPower),
    maxTerrainDifficulty: firstDefined(
      options.maxTerrainDifficulty,
      definition.maxTerrainDifficulty,
      definition.maxTerrainDifficuly
    ),
    losMode: firstDefined(options.losMode, definition.losMode),
    iconKey: firstDefined(options.iconKey, definition.iconKey, type),
    isLoaded: options.isLoaded,
    isActive: options.isActive,
    metadata: options.metadata
  })
}

/**
 * Створює юніта заданого типу
 * @param {string} type - тип юніта
 * @param {Object} options - додаткові опції
 * @returns {GameUnit} новий юніт
 */
export function createUnit(type, options = {}) {
  const unitType = UNIT_TYPES[type]
  if (!unitType) {
    throw new Error(`Unknown unit type: ${type}`)
  }
  
  return new GameUnit({
    type,
    name: options.name || unitType.name,
    health: unitType.maxHealth, // spread below may override; explicit options.health takes precedence
    maxHealth: unitType.maxHealth,
    movement: unitType.movement,
    attackRange: unitType.attackRange,
    attackAngle: unitType.attackAngle,
    attackPower: unitType.attackPower,
    losMode: unitType.losMode,
    iconKey: unitType.iconKey || type,
    ...options
  })
}
