/**
 * Базовий клас для управління ігровим станом
 */

import { GameHex, normalizeTerrainShape } from './gameHex.js'
import {
  GameUnit,
  createUnitFromDefinition,
  makePlacementUnitId,
  normalizeUnitCatalog,
  resolveUnitTypeDef,
  unitCatalogToMap
} from './gameUnits.js'
import {
  getHexDirections,
  hexFacingToward,
  hexInBounds,
  allowedFacingDirections,
  collectRayHexes,
  normalizeHexFacing
} from './hexUtils.js'
import { computeReachableHexes } from './actionEconomy.js'
import { createRng } from '../simulation/rng.js'
import {
  createActiveOutcome,
  evaluateObjectives,
  formatOutcomeLabel,
  isTerminalOutcome,
  normalizeObjectives,
  normalizeOutcome
} from '../objectives/objectives.js'
import { INVALID_LINE_OF_FIRE_MESSAGE } from '../../constants/combat.js'
import {
  ACTION_TYPES,
  PHASES,
  normalizeActionType
} from '../rules/actionTypes.js'

/** Authoritative AP cost for shooting; client `actionMeta.cost` must never override this for attacks. */
const AUTHORITATIVE_FIRE_ACTION_COST = 1

/**
 * Normalize a persisted `initialState` payload so its nested
 * `hexes[*].terrain` no longer carries the legacy `terrainDifficuly`
 * typo. Used at `GameState.fromJSON` boundary — `initialState` is the
 * replay anchor for `revertTo` and is re-exported verbatim by
 * `toJSON(true)`, so without this migration a pre-Batch-4 save would
 * keep the typo alive across save/restore cycles even after the live
 * `hexes` map gets normalized by `GameHex.fromJSON`.
 *
 * `initialState` itself does not nest (it is produced by
 * `toJSON(false)`, which omits `history`/`initialState`), so a single
 * level of walking is enough.
 *
 * @param {*} initialState
 * @returns {*} shallow-cloned, terrain-normalized copy, or the input as-is
 */
function normalizeInitialStateForRestore(initialState) {
  if (!initialState || typeof initialState !== 'object') return initialState
  if (!Array.isArray(initialState.hexes)) return initialState
  return {
    ...initialState,
    hexes: initialState.hexes.map(entry => {
      if (!Array.isArray(entry) || entry.length < 2) return entry
      const [key, hexData] = entry
      if (!hexData || typeof hexData !== 'object' || !hexData.terrain) return entry
      const normalizedTerrain = normalizeTerrainShape(hexData.terrain)
      if (normalizedTerrain === hexData.terrain) return entry
      return [key, { ...hexData, terrain: normalizedTerrain }]
    })
  }
}

export { INVALID_LINE_OF_FIRE_MESSAGE }

/** Верхня межа кроків променя (захист від зависання при зіпсутому `attackRange`). */
const MAX_ATTACK_RAY_STEPS = 64

/** Порівняння `player` у LOS: однакова семантика для рядків і зайвих пробілів у даних. */
function normalizeLosPlayerId(player) {
  if (player == null || player === '') return ''
  return String(player).trim()
}

/** Ключ юніта для Map: відсікає null/порожнє й уніфікує тип (рядок). */
function normalizeUnitIdKey(unitId) {
  if (unitId == null) return ''
  const s = String(unitId).trim()
  return s
}

/** Грань D6 (1–6) або null, якщо значення не придатне. */
function normalizeDiceFace(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null
}

function createPlainRecord() {
  return Object.create(null)
}

function clonePlainRecord(value) {
  const record = createPlainRecord()
  if (!value || typeof value !== 'object') return record
  Object.keys(value).forEach(key => {
    record[key] = value[key]
  })
  return record
}

function clonePlainSnapshot(value, label = 'snapshot') {
  if (value === undefined || value === null) return value
  let serialized
  try {
    serialized = JSON.stringify(value, (key, nested) => {
      if (nested === undefined) {
        throw new Error(`undefined at ${key || '<root>'}`)
      }
      const nestedType = typeof nested
      if (nestedType === 'function' || nestedType === 'symbol' || nestedType === 'bigint') {
        throw new Error(`${nestedType} at ${key || '<root>'}`)
      }
      if (nestedType === 'number' && !Number.isFinite(nested)) {
        throw new Error(`non-finite number at ${key || '<root>'}`)
      }
      return nested
    })
  } catch (e) {
    throw new Error(`${label} must be JSON-serializable: ${e && e.message ? e.message : String(e)}`)
  }
  if (serialized === undefined) {
    throw new Error(`${label} must be JSON-serializable`)
  }
  try {
    return JSON.parse(serialized)
  } catch (e) {
    throw new Error(`${label} could not be cloned: ${e && e.message ? e.message : String(e)}`)
  }
}

function parseReplayInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^-?\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function readReplayPose(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  const q = parseReplayInteger(record.q)
  const r = parseReplayInteger(record.r)
  if (q === null || r === null) return null
  return { q, r, facing: record.facing }
}

/**
 * Ключ масиву операцій у turntable: лише `player2` → Enemy; усе інше (включно з невідомим id) → Our.
 */
function turntableOperationsKey(player) {
  return player === 'player2' ? 'Enemy_operations' : 'Our_operations'
}

export class GameState {
  constructor(options = {}) {
    const mapData = options.mapData
    if (mapData && mapData.parameters) {
      this.width = mapData.parameters.width
      this.height = mapData.parameters.height
    } else {
      this.width = options.width || 5
      this.height = options.height || 5
    }
    this.hexes = new Map() // Map<string, GameHex> де ключ = "q,r"
    this.units = new Map() // Map<string, GameUnit> де ключ = unit.id
    // Seedable RNG hook: when `options.rng` is provided (headless simulation
    // and seeded Playground games), randomness-dependent paths read from it
    // instead of `Math.random()`. Legacy/import callers without a persisted
    // RNG stream still fall back to `Math.random()`. `_rng` keeps the live
    // RNG object so `toJSON` can persist its `stateSnapshot()` and a later
    // `fromJSON` can rebuild a stream that continues from the same point.
    this._rng =
      options.rng && typeof options.rng.next === 'function'
        ? options.rng
        : null
    this._random = this._rng
      ? () => this._rng.next()
      : Math.random
    this.currentPlayer = options.currentPlayer || 'player1'
    this.turnNumber = options.turnNumber || 1
    this.gamePhase = options.gamePhase || 'movement' // movement, combat, end
    this.selectedUnit = null
    this.selectedHex = null
    
    // History Tracking
    this.history = options.history || [] // Array of completed turns (arrays of actions)
    this.currentTurnActions = options.currentTurnActions || [] // Actions in current turn
    this.initialState = options.initialState || null // Snapshot of start state
    this.turnState = clonePlainRecord(options.turnState)
    // Completed player-turns since any unit last lost health. Reset on damage
    // (performAttack), incremented per endTurn. Same unit as maxTurns/deadline.
    this.turnsSinceLastDamage = Number.isInteger(options.turnsSinceLastDamage)
      ? options.turnsSinceLastDamage
      : 0
    this.turntable = this.normalizeTurntable(options.turntableData || options.movesData || null)
    const rawObjectives = options.objectivesData !== undefined
      ? options.objectivesData
      : options.objectives
    const hasExplicitObjectives = rawObjectives != null
    this.objectives = hasExplicitObjectives ? rawObjectives : null
    this.outcome = normalizeOutcome(options.outcome)
    this._setupComplete = false
    this._objectivesArmed = options.objectivesArmed === true
    /** True only while revertTo replays history; not serialized. Blocks updateInitialState from re-anchoring mid-replay. */
    this._replaying = false
    this.reachableHexesCache = new Set()
    this._reachableHexCosts = new Map()
    this.cacheValidForUnitId = null
    /** Лічильник мутацій дошки: юніти, терен, facing тощо.
     *  Жива версія дошки; всі version-keyed кеші (union reachability, attack targets,
     *  attack range, directional costs, board snapshot statics) порівнюються з нею. */
    this.reachabilityVersion = 0
    this.cacheVersion = -1
    /** Кеш `getValidFireTargets(unitId)`; інвалідується разом із reachability. */
    this._attackTargetsCache = new Map()
    this._attackTargetsCacheVersion = -1
    /** Кеш `getFireRangeHexes(unitId)`; інвалідується разом із reachability. */
    this._attackRangeHexesCache = new Map()
    this._attackRangeHexesCacheVersion = -1
    /** Кеш `getDirectionalReachableCosts`; ключ `"unitId:motionMode"`, інвалідується разом із reachability. */
    this._directionalCostsCache = new Map()
    this._directionalCostsCacheVersion = -1
    /** Спільні для всіх юнітів частини снапшота дошки (`terrainByHex` + зайнятість); інвалідується разом із reachability. */
    this._boardSnapshotCache = null
    this._boardSnapshotCacheVersion = -1
    this.unitCatalog = normalizeUnitCatalog(options.unitsData && options.unitsData.unitTypes)
    this.unitCatalogById = unitCatalogToMap(this.unitCatalog)

    // Ініціалізуємо сітку гексів (з mapData + terrainTypes якщо є)
    this.initializeHexes(options.terrainTypes, mapData)
    if (hasExplicitObjectives) {
      this.objectives = normalizeObjectives(this.objectives, this)
    }
    // Розміщуємо юнітів з unitsData по спавн-гексах
    if (options.unitsData && mapData) {
      this.placeUnitsFromLevel(options.unitsData, mapData)
    }
    if (Object.keys(this.turnState).length === 0 && this.units.size > 0) {
      this.resetPlayerTurn(this.currentPlayer)
    }
    if (options.deferInitialEvaluation !== true) {
      this._setupComplete = true
      if (!isTerminalOutcome(this.outcome)) {
        this.evaluateOutcome({ phase: 'afterAction' })
      }
    }
    // Capture initial state after final objective evaluation so replay anchors
    // carry the same outcome/objectives as the live starting board.
    if (options.deferInitialEvaluation !== true && !options.initialState && !options.history) {
      this.captureInitialState()
    }
  }

  /**
   * Розміщує юнітів з unitsData на спавн-гексах мапи (player1Spawn/Base, player2Spawn/Base).
   * Кількість юнітів визначається через `count` у unitsData (якщо count не задано — вважаємо `1`).
   * Розміщення на спавн-гексах завжди рандомне для кожної ініціалізації гри.
   * Початковий `facing`: за замовчуванням — у бік центру мапи (за `parameters.width` / `height`, інакше за bbox гексів у `map`).
   * Явне число `facing` у записі юніта перекриває авто.
   */
  placeUnitsFromLevel(unitsData, mapData) {
    const mapArray = mapData && Array.isArray(mapData.map) ? mapData.map : []
    const validCoord = h => Number.isInteger(h.q) && Number.isInteger(h.r)
    this.unitCatalog = normalizeUnitCatalog(unitsData && unitsData.unitTypes)
    this.unitCatalogById = unitCatalogToMap(this.unitCatalog)

    const mapCenterHex = () => {
      const params = mapData && mapData.parameters
      const w = params && params.width != null ? Number(params.width) : NaN
      const h = params && params.height != null ? Number(params.height) : NaN
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return {
          q: Math.floor((w - 1) / 2),
          r: Math.floor((h - 1) / 2)
        }
      }
      let minQ = Infinity
      let maxQ = -Infinity
      let minR = Infinity
      let maxR = -Infinity
      for (const cell of mapArray) {
        if (!validCoord(cell)) continue
        minQ = Math.min(minQ, cell.q)
        maxQ = Math.max(maxQ, cell.q)
        minR = Math.min(minR, cell.r)
        maxR = Math.max(maxR, cell.r)
      }
      if (minQ === Infinity) return { q: 0, r: 0 }
      return {
        q: Math.floor((minQ + maxQ) / 2),
        r: Math.floor((minR + maxR) / 2)
      }
    }
    const centerHex = mapCenterHex()

    const spawnsP1 = mapArray
      .filter(h => (h.player1Spawn === true || h.player1Base === true) && validCoord(h))
      .map(h => ({ q: h.q, r: h.r }))
      .sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q)
    const spawnsP2 = mapArray
      .filter(h => (h.player2Spawn === true || h.player2Base === true) && validCoord(h))
      .map(h => ({ q: h.q, r: h.r }))
      .sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q)

    const placeForPlayer = (player, spawns) => {
      const shuffle = arr => {
        // Fisher-Yates shuffle (in-place). Uses `this._random` so headless
        // simulations and seeded Playground games observe deterministic
        // placement; legacy/import fallback stays on `Math.random`.
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(this._random() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return arr
      }

      const listDefs = (unitsData[player] && unitsData[player].units) || []

      // Expand unit definitions into copies based on `count`.
      // If `count` is not provided => default to 1.
      const expandedList = []
      listDefs.forEach(def => {
        const rawCount = def && def.count != null ? Number(def.count) : 1
        const count = Number.isFinite(rawCount) ? Math.trunc(rawCount) : 1
        if (count <= 0) return
        for (let c = 0; c < count; c++) expandedList.push(def)
      })

      if (expandedList.length > spawns.length) {
        console.warn(
          `placeUnitsFromLevel: ${player} has ${expandedList.length} unit instance(s) but only ${spawns.length} spawn hex(es); placing only ${spawns.length}.`
        )
      }

      const spawnsShuffled = shuffle([...spawns])
      const expandedShuffled = shuffle([...expandedList])

      const toPlaceCount = Math.min(spawnsShuffled.length, expandedShuffled.length)
      /** Лічильник екземплярів на (player, type) для id на кшталт p1_inf1, p1_inf2. */
      const typeInstanceCount = {}
      for (let i = 0; i < toPlaceCount; i++) {
        const def = expandedShuffled[i]
        const pos = spawnsShuffled[i]
        if (!pos) continue

        const type = def && def.type != null ? String(def.type).trim() : ''
        const catalogDef = resolveUnitTypeDef(type, this.unitCatalogById)
        if (!type || !catalogDef) {
          console.warn(`placeUnitsFromLevel: ${player} unit at expanded index ${i} has missing or unknown type "${def && def.type}", skipping.`)
          continue
        }

        try {
          const effectiveDef = { ...catalogDef, ...def, type }
          // Prefer canonical `maxTerrainDifficulty`; fall back to the legacy
          // typo `maxTerrainDifficuly` so direct fixtures that bypass the
          // validator gate still place units. Both names yield the same
          // canonical engine field via createUnitFromDefinition.
          const rawMaxTerrain =
            effectiveDef.maxTerrainDifficulty != null ? effectiveDef.maxTerrainDifficulty : effectiveDef.maxTerrainDifficuly
          let maxTerrainVal = rawMaxTerrain != null ? Number(rawMaxTerrain) : undefined
          if (rawMaxTerrain != null && (!Number.isFinite(maxTerrainVal) || maxTerrainVal < 0)) {
            console.warn(`placeUnitsFromLevel: ${player} unit at expanded index ${i} has invalid maxTerrainDifficulty "${rawMaxTerrain}", ignoring.`)
            maxTerrainVal = undefined
          }

          const idx = (typeInstanceCount[type] = (typeInstanceCount[type] || 0) + 1)
          const stableId = makePlacementUnitId(player, type, idx)

          const autoFacing = hexFacingToward(pos, centerHex)
          const facingResolved = effectiveDef.facing != null && effectiveDef.facing !== '' ? effectiveDef.facing : autoFacing

          const opts = {
            id: stableId,
            name: effectiveDef.name,
            health: effectiveDef.health,
            maxHealth: effectiveDef.health,
            facing: facingResolved,
            movement: effectiveDef.movement,
            attackRange: effectiveDef.attackRange,
            attackAngle: effectiveDef.attackAngle,
            attackPower: effectiveDef.attackPower,
            maxTerrainDifficulty: maxTerrainVal,
            losMode: effectiveDef.losMode,
            iconKey: effectiveDef.iconKey,
            player,
            position: { q: pos.q, r: pos.r }
          }
          const unit = createUnitFromDefinition(effectiveDef, opts)
          this.addUnit(unit, pos.q, pos.r)
        } catch (err) {
          console.error(`placeUnitsFromLevel: failed to place ${player} unit at expanded index ${i}:`, err.message)
        }
      }
    }
    placeForPlayer('player1', spawnsP1)
    placeForPlayer('player2', spawnsP2)
  }

  updateInitialState() {
     // revertTo empties the buffers during replay; never move the anchor then.
     if (this._replaying) return
     // Only update if we haven't started recording actions yet
     if (this.history.length === 0 && this.currentTurnActions.length === 0) {
         this.captureInitialState()
     }
  }

  captureInitialState() {
    // We only save the structural data needed to reconstruct the game
    // Note: This relies on toJSON/fromJSON logic which we will ensure covers everything
    this.initialState = clonePlainSnapshot(this.toJSON(false), 'initialState') // false = don't include history in the snapshot itself
  }

  evaluateOutcome(options = {}) {
    if (isTerminalOutcome(this.outcome)) {
      return this.outcome
    }
    this.refreshObjectiveArming()
    this.outcome = evaluateObjectives(this, this.objectives, {
      phase: options && options.phase ? options.phase : 'afterAction',
      setupComplete: this._setupComplete === true && this._objectivesArmed === true
    })
    return this.outcome
  }

  hasLivingUnitForPlayer(player) {
    for (const unit of this.units.values()) {
      if (!unit || unit.player !== player) continue
      if (typeof unit.isAlive === 'function') {
        if (unit.isAlive()) return true
      } else if (unit.health > 0 && unit.isActive !== false) {
        return true
      }
    }
    return false
  }

  refreshObjectiveArming() {
    if (this._objectivesArmed === true) return true
    if (this.hasLivingUnitForPlayer('player1') && this.hasLivingUnitForPlayer('player2')) {
      this._objectivesArmed = true
    }
    return this._objectivesArmed === true
  }

  isGameEnded() {
    return isTerminalOutcome(this.outcome)
  }

  assertGameActive(actionLabel = 'Action') {
    if (!isTerminalOutcome(this.outcome)) {
      this.evaluateOutcome()
    }
    if (isTerminalOutcome(this.outcome)) {
      throw new Error(`${actionLabel} is not allowed: game already ended (${formatOutcomeLabel(this.outcome)})`)
    }
  }

  /**
   * Deep snapshot for transactional revert (history + board + turn state).
   */
  _cloneSnapshotForRevert() {
    const raw = this.toJSON(true)
    return clonePlainSnapshot(raw, 'pre-revert snapshot')
  }

  /**
   * Adopts the canonical common-field set from another GameState instance.
   * Single source of truth for full-state restore — `revertTo`,
   * `_restoreGameStateFromSnapshot` and the `loadHistoryJSON` commit all go
   * through this list; path-specific fields (initialState, history,
   * currentTurnActions, selection) stay at the call sites. RNG adopts the
   * source's stream (anchor state for revert/import); replay does not advance
   * it past recorded dice rolls, so the export-point stream state is not
   * reconstructible. `_replaying` is deliberately not adopted.
   * `source` must be a discarded temp (a `fromJSON` product): containers
   * (hexes/units/turnState) are adopted by reference, not cloned, so the
   * source must not be used afterwards. `_rng` and `_random` must always
   * travel together — `_random` is a closure over the source's `_rng`.
   */
  _adoptState(source) {
    this.hexes = source.hexes
    this.units = source.units
    this.currentPlayer = source.currentPlayer
    this.turnNumber = source.turnNumber
    this.gamePhase = source.gamePhase
    this.turnState = source.turnState
    this.objectives = source.objectives
    this.outcome = source.outcome
    this.width = source.width
    this.height = source.height
    this.turntable = source.turntable
    this.turnsSinceLastDamage = source.turnsSinceLastDamage
    this._objectivesArmed = source._objectivesArmed
    this._rng = source._rng
    this._random = source._random
  }

  /**
   * Restores full mutable state from a snapshot produced by `_cloneSnapshotForRevert` / `toJSON(true)`.
   * @returns {boolean}
   */
  _restoreGameStateFromSnapshot(snapshot) {
    try {
      const s = GameState.fromJSON(snapshot)
      this._adoptState(s)
      this.history = s.history
      this.currentTurnActions = s.currentTurnActions
      this.initialState = s.initialState
      this.selectedUnit = s.selectedUnit
      this.selectedHex = s.selectedHex
      this.touchReachabilityState()
      this.clearHighlights()
      return true
    } catch (e) {
      console.error('GameState: failed to restore from snapshot', e)
      return false
    }
  }

  cloneTurnStateSnapshot(snapshot = this.turnState) {
    return clonePlainSnapshot(snapshot || {}, 'turnStateSnapshot')
  }

  getRecordedActionType(action = {}) {
    if (typeof action.actionType === 'string' && action.actionType.trim()) {
      return action.actionType.trim().toLowerCase()
    }
    if (typeof action.type === 'string' && action.type.trim()) {
      return action.type.trim().toLowerCase()
    }
    return ''
  }

  isValidHistoryAction(action) {
    if (!action || typeof action !== 'object') return false
    if (typeof action.type !== 'string' || !action.type.trim()) return false
    const type = action.type.trim()

    if (type === 'startTurn') {
      return (
        typeof action.player === 'string' &&
        Number.isInteger(action.turnNumber) &&
        action.turnNumber >= 1 &&
        action.turnStateSnapshot &&
        typeof action.turnStateSnapshot === 'object'
      )
    }

    if (type === 'endTurn') {
      return typeof action.player === 'string' && Number.isInteger(action.turnNumber)
    }

    if (type === 'dice_roll') {
      // Validation defends loadHistoryJSON replay against payloads with missing/
      // bogus dice faces. Replay itself is a no-op for dice_roll, but a malformed
      // entry slipping into `currentTurnActions` would mislead `getCurrentDiceResult`.
      return normalizeDiceFace(action.result) != null
    }

    // Whitelist remaining types so history payloads with unknown action types
    // (e.g. `teleport`) are rejected at validation time, before any mutation.
    const needsUnit = type === 'move' || type === 'rotate' || type === 'attack' || type === 'reload'
    if (!needsUnit) return false
    if (typeof action.unitId !== 'string' || !action.unitId.trim()) return false

    if (type === 'move') {
      if (!readReplayPose(action.to)) return false
      // Legacy saves may omit `from`; new recordings should include from + to (with facing) for strict replay.
      if (action.from != null && !readReplayPose(action.from)) return false
      return true
    }

    return true
  }

  validateHistoryPayload(data) {
    if (!data || typeof data !== 'object') return { ok: false, error: 'History payload must be an object' }
    if (!data.initialState || typeof data.initialState !== 'object') {
      return { ok: false, error: 'Missing initialState in history payload' }
    }

    const history = Array.isArray(data.history) ? data.history : []
    const currentTurnActions = Array.isArray(data.currentTurnActions) ? data.currentTurnActions : []

    // Enforce the same one-roll-per-turn invariant on imports that the public
    // append APIs (`rollDice` / `recordAction`) enforce. Without this, a crafted
    // payload with two `dice_roll` entries in a turn would commit through
    // `loadHistoryJSON` and leave `getCurrentDiceResult` reading the second face.
    for (let t = 0; t < history.length; t++) {
      const turnActions = history[t]
      if (!Array.isArray(turnActions)) {
        return { ok: false, error: `history[${t}] must be an array` }
      }
      let diceRollCount = 0
      for (let a = 0; a < turnActions.length; a++) {
        if (!this.isValidHistoryAction(turnActions[a])) {
          return { ok: false, error: `Invalid action at history[${t}][${a}]` }
        }
        if (turnActions[a] && turnActions[a].type === 'dice_roll') {
          diceRollCount += 1
          if (diceRollCount > 1) {
            return { ok: false, error: `history[${t}] contains multiple dice_roll entries` }
          }
        }
      }
    }

    let currentDiceRollCount = 0
    for (let a = 0; a < currentTurnActions.length; a++) {
      if (!this.isValidHistoryAction(currentTurnActions[a])) {
        return { ok: false, error: `Invalid action at currentTurnActions[${a}]` }
      }
      if (currentTurnActions[a] && currentTurnActions[a].type === 'dice_roll') {
        currentDiceRollCount += 1
        if (currentDiceRollCount > 1) {
          return { ok: false, error: 'currentTurnActions contains multiple dice_roll entries' }
        }
      }
    }

    return { ok: true }
  }
  
  recordAction(action) {
    const type = action && action.type
    if (!type) return
    this.turnState = clonePlainRecord(this.turnState)

    const baseAction = {
      type,
      turnNumber: this.turnNumber,
      player: this.currentPlayer
    }

    if (type === 'startTurn') {
      baseAction.turnStateSnapshot = this.cloneTurnStateSnapshot(action.turnStateSnapshot || this.turnState)
      this.currentTurnActions.push(baseAction)
      return
    }

    if (type === 'endTurn') {
      this.currentTurnActions.push(baseAction)
      return
    }

    if (type === 'dice_roll') {
      // Enforce one-roll-per-turn here so callers can't bypass `rollDice`
      // by going through `recordAction` directly. `rollDice` inlines its
      // own push after its own guard and never reaches this branch.
      const face = normalizeDiceFace(action.result)
      if (face == null) {
        throw new Error('recordAction(dice_roll): result must be a D6 face (1-6)')
      }
      if (this.hasRolledDice()) {
        throw new Error('Dice already rolled this turn; rerolls are not allowed')
      }
      baseAction.result = face
      if (typeof action.unitName === 'string' && action.unitName.trim()) baseAction.unitName = action.unitName.trim()
      this.currentTurnActions.push(baseAction)
      return
    }

    if (action.unitId) baseAction.unitId = action.unitId
    if (action.targetUnitId) baseAction.targetUnitId = action.targetUnitId
    if (action.from) baseAction.from = clonePlainSnapshot(action.from, 'action.from')
    if (action.to) baseAction.to = clonePlainSnapshot(action.to, 'action.to')
    if (Array.isArray(action.path)) baseAction.path = clonePlainSnapshot(action.path, 'action.path')
    if (action.damage != null) baseAction.damage = action.damage

    const normalizedCost = this.normalizeActionCost(action.cost)
    if (normalizedCost !== null) baseAction.cost = normalizedCost
    if (action.phase != null) baseAction.phase = this.normalizeActionPhase(action.phase)

    const normalizedActionType = this.getRecordedActionType(action)
    if (normalizedActionType) baseAction.actionType = normalizedActionType

    if (baseAction.actionType === ACTION_TYPES.FIRE || baseAction.actionType === ACTION_TYPES.RELOAD) {
      const row = action.unitId ? this.turnState[action.unitId] : null
      if (row && typeof row.isLoaded === 'boolean') {
        baseAction.isLoadedBefore = row.isLoaded
        baseAction.isLoadedAfter = baseAction.actionType === ACTION_TYPES.FIRE ? false : true
      }
    }

    this.currentTurnActions.push(baseAction)
  }
  
  endTurn() {
    this.assertGameActive('End turn')
    this.recordAction({ type: 'endTurn' })
    this.history.push([...this.currentTurnActions])
    this.currentTurnActions = []
    this.turnsSinceLastDamage += 1
    this.nextPlayer()
    this.evaluateOutcome({ phase: 'endTurn' })
  }

  /**
   * Reverts game state to a specific point in history
   * @param {number} turnIndex - Index of the turn in history
   * @param {number} actionIndex - Index of the action within that turn (inclusive)
   */
  revertTo(turnIndex, actionIndex) {
    if (!this.initialState) {
      console.error("Cannot revert: No initial state saved")
      return false
    }
    if (!Number.isInteger(turnIndex) || !Number.isInteger(actionIndex) || turnIndex < 0 || actionIndex < 0) {
      console.error('Cannot revert: invalid turnIndex/actionIndex', { turnIndex, actionIndex })
      return false
    }
    if (turnIndex > this.history.length) {
      console.error('Cannot revert: turnIndex out of range', { turnIndex, historyLength: this.history.length })
      return false
    }

    const turnActionCount =
      turnIndex < this.history.length
        ? Array.isArray(this.history[turnIndex])
          ? this.history[turnIndex].length
          : 0
        : this.currentTurnActions.length
    if (actionIndex > turnActionCount) {
      console.error('Cannot revert: actionIndex out of range', {
        actionIndex,
        turnActionCount,
        turnIndex
      })
      return false
    }

    let preRevertSnapshot
    try {
      preRevertSnapshot = this._cloneSnapshotForRevert()
    } catch (e) {
      console.error('Cannot revert: snapshot clone failed', e)
      return false
    }

    // 1. Reset to initial state
    let freshState
    try {
      freshState = GameState.fromJSON(this.initialState)
    } catch (e) {
      console.error('Cannot revert: invalid initialState', e)
      return false
    }
    // `fromJSON` already calls `reconcileBoardUnitsWithMap()` so hex occupancy matches `this.units`
    // (avoids duplicate unit copies that would break strict replay assertions).

    // Copy fresh state properties to this instance
    this._adoptState(freshState)
    this.selectedUnit = null
    this.selectedHex = null
    this.touchReachabilityState()
    
    // 2. Build action list up to requested point (clicked action is excluded)
    const actionsToReplay = []
    for (let t = 0; t < turnIndex; t++) {
      if (this.history[t]) {
        actionsToReplay.push(...this.history[t])
      }
    }
    
    if (turnIndex < this.history.length) {
      if (this.history[turnIndex]) {
        const turnActions = this.history[turnIndex]
        if (actionIndex === 0) {
          const first = turnActions[0]
          if (first && first.type === 'startTurn') {
            actionsToReplay.push(first)
          }
        } else {
          for (let a = 0; a < actionIndex; a++) {
            if (turnActions[a]) {
              actionsToReplay.push(turnActions[a])
            }
          }
        }
      }
    } else {
        // Replaying current turn (turn not yet pushed to history)
        if (actionIndex === 0) {
          const first = this.currentTurnActions[0]
          if (first && first.type === 'startTurn') {
            actionsToReplay.push(first)
          }
        } else {
          for (let a = 0; a < actionIndex; a++) {
            if (this.currentTurnActions[a]) {
              actionsToReplay.push(this.currentTurnActions[a])
            }
          }
        }
    }
    
    // 3. Execute replay
    // We need to temporarily clear history/current actions to avoid duplicating them during replay
    const savedHistory = this.history
    const savedCurrentActions = [...this.currentTurnActions] // Create a copy!
    this.history = [] 
    this.currentTurnActions = []
    
    const nearestStartTurnIndex = (() => {
      for (let i = actionsToReplay.length - 1; i >= 0; i--) {
        if (actionsToReplay[i] && actionsToReplay[i].type === 'startTurn') return i
      }
      return -1
    })()

    // Flag the replay window: with the buffers emptied above, a replayed lethal
    // attack (removeUnit → updateInitialState) would overwrite the replay anchor.
    this._replaying = true
    try {
      if (nearestStartTurnIndex >= 0) {
        for (let i = 0; i < nearestStartTurnIndex; i++) {
          if (!this.applyAction(actionsToReplay[i])) {
            if (!this._restoreGameStateFromSnapshot(preRevertSnapshot)) {
              console.error('revertTo: replay failed and snapshot restore failed')
            }
            return false
          }
        }

        const startTurnAction = actionsToReplay[nearestStartTurnIndex]
        if (Number.isInteger(startTurnAction.turnNumber)) {
          this.turnNumber = startTurnAction.turnNumber
        }
        if (typeof startTurnAction.player === 'string') {
          this.currentPlayer = startTurnAction.player
        }
        this.turnState = this.normalizeTurnState(
          this.cloneTurnStateSnapshot(startTurnAction.turnStateSnapshot || {}),
          this.units
        )

        for (let i = nearestStartTurnIndex + 1; i < actionsToReplay.length; i++) {
          if (!this.applyAction(actionsToReplay[i])) {
            if (!this._restoreGameStateFromSnapshot(preRevertSnapshot)) {
              console.error('revertTo: replay failed and snapshot restore failed')
            }
            return false
          }
        }
      } else {
        for (let i = 0; i < actionsToReplay.length; i++) {
          if (!this.applyAction(actionsToReplay[i])) {
            if (!this._restoreGameStateFromSnapshot(preRevertSnapshot)) {
              console.error('revertTo: replay failed and snapshot restore failed')
            }
            return false
          }
        }
      }
    } finally {
      this._replaying = false
    }
    
    // Restore history, but truncated
    this.history = savedHistory.slice(0, turnIndex)
    
    // The current turn actions are the ones we just replayed from the target turn
    // If we reverted to a past turn, that turn becomes the current turn (up to actionIndex)
    // If we reverted within current turn, we restore up to actionIndex
    
    if (turnIndex < savedHistory.length) {
      if (savedHistory[turnIndex]) {
        if (actionIndex === 0) {
          const first = savedHistory[turnIndex][0]
          this.currentTurnActions = first && first.type === 'startTurn' ? [first] : []
        } else {
          this.currentTurnActions = savedHistory[turnIndex].slice(0, actionIndex)
        }
      } else {
        this.currentTurnActions = []
      }
    } else {
        // Reverted within current turn: clicked action and later actions are undone.
        if (actionIndex === 0) {
          const first = savedCurrentActions[0]
          this.currentTurnActions = first && first.type === 'startTurn' ? [first] : []
        } else {
          this.currentTurnActions = savedCurrentActions.slice(0, actionIndex)
        }
    }
    
    // Clear selection state
    this.selectedUnit = null
    this.selectedHex = null
    this.clearHighlights()

    this.touchReachabilityState()
    this.evaluateOutcome()
    return true
  }

  /**
   * Strict replay: when history includes `action.from`, board pose must match before mutating.
   * Legacy rows without `from` skip this check (see applyAction move).
   */
  _assertReplayMoveFromPose(unit, fromRecord) {
    const fromPose = readReplayPose(fromRecord)
    if (!fromPose) {
      throw new Error('applyAction move: invalid action.from coordinates')
    }
    if (unit.position.q !== fromPose.q || unit.position.r !== fromPose.r) {
      throw new Error('applyAction move: unit position does not match action.from')
    }
    if (fromPose.facing !== undefined && fromPose.facing !== null && fromPose.facing !== '') {
      if (normalizeHexFacing(unit.facing) !== normalizeHexFacing(fromPose.facing)) {
        throw new Error('applyAction move: unit facing does not match action.from.facing')
      }
    }
  }

  _isLegacyDegenerateMoveAction(action, unit) {
    if (!action || action.type !== 'move') return false
    if (!unit || !unit.position) return false
    const fromPose = readReplayPose(action.from)
    const toPose = readReplayPose(action.to)
    const unitPose = readReplayPose(unit.position)
    if (!fromPose || !toPose || !unitPose) return false
    const recordedCost = this.normalizeActionCost(action.cost)
    if (recordedCost === null || recordedCost === 0) return false
    if (fromPose.q !== toPose.q || fromPose.r !== toPose.r) return false
    if (unitPose.q === toPose.q && unitPose.r === toPose.r) return false

    const turnRow = this.turnState[action.unitId]
    const budget = this.normalizeActionBudget(
      turnRow ? turnRow.actionsRemaining : unit.movement,
      0
    )
    return recordedCost <= budget && !!this.getHex(toPose.q, toPose.r)
  }

  _shouldLogReplayDiagnostics() {
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') return false
    return true
  }

  applyAction(action) {
    // Helper to apply action without recording it
    try {
        if (!this.isValidHistoryAction(action)) {
            throw new Error(`Invalid action payload: ${JSON.stringify(action)}`)
        }
        this.turnState = clonePlainRecord(this.turnState)
        if (action.type === 'startTurn') {
            if (typeof action.player === 'string') {
                this.currentPlayer = action.player
            }
            if (Number.isInteger(action.turnNumber)) {
                this.turnNumber = action.turnNumber
            }
            this.turnState = this.normalizeTurnState(
              this.cloneTurnStateSnapshot(action.turnStateSnapshot || {}),
              this.units
            )
            this.touchReachabilityState()
        } else if (action.type === 'endTurn') {
            // Marker event; replay still mirrors live endTurn()'s idle-counter
            // increment so revert/import reconstruct it.
            this.turnsSinceLastDamage += 1
        } else if (action.type === 'move') {
            const unit = this.units.get(action.unitId)
            if (!unit) {
              throw new Error(`applyAction move: unit ${action.unitId} not found`)
            }
            if (!this.turnState[action.unitId]) {
              this.turnState[action.unitId] = {
                actionsRemaining: this.normalizeActionBudget(unit.movement, 0),
                isLoaded: unit.isLoaded === true
              }
            }

            const toPose = readReplayPose(action.to)
            if (!toPose) {
              throw new Error('applyAction move: invalid action.to coordinates')
            }
            const tq = toPose.q
            const tr = toPose.r

            const hasFromRecord = action.from != null
            if (hasFromRecord) {
              try {
                this._assertReplayMoveFromPose(unit, action.from)
              } catch (e) {
                if (!this._isLegacyDegenerateMoveAction(action, unit)) {
                  throw e
                }
                if (this._shouldLogReplayDiagnostics()) {
                  console.warn(
                    `[applyAction move] ignoring degenerate legacy action.from for ${action.unitId}; replaying from current board pose`
                  )
                }
              }
            }

            const fromHex = this.getHex(unit.position.q, unit.position.r)
            const toHex = this.getHex(tq, tr)
            if (!fromHex || !toHex) {
              throw new Error('applyAction move: fromHex or toHex missing')
            }
            if (fromHex.unit !== unit) {
              throw new Error('applyAction move: fromHex does not reference this unit')
            }
            if (toHex.unit != null && toHex.unit !== unit) {
              throw new Error('applyAction move: target hex is occupied by another unit')
            }

            let recordedCost = this.normalizeActionCost(action.cost)
            if (recordedCost === null) {
              console.warn(
                `[applyAction move] missing or invalid cost in history; using 0 for legacy replay (${action.unitId})`
              )
              recordedCost = 0
            }

            this.ensureReachabilityCache(action.unitId)
            const targetKey = this.getHexKey(tq, tr)
            const recomputedCost = this._reachableHexCosts.get(targetKey)
            if (
              this._shouldLogReplayDiagnostics() &&
              recomputedCost !== undefined &&
              recomputedCost !== recordedCost
            ) {
              console.warn(
                `[applyAction move] pathfinder cost ${recomputedCost} differs from recorded ${recordedCost} (${action.unitId} → ${targetKey}); mutation uses recorded cost only`
              )
            }

            fromHex.removeUnit()
            toHex.placeUnit(unit)
            unit.position = { q: tq, r: tr }
            if (toPose.facing !== undefined && toPose.facing !== null && toPose.facing !== '') {
              unit.facing = normalizeHexFacing(toPose.facing)
            }

            this.applyActionStateMutation(
              action.unitId,
              this.getRecordedActionType(action) || 'move',
              recordedCost
            )
            this.touchReachabilityState()
        } else if (action.type === 'rotate') {
            const unit = this.units.get(action.unitId)
            if (!unit) {
              throw new Error(`applyAction rotate: unit ${action.unitId} not found`)
            }
            if (!this.turnState[action.unitId]) {
              this.turnState[action.unitId] = {
                actionsRemaining: this.normalizeActionBudget(unit.movement, 0),
                isLoaded: unit.isLoaded === true
              }
            }
            const toFacing =
              action.to && typeof action.to === 'object' ? action.to.facing : undefined
            unit.facing = normalizeHexFacing(toFacing)
            this.applyActionStateMutation(
              action.unitId,
              this.getRecordedActionType(action) || 'turn',
              action.cost || 0
            )
            this.touchReachabilityState()
        } else if (action.type === 'reload') {
            const unit = this.units.get(action.unitId)
            if (!unit) {
              throw new Error(`applyAction reload: unit ${action.unitId} not found`)
            }
            if (!this.turnState[action.unitId]) {
                this.turnState[action.unitId] = {
                  actionsRemaining: this.normalizeActionBudget(unit.movement, 0),
                  isLoaded: unit.isLoaded === true
                }
            }
            this.applyActionStateMutation(
              action.unitId,
              this.getRecordedActionType(action) || 'reload',
              action.cost || 0
            )
            this.touchReachabilityState()
        } else if (action.type === 'attack') {
            const attacker = this.units.get(action.unitId)
            if (!attacker) {
              throw new Error(`applyAction attack: attacker ${action.unitId} not found`)
            }
            if (!this.turnState[action.unitId]) {
              this.turnState[action.unitId] = {
                actionsRemaining: this.normalizeActionBudget(attacker.movement, 0),
                isLoaded: attacker.isLoaded === true
              }
            }
            const toPose = readReplayPose(action.to)
            const targetFromTo =
              toPose ? this.getHex(toPose.q, toPose.r)?.unit : undefined
            const target = action.targetUnitId
              ? this.units.get(action.targetUnitId)
              : targetFromTo
            if (!target) {
              throw new Error('applyAction attack: target unit not found')
            }
            if (target.player === attacker.player) {
              throw new Error('applyAction attack: cannot attack friendly unit')
            }
            const targetPose = readReplayPose(target.position)
            if (!targetPose) {
              throw new Error('applyAction attack: invalid target position')
            }
            const tq = targetPose.q
            const tr = targetPose.r
            if (!this.isAuthorizedFireTarget(action.unitId, tq, tr, target.id)) {
              throw new Error(INVALID_LINE_OF_FIRE_MESSAGE)
            }
            const damage = this.normalizeActionBudget(action.damage, attacker.attackPower || 0)
            target.takeDamage(damage)
            // Mirror performAttack: any replayed health loss resets the idle clock.
            if (damage > 0) {
              this.turnsSinceLastDamage = 0
            }
            if (!target.isAlive()) {
              this.removeUnit(target.id)
            }
            const recordedCost = this.normalizeActionCost(action.cost)
            const costForMutation =
              recordedCost !== null ? recordedCost : AUTHORITATIVE_FIRE_ACTION_COST
            this.applyActionStateMutation(action.unitId, ACTION_TYPES.FIRE, costForMutation)
            this.touchReachabilityState()
        } else if (action.type === 'dice_roll') {
            // No-op: dice rolls are recorded for timeline/persistence only
        } else {
            // Defense in depth: even if `isValidHistoryAction` is bypassed, an unknown
            // action type must not silently succeed during replay.
            throw new Error(`applyAction: unknown action type "${action && action.type}"`)
        }
        return true
    } catch (e) {
        console.error("Error applying action during replay:", action, e)
        return false
    }
  }

  getHistoryJSON() {
    return JSON.stringify({
        initialState: this.initialState,
        history: this.history,
        currentTurnActions: this.currentTurnActions
    }, null, 2)
  }

  /**
   * Transactional import: parse + validate, replay onto a throwaway `GameState`, and only
   * copy the resulting fields into `this` after the full replay succeeds. Any failure
   * leaves the current instance untouched.
   */
  loadHistoryJSON(jsonString) {
      let data
      try {
          data = JSON.parse(jsonString)
      } catch (e) {
          console.error("Failed to load history: invalid JSON", e)
          return false
      }

      const validation = this.validateHistoryPayload(data)
      if (!validation.ok) {
          console.error("Failed to load history:", validation.error)
          return false
      }

      let tempState
      try {
          tempState = GameState.fromJSON(data.initialState)
      } catch (e) {
          console.error("Failed to load history: cannot construct state from initialState", e)
          return false
      }

      const history = Array.isArray(data.history) ? data.history : []
      const currentTurnActions = Array.isArray(data.currentTurnActions) ? data.currentTurnActions : []

      try {
          for (const turnActions of history) {
              for (const a of turnActions) {
                  if (!tempState.applyAction(a)) {
                      throw new Error('Failed to apply history action while loading')
                  }
              }
          }
          for (const a of currentTurnActions) {
              if (!tempState.applyAction(a)) {
                  throw new Error('Failed to apply current turn action while loading')
              }
          }
      } catch (e) {
          console.error("Failed to load history:", e)
          return false
      }

      // Commit: copy from tempState into `this` only after every action replayed successfully.
      this._adoptState(tempState)
      // Normalize the replay anchor through the same helper that
      // `GameState.fromJSON` uses, so `loadHistoryJSON` cannot leave a
      // legacy `terrainDifficuly` typo on `initialState.hexes[*].terrain`
      // that a later `getHistoryJSON()` would re-export verbatim.
      // (Cannot use `tempState.initialState` here — the constructor
      // captures it from default-plains hexes before the real ones are
      // populated, so it would not reflect the source anchor.)
      this.initialState = normalizeInitialStateForRestore(data.initialState)
      this.history = history
      this.currentTurnActions = currentTurnActions
      this.selectedUnit = null
      this.selectedHex = null
      this.touchReachabilityState()
      this.clearHighlights()
      this.evaluateOutcome()

      return true
  }

  /**
   * Ініціалізує сітку гексів.
   * Якщо передано mapData.map та terrainTypes, кожен гекс отримує terrain з мапи; інакше — default plains.
   */
  initializeHexes(terrainTypes = [], mapData = null) {
    const terrainList = Array.isArray(terrainTypes) ? terrainTypes : []
    const plainsFromList = terrainList.find(t => t.id === 'plains')
    const defaultTerrain = plainsFromList || { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
    const mapArray = mapData && Array.isArray(mapData.map) ? mapData.map : null
    const mapByKey = new Map()
    if (mapArray) {
      mapArray.forEach(h => {
        if (Number.isInteger(h.q) && Number.isInteger(h.r)) {
          mapByKey.set(this.getHexKey(h.q, h.r), h)
        }
      })
    }

    const getTerrainForHex = (q, r) => {
      if (mapByKey.size > 0 && terrainList.length > 0) {
        const mapHex = mapByKey.get(this.getHexKey(q, r))
        const terrainId = mapHex && mapHex.terrain != null ? mapHex.terrain : 'plains'
        const terrain = terrainList.find(t => t.id === terrainId)
        return terrain || defaultTerrain
      }
      return terrainList.find(t => t.id === 'plains') || defaultTerrain
    }

    const getOverlaysForHex = (q, r) => {
      if (mapByKey.size === 0) return {}
      const mapHex = mapByKey.get(this.getHexKey(q, r))
      if (!mapHex) return {}
      return {
        player1Spawn: !!mapHex.player1Spawn,
        player1Base: !!mapHex.player1Base,
        player2Spawn: !!mapHex.player2Spawn,
        player2Base: !!mapHex.player2Base
      }
    }

    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        const hexKey = this.getHexKey(q, r)
        const terrain = getTerrainForHex(q, r)
        const overlays = getOverlaysForHex(q, r)
        this.hexes.set(hexKey, new GameHex({
          q,
          r,
          terrain,
          passable: terrain.passable !== false,
          movementCost: 1,
          ...overlays
        }))
      }
    }
  }
  
  /**
   * Отримує ключ для гекса
   */
  getHexKey(q, r) {
    return `${q},${r}`
  }
  
  /**
   * Отримує гекс за координатами
   */
  getHex(q, r) {
    return this.hexes.get(this.getHexKey(q, r))
  }
  
  /**
   * Перевіряє чи існує гекс
   */
  hasHex(q, r) {
    return this.hexes.has(this.getHexKey(q, r))
  }
  
  /**
   * Отримує всі гекси
   */
  getAllHexes() {
    return Array.from(this.hexes.values())
  }
  
  /**
   * Отримує всіх юнітів
   */
  getAllUnits() {
    return Array.from(this.units.values())
  }
  
  /**
   * Отримує юнітів гравця
   */
  getPlayerUnits(player) {
    return this.getAllUnits().filter(unit => unit.player === player)
  }
  
  /**
   * Отримує активних юнітів гравця
   */
  getActivePlayerUnits(player) {
    return this.getPlayerUnits(player).filter(unit => unit.isAlive())
  }

  normalizeActionBudget(value, fallback = 0) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) {
      return fallback
    }
    return Math.max(0, Math.trunc(numberValue))
  }

  normalizeActionCost(value) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) return null
    if (!Number.isInteger(numberValue)) return null
    if (numberValue < 0) return null
    return numberValue
  }

  normalizeTurnState(turnState = {}, units = this.units) {
    const normalized = createPlainRecord()
    if (!(units instanceof Map)) return normalized

    units.forEach((unit, unitId) => {
      const row =
        turnState && typeof turnState === 'object' && Object.prototype.hasOwnProperty.call(turnState, unitId)
          ? turnState[unitId]
          : null
      const fallbackBudget = this.normalizeActionBudget(unit ? unit.movement : 0, 0)
      const hasActionsRemaining = row && row.actionsRemaining !== undefined && row.actionsRemaining !== null
      normalized[unitId] = {
        actionsRemaining: hasActionsRemaining
          ? this.normalizeActionBudget(row.actionsRemaining, fallbackBudget)
          : fallbackBudget,
        isLoaded: row && typeof row.isLoaded === 'boolean'
          ? row.isLoaded
          : !!(unit && unit.isLoaded)
      }
    })

    return normalized
  }

  normalizeTurntable(turntable) {
    if (!turntable || typeof turntable !== 'object') return null
    const ourOps = Array.isArray(turntable.Our_operations) ? turntable.Our_operations : []
    const enemyOps = Array.isArray(turntable.Enemy_operations) ? turntable.Enemy_operations : []
    if (ourOps.length === 0 && enemyOps.length === 0) return null
    return {
      Our_operations: ourOps,
      Enemy_operations: enemyOps
    }
  }

  getCurrentDiceResult() {
    const list = Array.isArray(this.currentTurnActions) ? this.currentTurnActions : []
    for (let i = list.length - 1; i >= 0; i--) {
      const action = list[i]
      if (action && action.type === 'dice_roll') {
        const face = normalizeDiceFace(action.result)
        if (face != null) return face
      }
    }
    return null
  }

  /** True when the active player has already committed a D6 in the current turn buffer. */
  hasRolledDice() {
    return this.getCurrentDiceResult() != null
  }

  /**
   * Authoritative D6 roll commit for the active player's turn. UI and
   * future strategy code must call this instead of `recordAction({type:'dice_roll'})`
   * so that the engine — not the UI — enforces the "one roll per turn" invariant.
   *
   * `options.allowReroll` exists as an explicit escape hatch (used by future
   * "reroll" rules); without it a second roll in the same turn throws.
   *
   * @param {number} face
   * @param {{ allowReroll?: boolean }} [options]
   * @returns {number} the normalized face that was recorded
   */
  rollDice(face, options = {}) {
    this.assertGameActive('Roll dice')
    const allowReroll = options && options.allowReroll === true
    const normalized = normalizeDiceFace(face)
    if (normalized == null) {
      throw new Error(`Invalid dice face: ${face}`)
    }
    if (!allowReroll && this.hasRolledDice()) {
      throw new Error('Dice already rolled this turn; rerolls are not allowed')
    }
    // Inlined append so no separately-callable bypass method exists on the
    // instance; the only paths that can add a `dice_roll` entry are this
    // method and `recordAction({ type:'dice_roll' })` (which enforces its
    // own guard). Import paths go through `validateHistoryPayload`.
    this.currentTurnActions.push({
      type: 'dice_roll',
      turnNumber: this.turnNumber,
      player: this.currentPlayer,
      result: normalized,
      unitName: 'D6'
    })
    return normalized
  }

  /**
   * Draw a D6 face from the engine RNG without recording it in the turn
   * history yet. This supports UI reveal timing: the face is chosen by
   * the deterministic engine RNG when the roll starts, but `rollDice`
   * commits it only after the dice animation completes.
   *
   * Forwarded options match `rollDice` for the one-roll guard. The guard
   * runs before consuming RNG so a rejected reroll cannot advance the
   * stream.
   *
   * @param {{ allowReroll?: boolean }} [options]
   * @returns {number} the drawn face (1..6), not yet committed
   */
  drawDiceFaceFromRng(options = {}) {
    this.assertGameActive('Draw dice')
    const allowReroll = options && options.allowReroll === true
    if (!allowReroll && this.hasRolledDice()) {
      throw new Error('Dice already rolled this turn; rerolls are not allowed')
    }
    return Math.floor(this._random() * 6) + 1
  }

  /**
   * Roll a D6 from the engine's own RNG (`this._random`) and commit it
   * via `rollDice`. This is the deterministic entry-point UI/headless
   * code should use when it does *not* already have an externally chosen
   * face — it keeps the random source isolated inside the engine so a
   * seeded `options.rng` makes both placement and dice reproducible.
   *
   * Forwarded options match `rollDice` (e.g. `allowReroll`).
   *
   * @param {{ allowReroll?: boolean }} [options]
   * @returns {number} the rolled face (1..6) that was committed
   */
  rollDiceFromRng(options = {}) {
    const face = this.drawDiceFaceFromRng(options)
    return this.rollDice(face, options)
  }

  normalizeActionPhase(phase = this.gamePhase) {
    if (typeof phase !== 'string') return 'MANOEUVRE'
    const normalized = phase.trim().toUpperCase()
    if (normalized === 'MANOEUVRE' || normalized === 'MANEUVRE') return 'MANOEUVRE'
    if (normalized === 'ATTACK' || normalized === 'COMBAT') return 'ATTACK'
    if (normalized === 'MOVEMENT') return 'MANOEUVRE'
    return normalized
  }

  getAllowedActions(diceResult, phase, player = this.currentPlayer) {
    const face = normalizeDiceFace(diceResult)
    if (face == null) return []

    const table = this.turntable
    if (!table) return []

    const phaseTitle = this.normalizeActionPhase(phase)
    const tableKey = turntableOperationsKey(player)
    const operations = Array.isArray(table[tableKey]) ? table[tableKey] : []
    const operation = operations.find(op => this.normalizeActionPhase(op && op.title) === phaseTitle)
    if (!operation || !Array.isArray(operation.moves)) return []

    const result = new Set()
    operation.moves.forEach(moveDef => {
      const diceRows = Array.isArray(moveDef && moveDef.dice) ? moveDef.dice : []
      const actionList = diceRows[face - 1]
      if (!Array.isArray(actionList)) return
      actionList.forEach(type => {
        if (typeof type !== 'string') return
        const normalizedType = type.trim().toLowerCase()
        if (!normalizedType || normalizedType === '-') return
        result.add(normalizedType)
      })
    })

    return Array.from(result)
  }

  canPerformAction(unitId, actionType, cost, phase = this.gamePhase, diceResult = this.getCurrentDiceResult()) {
    if (isTerminalOutcome(this.outcome)) return false
    const unit = this.units.get(unitId)
    if (!unit) return false
    // Active-player guard: after fromJSON/import `turnState` may carry entries for both players;
    // only units owned by the current player are allowed to act through this API.
    if (normalizeLosPlayerId(unit.player) !== normalizeLosPlayerId(this.currentPlayer)) return false
    const turnStateEntry = this.turnState[unitId]
    if (!turnStateEntry) return false

    const normalizedType = typeof actionType === 'string' ? actionType.trim().toLowerCase() : ''
    if (!normalizedType) return false

    const normalizedCost = this.normalizeActionCost(cost)
    if (normalizedCost === null) return false

    const allowedActions = this.getAllowedActions(diceResult, phase, unit.player)
    if (!allowedActions.includes(normalizedType)) return false
    if (this.normalizeActionBudget(turnStateEntry.actionsRemaining, 0) < normalizedCost) return false

    if (normalizedType === ACTION_TYPES.FIRE) {
      return turnStateEntry.isLoaded === true
    }
    if (normalizedType === ACTION_TYPES.RELOAD) {
      return turnStateEntry.isLoaded === false
    }
    return true
  }

  /**
   * Returns legal action entries in turntable priority order.
   * `priority` is scoped to the phase, so manoeuvre and attack keep
   * separate queues even when both produce commands in one turn.
   *
   * Move/reverse are gated on having any reachable hex within budget.
   *
   * @param {string} unitId
   * @returns {Array<{type:string,phase:string,priority:number}>}
   */
  getAllowedActionEntriesForUnit(unitId) {
    if (isTerminalOutcome(this.outcome)) return []
    const unit = this.units.get(unitId)
    if (!unit) return []
    if (normalizeLosPlayerId(unit.player) !== normalizeLosPlayerId(this.currentPlayer)) return []
    const turnRow = this.turnState[unitId]
    if (!turnRow) return []
    const diceResult = this.getCurrentDiceResult()
    if (diceResult == null) return []

    const phaseEntries = []
    for (const phase of [PHASES.MANOEUVRE, PHASES.ATTACK]) {
      const phaseActions = this.getAllowedActions(diceResult, phase, unit.player)
      const seenInPhase = new Set()
      phaseActions.forEach((type, index) => {
        if (seenInPhase.has(type)) return
        seenInPhase.add(type)
        phaseEntries.push({ type, phase, priority: index + 1 })
      })
    }

    const budget = this.normalizeActionBudget(turnRow.actionsRemaining, 0)
    const result = []
    let reachabilityProbed = false
    let hasReachableHex = false

    for (const entry of phaseEntries) {
      const { type } = entry
      if (budget < 1) continue
      if (type === ACTION_TYPES.FIRE && turnRow.isLoaded !== true) continue
      if (type === ACTION_TYPES.RELOAD && turnRow.isLoaded !== false) continue
      if (type === ACTION_TYPES.MOVE || type === ACTION_TYPES.REVERSE) {
        if (!reachabilityProbed) {
          this.ensureReachabilityCache(unitId)
          // The unit's own hex is always reachable at cost 0 — exclude it
          // so we only count truly traversable destinations.
          const selfKey = this.getHexKey(unit.position.q, unit.position.r)
          for (const key of this._reachableHexCosts.keys()) {
            if (key === selfKey) continue
            hasReachableHex = true
            break
          }
          reachabilityProbed = true
        }
        if (!hasReachableHex) continue
      }
      result.push(entry)
    }

    return result
  }

  getAllowedActionsForUnit(unitId) {
    return this.getAllowedActionEntriesForUnit(unitId).map(entry => entry.type)
  }

  applyActionStateMutation(unitId, actionType, cost) {
    const unit = this.units.get(unitId)
    const row = this.turnState[unitId]
    if (!unit || !row) return

    const normalizedCost = this.normalizeActionCost(cost)
    if (normalizedCost === null) return
    row.actionsRemaining = Math.max(0, this.normalizeActionBudget(row.actionsRemaining, 0) - normalizedCost)

    const normalizedType = normalizeActionType(actionType)
    if (normalizedType === ACTION_TYPES.FIRE) {
      row.isLoaded = false
      unit.isLoaded = false
    } else if (normalizedType === ACTION_TYPES.RELOAD) {
      row.isLoaded = true
      unit.isLoaded = true
    }
  }

  /**
   * Снапшот дошки для pathfinding. Незалежні від юніта частини
   * (`terrainByHex` + мапа «гекс → id юніта») будуються один раз на
   * `reachabilityVersion`; залежний від `excludeUnitId` набір
   * `occupiedHexes` збирається з кешованої мапи за O(кількість юнітів),
   * без повторного обходу всіх W×H гексів. Спільний `terrainByHex`
   * шериться між снапшотами — споживачі трактують його як read-only
   * (`computeReachableHexes` лише читає).
   */
  createBoardSnapshot(excludeUnitId = null) {
    if (
      !this._boardSnapshotCache ||
      this._boardSnapshotCacheVersion !== this.reachabilityVersion
    ) {
      const terrainByHex = {}
      const occupantByHex = new Map()
      this.hexes.forEach((hex, key) => {
        terrainByHex[key] = {
          type: hex.terrain && hex.terrain.id,
          terrainDifficulty: Number(hex.terrain && hex.terrain.terrainDifficulty) || 0,
          passable: hex.passable !== false
        }
        if (hex.unit) {
          occupantByHex.set(key, hex.unit.id)
        }
      })
      this._boardSnapshotCache = { terrainByHex, occupantByHex }
      this._boardSnapshotCacheVersion = this.reachabilityVersion
    }

    const { terrainByHex, occupantByHex } = this._boardSnapshotCache
    const occupiedHexes = new Set()
    occupantByHex.forEach((occupantId, key) => {
      if (occupantId !== excludeUnitId) {
        occupiedHexes.add(key)
      }
    })

    return {
      width: this.width,
      height: this.height,
      terrainByHex,
      occupiedHexes,
      getDirectionsForRow: r => getHexDirections(r)
    }
  }

  invalidateReachabilityCache() {
    // NOTE: adding a new version-keyed cache → also reset it here.
    this.reachableHexesCache.clear()
    this._reachableHexCosts.clear()
    this.cacheValidForUnitId = null
    this.cacheVersion = -1
    this._attackTargetsCache.clear()
    this._attackTargetsCacheVersion = -1
    this._attackRangeHexesCache.clear()
    this._attackRangeHexesCacheVersion = -1
    this._directionalCostsCache.clear()
    this._directionalCostsCacheVersion = -1
    this._boardSnapshotCache = null
    this._boardSnapshotCacheVersion = -1
  }

  /**
   * Інваріант: будь-яка мутація, що впливає на досяжність, МУСИТЬ викликати цей метод.
   * Це включає: позицію/facing юніта, terrain passable, actionsRemaining та будь-які
   * бюджети turnState. Усі version-keyed поля `_*Cache` порівнюються з `reachabilityVersion`;
   * без цього виклику вони лишаться застарілими.
   */
  touchReachabilityState() {
    this.reachabilityVersion += 1
    this.invalidateReachabilityCache()
  }

  /**
   * After deserializing, each hex may hold a GameUnit copy while `this.units` holds another copy
   * for the same id. Movement checks identity (`hex.unit === units.get(id)`), so we clear hex
   * occupancy and re-place the canonical instances from `this.units`.
   */
  reconcileBoardUnitsWithMap() {
    this.hexes.forEach(hex => {
      if (hex.unit) hex.unit = null
    })
    this.units.forEach(unit => {
      if (!unit || !unit.position) return
      const q = unit.position.q
      const r = unit.position.r
      if (!Number.isInteger(q) || !Number.isInteger(r)) return
      const hex = this.getHex(q, r)
      if (hex) hex.placeUnit(unit)
    })
    this.touchReachabilityState()
  }

  ensureReachabilityCache(unitId) {
    const unit = this.units.get(unitId)
    if (!unit) {
      this.invalidateReachabilityCache()
      return this.reachableHexesCache
    }

    if (
      this.cacheValidForUnitId === unitId &&
      this.cacheVersion === this.reachabilityVersion
    ) {
      return this.reachableHexesCache
    }

    const turnRow = this.turnState[unitId]
    const actionsRemaining = this.normalizeActionBudget(
      turnRow ? turnRow.actionsRemaining : unit.movement,
      0
    )
    const boardState = this.createBoardSnapshot(unitId)
    computeReachableHexes({
      unit,
      boardState,
      actionsRemaining,
      targetSet: this.reachableHexesCache,
      costMap: this._reachableHexCosts
    })
    this.cacheValidForUnitId = unitId
    this.cacheVersion = this.reachabilityVersion
    return this.reachableHexesCache
  }

  /**
   * Мінімальна вартість шляху до гекса з кешу reachability, або undefined якщо недосяжно.
   */
  getAuthoritativePathCost(unitId, q, r) {
    this.ensureReachabilityCache(unitId)
    const key = this.getHexKey(q, r)
    return this._reachableHexCosts.get(key)
  }

  /**
   * Reachability for a given motion mode. Returned `Map` contains only hexes
   * whose minimum cost is reachable via the chosen mode (`'forward'` —
   * turntable `move`; `'reverse'` — turntable `reverse`; `'both'` — their
   * union; `'maneuver'` — rotation-inclusive, served on behalf of
   * `getManeuverReachableCosts` for the map highlight overlay ONLY). The
   * full-union cache used by legacy reachability APIs is left untouched.
   *
   * Headless simulation uses the DIRECTIONAL modes to keep `listLegalCommands`
   * turntable-authoritative: a hex reachable only by reversing must not
   * be exposed as a `move` command (and vice versa). It must never use
   * `'maneuver'` (which mixes turns and is overlay-only).
   *
   * Результат кешується за `reachabilityVersion` (ключ `"unitId:motionMode"`,
   * за зразком `_attackTargetsCache`): listLegalCommands/applyCommand/UI
   * смикають цей метод у найгарячішому циклі ШІ. Повертається ТА САМА
   * Map-інстанція кільком викликачам — трактуй як immutable (усі поточні
   * споживачі лише читають: `get`/`forEach`).
   *
   * @param {string} unitId
   * @param {'forward'|'reverse'|'both'|'maneuver'} motionMode
   * @returns {Map<string, number>} costMap: `"q,r"` → min cost via that motion
   */
  getDirectionalReachableCosts(unitId, motionMode) {
    const unit = this.units.get(unitId)
    if (!unit) return new Map()
    if (this._directionalCostsCacheVersion !== this.reachabilityVersion) {
      this._directionalCostsCache.clear()
      this._directionalCostsCacheVersion = this.reachabilityVersion
    }
    const cacheKey = `${unitId}:${motionMode}`
    if (this._directionalCostsCache.has(cacheKey)) {
      return this._directionalCostsCache.get(cacheKey)
    }
    const turnRow = this.turnState[unitId]
    const budget = this.normalizeActionBudget(
      turnRow ? turnRow.actionsRemaining : unit.movement,
      0
    )
    const boardState = this.createBoardSnapshot(unitId)
    const costMap = new Map()
    computeReachableHexes({
      unit,
      boardState,
      actionsRemaining: budget,
      targetSet: new Set(),
      costMap,
      motionMode
    })
    this._directionalCostsCache.set(cacheKey, costMap)
    return costMap
  }

  /**
   * Rotation-inclusive ("maneuver") reachability for the selected-unit
   * highlight overlay ONLY. Unlike the directional accessor, this treats a
   * full reorientation as a flat-cost turn (matching the live TURN action),
   * so hexes reachable only after turning are included.
   *
   * Delegates to `getDirectionalReachableCosts(unitId, 'maneuver')`: that
   * method threads `motionMode` straight through to `computeReachableHexes`
   * and caches under the key `"unitId:maneuver"`, invalidated by
   * `reachabilityVersion` like every other directional entry.
   *
   * NOT used by simulation/legality — `applyCommand`/`legalCommands`/`moveUnit`
   * keep calling the directional accessor with forward/reverse/both.
   *
   * @param {string} unitId
   * @returns {Map<string, number>} costMap: `"q,r"` → min cost via turn+move
   */
  getManeuverReachableCosts(unitId) {
    return this.getDirectionalReachableCosts(unitId, 'maneuver')
  }

  /**
   * Додає юніта на мапу
   */
  addUnit(unit, q, r) {
    const hex = this.getHex(q, r)
    if (!hex) {
      throw new Error(`Hex at ${q},${r} does not exist`)
    }
    
    if (!hex.canPlaceUnit()) {
      throw new Error(`Cannot place unit at ${q},${r}`)
    }
    
    hex.placeUnit(unit)
    this.units.set(unit.id, unit)
    this.touchReachabilityState()
    this.evaluateOutcome()
    this.updateInitialState()
  }
  
  /**
   * Видаляє юніта з мапи
   */
  removeUnit(unitId) {
    const unit = this.units.get(unitId)
    if (!unit) return false
    
    const hex = this.getHex(unit.position.q, unit.position.r)
    if (hex) {
      hex.removeUnit()
    }
    
    this.units.delete(unitId)
    this.touchReachabilityState()
    this.evaluateOutcome()
    this.updateInitialState()
    return true
  }
  
  /**
   * Переміщує юніта. Вартість кроку береться з кешу pathfinding (`_reachableHexCosts`);
   * поле `cost` у `actionMeta` (якщо передати) ігнорується — залишено лише для сумісності сигнатури.
   * `actionMeta.motionKind`: `'forward'` (за замовчуванням) — дія turntable `move`; `'reverse'` — дія `reverse`.
   */
  moveUnit(unitId, newQ, newR, actionMeta = {}) {
    this.assertGameActive('Move')
    const {
      phase = PHASES.MANOEUVRE,
      diceResult,
      motionKind = 'forward',
      // Optional directional path cost supplied by the simulation boundary.
      // It must be at least the engine's fixed-facing directional cost.
      // Otherwise moveUnit uses its own directional cost.
      authoritativeCost
    } = actionMeta
    const authoritativeActionType =
      motionKind === 'reverse' ? ACTION_TYPES.REVERSE : ACTION_TYPES.MOVE
    const unit = this.units.get(unitId)
    if (!unit) {
      throw new Error(`Unit ${unitId} not found`)
    }
    if (!this.turnState[unitId]) {
      throw new Error(`Turn state for unit ${unitId} is not initialized`)
    }

    const tq = Number(newQ)
    const tr = Number(newR)
    if (!Number.isInteger(tq) || !Number.isInteger(tr)) {
      throw new Error(`Invalid target coordinates (${newQ}, ${newR}): expected integer q, r`)
    }
    if (!this.hasHex(tq, tr)) {
      throw new Error(`Target hex ${tq},${tr} does not exist`)
    }

    const fromHex = this.getHex(unit.position.q, unit.position.r)
    if (!fromHex || fromHex.unit !== unit) {
      throw new Error(`Unit ${unitId} is not placed on the board consistently`)
    }
    const toHex = this.getHex(tq, tr)

    if (!toHex.canPlaceUnit()) {
      throw new Error(`Cannot move to ${tq},${tr}`)
    }

    const targetKey = this.getHexKey(tq, tr)
    const directionalCosts = this.getDirectionalReachableCosts(unitId, motionKind)
    const directionalCost = directionalCosts.get(targetKey)
    if (directionalCost === undefined) {
      throw new Error(`Hex ${tq},${tr} is not reachable via ${motionKind} motion for unit ${unitId}`)
    }
    this.ensureReachabilityCache(unitId)
    const unionCost = this._reachableHexCosts.get(targetKey)
    if (unionCost === undefined) {
      throw new Error(`Hex ${tq},${tr} is not reachable for unit ${unitId}`)
    }
    // Use the caller-supplied directional cost when present and at
    // least as high as the fixed-facing directional minimum; never let
    // the caller charge less than the engine's reachability would.
    const pathCost =
      Number.isInteger(authoritativeCost) && authoritativeCost >= directionalCost
        ? authoritativeCost
        : directionalCost
    const turnRow = this.turnState[unitId]
    const budget = this.normalizeActionBudget(turnRow.actionsRemaining, 0)
    if (pathCost > budget) {
      throw new Error(
        `Move to ${tq},${tr} exceeds action budget (path cost ${pathCost}, remaining ${budget})`
      )
    }
    if (!this.canPerformAction(unitId, authoritativeActionType, pathCost, phase, diceResult)) {
      throw new Error(`Action "${authoritativeActionType}" is not allowed for current dice/phase or budget`)
    }

    // Capture state before move
    const fromState = {
        q: unit.position.q,
        r: unit.position.r,
        facing: unit.facing
    }
    
    // Видаляємо з поточної позиції
    fromHex.removeUnit()
    
    // Розміщуємо на новій позиції
    toHex.placeUnit(unit)

    // Record Action (actionType mirrors turntable: "move" vs "reverse")
    this.recordAction({
        type: 'move',
        unitId: unit.id,
        unitName: unit.id,
      actionType: authoritativeActionType,
      cost: pathCost,
      phase: this.normalizeActionPhase(phase),
        from: fromState,
        to: { q: tq, r: tr, facing: unit.facing },
        path: [
          { q: fromState.q, r: fromState.r, facing: fromState.facing },
          { q: tq, r: tr, facing: unit.facing }
        ]
    })

    this.applyActionStateMutation(unitId, authoritativeActionType, pathCost)
    this.touchReachabilityState()
    this.evaluateOutcome()
  }
  
  /**
   * Оновлює напрямок юніта
   */
  updateUnitFacing(unitId, newFacing, actionMeta = {}) {
    this.assertGameActive('Rotate')
    const { actionType = ACTION_TYPES.TURN, cost = 1, phase = PHASES.MANOEUVRE, diceResult } = actionMeta
    const unit = this.units.get(unitId)
    if (!unit) {
      throw new Error(`Unit ${unitId} not found`)
    }
    
    if (newFacing < 0 || newFacing > 5) {
      throw new Error(`Invalid facing: ${newFacing}. Must be 0-5`)
    }
    if (!this.canPerformAction(unitId, actionType, cost, phase, diceResult)) {
      throw new Error(`Action "${actionType}" is not allowed for current dice/phase or budget`)
    }

    const oldFacing = unit.facing
    
    unit.facing = newFacing

    // Record Action
    this.recordAction({
        type: 'rotate',
        unitId: unit.id,
        unitName: unit.id,
      actionType,
      cost: this.normalizeActionBudget(cost, 0),
      phase: this.normalizeActionPhase(phase),
        from: { q: unit.position.q, r: unit.position.r, facing: oldFacing },
        to: { q: unit.position.q, r: unit.position.r, facing: newFacing }
    })

    this.applyActionStateMutation(unitId, actionType, cost)
    this.touchReachabilityState()
    this.evaluateOutcome()
  }
  
  /**
   * Отримує доступні для переміщення гекси
   */
  getReachableHexes(unitId) {
    const cache = this.ensureReachabilityCache(unitId)
    const reachable = []
    cache.forEach(key => {
      const [qStr, rStr] = String(key).split(',')
      const hex = this.getHex(Number(qStr), Number(rStr))
      if (hex) reachable.push(hex)
    })
    return reachable
  }
  
  /**
   * Спільний пролог + цикл променів для `getValidFireTargets` і `getFireRangeHexes`.
   * Повертає `null` при ранньому виході (нема юніта / позиції / canAttack() / нецілих координат /
   * attackRange <= 0), або об'єкт `{ byUnitId: Map, byHexKey: Map }` після повного обходу.
   * Викидає помилку fail-fast при збої окремого променя.
   *
   * @param {string} id — вже нормалізований ключ юніта
   * @returns {{ byUnitId: Map<string, {q,r,unitId}>, byHexKey: Map<string, {q,r}> } | null}
   */
  _collectFireRays(id) {
    const unit = this.units.get(id)
    if (!unit || !unit.position || !unit.canAttack()) {
      return null
    }

    const pq = unit.position.q
    const pr = unit.position.r
    if (!Number.isInteger(pq) || !Number.isInteger(pr)) {
      return null
    }

    const rawRange = this.normalizeActionBudget(unit.attackRange, 0)
    const attackRange = Math.min(rawRange, MAX_ATTACK_RAY_STEPS)
    if (attackRange <= 0) {
      return null
    }

    const origin = { q: pq, r: pr }
    const losMode = unit.losMode === 'artillery' ? 'artillery' : 'direct_fire'
    const directions = allowedFacingDirections(unit.attackAngle, unit.facing)
    const attackerPlayerId = normalizeLosPlayerId(unit.player)

    const isHexInBounds = h => hexInBounds(h, this.width, this.height)
    const getTerrainPassable = h => {
      const hex = this.getHex(h.q, h.r)
      return !!(hex && hex.passable !== false)
    }
    const getUnitAt = h => {
      const hex = this.getHex(h.q, h.r)
      const u = hex && hex.unit
      if (!u) return null
      return { id: u.id, player: normalizeLosPlayerId(u.player) }
    }

    const byUnitId = new Map()
    const byHexKey = new Map()
    for (const directionIndex of directions) {
      let rayResult
      try {
        rayResult = collectRayHexes({
          origin,
          directionIndex,
          attackRange,
          losMode,
          isHexInBounds,
          getTerrainPassable,
          getUnitAt,
          attackerPlayerId
        })
      } catch (err) {
        throw new Error(
          `_collectFireRays: ray computation failed (unitId=${String(id)}, directionIndex=${directionIndex})`,
          { cause: err }
        )
      }
      for (const t of rayResult.enemyTargets) {
        if (!byUnitId.has(t.unitId)) {
          byUnitId.set(t.unitId, { q: t.q, r: t.r, unitId: t.unitId })
        }
      }
      for (const h of rayResult.visitedHexes) {
        const key = this.getHexKey(h.q, h.r)
        if (!byHexKey.has(key)) {
          byHexKey.set(key, { q: h.q, r: h.r })
        }
      }
    }

    return { byUnitId, byHexKey }
  }

  /**
   * Валідні цілі для пострілу: промені за `attackAngle` / `facing`, `attackRange`, LOS (`direct_fire` vs `artillery`).
   * Політика помилок: при зіпсутих даних або збої променя кидаємо помилку (fail-fast), без пропуску напрямку та без часткового списку.
   * @param {string} unitId
   * @returns {Array<{ q: number, r: number, unitId: string }>}
   */
  getValidFireTargets(unitId) {
    const id = normalizeUnitIdKey(unitId)
    if (!id) {
      return []
    }

    const rays = this._collectFireRays(id)
    if (!rays) {
      return []
    }

    const list = Array.from(rays.byUnitId.values())
    list.sort((a, b) => {
      if (a.q !== b.q) return a.q - b.q
      if (a.r !== b.r) return a.r - b.r
      const sa = String(a.unitId)
      const sb = String(b.unitId)
      return sa < sb ? -1 : sa > sb ? 1 : 0
    })
    return list
  }

  /**
   * Те саме, що `getValidFireTargets`, з кешем на поточну версію дошки (`reachabilityVersion`).
   * Порядок елементів стабільний і збігається з `getValidFireTargets`: спочатку `q`, потім `r`, потім `unitId`
   * (достатньо для UI без додаткового сортування).
   *
   * @param {string} unitId
   * @returns {Array<{ q: number, r: number, unitId: string }>}
   */
  getValidFireTargetsCached(unitId) {
    const id = normalizeUnitIdKey(unitId)
    if (!id) {
      return []
    }
    if (this._attackTargetsCacheVersion !== this.reachabilityVersion) {
      this._attackTargetsCache.clear()
      this._attackTargetsCacheVersion = this.reachabilityVersion
    }
    if (this._attackTargetsCache.has(id)) {
      return this._attackTargetsCache.get(id).slice()
    }
    const list = this.getValidFireTargets(id)
    // Кешуємо лише повний успішний результат; при throw з getValidFireTargets запису не буде.
    this._attackTargetsCache.set(id, list)
    return list.slice()
  }

  /**
   * Hexes traversed by attack rays using the same LOS/range rules as
   * `getValidFireTargets`. This is UI geometry for the fire zone: it includes
   * empty hexes and the blocker hex where direct fire stops.
   *
   * @param {string} unitId
   * @returns {Array<{ q: number, r: number }>}
   */
  getFireRangeHexes(unitId) {
    const id = normalizeUnitIdKey(unitId)
    if (!id) {
      return []
    }

    const rays = this._collectFireRays(id)
    if (!rays) {
      return []
    }

    const list = Array.from(rays.byHexKey.values())
    list.sort((a, b) => {
      if (a.q !== b.q) return a.q - b.q
      return a.r - b.r
    })
    return list
  }

  /**
   * Cached `getFireRangeHexes`, invalidated on board/reachability changes.
   *
   * @param {string} unitId
   * @returns {Array<{ q: number, r: number }>}
   */
  getFireRangeHexesCached(unitId) {
    const id = normalizeUnitIdKey(unitId)
    if (!id) {
      return []
    }
    if (this._attackRangeHexesCacheVersion !== this.reachabilityVersion) {
      this._attackRangeHexesCache.clear()
      this._attackRangeHexesCacheVersion = this.reachabilityVersion
    }
    if (this._attackRangeHexesCache.has(id)) {
      return this._attackRangeHexesCache.get(id).map(h => ({ ...h }))
    }
    const list = this.getFireRangeHexes(id)
    this._attackRangeHexesCache.set(id, list)
    return list.map(h => ({ ...h }))
  }

  /**
   * Гекси з ворожими юнітами, доступні для пострілу за тими ж правилами, що й `getValidFireTargets`.
   */
  getAttackableHexes(unitId) {
    const targets = this.getValidFireTargetsCached(unitId)
    const attackable = []
    for (const t of targets) {
      const hex = this.getHex(t.q, t.r)
      if (hex && hex.unit && hex.unit.id === t.unitId) {
        attackable.push(hex)
      }
    }
    return attackable
  }

  /**
   * Чи дозволено влучити у ворога на (q,r) з поточного стану атакуючого (кешований LOS).
   * @param {string} attackerId
   * @param {number} targetQ
   * @param {number} targetR
   * @param {string} targetUnitId
   */
  isAuthorizedFireTarget(attackerId, targetQ, targetR, targetUnitId) {
    const aid = normalizeUnitIdKey(attackerId)
    if (!aid) return false
    const tq = Number(targetQ)
    const tr = Number(targetR)
    if (!Number.isInteger(tq) || !Number.isInteger(tr)) return false
    const uid = targetUnitId != null ? String(targetUnitId) : ''
    if (!uid) return false
    const valid = this.getValidFireTargetsCached(aid)
    return valid.some(
      t => t.q === tq && t.r === tr && String(t.unitId) === uid
    )
  }
  
  /**
   * Виконує атаку
   */
  performAttack(attackerId, targetHexQ, targetHexR, actionMeta = {}) {
    this.assertGameActive('Fire')
    const { diceResult } = actionMeta
    const actionType = ACTION_TYPES.FIRE
    const phase = PHASES.ATTACK
    const authoritativeCost = AUTHORITATIVE_FIRE_ACTION_COST
    const aid = normalizeUnitIdKey(attackerId)
    if (!aid) {
      throw new Error(`Attacker ${attackerId} not found`)
    }
    const attacker = this.units.get(aid)
    if (!attacker) {
      throw new Error(`Attacker ${attackerId} not found`)
    }

    const tq = Number(targetHexQ)
    const tr = Number(targetHexR)
    if (!Number.isInteger(tq) || !Number.isInteger(tr)) {
      throw new Error(`Invalid target coordinates (${targetHexQ}, ${targetHexR}): expected integer q, r`)
    }

    const targetHex = this.getHex(tq, tr)
    if (!targetHex || !targetHex.isOccupied()) {
      throw new Error(`No target at ${tq},${tr}`)
    }
    
    const target = targetHex.unit
    if (normalizeLosPlayerId(target.player) === normalizeLosPlayerId(attacker.player)) {
      throw new Error('Cannot attack friendly unit')
    }

    if (!this.canPerformAction(aid, actionType, authoritativeCost, phase, diceResult)) {
      throw new Error(`Action "${actionType}" is not allowed for current dice/phase, weapon state, or budget`)
    }

    if (!this.isAuthorizedFireTarget(aid, tq, tr, target.id)) {
      throw new Error(INVALID_LINE_OF_FIRE_MESSAGE)
    }
    
    const damage = attacker.attack(target)

    // Any health loss resets the idle clock that drives AI anti-stall drift.
    if (Number(damage) > 0) {
      this.turnsSinceLastDamage = 0
    }

    // Видаляємо мертвого юніта
    if (!target.isAlive()) {
      this.removeUnit(target.id)
    }

    this.recordAction({
      type: 'attack',
      unitId: attacker.id,
      unitName: attacker.id,
      targetUnitId: target.id,
      actionType: ACTION_TYPES.FIRE,
      cost: authoritativeCost,
      phase: this.normalizeActionPhase(phase),
      from: { q: attacker.position.q, r: attacker.position.r, facing: attacker.facing },
      to: { q: target.position.q, r: target.position.r, facing: target.facing },
      damage
    })
    this.applyActionStateMutation(attacker.id, actionType, authoritativeCost)
    this.touchReachabilityState()
    this.evaluateOutcome()

    return damage
  }

  performReload(unitId, actionMeta = {}) {
    this.assertGameActive('Reload')
    const { actionType = ACTION_TYPES.RELOAD, cost = 1, phase = PHASES.ATTACK, diceResult } = actionMeta
    const unit = this.units.get(unitId)
    if (!unit) throw new Error(`Unit ${unitId} not found`)
    if (!this.canPerformAction(unitId, actionType, cost, phase, diceResult)) {
      throw new Error('Reload is not allowed for current dice/phase, weapon state, or budget')
    }

    this.recordAction({
      type: 'reload',
      unitId: unit.id,
      unitName: unit.id,
      actionType,
      cost: this.normalizeActionBudget(cost, 0),
      phase: this.normalizeActionPhase(phase),
      from: { q: unit.position.q, r: unit.position.r, facing: unit.facing },
      to: { q: unit.position.q, r: unit.position.r, facing: unit.facing }
    })
    this.applyActionStateMutation(unitId, actionType, cost)
    this.touchReachabilityState()
    this.evaluateOutcome()
    return true
  }
  
  /**
   * Скидає стан ходу для всіх юнітів гравця
   */
  resetPlayerTurn(player) {
    this.turnState = createPlainRecord()
    const units = this.getActivePlayerUnits(player)
    units.forEach(unit => {
      this.turnState[unit.id] = {
        actionsRemaining: this.normalizeActionBudget(unit.movement, 0),
        isLoaded: unit.isLoaded === true
      }
    })
    this.recordAction({
      type: 'startTurn',
      player,
      turnNumber: this.turnNumber,
      turnStateSnapshot: this.turnState
    })
    this.touchReachabilityState()
  }
  
  /**
   * Переходить до наступного гравця
   */
  nextPlayer() {
    const players = ['player1', 'player2']
    const currentIndex = players.indexOf(this.currentPlayer)
    this.currentPlayer = players[(currentIndex + 1) % players.length]
    
    if (this.currentPlayer === 'player1') {
      this.turnNumber++
    }
    
    // Скидаємо стан ходу для нового гравця
    this.resetPlayerTurn(this.currentPlayer)
  }
  
  /**
   * Очищає всі підсвічування
   */
  clearHighlights() {
    this.getAllHexes().forEach(hex => hex.unhighlight())
  }
  
  /**
   * Підсвічує доступні гекси для юніта
   */
  highlightUnitOptions(unitId) {
    this.clearHighlights()
    
    const reachable = this.getReachableHexes(unitId)
    const attackable = this.getAttackableHexes(unitId)
    
    reachable.forEach(hex => hex.highlight('reachable'))
    attackable.forEach(hex => hex.highlight('attackable'))
  }
  
  /**
   * Серіалізує ігровий стан в JSON
   */
  toJSON(includeHistory = true) {
    const turnStateSnapshot = clonePlainSnapshot(this.turnState)
    // Adding a persisted field? If it must survive revert/import, also add it to _adoptState.
    const data = {
      width: this.width,
      height: this.height,
      hexes: Array.from(this.hexes.entries()).map(([key, hex]) => [key, hex.toJSON()]),
      units: Array.from(this.units.entries()).map(([key, unit]) => [key, unit.toJSON()]),
      currentPlayer: this.currentPlayer,
      turnNumber: this.turnNumber,
      gamePhase: this.gamePhase,
      turntable: this.turntable,
      objectives: this.objectives,
      outcome: this.outcome || createActiveOutcome(),
      objectivesArmed: this._objectivesArmed === true,
      turnsSinceLastDamage: this.turnsSinceLastDamage,
      turnState: turnStateSnapshot,
      selectedUnit: this.selectedUnit,
      selectedHex: this.selectedHex
    }

    if (includeHistory) {
        data.history = clonePlainSnapshot(this.history, 'history')
        data.currentTurnActions = clonePlainSnapshot(this.currentTurnActions, 'currentTurnActions')
        data.initialState = clonePlainSnapshot(this.initialState, 'initialState')
    }

    // Persist enough RNG metadata to resume the exact draw stream after a
    // round-trip through `fromJSON`. Only present when the engine owns a
    // seeded RNG; legacy/Math.random callers omit it and stay on fallback.
    if (this._rng && typeof this._rng.stateSnapshot === 'function') {
      data.rng = { state: this._rng.stateSnapshot() }
    }

    return data
  }
  
  /**
   * Створює ігровий стан з JSON
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid game state JSON payload')
    }

    // Resume the seeded RNG stream when the snapshot carries one. Legacy
    // snapshots saved before Batch 1 omit `rng`; those fall back to
    // `Math.random` so older saves still load (with the determinism caveat
    // documented in DOMAIN_MODEL.md).
    let rng = null
    const savedRng = data.rng
    if (savedRng && typeof savedRng === 'object' && Number.isFinite(Number(savedRng.state))) {
      rng = createRng({ state: Number(savedRng.state) })
    }

    // `data.initialState` is the replay anchor used by `revertTo`. A
    // pre-Batch-4 snapshot still carries `terrainDifficuly` on its nested
    // `initialState.hexes[*].terrain`. Without normalization here, the
    // typo survives the round trip — live `hexes` would be migrated by
    // `GameHex.fromJSON` (already wired below), but `toJSON(true)` would
    // re-export the raw `this.initialState` and put the typo back on
    // disk. Normalize the anchor's terrain entries once at restore.
    const initialState = normalizeInitialStateForRestore(data.initialState)

    const gameState = new GameState({
      width: data.width,
      height: data.height,
      currentPlayer: data.currentPlayer,
      turnNumber: data.turnNumber,
      history: data.history,
      currentTurnActions: data.currentTurnActions,
      initialState,
      turnState: data.turnState || {},
      turntableData: data.turntable || data.movesData || null,
      objectivesData: data.objectives || null,
      outcome: data.outcome || null,
      objectivesArmed: data.objectivesArmed === true,
      turnsSinceLastDamage: data.turnsSinceLastDamage,
      rng,
      deferInitialEvaluation: true
    })
    
    // Відновлюємо гекси
    const hexesData = Array.isArray(data.hexes) ? data.hexes : []
    hexesData.forEach(([key, hexData]) => {
      const hex = GameHex.fromJSON(hexData)
      gameState.hexes.set(key, hex)
    })
    
    // Відновлюємо юнітів
    const unitsData = Array.isArray(data.units) ? data.units : []
    unitsData.forEach(([key, unitData]) => {
      const unit = GameUnit.fromJSON(unitData)
      gameState.units.set(key, unit)
    })
    
    gameState.gamePhase = data.gamePhase
    gameState.objectives = data.objectives != null
      ? normalizeObjectives(data.objectives, gameState)
      : null
    gameState.turnState = gameState.normalizeTurnState(data.turnState || {}, gameState.units)
    gameState.selectedUnit = data.selectedUnit
    gameState.selectedHex = data.selectedHex
    gameState.refreshObjectiveArming()

    gameState.reconcileBoardUnitsWithMap()
    gameState.outcome = normalizeOutcome(data.outcome)
    gameState._setupComplete = true
    if (!isTerminalOutcome(gameState.outcome)) {
      gameState.evaluateOutcome({ phase: 'afterAction' })
    }
    
    return gameState
  }
}
