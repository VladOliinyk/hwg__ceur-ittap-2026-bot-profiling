import { describe, it, expect } from 'vitest'
import {
  allowedFacingDirections,
  collectRayHexes,
  computeHexPolygonGeometry,
  computeSvgMapSize,
  pointyTopHexPolygonPoints
} from '@/domain/engine/hexUtils.js'

describe('allowedFacingDirections', () => {
  it('attackAngle 0 повертає один напрямок — нормалізований facing', () => {
    expect(allowedFacingDirections(0, 3)).toEqual([3])
    expect(allowedFacingDirections(0, 0)).toEqual([0])
  })

  it('attackAngle 1 повертає три напрямки: facing−1, facing, facing+1 (mod 6)', () => {
    expect(allowedFacingDirections(1, 0)).toEqual([5, 0, 1])
    expect(allowedFacingDirections(1, 2)).toEqual([1, 2, 3])
    expect(allowedFacingDirections(1, 5)).toEqual([4, 5, 0])
  })

  it('рядковий attackAngle з JSON нормалізується як число', () => {
    expect(allowedFacingDirections('1', 0)).toEqual([5, 0, 1])
    expect(allowedFacingDirections('2', 0)).toEqual([4, 5, 0, 1, 2])
    expect(allowedFacingDirections('0', 2)).toEqual([2])
  })

  it('attackAngle 2 повертає facing плюс два напрямки ліворуч і праворуч', () => {
    expect(allowedFacingDirections(2, 0)).toEqual([4, 5, 0, 1, 2])
    expect(allowedFacingDirections(2, 4)).toEqual([2, 3, 4, 5, 0])
  })

  it('attackAngle 3 і 4 дозволяють вогонь у всі шість напрямків', () => {
    expect(allowedFacingDirections(3, 4)).toEqual([0, 1, 2, 3, 4, 5])
    expect(allowedFacingDirections(4, 1)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('attackAngle поза діапазоном нормалізується до найближчої підтримуваної межі', () => {
    expect(allowedFacingDirections(-1, 4)).toEqual([4])
    expect(allowedFacingDirections(99, 4)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('collectRayHexes validation', () => {
  const validBase = () => ({
    origin: { q: 0, r: 0 },
    directionIndex: 0,
    attackRange: 1,
    losMode: 'direct_fire',
    isHexInBounds: () => true,
    getTerrainPassable: () => true,
    getUnitAt: () => null,
    attackerPlayerId: 'player1'
  })

  it('кидає TypeError при невалідному losMode', () => {
    expect(() =>
      collectRayHexes({ ...validBase(), losMode: 'direct' })
    ).toThrowError(/invalid losMode/)
  })

  it('кидає TypeError при від’ємному attackRange', () => {
    expect(() => collectRayHexes({ ...validBase(), attackRange: -1 })).toThrowError(/attackRange/)
  })

  it('кидає TypeError при directionIndex поза 0..5', () => {
    expect(() => collectRayHexes({ ...validBase(), directionIndex: 6 })).toThrowError(/directionIndex/)
  })

  it('кидає при ворогу без id', () => {
    expect(() =>
      collectRayHexes({
        ...validBase(),
        attackRange: 2,
        getUnitAt: (h) => (h.q === 0 && h.r === -1 ? { player: 'player2' } : null)
      })
    ).toThrowError(/non-empty id/)
  })
})

describe('collectRayHexes (LOS, майбутня інтеграція з GameState)', () => {
  const W = 8
  const H = 8
  const inMap = (h) => h.q >= 0 && h.q < W && h.r >= 0 && h.r < H
  const key = (q, r) => `${q},${r}`

  function makeRay(overrides) {
    const impassable = overrides.impassableKeys ?? new Set()
    const units = overrides.units ?? {}
    return collectRayHexes({
      origin: overrides.origin,
      directionIndex: overrides.directionIndex,
      attackRange: overrides.attackRange,
      losMode: overrides.losMode,
      isHexInBounds: inMap,
      getTerrainPassable: (h) => !impassable.has(key(h.q, h.r)),
      getUnitAt: (h) => units[key(h.q, h.r)] ?? null,
      attackerPlayerId: 'player1'
    })
  }

  /** Лінія з (2,2) по напрямку 1: (3,2), (4,2), … */
  const origin = { q: 2, r: 2 }
  const dir = 1

  describe('прямий вогонь (direct_fire)', () => {
    it('промінь зупиняється на непрохідному терені; далі гекси не відвідуються', () => {
      const impassableKeys = new Set([key(3, 2)])
      const res = makeRay({
        origin,
        directionIndex: dir,
        attackRange: 5,
        losMode: 'direct_fire',
        impassableKeys,
        units: {
          [key(4, 2)]: { id: 'e_behind', player: 'player2' }
        }
      })
      expect(res.stoppedBy).toBe('terrain')
      expect(res.enemyTargets).toHaveLength(0)
      expect(res.visitedHexes.some((h) => h.q === 4 && h.r === 2)).toBe(false)
    })

    it('промінь зупиняється на дружньому юніті; ворог за ним не в зоні LOS', () => {
      const res = makeRay({
        origin,
        directionIndex: dir,
        attackRange: 5,
        losMode: 'direct_fire',
        units: {
          [key(3, 2)]: { id: 'ally', player: 'player1' },
          [key(4, 2)]: { id: 'e_behind', player: 'player2' }
        }
      })
      expect(res.stoppedBy).toBe('friendly')
      expect(res.enemyTargets).toHaveLength(0)
      expect(res.visitedHexes.some((h) => h.q === 4 && h.r === 2)).toBe(false)
    })

    it('лише перший ворог на промені потрапляє в цілі; наступні гекси не обходяться', () => {
      const res = makeRay({
        origin,
        directionIndex: dir,
        attackRange: 5,
        losMode: 'direct_fire',
        units: {
          [key(3, 2)]: { id: 'e_first', player: 'player2' },
          [key(4, 2)]: { id: 'e_second', player: 'player2' }
        }
      })
      expect(res.stoppedBy).toBe('first_enemy')
      expect(res.enemyTargets).toEqual([{ q: 3, r: 2, unitId: 'e_first' }])
      expect(res.visitedHexes.some((h) => h.q === 4 && h.r === 2)).toBe(false)
    })
  })

  describe('артилерія (artillery)', () => {
    it('непрохідний терен не зупиняє промінь; видно ворогів за перешкодою', () => {
      const impassableKeys = new Set([key(3, 2)])
      const res = makeRay({
        origin,
        directionIndex: dir,
        attackRange: 5,
        losMode: 'artillery',
        impassableKeys,
        units: {
          [key(4, 2)]: { id: 'e1', player: 'player2' },
          [key(5, 2)]: { id: 'e2', player: 'player2' }
        }
      })
      expect(res.enemyTargets).toEqual([
        { q: 4, r: 2, unitId: 'e1' },
        { q: 5, r: 2, unitId: 'e2' }
      ])
      expect(res.visitedHexes.some((h) => h.q === 3 && h.r === 2)).toBe(true)
      expect(res.visitedHexes.some((h) => h.q === 5 && h.r === 2)).toBe(true)
    })

    it('дружні юніти не блокують промінь; кілька ворогів на одній лінії — окремі цілі', () => {
      const res = makeRay({
        origin,
        directionIndex: dir,
        attackRange: 5,
        losMode: 'artillery',
        units: {
          [key(3, 2)]: { id: 'ally', player: 'player1' },
          [key(4, 2)]: { id: 'e1', player: 'player2' },
          [key(5, 2)]: { id: 'e2', player: 'player2' }
        }
      })
      expect(res.enemyTargets).toEqual([
        { q: 4, r: 2, unitId: 'e1' },
        { q: 5, r: 2, unitId: 'e2' }
      ])
      expect(res.visitedHexes.map((h) => key(h.q, h.r))).toContain(key(3, 2))
    })
  })
})

/**
 * Reference math copied verbatim from the original inline implementations
 * in `GameMapBlock.computeHexGeometry` and `LevelBuilder.createHex` (originally
 * authored in the legacy HexMapBuilder page, ported verbatim to LevelBuilder).
 * The helper extraction must produce byte-identical strings — this is the
 * lock-in for "no visible behavior change".
 */
function legacyPolygon(q, r, hexSize, hexStrokeOffset) {
  const hexWidth = hexSize * Math.sqrt(3)
  const hexHeight = hexSize * 1.5
  const x = q * hexWidth + (r % 2) * (hexWidth / 2) + hexSize
  const y = r * hexHeight + hexSize
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    points.push(`${x + hexSize * Math.cos(angle)},${y + hexSize * Math.sin(angle)}`)
  }
  const innerSize = hexSize - hexStrokeOffset
  const innerPoints = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    innerPoints.push(`${x + innerSize * Math.cos(angle)},${y + innerSize * Math.sin(angle)}`)
  }
  return {
    x,
    y,
    points: points.join(' '),
    innerPoints: innerPoints.join(' '),
    center: { x, y }
  }
}

/**
 * Reference math copied verbatim from the pre-refactor inline
 * `GameMapBlock.getUnitHexagonPoints(centerX, centerY)` body — the
 * unit-icon polygon. Used to prove the small `pointyTopHexPolygonPoints`
 * extraction is byte-identical to what the unit icon rendered before.
 */
function legacyUnitHexPoints(centerX, centerY, hexSize) {
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = centerX + hexSize * Math.cos(angle)
    const y = centerY + hexSize * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

describe('computeHexPolygonGeometry', () => {
  it('matches the legacy inline math for (0, 0) at hexSize=30 with no stroke offset', () => {
    const expected = legacyPolygon(0, 0, 30, 0)
    expect(computeHexPolygonGeometry({ q: 0, r: 0, hexSize: 30 })).toEqual(expected)
  })

  it('matches the legacy inline math for the GameMapBlock surface (hexStrokeOffset=2)', () => {
    // GameMapBlock historically used `innerSize = hexSize - 2` (hardcoded).
    // The refactored helper must keep that exact output when the call site
    // passes `hexStrokeOffset: 2`.
    for (const [q, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [3, 5], [4, 2], [10, 9], [-1, -1]]) {
      expect(computeHexPolygonGeometry({ q, r, hexSize: 30, hexStrokeOffset: 2 }))
        .toEqual(legacyPolygon(q, r, 30, 2))
    }
  })

  it('matches the legacy inline math for the LevelBuilder surface (hexStrokeOffset=3, from theme)', () => {
    // LevelBuilder uses `innerSize = hexSize - hexMap.hexStrokeOffset`
    // where hexStrokeOffset = 3. Same byte-identical contract.
    for (const [q, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [3, 5], [4, 2], [10, 9], [-1, -1]]) {
      expect(computeHexPolygonGeometry({ q, r, hexSize: 30, hexStrokeOffset: 3 }))
        .toEqual(legacyPolygon(q, r, 30, 3))
    }
  })

  it('honours zoom by multiplying hexSize: 60px hex matches legacy math', () => {
    expect(computeHexPolygonGeometry({ q: 2, r: 3, hexSize: 60, hexStrokeOffset: 3 }))
      .toEqual(legacyPolygon(2, 3, 60, 3))
  })

  it('preserves the odd-row half-hexWidth x shift', () => {
    // r=0 (even row): no shift
    const evenRow = computeHexPolygonGeometry({ q: 1, r: 0, hexSize: 30 })
    // r=1 (odd row): x shifted by +hexWidth/2 = +15*sqrt(3)
    const oddRow = computeHexPolygonGeometry({ q: 1, r: 1, hexSize: 30 })
    expect(oddRow.x - evenRow.x).toBeCloseTo(30 * Math.sqrt(3) / 2, 10)
  })

  it('produces 6 outer vertices and 6 inner vertices', () => {
    const geom = computeHexPolygonGeometry({ q: 0, r: 0, hexSize: 30, hexStrokeOffset: 3 })
    expect(geom.points.split(' ')).toHaveLength(6)
    expect(geom.innerPoints.split(' ')).toHaveLength(6)
  })

  it('omitting hexStrokeOffset defaults to 0 (inner polygon equals outer)', () => {
    const geom = computeHexPolygonGeometry({ q: 0, r: 0, hexSize: 30 })
    expect(geom.innerPoints).toBe(geom.points)
  })

  it('center mirrors {x, y} for convenience', () => {
    const geom = computeHexPolygonGeometry({ q: 2, r: 5, hexSize: 30, hexStrokeOffset: 3 })
    expect(geom.center).toEqual({ x: geom.x, y: geom.y })
  })
})

describe('pointyTopHexPolygonPoints', () => {
  it('matches the legacy unit-icon math for centered hexes (hexSize=10)', () => {
    // GameMapBlock.getUnitHexagonPoints(centerX, centerY) historically
    // used `hexSize = 10` and the same `i*60° − 30°` angle stride.
    // The helper must produce byte-identical strings at the same inputs.
    const cases = [
      { centerX: 0, centerY: 0 },
      { centerX: 50, centerY: 50 },
      { centerX: 123.5, centerY: -7.25 },
      { centerX: -10, centerY: 1000 }
    ]
    for (const c of cases) {
      expect(pointyTopHexPolygonPoints({ ...c, radius: 10 }))
        .toBe(legacyUnitHexPoints(c.centerX, c.centerY, 10))
    }
  })

  it('produces 6 vertices', () => {
    const out = pointyTopHexPolygonPoints({ centerX: 0, centerY: 0, radius: 10 })
    expect(out.split(' ')).toHaveLength(6)
  })

  it('is what computeHexPolygonGeometry uses for its outer points (board-hex equivalence)', () => {
    // Round-trip check: the polygon helper, when called with the same
    // center the geometry helper resolved via hexToPixel and the same
    // hexSize, must produce exactly the geometry helper's `points`.
    const geom = computeHexPolygonGeometry({ q: 2, r: 3, hexSize: 30, hexStrokeOffset: 3 })
    const outer = pointyTopHexPolygonPoints({ centerX: geom.x, centerY: geom.y, radius: 30 })
    expect(outer).toBe(geom.points)
  })

  it('inner polygon equivalence: hexStrokeOffset folds into the radius', () => {
    const geom = computeHexPolygonGeometry({ q: 0, r: 0, hexSize: 30, hexStrokeOffset: 3 })
    const inner = pointyTopHexPolygonPoints({ centerX: geom.x, centerY: geom.y, radius: 27 })
    expect(inner).toBe(geom.innerPoints)
  })
})

describe('computeSvgMapSize', () => {
  it('matches the legacy inline math used by both surfaces', () => {
    // GameMapBlock.updateMapDimensions and LevelBuilder.updateMapDimensions
    // had byte-identical inline math; the helper must reproduce it exactly.
    const cases = [
      { width: 5, height: 8, hexSize: 30 },
      { width: 1, height: 1, hexSize: 30 },
      { width: 20, height: 12, hexSize: 30 },
      { width: 10, height: 10, hexSize: 60 }
    ]
    for (const c of cases) {
      const hexWidth = c.hexSize * Math.sqrt(3)
      const hexHeight = c.hexSize * 1.5
      expect(computeSvgMapSize(c)).toEqual({
        svgWidth: c.width * hexWidth + c.hexSize * 2,
        svgHeight: c.height * hexHeight + c.hexSize * 2
      })
    }
  })

  it('scales linearly with hexSize (zoom path)', () => {
    const a = computeSvgMapSize({ width: 5, height: 8, hexSize: 30 })
    const b = computeSvgMapSize({ width: 5, height: 8, hexSize: 60 })
    expect(b.svgWidth).toBeCloseTo(a.svgWidth * 2, 10)
    expect(b.svgHeight).toBeCloseTo(a.svgHeight * 2, 10)
  })
})
