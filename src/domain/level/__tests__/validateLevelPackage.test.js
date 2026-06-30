import { describe, expect, it } from 'vitest'
import {
  validateLevelPackage,
  LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
} from '../validateLevelPackage.js'
import { DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID, UNIT_TYPES } from '@/domain/engine/gameUnits.js'

/**
 * Compact, valid LevelPackage shape mirroring the canonical `level_000` data
 * (4×3 board, two players, plains/forest terrain, standard turntable).
 * Each test gets a fresh deep copy so mutations don't leak between cases.
 */
function makeValidPackage() {
  return {
    id: 'level_000',
    hexmap: {
      parameters: { width: 2, height: 3 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 0, r: 1, terrain: 'forest' },
        { q: 1, r: 1, terrain: 'plains' },
        { q: 0, r: 2, terrain: 'plains', player2Spawn: true, player2Base: true },
        { q: 1, r: 2, terrain: 'plains', player2Spawn: true }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
      ]
    },
    units: {
      player1: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 2 }
        ]
      },
      player2: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 2 }
        ]
      }
    },
    turntable: {
      Our_operations: [
        {
          title: 'MANOEUVRE',
          moves: [
            { title: 'x1 dice', dice: [
              ['move', 'turn'], ['move'], ['turn'], ['-'], ['move'], ['turn']
            ] }
          ]
        },
        {
          title: 'ATTACK',
          moves: [
            { title: 'x1 dice', dice: [
              ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
            ] }
          ]
        }
      ],
      Enemy_operations: [
        {
          title: 'MANOEUVRE',
          moves: [
            { title: 'x1 dice', dice: [
              ['move', 'turn'], ['move'], ['turn'], ['-'], ['move'], ['turn']
            ] }
          ]
        },
        {
          title: 'ATTACK',
          moves: [
            { title: 'x1 dice', dice: [
              ['fire'], ['reload'], ['-'], ['-'], ['fire'], ['reload']
            ] }
          ]
        }
      ]
    }
  }
}

function heavyTankType(overrides = {}) {
  return {
    id: 'heavy_tank',
    name: 'Heavy Tank',
    health: 120,
    movement: 2,
    attackRange: 2,
    attackAngle: 1,
    attackPower: 65,
    maxTerrainDifficulty: 3,
    losMode: 'direct_fire',
    iconKey: 'armored',
    ...overrides
  }
}

describe('validateLevelPackage — happy path', () => {
  it('accepts a fully-formed level package and reports ok: true', () => {
    const pkg = makeValidPackage()
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('returns the normalized package on success', () => {
    const pkg = makeValidPackage()
    const result = validateLevelPackage(pkg)
    expect(result.package).toBeTruthy()
    expect(result.package.id).toBe('level_000')
    expect(Array.isArray(result.package.hexmap.map)).toBe(true)
    expect(result.package.terrain.terrainTypes).toHaveLength(2)
  })
})

describe('validateLevelPackage — top-level shape', () => {
  it('rejects null or non-object input', () => {
    expect(validateLevelPackage(null).ok).toBe(false)
    expect(validateLevelPackage(undefined).ok).toBe(false)
    expect(validateLevelPackage('level').ok).toBe(false)
    expect(validateLevelPackage(42).ok).toBe(false)
  })

  it('reports every missing required section by path', () => {
    const result = validateLevelPackage({})
    expect(result.ok).toBe(false)
    const paths = result.errors.map(e => e.path)
    expect(paths).toEqual(expect.arrayContaining(['hexmap', 'terrain', 'units', 'turntable']))
  })

  it('rejects missing or non-string id', () => {
    const pkg = makeValidPackage()
    pkg.id = ''
    expect(validateLevelPackage(pkg).errors.some(e => e.path === 'id')).toBe(true)
    pkg.id = 42
    expect(validateLevelPackage(pkg).errors.some(e => e.path === 'id')).toBe(true)
  })
})

describe('validateLevelPackage — hexmap', () => {
  it('rejects non-integer or non-positive width/height', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.parameters.width = 0
    let errors = validateLevelPackage(pkg).errors.map(e => e.path)
    expect(errors).toContain('hexmap.parameters.width')

    const pkg2 = makeValidPackage()
    pkg2.hexmap.parameters.height = 2.5
    errors = validateLevelPackage(pkg2).errors.map(e => e.path)
    expect(errors).toContain('hexmap.parameters.height')
  })

  it('rejects oversized boards (>200)', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.parameters.width = 201
    const errors = validateLevelPackage(pkg).errors.map(e => e.path)
    expect(errors).toContain('hexmap.parameters.width')
  })

  it('rejects empty map array', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map = []
    const errors = validateLevelPackage(pkg).errors.map(e => e.path)
    expect(errors).toContain('hexmap.map')
  })

  it('rejects cells with non-integer q/r', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map[0].q = 1.5
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'hexmap.map[0].q')).toBe(true)
  })

  it('rejects cells whose coordinates are outside board bounds', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map[0].q = 99
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'hexmap.map[0].q')).toBe(true)
  })

  it('rejects duplicate (q,r) coordinates', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map.push({ q: 0, r: 0, terrain: 'plains' })
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => /duplicate/i.test(e.message))).toBe(true)
  })

  it('rejects cells with unknown terrain id', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map[2].terrain = 'lava'
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'hexmap.map[2].terrain' && /lava/.test(e.message))).toBe(true)
  })
})

describe('validateLevelPackage — terrain catalog', () => {
  it('rejects duplicate terrain ids', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes.push({ id: 'plains', name: 'Dup', color: '#fff', terrainDifficulty: 0 })
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path.startsWith('terrain.terrainTypes') && /duplicate/i.test(e.message))).toBe(true)
  })

  it('rejects terrain entry without id', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes.push({ name: 'NoId', color: '#fff' })
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => /id/.test(e.path))).toBe(true)
  })

  it('emits a warning when the legacy `terrainDifficuly` typo is present, normalizes it, and strips the legacy key', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0] = {
      id: 'plains',
      name: 'Plains',
      color: '#4CAF50',
      terrainDifficuly: 0
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => /terrainDifficuly/.test(w.message))).toBe(true)
    expect(result.package.terrain.terrainTypes[0].terrainDifficulty).toBe(0)
    // Normalized output must not carry the legacy key, otherwise a downstream
    // re-export (Builder saveMap, GameSnapshot embed) would write the typo
    // back to disk.
    expect('terrainDifficuly' in result.package.terrain.terrainTypes[0]).toBe(false)
  })

  it('warns and strips when both canonical `terrainDifficulty` and legacy `terrainDifficuly` are present (canonical wins)', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0] = {
      id: 'plains',
      name: 'Plains',
      color: '#4CAF50',
      terrainDifficulty: 3,
      terrainDifficuly: 9
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const warn = result.warnings.find(w => /terrainDifficuly/.test(w.message))
    expect(warn).toBeTruthy()
    expect(warn.message).toMatch(/ignored/)
    expect(result.package.terrain.terrainTypes[0].terrainDifficulty).toBe(3)
    expect('terrainDifficuly' in result.package.terrain.terrainTypes[0]).toBe(false)
  })

  it('warns and strips when canonical equals legacy (no value conflict, but still dual-write)', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0] = {
      id: 'plains',
      name: 'Plains',
      color: '#4CAF50',
      terrainDifficulty: 0,
      terrainDifficuly: 0
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const warn = result.warnings.find(w => /terrainDifficuly/.test(w.message))
    expect(warn).toBeTruthy()
    expect(warn.message).toMatch(/duplicates/)
    expect('terrainDifficuly' in result.package.terrain.terrainTypes[0]).toBe(false)
  })

  it('rejects negative or non-numeric terrainDifficulty', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0].terrainDifficulty = -1
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'terrain.terrainTypes[0].terrainDifficulty')).toBe(true)
  })

  it('rejects negative or non-numeric generationWeight', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0].generationWeight = -1
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'terrain.terrainTypes[0].generationWeight')).toBe(true)
  })

  it('accepts optional localized terrain labels while keeping plain name backward compatible', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0].labels = {
      en_US: 'Plains',
      uk_UA: 'Rivnyna'
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.terrain.terrainTypes[0]).toMatchObject({
      id: 'plains',
      name: 'Plains',
      labels: {
        en_US: 'Plains',
        uk_UA: 'Rivnyna'
      }
    })
  })

  it('rejects malformed terrain label maps when present', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0].labels = { en_US: '' }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'terrain.terrainTypes[0].labels.en_US')).toBe(true)
  })

  it('rejects terrain labels without name or default-locale fallback', () => {
    const pkg = makeValidPackage()
    delete pkg.terrain.terrainTypes[0].name
    pkg.terrain.terrainTypes[0].labels = { uk_UA: 'Rivnyna' }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'terrain.terrainTypes[0].name')).toBe(true)
  })

  it('rejects overlong terrain label keys and values', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0].labels = {
      en_US: 'Plains',
      ['x'.repeat(33)]: 'Bad',
      uk_UA: 'x'.repeat(121)
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === `terrain.terrainTypes[0].labels.${'x'.repeat(33)}`)).toBe(true)
    expect(result.errors.some(e => e.path === 'terrain.terrainTypes[0].labels.uk_UA')).toBe(true)
  })
})

describe('validateLevelPackage — units roster', () => {
  it('rejects unknown player keys (only player1 / player2 allowed)', () => {
    const pkg = makeValidPackage()
    pkg.units.player3 = { units: [] }
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => /player3/.test(e.path) || /player3/.test(e.message))).toBe(true)
  })

  it('rejects missing player section when other player exists', () => {
    const pkg = makeValidPackage()
    delete pkg.units.player2
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'units.player2')).toBe(true)
  })

  it('rejects duplicate unit type within same player roster', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units.push({
      type: 'infantry', name: 'Dup', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1
    })
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => /duplicate/i.test(e.message) && /infantry/.test(e.message))).toBe(true)
  })

  it('rejects unit with non-integer or negative count', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].count = -2
    let errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'units.player1.units[0].count')).toBe(true)
    const pkg2 = makeValidPackage()
    pkg2.units.player1.units[0].count = 1.5
    errors = validateLevelPackage(pkg2).errors
    expect(errors.some(e => e.path === 'units.player1.units[0].count')).toBe(true)
  })

  it('rejects unit with missing or non-string type', () => {
    const pkg = makeValidPackage()
    delete pkg.units.player1.units[0].type
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'units.player1.units[0].type')).toBe(true)
  })

  it('rejects unit with non-numeric stat (health/movement/attackRange/attackPower)', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].health = -1
    let errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'units.player1.units[0].health')).toBe(true)
    const pkg2 = makeValidPackage()
    pkg2.units.player1.units[0].movement = 'fast'
    errors = validateLevelPackage(pkg2).errors
    expect(errors.some(e => e.path === 'units.player1.units[0].movement')).toBe(true)
  })

  it('accepts a custom unit catalog type referenced by rosters', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType()],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.units.unitTypes[0]).toMatchObject({
      id: 'heavy_tank',
      name: 'Heavy Tank',
      losMode: 'direct_fire',
      attackAngle: 1
    })
  })

  it('accepts optional localized unit type labels and preserves them through normalization', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [
        heavyTankType({
          labels: {
            en_US: 'Heavy Tank',
            uk_UA: 'Vazhkyi Tank'
          }
        })
      ],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.units.unitTypes[0]).toMatchObject({
      id: 'heavy_tank',
      name: 'Heavy Tank',
      labels: {
        en_US: 'Heavy Tank',
        uk_UA: 'Vazhkyi Tank'
      }
    })
  })

  it('accepts unit type labels as the display fallback when plain name is absent', () => {
    const pkg = makeValidPackage()
    const unitType = heavyTankType({
      labels: {
        en_US: 'Heavy Tank',
        uk_UA: 'Vazhkyi Tank'
      }
    })
    delete unitType.name
    pkg.units = {
      unitTypes: [unitType],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.units.unitTypes[0].name).toBe('Heavy Tank')
  })

  it('rejects unit type labels without name or default-locale fallback', () => {
    const pkg = makeValidPackage()
    const unitType = heavyTankType({ labels: { uk_UA: 'Vazhkyi Tank' } })
    delete unitType.name
    pkg.units = {
      unitTypes: [unitType],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'units.unitTypes[0].name')).toBe(true)
  })

  it('rejects malformed unit type label maps when present', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType({ labels: { en_US: 42 } })],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'units.unitTypes[0].labels.en_US')).toBe(true)
  })

  it('rejects overlong unit type label keys and values', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType({
        labels: {
          en_US: 'Heavy Tank',
          ['x'.repeat(33)]: 'Bad',
          uk_UA: 'x'.repeat(121)
        }
      })],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === `units.unitTypes[0].labels.${'x'.repeat(33)}`)).toBe(true)
    expect(result.errors.some(e => e.path === 'units.unitTypes[0].labels.uk_UA')).toBe(true)
  })

  it('rejects roster types that are absent from an explicit unit catalog', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType()],
      player1: { units: [{ type: 'infantry', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'units.player1.units[0].type' &&
      /unknown unit type "infantry"/.test(e.message)
    )).toBe(true)
  })

  it('accepts legacy units without unitTypes and normalizes the default catalog', () => {
    const pkg = makeValidPackage()
    expect(pkg.units.unitTypes).toBeUndefined()
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.units.unitTypes.map(t => t.id)).toEqual(
      expect.arrayContaining([
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.armored,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.artillery,
        DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.scout
      ])
    )
    expect(result.package.units.player1.units[0].type).toBe(DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry)
  })

  it('validates unit catalog attackAngle and losMode', () => {
    const pkg = makeValidPackage()
    pkg.units.unitTypes = [heavyTankType({ attackAngle: 5, losMode: 'lob' })]
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'units.unitTypes[0].attackAngle')).toBe(true)
    expect(result.errors.some(e => e.path === 'units.unitTypes[0].losMode')).toBe(true)
  })

  it('accepts unit catalog attackAngle values 0 through 4', () => {
    for (const attackAngle of [0, 1, 2, 3, 4]) {
      const pkg = makeValidPackage()
      pkg.units = {
        unitTypes: [heavyTankType({ attackAngle })],
        player1: { units: [] },
        player2: { units: [] }
      }
      const result = validateLevelPackage(pkg)
      if (!result.ok) {
        throw new Error(`attackAngle ${attackAngle} should validate: ` + JSON.stringify(result.errors))
      }
      expect(result.package.units.unitTypes[0].attackAngle).toBe(attackAngle)
    }
  })

  it('validates row-level attackAngle overrides', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].attackAngle = 5
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'units.player1.units[0].attackAngle')).toBe(true)
  })

  it('accepts row-level attackAngle override values 0 through 4', () => {
    for (const attackAngle of [0, 1, 2, 3, 4]) {
      const pkg = makeValidPackage()
      pkg.units.player1.units[0].attackAngle = attackAngle
      const result = validateLevelPackage(pkg)
      if (!result.ok) {
        throw new Error(`row attackAngle ${attackAngle} should validate: ` + JSON.stringify(result.errors))
      }
      expect(result.package.units.player1.units[0].attackAngle).toBe(attackAngle)
    }
  })
})

describe('validateLevelPackage — spawn/base consistency', () => {
  it('rejects when active unit count exceeds player1 spawn slots', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].count = 99
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e =>
      e.path === 'units.player1' && /spawn/i.test(e.message) && /99/.test(e.message)
    )).toBe(true)
  })

  it('rejects when a player has units (count > 0) but no spawn or base hex', () => {
    const pkg = makeValidPackage()
    for (const cell of pkg.hexmap.map) {
      delete cell.player1Spawn
      delete cell.player1Base
    }
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => e.path === 'units.player1' && /no.*spawn/i.test(e.message))).toBe(true)
  })

  it('does not flag a player with zero total units even if they have no spawn slots', () => {
    const pkg = makeValidPackage()
    pkg.units.player2.units = pkg.units.player2.units.map(u => ({ ...u, count: 0 }))
    for (const cell of pkg.hexmap.map) {
      delete cell.player2Spawn
      delete cell.player2Base
    }
    const result = validateLevelPackage(pkg)
    expect(result.errors.filter(e => e.path === 'units.player2')).toEqual([])
  })
})

describe('validateLevelPackage — turntable', () => {
  it('rejects when Our_operations or Enemy_operations is missing or non-array', () => {
    const pkg = makeValidPackage()
    delete pkg.turntable.Our_operations
    let errors = validateLevelPackage(pkg).errors.map(e => e.path)
    expect(errors).toContain('turntable.Our_operations')

    const pkg2 = makeValidPackage()
    pkg2.turntable.Enemy_operations = 'not-array'
    errors = validateLevelPackage(pkg2).errors.map(e => e.path)
    expect(errors).toContain('turntable.Enemy_operations')
  })

  it('rejects when a phase dice grid does not have exactly 6 rows', () => {
    const pkg = makeValidPackage()
    pkg.turntable.Our_operations[0].moves[0].dice = [['move'], ['turn']]
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e =>
      e.path === 'turntable.Our_operations[0].moves[0].dice' && /6/.test(e.message)
    )).toBe(true)
  })

  it('emits a warning (not error) for unknown turntable action tokens', () => {
    const pkg = makeValidPackage()
    pkg.turntable.Our_operations[0].moves[0].dice[0] = ['teleport']
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => /teleport/.test(w.message))).toBe(true)
  })

  it('accepts the "-" no-op marker as a legal turntable token', () => {
    const pkg = makeValidPackage()
    // Already uses '-' in fixture; just confirm no warning/error mentions it
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.filter(w => /['"-]/.test(w.message) && /no-op/.test(w.message))).toEqual([])
  })

  it('rejects duplicate action tokens in the same D6 row', () => {
    const pkg = makeValidPackage()
    pkg.turntable.Enemy_operations[0].moves[0].dice[0] = ['move', 'turn', 'move']
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e =>
      e.path === 'turntable.Enemy_operations[0].moves[0].dice[0][2]' &&
      /duplicate/.test(e.message)
    )).toBe(true)
  })

  it('rejects rows that are not arrays of strings', () => {
    const pkg = makeValidPackage()
    pkg.turntable.Our_operations[0].moves[0].dice[0] = 'move'
    const errors = validateLevelPackage(pkg).errors
    expect(errors.some(e => /dice\[0\]/.test(e.path))).toBe(true)
  })
})

describe('validateLevelPackage — objectives', () => {
  it('accepts and normalizes legacy objective conditions to one primaryBlue objective', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [
        { type: 'eliminateUnits', targetPlayer: 'player2' },
        { type: 'occupyBase', actorPlayer: 'player1', targetPlayer: 'player2' },
        { type: 'surviveTurns', player: 'player1', rounds: 3 }
      ]
    }

    const result = validateLevelPackage(pkg)

    expect(result.ok).toBe(true)
    expect(result.package.objectives.mode).toBe('primaryBlue')
    expect(result.package.objectives.primary).toMatchObject({
      id: 'eliminateUnits_1',
      type: 'eliminateUnits',
      player: 'player1',
      targetPlayer: 'player2'
    })
    expect(result.warnings.some(w => w.path === 'objectives' && /legacy/i.test(w.message))).toBe(true)
    expect(result.warnings.some(w => w.path === 'objectives.conditions' && /multiple/i.test(w.message))).toBe(true)
    expect(result.warnings.some(w => w.path === 'objectives.conditions[2].rounds')).toBe(true)
  })

  it('accepts primaryBlue objectives v2', () => {
    const pkg = makeValidPackage()
    pkg.schemaVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
    pkg.objectives = {
      mode: 'primaryBlue',
      primary: {
        id: 'protect_blue_base',
        type: 'protectBase',
        player: 'player1',
        basePlayer: 'player1',
        deadlineTurns: 4
      }
    }

    const result = validateLevelPackage(pkg)

    expect(result.ok).toBe(true)
    expect(result.package.objectives).toEqual(pkg.objectives)
  })

  it('rejects an occupyBase objective when the target player has no base cell', () => {
    const pkg = makeValidPackage()
    for (const cell of pkg.hexmap.map) delete cell.player2Base
    pkg.objectives = {
      conditions: [
        { type: 'occupyBase', actorPlayer: 'player1', targetPlayer: 'player2' }
      ]
    }

    const result = validateLevelPackage(pkg)

    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'objectives.conditions[0].targetPlayer' &&
      /no base/i.test(e.message)
    )).toBe(true)
  })

  it('rejects duplicate objective ids and unknown objective types', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [
        { id: 'same', type: 'eliminateUnits', targetPlayer: 'player2' },
        { id: 'same', type: 'surviveTurns', player: 'player1', turns: 2 },
        { type: 'collectCoins', winner: 'player1' }
      ]
    }

    const result = validateLevelPackage(pkg)

    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'objectives.conditions[1].id')).toBe(true)
    expect(result.errors.some(e => e.path === 'objectives.conditions[2].type')).toBe(true)
  })
})

describe('validateLevelPackage — map completeness (code-review round 1)', () => {
  it('rejects a hexmap whose `map` is missing cells for the declared width×height', () => {
    const pkg = makeValidPackage()
    // Drop a single in-bounds cell; (1,1) is plains, no overlays, safe to remove
    pkg.hexmap.map = pkg.hexmap.map.filter(c => !(c.q === 1 && c.r === 1))
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'hexmap.map' && /missing/i.test(e.message) && /1.*1/.test(e.message)
    )).toBe(true)
  })

  it('lists multiple missing coordinates (capped) without crashing', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map = [pkg.hexmap.map[0]] // keep only (0,0)
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    const completenessErr = result.errors.find(e => e.path === 'hexmap.map' && /missing/i.test(e.message))
    expect(completenessErr).toBeTruthy()
  })

  it('still passes when every coordinate is present (no false positive on the canonical fixture)', () => {
    const pkg = makeValidPackage()
    const result = validateLevelPackage(pkg)
    expect(result.errors.filter(e => e.path === 'hexmap.map' && /missing/i.test(e.message))).toEqual([])
  })
})

describe('validateLevelPackage — unit type registry (code-review round 1)', () => {
  it('rejects unit definitions whose `type` is not in the canonical UNIT_TYPES registry', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].type = 'mech'
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'units.player1.units[0].type' && /mech/.test(e.message) && /unknown/i.test(e.message)
    )).toBe(true)
  })

  it('accepts every type currently in UNIT_TYPES (derived from the registry)', () => {
    const known = Object.keys(UNIT_TYPES)
    expect(known.length).toBeGreaterThan(0)
    for (const type of known) {
      const pkg = makeValidPackage()
      pkg.units.player1.units[0] = {
        type, name: 'X', health: 60, movement: 2, attackRange: 1, attackPower: 30, count: 1
      }
      pkg.units.player2.units[0] = {
        type, name: 'X', health: 60, movement: 2, attackRange: 1, attackPower: 30, count: 1
      }
      const result = validateLevelPackage(pkg)
      if (!result.ok) {
        throw new Error(`type "${type}" should validate: ` + JSON.stringify(result.errors))
      }
    }
  })
})

describe('validateLevelPackage — empty units (code-review round 1)', () => {
  it('rejects an empty `units: {}` object with errors for both missing rosters', () => {
    const pkg = makeValidPackage()
    pkg.units = {}
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    const paths = result.errors.map(e => e.path)
    expect(paths).toContain('units.player1')
    expect(paths).toContain('units.player2')
  })

  it('rejects missing player1 even when player2 has units', () => {
    const pkg = makeValidPackage()
    delete pkg.units.player1
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'units.player1')).toBe(true)
  })
})

describe('validateLevelPackage — overlay field types (code-review round 1)', () => {
  for (const field of ['player1Spawn', 'player1Base', 'player2Spawn', 'player2Base']) {
    it(`rejects non-boolean values in cell.${field} (e.g. the string "false")`, () => {
      const pkg = makeValidPackage()
      pkg.hexmap.map[0][field] = 'false'
      const result = validateLevelPackage(pkg)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e =>
        e.path === `hexmap.map[0].${field}` && /boolean/i.test(e.message)
      )).toBe(true)
    })
  }

  it('accepts both true and false as valid boolean overlay values', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map[2].player1Spawn = false
    pkg.hexmap.map[2].player2Base = false
    const result = validateLevelPackage(pkg)
    expect(result.errors.filter(e => /player1Spawn|player2Base/.test(e.path))).toEqual([])
  })
})

describe('validateLevelPackage — schemaVersion (Batch 4)', () => {
  it('treats a missing schemaVersion as legacy v0 and migrates with a warning', () => {
    const pkg = makeValidPackage()
    // makeValidPackage() does not include schemaVersion — that is the
    // legacy v0 shape this batch is migrating away from.
    expect('schemaVersion' in pkg).toBe(false)
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'schemaVersion' && /legacy/i.test(w.message)
    )).toBe(true)
    expect(result.package.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)
  })

  it('accepts an explicit current schemaVersion without any migration warning', () => {
    const pkg = makeValidPackage()
    pkg.schemaVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.path === 'schemaVersion')).toBe(false)
    expect(result.package.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)
  })

  it('rejects an unsupported (future) schemaVersion as a hard error', () => {
    const pkg = makeValidPackage()
    pkg.schemaVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION + 99
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'schemaVersion' && /unsupported/i.test(e.message)
    )).toBe(true)
  })

  it('rejects a non-integer or zero schemaVersion as a hard error', () => {
    const cases = [0, -1, 1.5, '1', true]
    for (const bad of cases) {
      const pkg = makeValidPackage()
      pkg.schemaVersion = bad
      const result = validateLevelPackage(pkg)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true)
    }
  })
})

describe('validateLevelPackage - package id safety', () => {
  it('rejects ids that cannot be used as level directory or file prefixes', () => {
    for (const badId of ['../escape', 'foo/bar', 'has space', 'dot.id']) {
      const pkg = makeValidPackage()
      pkg.id = badId
      const result = validateLevelPackage(pkg)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e =>
        e.path === 'id' && /must match/.test(e.message)
      )).toBe(true)
    }
  })

  it('accepts safe level ids', () => {
    const pkg = makeValidPackage()
    pkg.id = 'level_007-test'
    const result = validateLevelPackage(pkg)
    expect(result.errors.some(e => e.path === 'id')).toBe(false)
  })

  it('normalizes surrounding whitespace from otherwise-safe ids', () => {
    const pkg = makeValidPackage()
    pkg.id = ' level_007-test '
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.id).toBe('level_007-test')
  })
})

describe('validateLevelPackage — maxTerrainDifficuly migration (Batch 4)', () => {
  it('emits a warning when the legacy `maxTerrainDifficuly` typo is present, normalizes it, and strips the legacy key', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0] = {
      type: 'infantry', name: 'Infantry', health: 60, movement: 4,
      attackRange: 1, attackPower: 30, maxTerrainDifficuly: 7, count: 1
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'units.player1.units[0].maxTerrainDifficuly' &&
      /maxTerrainDifficuly/.test(w.message) &&
      /maxTerrainDifficulty/.test(w.message)
    )).toBe(true)
    expect(result.package.units.player1.units[0].maxTerrainDifficulty).toBe(7)
    // Same anti-redownstream-write guarantee as for terrainDifficuly.
    expect('maxTerrainDifficuly' in result.package.units.player1.units[0]).toBe(false)
  })

  it('does not migrate when canonical maxTerrainDifficulty is already set', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0] = {
      type: 'infantry', name: 'Infantry', health: 60, movement: 4,
      attackRange: 1, attackPower: 30, maxTerrainDifficulty: 4, count: 1
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => /maxTerrainDifficuly/.test(w.path))).toBe(false)
    expect(result.package.units.player1.units[0].maxTerrainDifficulty).toBe(4)
  })

  it('warns and strips when both canonical and legacy max-difficulty fields are present (canonical wins)', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0] = {
      type: 'infantry', name: 'Infantry', health: 60, movement: 4,
      attackRange: 1, attackPower: 30,
      maxTerrainDifficulty: 5,
      maxTerrainDifficuly: 99,
      count: 1
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const warn = result.warnings.find(w => /maxTerrainDifficuly/.test(w.path))
    expect(warn).toBeTruthy()
    expect(warn.message).toMatch(/ignored/)
    expect(result.package.units.player1.units[0].maxTerrainDifficulty).toBe(5)
    expect('maxTerrainDifficuly' in result.package.units.player1.units[0]).toBe(false)
  })

  it('rejects negative or non-numeric maxTerrainDifficulty', () => {
    const pkg = makeValidPackage()
    pkg.units.player1.units[0].maxTerrainDifficulty = -1
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'units.player1.units[0].maxTerrainDifficulty'
    )).toBe(true)
  })
})

describe('validateLevelPackage — cells without terrain', () => {
  it('warns (not errors) when a cell has terrain: null and the catalog has "plains"', () => {
    const pkg = makeValidPackage()
    pkg.hexmap.map[3].terrain = null // (1,1), no overlays
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const warn = result.warnings.find(w => w.path === 'hexmap.map' && /no terrain/i.test(w.message))
    expect(warn).toBeTruthy()
    expect(warn.message).toMatch(/fall back/i)
    expect(warn.message).toMatch(/"plains"/)
    expect(warn.message).toMatch(/\(1,1\)/)
  })

  it('treats an absent terrain key the same as terrain: null', () => {
    const pkg = makeValidPackage()
    delete pkg.hexmap.map[3].terrain
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.path === 'hexmap.map' && /no terrain/i.test(w.message))).toBe(true)
  })

  it('errors when a cell has no terrain and the catalog has no "plains" entry (engine would invent a synthetic terrain)', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes = [
      { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
    ]
    for (const cell of pkg.hexmap.map) cell.terrain = 'forest'
    pkg.hexmap.map[3].terrain = null
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'hexmap.map' &&
      /no terrain/i.test(e.message) &&
      /"plains"/.test(e.message) &&
      /synthetic/i.test(e.message)
    )).toBe(true)
  })

  it('aggregates many terrain-less cells into one warning with a count and the first 3 coordinates', () => {
    const pkg = makeValidPackage()
    for (const cell of pkg.hexmap.map) cell.terrain = null
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const warns = result.warnings.filter(w => w.path === 'hexmap.map' && /no terrain/i.test(w.message))
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toMatch(/6 cell/)
    expect(warns[0].message).toMatch(/\(0,0\), \(1,0\), \(0,1\)/)
    expect(warns[0].message).toMatch(/\+3 more/)
  })

  it('does not warn when every cell has a known terrain', () => {
    const result = validateLevelPackage(makeValidPackage())
    expect(result.warnings.filter(w => /no terrain/i.test(w.message))).toEqual([])
  })
})

describe('validateLevelPackage — unit catalog author extras', () => {
  it('preserves non-canonical author fields on catalog entries while canonical fields win and legacy alias keys are stripped', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType({
        description: 'Breakthrough armor',
        rotateUnitIcon: true,
        maxTerrainDifficuly: 99, // legacy typo next to canonical maxTerrainDifficulty: 3
        maxHealth: 999 // legacy alias next to canonical health: 120
      })],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const entry = result.package.units.unitTypes[0]
    expect(entry.description).toBe('Breakthrough armor')
    expect(entry.rotateUnitIcon).toBe(true)
    // Canonical values win over legacy aliases.
    expect(entry.maxTerrainDifficulty).toBe(3)
    expect(entry.health).toBe(120)
    // Legacy alias keys must not survive into the normalized package, or a
    // downstream re-export (Builder saveMap, GameSnapshot embed) would write
    // them back to disk.
    expect('maxTerrainDifficuly' in entry).toBe(false)
    expect('maxHealth' in entry).toBe(false)
  })

  it('keeps unit catalog extras across validate → re-validate (idempotent normalization)', () => {
    const pkg = makeValidPackage()
    pkg.units = {
      unitTypes: [heavyTankType({ description: 'Breakthrough armor', rotateUnitIcon: false })],
      player1: { units: [{ type: 'heavy_tank', count: 1 }] },
      player2: { units: [] }
    }
    const first = validateLevelPackage(pkg)
    expect(first.ok).toBe(true)
    const second = validateLevelPackage(first.package)
    expect(second.ok).toBe(true)
    const entry = second.package.units.unitTypes[0]
    expect(entry.description).toBe('Breakthrough armor')
    expect(entry.rotateUnitIcon).toBe(false)
    expect(entry).toMatchObject({
      id: 'heavy_tank',
      name: 'Heavy Tank',
      health: 120,
      maxTerrainDifficulty: 3,
      losMode: 'direct_fire'
    })
  })
})

describe('validateLevelPackage — legacy surviveTurns deadline clamp', () => {
  it('raises legacy surviveTurns turns=1 to deadlineTurns=2 with a warning and a re-validatable package', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 1 }]
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'objectives.conditions[0].turns' &&
      /turns=1/.test(w.message) &&
      /deadlineTurns=2/.test(w.message)
    )).toBe(true)
    expect(result.package.objectives.primary).toMatchObject({
      type: 'surviveTurns',
      player: 'player1',
      deadlineTurns: 2
    })
    // GameSnapshot import re-validates the embedded normalized package; the
    // migrated objective must pass the canonical deadlineTurns >= 2 rule.
    const second = validateLevelPackage(result.package)
    expect(second.ok).toBe(true)
  })

  it('does not clamp legacy surviveTurns when turns >= 2', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 3 }]
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.objectives.primary.deadlineTurns).toBe(3)
    expect(result.warnings.some(w => /raised to deadlineTurns/.test(w.message))).toBe(false)
  })

  it('still rejects legacy surviveTurns with non-positive turns', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 0 }]
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'objectives.conditions[0].turns')).toBe(true)
  })
})

describe('validateLevelPackage — legacy protectBase conditions', () => {
  it('warns when a legacy protectBase condition is dropped by the migration', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [
        { id: 'guard_hq', type: 'protectBase', winner: 'player1' },
        { type: 'eliminateUnits', targetPlayer: 'player2' }
      ]
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'objectives.conditions[0]' &&
      /protectBase/.test(w.message) &&
      /dropped/.test(w.message) &&
      /guard_hq/.test(w.message)
    )).toBe(true)
    // The remaining Blue condition still becomes the migrated primary.
    expect(result.package.objectives.primary).toMatchObject({
      type: 'eliminateUnits',
      player: 'player1',
      targetPlayer: 'player2'
    })
  })

  it('falls back to the default Blue eliminateUnits when protectBase was the only legacy condition', () => {
    const pkg = makeValidPackage()
    pkg.objectives = {
      conditions: [{ type: 'protectBase', winner: 'player1' }]
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'objectives.conditions[0]' &&
      /protectBase/.test(w.message) &&
      /dropped/.test(w.message)
    )).toBe(true)
    expect(result.warnings.some(w =>
      w.path === 'objectives.conditions' && /no Blue condition/i.test(w.message)
    )).toBe(true)
    expect(result.package.objectives.primary).toMatchObject({
      id: 'blue_primary',
      type: 'eliminateUnits',
      player: 'player1',
      targetPlayer: 'player2'
    })
  })
})

describe('validateLevelPackage — legacy v0 → v1 round trip (Batch 4)', () => {
  it('migrates a fully-legacy package (no schemaVersion + both typos) to canonical v1', () => {
    const pkg = makeValidPackage()
    // No schemaVersion → legacy v0.
    // Terrain typo: terrainDifficuly instead of terrainDifficulty.
    pkg.terrain.terrainTypes[0] = {
      id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficuly: 0
    }
    // Unit typo: maxTerrainDifficuly instead of maxTerrainDifficulty.
    pkg.units.player1.units[0] = {
      type: 'infantry', name: 'Infantry', health: 60, movement: 4,
      attackRange: 1, attackPower: 30, maxTerrainDifficuly: 5, count: 2
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    // All three migrations fired.
    const warnPaths = result.warnings.map(w => w.path)
    expect(warnPaths).toEqual(expect.arrayContaining([
      'schemaVersion',
      'terrain.terrainTypes[0].terrainDifficuly',
      'units.player1.units[0].maxTerrainDifficuly'
    ]))
    // Normalized package carries canonical names + current schemaVersion.
    expect(result.package.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)
    expect(result.package.terrain.terrainTypes[0].terrainDifficulty).toBe(0)
    expect(result.package.units.player1.units[0].maxTerrainDifficulty).toBe(5)
    // And the legacy keys are absent — a re-export through Builder or
    // GameSnapshot must not reintroduce the typo onto disk.
    expect('terrainDifficuly' in result.package.terrain.terrainTypes[0]).toBe(false)
    expect('maxTerrainDifficuly' in result.package.units.player1.units[0]).toBe(false)
  })
})

describe('validateLevelPackage — terrain passable field', () => {
  it('preserves passable:false on a terrain type and stays ok across re-validate', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes.push({
      id: 'wall', name: 'Wall', color: '#666666', terrainDifficulty: 0, passable: false
    })
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    const wall = result.package.terrain.terrainTypes.find(t => t.id === 'wall')
    expect(wall.passable).toBe(false)
    // Idempotent: the normalized package must re-validate and keep the flag, so
    // a GameSnapshot embed / Builder re-export round-trips the opt-in wall.
    const second = validateLevelPackage(result.package)
    expect(second.ok).toBe(true)
    expect(second.package.terrain.terrainTypes.find(t => t.id === 'wall').passable).toBe(false)
  })

  it('preserves passable:true on a terrain type without altering it', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0] = {
      id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0, passable: true
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    expect(result.package.terrain.terrainTypes[0].passable).toBe(true)
  })

  it('leaves terrain types without a passable field untouched (no field added)', () => {
    const pkg = makeValidPackage()
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(true)
    for (const entry of result.package.terrain.terrainTypes) {
      expect('passable' in entry).toBe(false)
    }
  })

  it('rejects a non-boolean passable on a terrain type', () => {
    const pkg = makeValidPackage()
    pkg.terrain.terrainTypes[0] = {
      id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0, passable: 'false'
    }
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e =>
      e.path === 'terrain.terrainTypes[0].passable' && /strict boolean/.test(e.message)
    )).toBe(true)
  })
})
