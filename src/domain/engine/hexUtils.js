/**
 * Утиліти для роботи з гексагональною сіткою
 * Використовує систему координат Axial (q, r) з pointy-top орієнтацією
 * 
 * Pointy-top орієнтація означає:
 * - Гексагони орієнтовані вершиною вгору
 * - Напрямок 0: направо наверх (q+0, r-1)
 * - Напрямок 1: направо (q+1, r+0)
 * - Напрямок 2: направо вниз (q+0, r+1)
 * - Напрямок 3: наліво вниз (q-1, r+1)
 * - Напрямок 4: наліво (q-1, r+0)
 * - Напрямок 5: наліво наверх (q-1, r-1)
 */

/**
 * Отримує напрямки руху для гексагональної сітки з pointy-top орієнтацією
 * Напрямки залежать від парності рядка (r)
 * @param {number} r - координата рядка
 * @returns {Array} масив напрямків [{q, r}, ...]
 */
export function getHexDirections(r) {
  const isEvenRow = r % 2 !== 0  // Інвертуємо логіку: r=1 (парний), r=2 (непарний)
  
  if (isEvenRow) {
    // Парний рядок (r=1,3,5...)
    return [
      { q: 1, r: -1 },   // 0: направо наверх   [1,1] → [2,0]
      { q: 1, r: 0 },    // 1: направо          [1,1] → [2,1]
      { q: 1, r: 1 },    // 2: направо вниз     [1,1] → [2,2]
      { q: 0, r: 1 },    // 3: наліво вниз      [1,1] → [1,2]
      { q: -1, r: 0 },   // 4: наліво           [1,1] → [0,1]
      { q: 0, r: -1 }    // 5: наліво наверх    [1,1] → [1,0]
    ]
  } else {
    // Непарний рядок (r=0,2,4...)
    return [
      { q: 0, r: -1 },   // 0: направо наверх   [2,2] → [2,1]
      { q: 1, r: 0 },    // 1: направо          [2,2] → [3,2]
      { q: 0, r: 1 },    // 2: направо вниз     [2,2] → [2,3]
      { q: -1, r: 1 },   // 3: наліво вниз      [2,2] → [1,3]
      { q: -1, r: 0 },   // 4: наліво           [2,2] → [1,2]
      { q: -1, r: -1 }   // 5: наліво наверх    [2,2] → [1,1]
    ]
  }
}

// Зберігаємо старий HEX_DIRECTIONS для сумісності (непарний рядок)
export const HEX_DIRECTIONS = [
  { q: 0, r: -1 },   // 0: направо наверх [2,2] → [2,1]
  { q: 1, r: 0 },    // 1: направо [2,2] → [3,2]
  { q: 0, r: 1 },    // 2: направо вниз [2,2] → [2,3]
  { q: -1, r: 1 },   // 3: наліво вниз [2,2] → [1,3]
  { q: -1, r: 0 },   // 4: наліво [2,2] → [1,2]
  { q: -1, r: -1 }   // 5: наліво наверх [2,2] → [1,1]
]

/**
 * Додає два гекса
 * @param {Object} hex1 - перший гекс {q, r}
 * @param {Object} hex2 - другий гекс {q, r}
 * @returns {Object} сума гексів {q, r}
 */
export function hexAdd(hex1, hex2) {
  return {
    q: hex1.q + hex2.q,
    r: hex1.r + hex2.r
  }
}

/**
 * Віднімає два гекса
 * @param {Object} hex1 - перший гекс {q, r}
 * @param {Object} hex2 - другий гекс {q, r}
 * @returns {Object} різниця гексів {q, r}
 */
export function hexSubtract(hex1, hex2) {
  return {
    q: hex1.q - hex2.q,
    r: hex1.r - hex2.r
  }
}

/**
 * Множить гекс на скаляр
 * @param {Object} hex - гекс {q, r}
 * @param {number} k - скаляр
 * @returns {Object} множення гекса на скаляр {q, r}
 */
export function hexMultiply(hex, k) {
  return {
    q: hex.q * k,
    r: hex.r * k
  }
}

/**
 * Конвертує offset координати в axial (для odd-r offset системи)
 * @param {number} col - колонка (q) в offset
 * @param {number} row - рядок (r) в offset
 * @returns {Object} axial координати {q, r}
 */
export function offsetToAxial(col, row) {
  // Для odd-r offset (r=1,3,5... зміщені вправо)
  // Конвертуємо в кубічні координати
  // x = col - (row - (row & 1)) / 2
  const x = col - (row - (row & 1)) / 2
  const z = row
  const y = -x - z
  return { x, y, z }
}

/**
 * Обчислює відстань між двома гексами в offset координатах
 * @param {Object} hex1 - перший гекс {q, r} в offset координатах
 * @param {Object} hex2 - другий гекс {q, r} в offset координатах
 * @returns {number} відстань в гексах
 */
export function hexDistanceOffset(hex1, hex2) {
  // Конвертуємо offset → cube
  const cube1 = offsetToAxial(hex1.q, hex1.r)
  const cube2 = offsetToAxial(hex2.q, hex2.r)
  
  // Обчислюємо Manhattan distance в кубічних координатах
  const dx = Math.abs(cube1.x - cube2.x)
  const dy = Math.abs(cube1.y - cube2.y)
  const dz = Math.abs(cube1.z - cube2.z)
  
  return (dx + dy + dz) / 2
}

/**
 * Отримує сусідній гекс у заданому напрямку
 * @param {Object} hex - початковий гекс {q, r}
 * @param {number} direction - напрямок (0-5)
 * @returns {Object} сусідній гекс {q, r}
 */
export function hexNeighbor(hex, direction) {
  const directions = getHexDirections(hex.r)
  return hexAdd(hex, directions[direction])
}

/**
 * Отримує всіх сусідів гекса
 * @param {Object} hex - гекс {q, r}
 * @returns {Array} масив сусідніх гексів [{q, r}, ...]
 */
export function hexNeighbors(hex) {
  const directions = getHexDirections(hex.r)
  return directions.map(direction => hexAdd(hex, direction))
}

/**
 * Напрямок 0–5 з `from` до `to`: сусідній крок, що найбільше наближає до цілі
 * (узгоджено з `getHexDirections(from.r)` і `hexNeighbor`).
 * @param {{ q: number, r: number }} from
 * @param {{ q: number, r: number }} to
 * @returns {number}
 */
export function hexFacingToward(from, to) {
  if (!from || !to || !Number.isInteger(from.q) || !Number.isInteger(from.r) || !Number.isInteger(to.q) || !Number.isInteger(to.r)) {
    return 0
  }
  const directions = getHexDirections(from.r)
  let bestDir = 0
  let bestDist = Infinity
  for (let d = 0; d < 6; d++) {
    const nq = from.q + directions[d].q
    const nr = from.r + directions[d].r
    const dist = hexDistanceOffset({ q: nq, r: nr }, to)
    if (dist < bestDist) {
      bestDist = dist
      bestDir = d
    }
  }
  return bestDir
}

/**
 * Як `hexFacingToward`, але спочатку обирає найближчий до `from` гекс з `candidates`.
 * @param {{ q: number, r: number }} from
 * @param {Array<{ q: number, r: number }>} candidates
 * @returns {number}
 */
export function hexFacingTowardNearest(from, candidates) {
  if (!from || !candidates || !Array.isArray(candidates) || candidates.length === 0) return 0
  let best = candidates[0]
  let bestD = hexDistanceOffset(from, best)
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    const d = hexDistanceOffset(from, c)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return hexFacingToward(from, best)
}

/**
 * Отримує гекси в кільці навколо центрального гекса
 * @param {Object} center - центральний гекс {q, r}
 * @param {number} radius - радіус кільця
 * @returns {Array} масив гексів у кільці [{q, r}, ...]
 */
export function hexesInRing(center, radius) {
  if (radius === 0) return [center]
  
  const results = []
  const directions = getHexDirections(center.r)
  let hex = hexAdd(center, hexMultiply(directions[4], radius))
  
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push(hex)
      hex = hexNeighbor(hex, i)
    }
  }
  
  return results
}

/**
 * Знаходить напрямок від одного гекса до іншого
 * @param {Object} from - початковий гекс {q, r}
 * @param {Object} to - кінцевий гекс {q, r}
 * @returns {number|null} напрямок (0-5) або null якщо не сусідні
 */
export function hexDirection(from, to) {
  const diff = hexSubtract(to, from)
  const directions = getHexDirections(from.r)
  
  for (let i = 0; i < directions.length; i++) {
    if (diff.q === directions[i].q && diff.r === directions[i].r) {
      return i
    }
  }
  
  return null
}

/**
 * Обчислює кут повороту між двома напрямками
 * @param {number} fromDirection - початковий напрямок (0-5)
 * @param {number} toDirection - кінцевий напрямок (0-5)
 * @returns {number} кут повороту в градусах
 */
export function hexRotationAngle(fromDirection, toDirection) {
  const diff = (toDirection - fromDirection + 6) % 6
  return diff * 60 // 60 градусів на кожен напрямок
}

/**
 * Перевіряє чи є гекс в межах мапи
 * @param {Object} hex - гекс {q, r}
 * @param {number} width - ширина мапи
 * @param {number} height - висота мапи
 * @returns {boolean} чи в межах мапи
 */
export function hexInBounds(hex, width, height) {
  return hex.q >= 0 && hex.q < width && hex.r >= 0 && hex.r < height
}

/**
 * Конвертує гексагональні координати в піксельні
 * @param {Object} hex - гекс {q, r}
 * @param {number} hexSize - розмір гекса
 * @returns {Object} піксельні координати {x, y}
 */
export function hexToPixel(hex, hexSize) {
  const hexWidth = hexSize * Math.sqrt(3)
  const hexHeight = hexSize * 1.5
  
  const x = hex.q * hexWidth + (hex.r % 2) * (hexWidth / 2) + hexSize
  const y = hex.r * hexHeight + hexSize
  
  return { x, y }
}

const HEX_FACING_COUNT = 6
export const MIN_ATTACK_ANGLE = 0
export const MAX_ATTACK_ANGLE = 4
export const FULL_ARC_ATTACK_ANGLE = 3

/**
 * Нормалізує напрямок юніта (0–5) з числа або рядка (JSON / форми).
 * Без цього pathfinder бачив би `facing` як 0, тоді як UI використовував би непустий рядок.
 */
export function normalizeHexFacing(value) {
  if (value === undefined || value === null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  const i = Math.trunc(n)
  return ((i % HEX_FACING_COUNT) + HEX_FACING_COUNT) % HEX_FACING_COUNT
}

/**
 * Normalizes attackAngle from config / JSON to the supported 0..4 domain.
 */
export function normalizeAttackAngle(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'boolean') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  const i = Math.trunc(n)
  return Math.max(MIN_ATTACK_ANGLE, Math.min(MAX_ATTACK_ANGLE, i))
}

export function isSupportedAttackAngle(value) {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return false
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n >= MIN_ATTACK_ANGLE && n <= MAX_ATTACK_ANGLE
}

/**
 * Attack directions relative to `facing`.
 * 0: facing only; 1/2: facing +/- N sectors; 3/4: full 360-degree fire.
 * @param {number} attackAngle
 * @param {number} facing - 0..5
 * @returns {number[]}
 */
export function allowedFacingDirections(attackAngle, facing) {
  const f = normalizeHexFacing(facing)
  const angle = normalizeAttackAngle(attackAngle)
  if (angle >= FULL_ARC_ATTACK_ANGLE) {
    return [0, 1, 2, 3, 4, 5]
  }

  const directions = []
  for (let offset = -angle; offset <= angle; offset++) {
    directions.push(normalizeHexFacing(f + offset))
  }
  return directions
}

const LOS_MODES = new Set(['direct_fire', 'artillery'])

function assertRayEnemyUnitId(unit, context) {
  if (unit == null || unit.id === undefined || unit.id === null || String(unit.id).trim() === '') {
    throw new Error(`${context}: enemy unit must have a non-empty id`)
  }
  return String(unit.id)
}

/**
 * Кроки променя атаки з урахуванням LOS (без GameState): геометрія як у `hexNeighbor` по фіксованому індексу напрямку.
 *
 * @param {Object} params
 * @param {{ q: number, r: number }} params.origin — гекс атакуючого
 * @param {number} params.directionIndex — 0–5
 * @param {number} params.attackRange — скільки гексів у глибину по променю
 * @param {'direct_fire'|'artillery'} params.losMode
 * @param {(hex: { q: number, r: number }) => boolean} params.isHexInBounds
 * @param {(hex: { q: number, r: number }) => boolean} params.getTerrainPassable — false = непрохідний терен (стіна для прямого вогню)
 * @param {(hex: { q: number, r: number }) => { id: string, player: string } | null | undefined} params.getUnitAt
 * @param {string} params.attackerPlayerId
 * @returns {{ visitedHexes: Array<{ q: number, r: number }>, enemyTargets: Array<{ q: number, r: number, unitId: string }>, stoppedBy: 'range'|'map_edge'|'terrain'|'friendly'|'first_enemy' }}
 */
export function collectRayHexes(params) {
  if (params == null || typeof params !== 'object') {
    throw new TypeError('collectRayHexes: params must be a non-null object')
  }

  const {
    origin,
    directionIndex,
    attackRange,
    losMode,
    isHexInBounds,
    getTerrainPassable,
    getUnitAt,
    attackerPlayerId
  } = params

  if (!origin || !Number.isInteger(origin.q) || !Number.isInteger(origin.r)) {
    throw new TypeError('collectRayHexes: origin must have integer q and r')
  }
  if (!Number.isInteger(directionIndex) || directionIndex < 0 || directionIndex > 5) {
    throw new TypeError('collectRayHexes: directionIndex must be an integer 0..5')
  }
  if (!Number.isInteger(attackRange) || attackRange < 0) {
    throw new TypeError('collectRayHexes: attackRange must be a non-negative integer')
  }
  if (!LOS_MODES.has(losMode)) {
    throw new TypeError(`collectRayHexes: invalid losMode (${String(losMode)})`)
  }
  if (typeof isHexInBounds !== 'function') {
    throw new TypeError('collectRayHexes: isHexInBounds must be a function')
  }
  if (typeof getTerrainPassable !== 'function') {
    throw new TypeError('collectRayHexes: getTerrainPassable must be a function')
  }
  if (typeof getUnitAt !== 'function') {
    throw new TypeError('collectRayHexes: getUnitAt must be a function')
  }
  if (typeof attackerPlayerId !== 'string') {
    throw new TypeError('collectRayHexes: attackerPlayerId must be a string')
  }

  const visitedHexes = []
  const enemyTargets = []
  let stoppedBy = null

  let current = origin
  for (let step = 1; step <= attackRange; step++) {
    current = hexNeighbor(current, directionIndex)
    if (!isHexInBounds(current)) {
      stoppedBy = 'map_edge'
      break
    }

    const passable = Boolean(getTerrainPassable(current))
    const unit = getUnitAt(current) ?? null

    if (losMode === 'direct_fire') {
      if (!passable) {
        visitedHexes.push({ q: current.q, r: current.r })
        stoppedBy = 'terrain'
        break
      }
      if (unit && unit.player === attackerPlayerId) {
        visitedHexes.push({ q: current.q, r: current.r })
        stoppedBy = 'friendly'
        break
      }
      if (unit && unit.player !== attackerPlayerId) {
        visitedHexes.push({ q: current.q, r: current.r })
        const unitId = assertRayEnemyUnitId(unit, 'collectRayHexes')
        enemyTargets.push({ q: current.q, r: current.r, unitId })
        stoppedBy = 'first_enemy'
        break
      }
      visitedHexes.push({ q: current.q, r: current.r })
    } else if (losMode === 'artillery') {
      if (unit && unit.player === attackerPlayerId) {
        visitedHexes.push({ q: current.q, r: current.r })
        continue
      }
      if (unit && unit.player !== attackerPlayerId) {
        visitedHexes.push({ q: current.q, r: current.r })
        const unitId = assertRayEnemyUnitId(unit, 'collectRayHexes')
        enemyTargets.push({ q: current.q, r: current.r, unitId })
        continue
      }
      visitedHexes.push({ q: current.q, r: current.r })
    }
  }

  if (stoppedBy === null) {
    stoppedBy = 'range'
  }

  return { visitedHexes, enemyTargets, stoppedBy }
}

/**
 * Six-vertex pointy-top polygon centered at `(centerX, centerY)` with
 * outer radius `radius`. Vertices step by 60° starting at `-30°` (top
 * point), matching the orientation used by GameMapBlock board hexes,
 * LevelBuilder board hexes, and GameMapBlock unit-icon hexes.
 *
 * Returned as a space-separated `"x,y x,y ..."` string ready for an
 * SVG `<polygon points>` attribute — callers historically built that
 * exact format inline.
 *
 * @param {object} input
 * @param {number} input.centerX
 * @param {number} input.centerY
 * @param {number} input.radius
 * @returns {string}
 */
export function pointyTopHexPolygonPoints({ centerX, centerY, radius }) {
  const vertices = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    vertices.push(`${centerX + radius * Math.cos(angle)},${centerY + radius * Math.sin(angle)}`)
  }
  return vertices.join(' ')
}

/**
 * Pure pointy-top hex polygon geometry shared by `GameMapBlock` and
 * `LevelBuilder`. Returns the SVG-ready vertex strings plus the cached
 * center so callers can spread the result into a render-model row.
 *
 * `hexStrokeOffset` is intentionally a caller parameter: GameMapBlock and
 * LevelBuilder have historically rendered the inner-stroke polygon with a
 * slightly different offset (hardcoded vs config); keeping it explicit
 * preserves each surface's current visual without baking a value into the
 * helper. Math itself (axial → pixel, 6-vertex polygon at angles
 * `i * 60° − 30°`) is identical to what both call sites had inline.
 *
 * @param {object} input
 * @param {number} input.q
 * @param {number} input.r
 * @param {number} input.hexSize          outer hex radius in CSS pixels
 * @param {number} [input.hexStrokeOffset] inner polygon radius offset (default 0 → inner equals outer)
 * @returns {{ x: number, y: number, points: string, innerPoints: string, center: { x: number, y: number } }}
 */
export function computeHexPolygonGeometry({ q, r, hexSize, hexStrokeOffset = 0 }) {
  const { x, y } = hexToPixel({ q, r }, hexSize)
  return {
    x,
    y,
    points: pointyTopHexPolygonPoints({ centerX: x, centerY: y, radius: hexSize }),
    innerPoints: pointyTopHexPolygonPoints({ centerX: x, centerY: y, radius: hexSize - hexStrokeOffset }),
    center: { x, y }
  }
}

/**
 * Total SVG canvas size required to render a `width × height` pointy-top
 * board with one `hexSize` radius of padding on every edge — the same
 * formula GameMapBlock and LevelBuilder were duplicating inline.
 *
 * @param {object} input
 * @param {number} input.width
 * @param {number} input.height
 * @param {number} input.hexSize
 * @returns {{ svgWidth: number, svgHeight: number }}
 */
export function computeSvgMapSize({ width, height, hexSize }) {
  const hexWidth = hexSize * Math.sqrt(3)
  const hexHeight = hexSize * 1.5
  return {
    svgWidth: width * hexWidth + hexSize * 2,
    svgHeight: height * hexHeight + hexSize * 2
  }
}
