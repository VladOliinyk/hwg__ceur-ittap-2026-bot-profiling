/**
 * Conversion helpers between LevelBuilder UI state and the canonical
 * LevelPackage shape consumed by `validateLevelPackage` / `loadLevelPackage`.
 *
 * Pure functions only — no `fetch`, no DOM, no Vue. The Builder component
 * uses these helpers to:
 *   1. assemble a full LevelPackage from its in-memory state before export;
 *   2. hydrate its in-memory state from an imported LevelPackage;
 *   3. classify a single JSON blob picked from disk as one of the known
 *      section shapes so multi-file imports can merge cleanly.
 *
 * The Builder still owns SVG geometry generation (`createHex`), so the
 * "builder state" produced by `packageToBuilderState` carries only the
 * logical seed for each cell (q, r, terrainId, overlay flags). The
 * component re-derives points/centers/innerPoints from `q,r` after
 * hydration.
 *
 * @module domain/level/builderPackage
 */

import { LATEST_LEVEL_PACKAGE_SCHEMA_VERSION } from './validateLevelPackage.js'
import { createRng } from '../simulation/rng.js'
import { buildDefaultObjectivesForLevelPackage } from '../objectives/objectives.js'

const OVERLAY_FLAGS = ['player1Spawn', 'player1Base', 'player2Spawn', 'player2Base']

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function pickTerrainId(value) {
  if (typeof value === 'string') return value
  if (isPlainObject(value) && typeof value.id === 'string') return value.id
  return null
}

/**
 * Build a single LevelPackage cell record from a Builder hex object.
 * Overlay flags are emitted only when strictly `true`, matching the
 * convention already used by `level_000_hexmap.json` and by `saveMap()`
 * in LevelBuilder.vue.
 */
function builderHexToCell(hex) {
  const terrainId = pickTerrainId(hex && hex.terrain)
  const cell = { q: hex.q, r: hex.r, terrain: terrainId }
  for (const flag of OVERLAY_FLAGS) {
    if (hex[flag] === true) cell[flag] = true
  }
  return cell
}

/**
 * Inverse of `builderHexToCell`: produce a logical seed (no geometry)
 * for a Builder hex. Geometry must be re-derived by the component.
 */
function cellToBuilderHexSeed(cell) {
  return {
    q: cell.q,
    r: cell.r,
    terrainId: cell.terrain,
    player1Spawn: cell.player1Spawn === true,
    player1Base: cell.player1Base === true,
    player2Spawn: cell.player2Spawn === true,
    player2Base: cell.player2Base === true
  }
}

/**
 * Assemble a LevelPackage from current Builder state.
 *
 * @param {object} input
 * @param {string} [input.levelId]
 * @param {object} input.mapParams        { width, height, availableTerrain?, zoom?, ... }
 * @param {Array}  input.generatedMap     Builder hex objects with q, r, terrain, overlay flags
 * @param {Array}  input.terrainTypes     terrain catalog entries
 * @param {object} [input.unitsData]      { player1: {units:[]}, player2: {units:[]} } — pass-through
 * @param {object} [input.turntableData]  { Our_operations, Enemy_operations } — pass-through
 * @returns {object} LevelPackage candidate (not yet validated)
 */
export function builderStateToPackage(input) {
  if (!isPlainObject(input)) {
    throw new TypeError('builderStateToPackage: input must be an object')
  }
  const {
    levelId,
    mapParams,
    generatedMap,
    terrainTypes,
    unitsData,
    turntableData,
    objectivesData
  } = input

  const id = typeof levelId === 'string' && levelId.trim() ? levelId.trim() : 'level_000'

  const params = isPlainObject(mapParams) ? { ...mapParams } : {}
  // Stamp the current schema version into both the package top level (where
  // the validator reads it) and into hexmap.parameters (where the split-file
  // download carries it so `loadLevelPackage` can hoist it back to the top).
  params.schemaVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
  const cells = Array.isArray(generatedMap) ? generatedMap.map(builderHexToCell) : []
  const terrainList = Array.isArray(terrainTypes) ? terrainTypes.map(entry => ({ ...entry })) : []

  const pkg = {
    id,
    schemaVersion: LATEST_LEVEL_PACKAGE_SCHEMA_VERSION,
    hexmap: {
      parameters: params,
      map: cells
    },
    terrain: { terrainTypes: terrainList },
    units: isPlainObject(unitsData) ? unitsData : {},
    turntable: isPlainObject(turntableData) ? turntableData : {}
  }
  const defaultObjectives = buildDefaultObjectivesForLevelPackage(pkg)
  if (isPlainObject(objectivesData) || defaultObjectives) {
    pkg.objectives = isPlainObject(objectivesData)
      ? objectivesData
      : defaultObjectives
  }
  return pkg
}

/**
 * Hydrate Builder state from a LevelPackage (validated or not).
 * Returns a logical-seed view: the component re-derives SVG geometry
 * from `(q, r)` for each cell.
 *
 * @param {object} pkg LevelPackage shape
 * @returns {{
 *   levelId: string,
 *   mapParams: object,
 *   cellSeeds: Array<{q:number,r:number,terrainId:string|null,player1Spawn:boolean,player1Base:boolean,player2Spawn:boolean,player2Base:boolean}>,
 *   terrainTypes: Array,
 *   unitsData: object,
 *   turntableData: object
 * }}
 */
export function packageToBuilderState(pkg) {
  if (!isPlainObject(pkg)) {
    throw new TypeError('packageToBuilderState: package must be an object')
  }
  const hexmap = isPlainObject(pkg.hexmap) ? pkg.hexmap : { parameters: {}, map: [] }
  const params = isPlainObject(hexmap.parameters) ? hexmap.parameters : {}
  const cells = Array.isArray(hexmap.map) ? hexmap.map.map(cellToBuilderHexSeed) : []
  const terrain = isPlainObject(pkg.terrain) ? pkg.terrain : { terrainTypes: [] }
  const terrainTypes = Array.isArray(terrain.terrainTypes) ? terrain.terrainTypes.map(t => ({ ...t })) : []

  return {
    levelId: typeof pkg.id === 'string' ? pkg.id : '',
    mapParams: { ...params },
    cellSeeds: cells,
    terrainTypes,
    unitsData: isPlainObject(pkg.units) ? pkg.units : {},
    turntableData: isPlainObject(pkg.turntable) ? pkg.turntable : {},
    objectivesData: isPlainObject(pkg.objectives)
      ? pkg.objectives
      : buildDefaultObjectivesForLevelPackage(pkg)
  }
}

/**
 * Classify a JSON blob picked from disk against the LevelPackage section
 * shapes. Used by the Builder's multi-file import path to merge several
 * dropped files into a single candidate package.
 *
 * Recognized shapes:
 *  - 'package'   → full LevelPackage (has all 4 sections + id)
 *  - 'hexmap'    → { parameters: { width, height }, map: [...] }
 *                  (also matches legacy `saveMap` files — the same shape)
 *  - 'terrain'   → { terrainTypes: [...] }
 *  - 'units'     → { player1: { units }, player2: { units } } or partial
 *  - 'turntable' → { Our_operations, Enemy_operations }
 *  - null        → unknown / not a JSON object
 *
 * The classifier is intentionally permissive: it accepts partial sections
 * (e.g. a units file with only player1) so the import path can still surface
 * structured validator errors after the package is assembled.
 *
 * @param {*} value parsed JSON
 * @returns {'package'|'hexmap'|'terrain'|'units'|'turntable'|null}
 */
export function detectSection(value) {
  if (!isPlainObject(value)) return null

  if (
    typeof value.id === 'string' &&
    isPlainObject(value.hexmap) &&
    isPlainObject(value.terrain) &&
    isPlainObject(value.units) &&
    isPlainObject(value.turntable)
  ) {
    return 'package'
  }

  if (Array.isArray(value.terrainTypes)) return 'terrain'
  if ('Our_operations' in value || 'Enemy_operations' in value) return 'turntable'
  if (Array.isArray(value.conditions)) return 'objectives'
  if (value.mode === 'primaryBlue' && isPlainObject(value.primary)) return 'objectives'

  if (isPlainObject(value.parameters) && Array.isArray(value.map)) return 'hexmap'

  const hasPlayer1Units = isPlainObject(value.player1) && Array.isArray(value.player1.units)
  const hasPlayer2Units = isPlainObject(value.player2) && Array.isArray(value.player2.units)
  if (hasPlayer1Units || hasPlayer2Units || Array.isArray(value.unitTypes)) return 'units'

  return null
}

/**
 * Merge an array of `{ section, body }` entries into a single LevelPackage
 * candidate, using `baseState` for any section that is not provided.
 * The order in `entries` matters: later entries override earlier ones.
 *
 * Sections of type `'package'` replace the whole candidate (later
 * `'package'` entries still override earlier sections that follow).
 *
 * @param {Array<{section: string, body: object}>} entries
 * @param {{ levelId?: string, mapParams: object, generatedMap: Array, terrainTypes: Array, unitsData: object, turntableData: object }} baseState
 * @returns {{ pkg: object, appliedSections: Array<string> }}
 */
export function mergeSectionsIntoPackage(entries, baseState) {
  let pkg = builderStateToPackage(baseState)
  const applied = []
  for (const entry of entries) {
    if (!entry || !entry.section || !isPlainObject(entry.body)) continue
    switch (entry.section) {
      case 'package':
        pkg = { ...entry.body }
        applied.push('package')
        break
      case 'hexmap':
        pkg = { ...pkg, hexmap: entry.body }
        // Unmask the LATEST stamp that builderStateToPackage pre-applied to
        // the base pkg: an imported hexmap section must speak for itself. A
        // legacy (v0) file with no parameters.schemaVersion must reach the
        // validator without a top-level version so it triggers the "missing
        // schemaVersion" migration warning instead of silently passing as
        // LATEST. Any version the final hexmap does carry is hoisted back by
        // the post-loop step below.
        delete pkg.schemaVersion
        applied.push('hexmap')
        break
      case 'terrain':
        pkg = { ...pkg, terrain: entry.body }
        applied.push('terrain')
        break
      case 'units':
        pkg = { ...pkg, units: entry.body }
        applied.push('units')
        break
      case 'turntable':
        pkg = { ...pkg, turntable: entry.body }
        applied.push('turntable')
        break
      case 'objectives':
        pkg = { ...pkg, objectives: entry.body }
        applied.push('objectives')
        break
      default:
        break
    }
  }
  // Hoist schemaVersion from hexmap.parameters on the final assembled package
  // (mirrors the post-loop hoist in loadLevelPackage and
  // loadLevelArchivePackage: split-file data carries its version inside
  // hexmap.parameters, and that version wins whenever present). Running this
  // after the loop makes version handling independent of section order — a
  // 'package' body whose embedded hexmap carries a version gets it hoisted
  // too, and a forward version (v > LATEST) surfaces as the validator's
  // "unsupported schemaVersion" error as expected.
  if (pkg.hexmap?.parameters?.schemaVersion != null) {
    pkg.schemaVersion = pkg.hexmap.parameters.schemaVersion
  }
  return { pkg, appliedSections: applied }
}

/**
 * Filename suffix used by Playground's `loadLevelPackage` for each
 * section file under `public/<id>/`. Exported for the Builder's
 * "Export Package" download flow.
 *
 * @type {Readonly<{ hexmap: string, terrain: string, units: string, turntable: string }>}
 */
export const SECTION_FILENAME_SUFFIX = Object.freeze({
  hexmap: '_hexmap.json',
  terrain: '_terrain.json',
  units: '_units.json',
  turntable: '_turntable.json',
  objectives: '_objectives.json'
})

/**
 * Default terrain weights for the Builder sprinkler. Higher weight ⇒
 * more cells of that type. Tuned so a default board reads as "plains
 * with patches of forest and rare water/swamp/desert/mountain", which
 * matches the intuition designers have for hand-built maps.
 *
 * Unknown terrain ids fall back to `UNKNOWN_TERRAIN_WEIGHT` so a
 * custom-terrain user still gets a sensible distribution instead of
 * either zero coverage or an off-the-charts spike.
 */
export const DEFAULT_TERRAIN_WEIGHTS = Object.freeze({
  plains: 55,
  forest: 25,
  water: 10,
  swamp: 5,
  desert: 4,
  mountain: 1
})
// Same as water: present but not dominant for custom terrain ids.
export const UNKNOWN_TERRAIN_WEIGHT = 10

export function terrainWeight(id, terrainById = null) {
  const terrain = terrainById && typeof terrainById.get === 'function'
    ? terrainById.get(id)
    : null
  const configuredWeight = terrain && terrain.generationWeight != null
    ? Number(terrain.generationWeight)
    : NaN
  if (Number.isFinite(configuredWeight) && configuredWeight >= 0) {
    return configuredWeight
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_TERRAIN_WEIGHTS, id)) {
    return DEFAULT_TERRAIN_WEIGHTS[id]
  }
  return UNKNOWN_TERRAIN_WEIGHT
}

/**
 * Weighted random pick from `terrainIds` using `terrainWeight`. `rng`
 * must expose `{ next: () => float in [0,1) }`. Returns the last id if
 * every weight is zero (defensive — should not happen with the default
 * table) or if floating-point drift slips past the loop.
 */
function weightedPickTerrain(terrainIds, rng, terrainById = null) {
  let total = 0
  for (const id of terrainIds) total += terrainWeight(id, terrainById)
  if (total <= 0) return terrainIds[0]
  let target = rng.next() * total
  for (const id of terrainIds) {
    target -= terrainWeight(id, terrainById)
    if (target < 0) return id
  }
  return terrainIds[terrainIds.length - 1]
}

/**
 * Wrap either a seeded Mulberry32 stream or `Math.random` in a uniform
 * `{ next, nextInt }` shape so the rest of the sprinkler does not have
 * to branch on the construction mode for every random draw.
 */
function buildRng(seedString) {
  if (typeof seedString === 'string' && seedString.length > 0) {
    const rng = createRng(seedString)
    return {
      next: () => rng.next(),
      nextInt: (n) => rng.nextInt(n)
    }
  }
  return {
    next: () => Math.random(),
    nextInt: (n) => {
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`nextInt: maxExclusive must be a positive integer, got ${n}`)
      }
      return Math.floor(Math.random() * n)
    }
  }
}

/** Probability that a cell with at least one already-generated neighbor
 *  copies the neighbor's terrain instead of running the weighted picker.
 *  0.6 was chosen empirically to produce visible clustering while still
 *  letting the weighted distribution drift through the board. */
const NEIGHBOR_BIAS_PROB = 0.6
const SPAWN_SAFETY_NEIGHBOR_PROB = 0.5

/**
 * Inspect row-major already-generated neighbors for `(q, r)` — the cell
 * to the left, `(q - 1, r)`, and the cell upstairs, `(q, r - 1)`. We
 * intentionally do not walk the full 6-hex adjacency here: cheap
 * clustering only needs "any already-generated neighbor", and skipping
 * parity keeps this helper trivial. Returns one of the found terrain
 * ids, or `null` if no in-grid neighbor has been generated yet.
 *
 * @param {{q:number, r:number, cellsByKey:Map<string,{terrainId:string}>, rng:{nextInt:(n:number)=>number}}} args
 */
function pickGeneratedNeighborTerrain({ q, r, cellsByKey, rng }) {
  const candidates = []
  const left = cellsByKey.get(`${q - 1},${r}`)
  if (left) candidates.push(left.terrainId)
  const up = cellsByKey.get(`${q},${r - 1}`)
  if (up) candidates.push(up.terrainId)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  return candidates[rng.nextInt(candidates.length)]
}

/** Odd-r offset (pointy-top) neighbor deltas. Must yield the same six
 *  neighbor coordinates as the runtime helper `getHexDirections` at
 *  `src/domain/engine/hexUtils.js`. Parity here uses standard mathematical
 *  convention (`r & 1 === 0` → even row); `getHexDirections` carries
 *  an inverted internal label but the effective deltas line up once
 *  the bit-test in `applySpawnSafety` is aligned. */
const ODD_R_NEIGHBOR_DELTAS_EVEN_ROW = Object.freeze([
  [ 1,  0], [-1,  0],
  [ 0, -1], [-1, -1],
  [ 0,  1], [-1,  1]
])
const ODD_R_NEIGHBOR_DELTAS_ODD_ROW = Object.freeze([
  [ 1,  0], [-1,  0],
  [ 1, -1], [ 0, -1],
  [ 1,  1], [ 0,  1]
])

/**
 * Choose the "safe" terrain id used by `applySpawnSafety` to overwrite
 * spawn/base cells. Preference order:
 *   1. `'plains'` if it appears in `availableTerrain` (matches the
 *      Builder's painting-mode default and gives a flat, walkable tile).
 *   2. The id in `availableTerrain` whose entry in `terrainTypes` has
 *      the lowest finite `terrainDifficulty`. Ties resolve to the
 *      earlier-listed id (stable single-pass reduce).
 *   3. The first entry of `availableTerrain` as a last resort —
 *      used both when `terrainTypes` is absent/empty and when it is
 *      present but contains no matching finite `terrainDifficulty`
 *      for any id in `availableTerrain`.
 *
 * Returns `null` only if `availableTerrain` itself is empty, in which
 * case the caller has already returned `[]` and never invokes us.
 */
function chooseSafeTerrainId({ availableTerrain, terrainTypes }) {
  if (!Array.isArray(availableTerrain) || availableTerrain.length === 0) return null
  if (availableTerrain.includes('plains')) return 'plains'
  if (Array.isArray(terrainTypes) && terrainTypes.length > 0) {
    const ranked = availableTerrain
      .map(id => terrainTypes.find(t => t && t.id === id))
      .filter(t => t && Number.isFinite(t.terrainDifficulty))
    if (ranked.length > 0) {
      const best = ranked.reduce((acc, t) =>
        t.terrainDifficulty < acc.terrainDifficulty ? t : acc
      )
      return best.id
    }
  }
  return availableTerrain[0]
}

/**
 * Force `safeCells` to `safeTerrainId`, then give each in-bounds odd-r
 * radius-1 neighbor an independent 50% chance to become safe terrain.
 * Mutates cells in place — the caller created the
 * array and is the only owner. Out-of-bounds or non-integer
 * coordinates are silently skipped so a caller passing a stale overlay
 * map from a previously-larger board does not throw.
 */
function applySpawnSafety({ cells, width, height, safeCells, safeTerrainId, rng }) {
  if (!Array.isArray(safeCells) || safeCells.length === 0) return cells
  if (!safeTerrainId) return cells
  const cellsByKey = new Map(cells.map(c => [`${c.q},${c.r}`, c]))
  const guaranteedSafe = new Set()
  const neighborCandidates = new Set()
  for (const safe of safeCells) {
    if (!safe) continue
    const q = safe.q
    const r = safe.r
    if (!Number.isInteger(q) || !Number.isInteger(r)) continue
    if (q < 0 || q >= width || r < 0 || r >= height) continue
    const safeKey = `${q},${r}`
    guaranteedSafe.add(safeKey)
    const deltas = (r & 1) ? ODD_R_NEIGHBOR_DELTAS_ODD_ROW : ODD_R_NEIGHBOR_DELTAS_EVEN_ROW
    for (const [dq, dr] of deltas) {
      const nq = q + dq
      const nr = r + dr
      if (nq < 0 || nq >= width || nr < 0 || nr >= height) continue
      neighborCandidates.add(`${nq},${nr}`)
    }
  }
  for (const key of guaranteedSafe) {
    const cell = cellsByKey.get(key)
    if (cell) cell.terrainId = safeTerrainId
  }
  for (const key of neighborCandidates) {
    if (guaranteedSafe.has(key)) continue
    if (!rng || rng.next() >= SPAWN_SAFETY_NEIGHBOR_PROB) continue
    const cell = cellsByKey.get(key)
    if (cell) cell.terrainId = safeTerrainId
  }
  return cells
}

/**
 * Pure seeded terrain sprinkler used by the Builder's "Generate Map"
 * flow. Given a board shape, the set of terrain ids the user has
 * checked in the Builder, and a seed string, produces a stable
 * (q, r) → terrainId map.
 *
 * Selection model:
 *   - Weighted base pick — each terrain id is drawn proportional to
 *     `DEFAULT_TERRAIN_WEIGHTS` unless a terrain catalog entry supplies
 *     `generationWeight` (unknown ids get a fallback weight of
 *     `UNKNOWN_TERRAIN_WEIGHT`). Replaces the uniform pick used by
 *     earlier batches; output now favors common terrain.
 *   - Neighbor bias — when a cell has at least one already-generated
 *     row-major neighbor (left or upstairs), copy that neighbor's
 *     terrain with probability `NEIGHBOR_BIAS_PROB`. Produces visible
 *     clustering without walking the full 6-hex adjacency.
 *   - Spawn safety post-pass: safe cells are forced to a "safe" terrain after weighted/neighbor generation,
 *     while their 6 immediate odd-r neighbors get the same safe terrain
 *     with 50% probability. Prefers
 *     `plains` when available, otherwise the available id with the
 *     lowest `terrainDifficulty` in `terrainTypes`, otherwise the
 *     first listed id.
 *
 * Two construction modes:
 *   - `seed` is a non-empty string → use `createRng(seed)` so the same
 *     seed reproduces the same board (deterministic Builder fixture).
 *   - `seed` is null / empty / undefined → fall back to `Math.random`
 *     so the existing "shuffle for me" UX still works without forcing
 *     the user to pick a seed every time.
 *
 * Returns rows in row-major order (r outer, q inner), and every row
 * carries q/r for direct coordinate use.
 *
 * @param {object} input
 * @param {number} input.width
 * @param {number} input.height
 * @param {Array<string>} input.availableTerrain terrain ids selected in the Builder
 * @param {string|null} [input.seed]             seed string (empty/null → Math.random)
 * @param {Array<{id:string, terrainDifficulty?:number, generationWeight?:number}>} [input.terrainTypes]
 *                                                       terrain catalog, used by generation weighting
 *                                                       and spawn safety to pick a lowest-difficulty
 *                                                       fallback when `plains` is unavailable
 * @param {Array<{q:number,r:number}>} [input.safeCells] coordinates whose terrain must be forced
 *                                                       to safe; immediate neighbors are softened
 *                                                       with 50% probability
 * @returns {Array<{ q: number, r: number, terrainId: string }>}
 */
export function sprinkleTerrainSeeds({
  width,
  height,
  availableTerrain,
  seed,
  terrainTypes,
  safeCells
} = {}) {
  const w = Number.isInteger(width) && width > 0 ? width : 0
  const h = Number.isInteger(height) && height > 0 ? height : 0
  const terrain = Array.isArray(availableTerrain)
    ? availableTerrain.filter(id => typeof id === 'string' && id)
    : []
  if (w === 0 || h === 0 || terrain.length === 0) return []

  const seedString = typeof seed === 'string' ? seed.trim() : ''
  const rng = buildRng(seedString)
  const terrainById = Array.isArray(terrainTypes)
    ? new Map(terrainTypes.filter(t => t && typeof t.id === 'string').map(t => [t.id, t]))
    : null

  const cells = []
  const cellsByKey = new Map()
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      let terrainId = null
      const neighborTerrain = pickGeneratedNeighborTerrain({ q, r, cellsByKey, rng })
      if (neighborTerrain !== null && rng.next() < NEIGHBOR_BIAS_PROB) {
        terrainId = neighborTerrain
      } else {
        terrainId = weightedPickTerrain(terrain, rng, terrainById)
      }
      const cell = { q, r, terrainId }
      cells.push(cell)
      cellsByKey.set(`${q},${r}`, cell)
    }
  }
  const safeTerrainId = chooseSafeTerrainId({ availableTerrain: terrain, terrainTypes })
  applySpawnSafety({ cells, width: w, height: h, safeCells, safeTerrainId, rng })
  return cells
}

/**
 * Mirror one player's turntable operations onto the other side of the
 * `LevelPackage.turntable` block. Used by the Builder's "Copy our →
 * enemy" / "Copy enemy → our" workflow buttons. Returns a fresh
 * turntable object — the input is not mutated. Unknown shapes are
 * passed through unchanged so a partially-loaded package does not
 * surprise the caller.
 *
 * @param {object} turntableData       { Our_operations?, Enemy_operations? }
 * @param {'our->enemy'|'enemy->our'} direction
 * @returns {object} new turntable shape
 */
export function copyTurntableSide(turntableData, direction) {
  if (!isPlainObject(turntableData)) return turntableData
  const base = { ...turntableData }
  if (direction === 'our->enemy') {
    base.Enemy_operations = Array.isArray(base.Our_operations)
      ? JSON.parse(JSON.stringify(base.Our_operations))
      : base.Enemy_operations
  } else if (direction === 'enemy->our') {
    base.Our_operations = Array.isArray(base.Enemy_operations)
      ? JSON.parse(JSON.stringify(base.Enemy_operations))
      : base.Our_operations
  }
  return base
}
