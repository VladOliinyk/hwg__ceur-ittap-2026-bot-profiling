/**
 * Розширені структури даних для гексів з підтримкою ігрових механік
 */

import { GameUnit } from './gameUnits.js'

/**
 * Migrate the legacy `terrainDifficuly` typo to canonical
 * `terrainDifficulty` on a terrain shape object. Used at the
 * persistence boundary (GameHex constructor / fromJSON, and
 * GameState.fromJSON for nested `initialState.hexes`) so a
 * pre-Batch-4 localStorage payload does not silently produce
 * zero-cost terrain after engine code stopped reading the legacy key,
 * and does not re-export the typo back to disk through subsequent
 * `toJSON(true).initialState`.
 */
export function normalizeTerrainShape(terrain) {
  if (!terrain || typeof terrain !== 'object') return terrain
  if (!('terrainDifficuly' in terrain)) return terrain
  const { terrainDifficuly: legacy, ...rest } = terrain
  if (rest.terrainDifficulty == null && legacy != null) {
    rest.terrainDifficulty = legacy
  }
  return rest
}

/**
 * Розширений клас гекса з ігровими властивостями
 */
export class GameHex {
  constructor(options = {}) {
    // Базові координати
    this.q = options.q || 0
    this.r = options.r || 0
    this.x = options.x || 0
    this.y = options.y || 0
    
    // Візуальні властивості
    this.points = options.points || ''
    this.innerPoints = options.innerPoints || ''
    this.center = options.center || { x: 0, y: 0 }
    this.stroke = options.stroke || '#333'
    this.strokeWidth = options.strokeWidth || 1
    
    // Місцевість. Migrate the legacy `terrainDifficuly` typo at the
    // persistence boundary too: a stale localStorage payload saved before
    // Batch 4 may carry only the legacy key on its `hex.terrain` entries.
    // Engine code now reads `terrain.terrainDifficulty` exclusively, so
    // without this shim a restored game would silently treat every cell
    // as cost 0.
    this.terrain = normalizeTerrainShape(
      options.terrain || { id: 'default', name: 'Default', color: '#CCCCCC' }
    )

    // Overlays (spawn/base markers) — для відображення та persistence
    this.player1Spawn = options.player1Spawn || false
    this.player1Base = options.player1Base || false
    this.player2Spawn = options.player2Spawn || false
    this.player2Base = options.player2Base || false

    // Ігрові властивості
    this.unit = options.unit || null // юніт на цьому гексі
    this.highlighted = options.highlighted || false
    this.reachable = options.reachable || false
    this.attackable = options.attackable || false
    this.selected = options.selected || false
    
    // Додаткові властивості
    this.elevation = options.elevation || 0
    this.cover = options.cover || 0 // рівень прикриття (0-100)
    this.movementCost = options.movementCost || this.getDefaultMovementCost()
    this.passable = options.passable !== undefined ? options.passable : this.getDefaultPassable()
    
    // Метадані
    this.metadata = options.metadata || {}
  }
  
  /**
   * Отримує базову вартість переміщення залежно від місцевості
   */
  getDefaultMovementCost() {
    const terrainCosts = {
      'plains': 1,
      'grass': 1,
      'forest': 2,
      'water': 3,
      'mountain': 4,
      'desert': 2,
      'mud': 3,
      'snow': 2,
      'swamp': 3
    }
    return terrainCosts[this.terrain.id] || 1
  }
  
  /**
   * Отримує чи можна пройти через цей гекс залежно від місцевості
   */
  getDefaultPassable() {
    const impassableTerrain = ['water', 'mountain']
    return !impassableTerrain.includes(this.terrain.id)
  }
  
  /**
   * Розміщує юніта на гексі
   * @param {GameUnit} unit - юніт для розміщення
   */
  placeUnit(unit) {
    if (this.unit) {
      throw new Error('Hex is already occupied')
    }
    if (!this.passable) {
      throw new Error('Cannot place unit on impassable terrain')
    }
    
    this.unit = unit
    unit.position = { q: this.q, r: this.r }
  }
  
  /**
   * Видаляє юніта з гекса
   * @returns {GameUnit|null} видалений юніт
   */
  removeUnit() {
    const unit = this.unit
    this.unit = null
    return unit
  }
  
  /**
   * Перевіряє чи зайнятий гекс
   */
  isOccupied() {
    return this.unit !== null
  }
  
  /**
   * Перевіряє чи можна розмістити юніта
   */
  canPlaceUnit() {
    return this.passable && !this.isOccupied()
  }
  
  /**
   * Підсвічує гекс
   * @param {string} type - тип підсвічування ('reachable', 'attackable', 'selected')
   */
  highlight(type = 'reachable') {
    this.highlighted = true
    
    switch (type) {
      case 'reachable':
        this.reachable = true
        break
      case 'attackable':
        this.attackable = true
        break
      case 'selected':
        this.selected = true
        break
    }
  }
  
  /**
   * Знімає підсвічування з гекса
   */
  unhighlight() {
    this.highlighted = false
    this.reachable = false
    this.attackable = false
    this.selected = false
  }
  
  /**
   * Отримує колір підсвічування залежно від стану
   */
  getHighlightColor() {
    if (this.selected) return '#ffffff'
    if (this.attackable) return '#ff4444'
    if (this.reachable) return '#44ff44'
    if (this.highlighted) return '#ffff44'
    return null
  }
  
  /**
   * Отримує товщину обводки залежно від стану
   */
  getStrokeWidth() {
    if (this.selected) return 3
    if (this.highlighted) return 2
    return this.strokeWidth
  }
  
  /**
   * Клонує гекс
   */
  clone() {
    return new GameHex({
      q: this.q,
      r: this.r,
      x: this.x,
      y: this.y,
      points: this.points,
      innerPoints: this.innerPoints,
      center: { ...this.center },
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      terrain: { ...this.terrain },
      player1Spawn: this.player1Spawn,
      player1Base: this.player1Base,
      player2Spawn: this.player2Spawn,
      player2Base: this.player2Base,
      unit: this.unit ? this.unit.clone() : null,
      highlighted: this.highlighted,
      reachable: this.reachable,
      attackable: this.attackable,
      selected: this.selected,
      elevation: this.elevation,
      cover: this.cover,
      movementCost: this.movementCost,
      passable: this.passable,
      metadata: { ...this.metadata }
    })
  }
  
  /**
   * Серіалізує гекс в JSON
   */
  toJSON() {
    return {
      q: this.q,
      r: this.r,
      x: this.x,
      y: this.y,
      points: this.points,
      innerPoints: this.innerPoints,
      center: this.center,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      terrain: this.terrain,
      player1Spawn: this.player1Spawn,
      player1Base: this.player1Base,
      player2Spawn: this.player2Spawn,
      player2Base: this.player2Base,
      unit: this.unit ? this.unit.toJSON() : null,
      highlighted: this.highlighted,
      reachable: this.reachable,
      attackable: this.attackable,
      selected: this.selected,
      elevation: this.elevation,
      cover: this.cover,
      movementCost: this.movementCost,
      passable: this.passable,
      metadata: this.metadata
    }
  }
  
  /**
   * Створює гекс з JSON
   */
  static fromJSON(data) {
    const hex = new GameHex(data)
    if (data.unit) {
      hex.unit = GameUnit.fromJSON(data.unit)
    }
    return hex
  }
}

/**
 * Створює гекс з базовими параметрами
 * @param {number} q - координата q
 * @param {number} r - координата r
 * @param {Object} terrain - тип місцевості
 * @param {Object} options - додаткові опції
 * @returns {GameHex} новий гекс
 */
export function createGameHex(q, r, terrain, options = {}) {
  return new GameHex({
    q,
    r,
    terrain,
    ...options
  })
}
