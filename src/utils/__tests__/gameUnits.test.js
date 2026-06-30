import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UNIT_CATALOG,
  DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID,
  GameUnit,
  UNIT_TYPES,
  createUnit,
  createUnitFromDefinition,
  makePlacementUnitId,
  normalizeUnitCatalog,
  resolveUnitTypeDef,
  unitCatalogToMap
} from '@/domain/engine/gameUnits.js'

describe('makePlacementUnitId', () => {
  it('builds p1_inf1 / p2_art1 style ids', () => {
    expect(makePlacementUnitId('player1', 'infantry', 1)).toBe('p1_inf1')
    expect(makePlacementUnitId('player1', 'infantry', 2)).toBe('p1_inf2')
    expect(makePlacementUnitId('player2', 'artillery', 1)).toBe('p2_art1')
    expect(makePlacementUnitId('player2', 'armored', 1)).toBe('p2_arm1')
  })
})

describe('unit catalog helpers', () => {
  it('exposes default catalog entries with stable ids and losMode', () => {
    const ids = DEFAULT_UNIT_CATALOG.map(entry => entry.id)
    expect(ids).toEqual(expect.arrayContaining([
      DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.infantry,
      DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.armored,
      DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.artillery,
      DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.scout
    ]))
    expect(DEFAULT_UNIT_CATALOG.find(entry => entry.id === DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID.artillery).losMode).toBe('artillery')
  })

  it('normalizes custom catalog rows and resolves by id', () => {
    const catalog = normalizeUnitCatalog([
      {
        id: 'heavy_tank',
        name: 'Heavy Tank',
        health: 120,
        movement: 2,
        attackRange: 2,
        attackAngle: 4,
        attackPower: 65,
        maxTerrainDifficulty: 3,
        losMode: 'direct_fire',
        iconKey: 'armored'
      }
    ])
    const byId = unitCatalogToMap(catalog)
    expect(resolveUnitTypeDef('heavy_tank', byId)).toMatchObject({
      id: 'heavy_tank',
      health: 120,
      attackAngle: 4,
      iconKey: 'armored'
    })
  })

  it('preserves optional localized labels on custom catalog rows', () => {
    const catalog = normalizeUnitCatalog([
      {
        id: 'heavy_tank',
        name: 'Heavy Tank',
        labels: {
          en_US: 'Heavy Tank',
          uk_UA: 'Vazhkyi Tank'
        },
        health: 120,
        movement: 2,
        attackRange: 2,
        attackAngle: 1,
        attackPower: 65,
        maxTerrainDifficulty: 3,
        losMode: 'direct_fire',
        iconKey: 'armored'
      }
    ])
    expect(catalog[0].labels).toEqual({
      en_US: 'Heavy Tank',
      uk_UA: 'Vazhkyi Tank'
    })
  })

  it('creates runtime units from custom definitions without the static registry', () => {
    const unit = createUnitFromDefinition({
      id: 'rocket_team',
      name: 'Rocket Team',
      health: 45,
      movement: 2,
      attackRange: 4,
      attackAngle: 3,
      attackPower: 80,
      maxTerrainDifficulty: 5,
      losMode: 'artillery',
      iconKey: 'unknown'
    }, {
      id: 'p1_roc1',
      player: 'player1'
    })
    expect(unit).toBeInstanceOf(GameUnit)
    expect(unit.type).toBe('rocket_team')
    expect(unit.losMode).toBe('artillery')
    expect(unit.attackAngle).toBe(3)
    expect(unit.maxTerrainDifficulty).toBe(5)
  })
})

describe('createUnit health initialisation', () => {
  it('createUnit health equals maxHealth for every built-in type', () => {
    for (const type of Object.keys(UNIT_TYPES)) {
      const unit = createUnit(type)
      expect(unit.health).toBe(unit.maxHealth)
      expect(unit.health).toBe(UNIT_TYPES[type].maxHealth)
    }
  })

  it('explicit health override in options takes precedence', () => {
    const unit = createUnit('infantry', { health: 30 })
    expect(unit.health).toBe(30)
    expect(unit.maxHealth).toBe(UNIT_TYPES.infantry.maxHealth)
  })
})
