import { describe, expect, it } from 'vitest'
import {
  builderStateToPackage,
  packageToBuilderState,
  detectSection,
  mergeSectionsIntoPackage,
  SECTION_FILENAME_SUFFIX,
  sprinkleTerrainSeeds,
  copyTurntableSide
} from '../builderPackage.js'
import { validateLevelPackage, LATEST_LEVEL_PACKAGE_SCHEMA_VERSION } from '../validateLevelPackage.js'

/**
 * Builder-shaped hex (logical fields only). The real component carries
 * extra geometry — `points`, `innerPoints`, `center`, `x`, `y` — that
 * the helpers must ignore on export.
 */
function builderHex(q, r, terrainId, overlays = {}) {
  return {
    q,
    r,
    x: 0, y: 0,
    points: 'unused', innerPoints: 'unused',
    center: { x: 0, y: 0 },
    terrain: { id: terrainId, name: terrainId, color: '#000' },
    player1Spawn: !!overlays.player1Spawn,
    player1Base: !!overlays.player1Base,
    player2Spawn: !!overlays.player2Spawn,
    player2Base: !!overlays.player2Base
  }
}

function defaultTerrainTypes() {
  return [
    { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
    { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
  ]
}

function defaultUnitsData() {
  return {
    player1: {
      units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ]
    },
    player2: {
      units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ]
    }
  }
}

function defaultTurntableData() {
  const diceBlock = () => [['move'], ['move'], ['turn'], ['-'], ['move'], ['turn']]
  const ops = (title) => [{ title, moves: [{ title: 'x1 dice', dice: diceBlock() }] }]
  return {
    Our_operations: [...ops('MANOEUVRE'), ...ops('ATTACK')],
    Enemy_operations: [...ops('MANOEUVRE'), ...ops('ATTACK')]
  }
}

/** Full 2×2 builder state that should validate against the LevelPackage schema. */
function fullBuilderState() {
  return {
    levelId: 'test_level',
    mapParams: { width: 2, height: 2, availableTerrain: ['plains'], zoom: 1.5 },
    generatedMap: [
      builderHex(0, 0, 'plains', { player1Spawn: true, player1Base: true }),
      builderHex(1, 0, 'plains'),
      builderHex(0, 1, 'forest', { player2Spawn: true, player2Base: true }),
      builderHex(1, 1, 'plains')
    ],
    terrainTypes: defaultTerrainTypes(),
    unitsData: defaultUnitsData(),
    turntableData: defaultTurntableData()
  }
}

describe('builderStateToPackage', () => {
  it('assembles a LevelPackage with all gameplay sections', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    expect(pkg.id).toBe('test_level')
    expect(pkg.hexmap.parameters.width).toBe(2)
    expect(pkg.hexmap.parameters.height).toBe(2)
    expect(pkg.hexmap.map).toHaveLength(4)
    expect(pkg.terrain.terrainTypes).toHaveLength(2)
    expect(pkg.units.player1.units[0].type).toBe('infantry')
    expect(Array.isArray(pkg.turntable.Our_operations)).toBe(true)
    expect(pkg.objectives).toMatchObject({
      mode: 'primaryBlue',
      primary: {
        type: 'eliminateUnits',
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('emits terrain id as a string (not the full terrain object)', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    for (const cell of pkg.hexmap.map) {
      expect(typeof cell.terrain).toBe('string')
    }
  })

  it('omits overlay flags that are not strictly true', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    const empty = pkg.hexmap.map.find(c => c.q === 1 && c.r === 0)
    expect('player1Spawn' in empty).toBe(false)
    expect('player1Base' in empty).toBe(false)
    expect('player2Spawn' in empty).toBe(false)
    expect('player2Base' in empty).toBe(false)
    const p1 = pkg.hexmap.map.find(c => c.q === 0 && c.r === 0)
    expect(p1.player1Spawn).toBe(true)
    expect(p1.player1Base).toBe(true)
    expect('player2Spawn' in p1).toBe(false)
  })

  it('falls back to "level_000" when levelId is missing or blank', () => {
    const a = builderStateToPackage({ ...fullBuilderState(), levelId: '' })
    const b = builderStateToPackage({ ...fullBuilderState(), levelId: undefined })
    expect(a.id).toBe('level_000')
    expect(b.id).toBe('level_000')
  })

  it('preserves Builder-only hints in hexmap.parameters (availableTerrain, zoom)', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    expect(pkg.hexmap.parameters.availableTerrain).toEqual(['plains'])
    expect(pkg.hexmap.parameters.zoom).toBe(1.5)
  })

  it('throws on non-object input', () => {
    expect(() => builderStateToPackage(null)).toThrow(TypeError)
    expect(() => builderStateToPackage('string')).toThrow(TypeError)
  })

  it('produces a package that passes validateLevelPackage', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('expected ok, got errors: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.ok).toBe(true)
  })
})

describe('packageToBuilderState', () => {
  it('hydrates cell seeds with terrain id strings and overlay booleans', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    const state = packageToBuilderState(pkg)
    expect(state.levelId).toBe('test_level')
    expect(state.mapParams.width).toBe(2)
    expect(state.cellSeeds).toHaveLength(4)
    const corner = state.cellSeeds.find(s => s.q === 0 && s.r === 0)
    expect(corner.terrainId).toBe('plains')
    expect(corner.player1Spawn).toBe(true)
    expect(corner.player1Base).toBe(true)
    expect(corner.player2Spawn).toBe(false)
    expect(corner.player2Base).toBe(false)
  })

  it('returns empty defaults when sections are missing', () => {
    const state = packageToBuilderState({})
    expect(state.cellSeeds).toEqual([])
    expect(state.terrainTypes).toEqual([])
    expect(state.unitsData).toEqual({})
    expect(state.turntableData).toEqual({})
  })

  it('survives a round-trip: package → builder seeds → package equals original cells', () => {
    const original = builderStateToPackage(fullBuilderState())
    const state = packageToBuilderState(original)
    // Rebuild a builder-shaped map from seeds so we can re-export.
    const rebuiltMap = state.cellSeeds.map(seed => ({
      q: seed.q,
      r: seed.r,
      terrain: state.terrainTypes.find(t => t.id === seed.terrainId) || { id: seed.terrainId },
      player1Spawn: seed.player1Spawn,
      player1Base: seed.player1Base,
      player2Spawn: seed.player2Spawn,
      player2Base: seed.player2Base
    }))
    const reExported = builderStateToPackage({
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: rebuiltMap,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    })
    expect(reExported).toEqual(original)
  })

  it('preserves units.unitTypes through builder package round-trip', () => {
    const original = builderStateToPackage({
      ...fullBuilderState(),
      unitsData: {
        unitTypes: [
          {
            id: 'heavy_tank',
            name: 'Heavy Tank',
            health: 120,
            movement: 2,
            attackRange: 2,
            attackAngle: 1,
            attackPower: 65,
            maxTerrainDifficulty: 3,
            losMode: 'direct_fire',
            iconKey: 'armored'
          }
        ],
        player1: { units: [{ type: 'heavy_tank', count: 1 }] },
        player2: { units: [] }
      }
    })
    const state = packageToBuilderState(original)
    const rebuiltMap = state.cellSeeds.map(seed => ({
      q: seed.q,
      r: seed.r,
      terrain: state.terrainTypes.find(t => t.id === seed.terrainId) || { id: seed.terrainId },
      player1Spawn: seed.player1Spawn,
      player1Base: seed.player1Base,
      player2Spawn: seed.player2Spawn,
      player2Base: seed.player2Base
    }))
    const reExported = builderStateToPackage({
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: rebuiltMap,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    })
    expect(reExported.units.unitTypes).toEqual(original.units.unitTypes)
    expect(reExported.units.player1.units).toEqual([{ type: 'heavy_tank', count: 1 }])
  })

  it('throws on non-object input', () => {
    expect(() => packageToBuilderState(null)).toThrow(TypeError)
  })
})

describe('detectSection', () => {
  it('detects a full package shape', () => {
    const pkg = builderStateToPackage(fullBuilderState())
    expect(detectSection(pkg)).toBe('package')
  })

  it('detects hexmap shape (and treats legacy single-file saveMap output as hexmap)', () => {
    const hexmap = { parameters: { width: 2, height: 2 }, map: [{ q: 0, r: 0, terrain: 'plains' }] }
    expect(detectSection(hexmap)).toBe('hexmap')
    const legacy = { parameters: { width: 3, height: 3 }, map: [], metadata: { version: '1.0' } }
    expect(detectSection(legacy)).toBe('hexmap')
  })

  it('detects terrain catalog shape', () => {
    expect(detectSection({ terrainTypes: [] })).toBe('terrain')
  })

  it('detects turntable shape', () => {
    expect(detectSection({ Our_operations: [], Enemy_operations: [] })).toBe('turntable')
    expect(detectSection({ Our_operations: [] })).toBe('turntable')
  })

  it('detects objectives shape', () => {
    expect(detectSection({ conditions: [] })).toBe('objectives')
    expect(detectSection({
      mode: 'primaryBlue',
      primary: { type: 'eliminateUnits', player: 'player1', targetPlayer: 'player2' }
    })).toBe('objectives')
  })

  it('detects units shape (and tolerates partial player roster)', () => {
    expect(detectSection({ player1: { units: [] }, player2: { units: [] } })).toBe('units')
    expect(detectSection({ player1: { units: [] } })).toBe('units')
    expect(detectSection({ unitTypes: [] })).toBe('units')
  })

  it('returns null for unknown shapes', () => {
    expect(detectSection(null)).toBeNull()
    expect(detectSection([])).toBeNull()
    expect(detectSection('text')).toBeNull()
    expect(detectSection({ foo: 'bar' })).toBeNull()
  })
})

describe('mergeSectionsIntoPackage — schemaVersion hoist for hexmap section', () => {
  it('forward schemaVersion in hexmap.parameters causes validateLevelPackage to reject (forward-version error)', () => {
    // A hexmap section carrying a future schema version (LATEST+1) must surface
    // as a validator error, not silently import with the base stamp of LATEST.
    const futureVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION + 1
    const hexmapBody = {
      parameters: {
        schemaVersion: futureVersion,
        width: 2,
        height: 2,
        availableTerrain: ['plains']
      },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 0, r: 1, terrain: 'forest', player2Spawn: true, player2Base: true },
        { q: 1, r: 1, terrain: 'plains' }
      ]
    }
    const { pkg } = mergeSectionsIntoPackage(
      [{ section: 'hexmap', body: hexmapBody }],
      fullBuilderState()
    )
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /unsupported schemaVersion/.test(e.message))).toBe(true)
  })

  it('hexmap section without schemaVersion in parameters causes legacy migration warning', () => {
    // A hexmap file without parameters.schemaVersion is a legacy (v0) file.
    // After merging, the assembled package must carry no schemaVersion so the
    // validator emits the "migrating to vN" warning, not silently accept it as LATEST.
    const hexmapBody = {
      parameters: {
        width: 2,
        height: 2,
        availableTerrain: ['plains']
        // no schemaVersion
      },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 0, r: 1, terrain: 'forest', player2Spawn: true, player2Base: true },
        { q: 1, r: 1, terrain: 'plains' }
      ]
    }
    const { pkg } = mergeSectionsIntoPackage(
      [{ section: 'hexmap', body: hexmapBody }],
      fullBuilderState()
    )
    expect(pkg.schemaVersion).toBeUndefined()
    const result = validateLevelPackage(pkg)
    expect(result.warnings.some(w => /migrating/i.test(w.message))).toBe(true)
  })

  it('archives with both package and hexmap sections: the later section determines schemaVersion', () => {
    // Mirrors the Playground loaders' post-loop hoist: the version embedded in
    // hexmap.parameters of the FINAL assembled package wins, so section order
    // decides which hexmap (standalone section vs the one inside the package
    // body) supplies the version — and nothing else about ordering matters.
    const futureVersion = LATEST_LEVEL_PACKAGE_SCHEMA_VERSION + 1
    const hexmapBody = {
      parameters: {
        schemaVersion: futureVersion,
        width: 2,
        height: 2,
        availableTerrain: ['plains']
      },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 0, r: 1, terrain: 'forest', player2Spawn: true, player2Base: true },
        { q: 1, r: 1, terrain: 'plains' }
      ]
    }
    // Full builder-exported package body: top-level schemaVersion = LATEST and
    // the same LATEST embedded in hexmap.parameters.
    const packageBody = builderStateToPackage(fullBuilderState())
    expect(packageBody.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)
    expect(packageBody.hexmap.parameters.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)

    const packageLast = mergeSectionsIntoPackage(
      [
        { section: 'hexmap', body: hexmapBody },
        { section: 'package', body: packageBody }
      ],
      fullBuilderState()
    )
    expect(packageLast.pkg.schemaVersion).toBe(LATEST_LEVEL_PACKAGE_SCHEMA_VERSION)

    const hexmapLast = mergeSectionsIntoPackage(
      [
        { section: 'package', body: packageBody },
        { section: 'hexmap', body: hexmapBody }
      ],
      fullBuilderState()
    )
    expect(hexmapLast.pkg.schemaVersion).toBe(futureVersion)
  })
})

describe('mergeSectionsIntoPackage', () => {
  it('overrides individual sections from current builder state', () => {
    const base = fullBuilderState()
    const newTerrain = {
      terrainTypes: [
        { id: 'plains', name: 'P', color: '#000', terrainDifficulty: 0 },
        { id: 'forest', name: 'F', color: '#111', terrainDifficulty: 1 },
        { id: 'water', name: 'W', color: '#222', terrainDifficulty: 2 }
      ]
    }
    const { pkg, appliedSections } = mergeSectionsIntoPackage(
      [{ section: 'terrain', body: newTerrain }],
      base
    )
    expect(appliedSections).toEqual(['terrain'])
    expect(pkg.terrain.terrainTypes).toHaveLength(3)
    expect(pkg.hexmap.parameters.width).toBe(2) // unchanged from base
  })

  it('a "package" entry replaces the whole candidate', () => {
    const base = fullBuilderState()
    const replacement = builderStateToPackage({ ...fullBuilderState(), levelId: 'other_level' })
    const { pkg, appliedSections } = mergeSectionsIntoPackage(
      [{ section: 'package', body: replacement }],
      base
    )
    expect(appliedSections).toEqual(['package'])
    expect(pkg.id).toBe('other_level')
  })

  it('ignores entries with unknown section or non-object body', () => {
    const base = fullBuilderState()
    const { pkg, appliedSections } = mergeSectionsIntoPackage(
      [
        { section: 'nope', body: { x: 1 } },
        { section: 'terrain', body: null },
        null
      ],
      base
    )
    expect(appliedSections).toEqual([])
    expect(pkg.terrain.terrainTypes).toHaveLength(2)
  })

  it('merges an objectives section', () => {
    const objectives = {
      mode: 'firstSatisfied',
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 3 }]
    }
    const { pkg, appliedSections } = mergeSectionsIntoPackage(
      [{ section: 'objectives', body: objectives }],
      fullBuilderState()
    )
    expect(appliedSections).toEqual(['objectives'])
    expect(pkg.objectives).toEqual(objectives)
  })
})

describe('Builder export ↔ validateLevelPackage acceptance', () => {
  it('export is blocked semantics: missing spawn slots produce validator errors', () => {
    // Builder state with units but no spawn hexes on the map.
    const broken = {
      ...fullBuilderState(),
      generatedMap: [
        builderHex(0, 0, 'plains'),
        builderHex(1, 0, 'plains'),
        builderHex(0, 1, 'plains'),
        builderHex(1, 1, 'plains')
      ]
    }
    const pkg = builderStateToPackage(broken)
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /spawn/i.test(e.message))).toBe(true)
  })

  it('export with an unknown unit type is blocked by validator', () => {
    const broken = {
      ...fullBuilderState(),
      unitsData: {
        player1: { units: [{ type: 'mecha', count: 1, health: 50, movement: 1, attackRange: 1, attackPower: 10 }] },
        player2: { units: [{ type: 'infantry', count: 1, health: 60, movement: 4, attackRange: 1, attackPower: 30 }] }
      }
    }
    const pkg = builderStateToPackage(broken)
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /unknown unit type "mecha"/.test(e.message))).toBe(true)
  })

  it('export blocked when map is incomplete for declared dimensions', () => {
    const broken = {
      ...fullBuilderState(),
      generatedMap: [
        // missing (1,1)
        builderHex(0, 0, 'plains', { player1Spawn: true, player1Base: true }),
        builderHex(1, 0, 'plains'),
        builderHex(0, 1, 'forest', { player2Spawn: true, player2Base: true })
      ]
    }
    const pkg = builderStateToPackage(broken)
    const result = validateLevelPackage(pkg)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /missing \d+ cell/.test(e.message))).toBe(true)
  })
})

describe('SECTION_FILENAME_SUFFIX', () => {
  it('matches the suffixes loadLevelPackage expects on disk', () => {
    expect(SECTION_FILENAME_SUFFIX.hexmap).toBe('_hexmap.json')
    expect(SECTION_FILENAME_SUFFIX.terrain).toBe('_terrain.json')
    expect(SECTION_FILENAME_SUFFIX.units).toBe('_units.json')
    expect(SECTION_FILENAME_SUFFIX.turntable).toBe('_turntable.json')
    expect(SECTION_FILENAME_SUFFIX.objectives).toBe('_objectives.json')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(SECTION_FILENAME_SUFFIX)).toBe(true)
  })
})

describe('sprinkleTerrainSeeds', () => {
  const baseInput = () => ({
    width: 4,
    height: 3,
    availableTerrain: ['plains', 'forest', 'water'],
    seed: 'fixture-seed'
  })

  it('returns row-major (q, r) coverage of the whole board', () => {
    const out = sprinkleTerrainSeeds(baseInput())
    expect(out).toHaveLength(4 * 3)
    // First 4 entries should be row 0 (r=0, q=0..3) — row-major.
    expect(out[0].q).toBe(0); expect(out[0].r).toBe(0)
    expect(out[3].q).toBe(3); expect(out[3].r).toBe(0)
    expect(out[4].q).toBe(0); expect(out[4].r).toBe(1)
    const seen = new Set(out.map(c => `${c.q},${c.r}`))
    expect(seen.size).toBe(12)
  })

  it('uses only ids from availableTerrain', () => {
    const out = sprinkleTerrainSeeds(baseInput())
    for (const cell of out) {
      expect(['plains', 'forest', 'water']).toContain(cell.terrainId)
    }
  })

  it('is deterministic for the same seed + dimensions + terrain list', () => {
    const a = sprinkleTerrainSeeds(baseInput())
    const b = sprinkleTerrainSeeds(baseInput())
    expect(b).toEqual(a)
  })

  it('different seeds produce different boards (on a large enough draw)', () => {
    const a = sprinkleTerrainSeeds(baseInput())
    const b = sprinkleTerrainSeeds({ ...baseInput(), seed: 'other-seed' })
    // 12-cell board with 3 terrain options has 3^12 possible outputs;
    // two random seeds matching everywhere is astronomically unlikely.
    const differing = a.some((cell, i) => cell.terrainId !== b[i].terrainId)
    expect(differing).toBe(true)
  })

  it('blank seed falls back to Math.random without throwing and uses the weighted picker', () => {
    // Stub Math.random for determinism. With DEFAULT_TERRAIN_WEIGHTS
    // (plains 55, forest 25, water 10 → total 90), 0.5 * 90 = 45 falls
    // inside the plains bucket [0, 55); later cells may copy neighbors,
    // but the board still deterministically lands on plains.
    const orig = Math.random
    try {
      Math.random = () => 0.5
      const out = sprinkleTerrainSeeds({ ...baseInput(), seed: '' })
      expect(out).toHaveLength(12)
      for (const cell of out) {
        expect(cell.terrainId).toBe('plains')
      }
    } finally {
      Math.random = orig
    }
  })

  it('uses catalog generationWeight for custom terrain frequency', () => {
    const orig = Math.random
    try {
      Math.random = () => 0.01
      const out = sprinkleTerrainSeeds({
        width: 1,
        height: 1,
        availableTerrain: ['rare', 'heavy'],
        seed: '',
        terrainTypes: [
          { id: 'rare', generationWeight: 1 },
          { id: 'heavy', generationWeight: 999 }
        ]
      })
      expect(out[0].terrainId).toBe('heavy')
    } finally {
      Math.random = orig
    }
  })

  it('weighted selection favors plains over rare terrain on a deterministic large board', () => {
    // Use a deterministic seed on a wide board, then count terrain
    // frequencies. Plains has weight 55 vs mountain 1 in
    // DEFAULT_TERRAIN_WEIGHTS, so the plains/mountain ratio should be
    // comfortably above the rare-terrain baseline.
    const out = sprinkleTerrainSeeds({
      width: 20,
      height: 20,
      availableTerrain: ['plains', 'forest', 'water', 'swamp', 'desert', 'mountain'],
      seed: 'weighted-fixture'
    })
    const counts = out.reduce((acc, cell) => {
      acc[cell.terrainId] = (acc[cell.terrainId] || 0) + 1
      return acc
    }, {})
    expect(counts.plains).toBeGreaterThan(counts.mountain * 5)
    expect(counts.plains).toBeGreaterThan(counts.desert)
    // With weighting plus neighbor inheritance, plains should still dominate.
    expect(counts.plains).toBeGreaterThan(out.length / 3)
  })

  it('neighbor bias produces more same-terrain adjacencies than a fully independent draw', () => {
    // Same dimensions, same terrain options, same seed — only difference
    // is that under neighbor bias the row-major loop is biased toward
    // copying an already-generated neighbor with probability 0.6. We
    // measure adjacency runs in row-major order: every cell whose left
    // or upstairs neighbor shares its terrain id counts as one
    // contributing pair. A 12x12 board with neighbor bias should beat
    // its same-seed uniform-weighted baseline by a wide margin.
    const board = sprinkleTerrainSeeds({
      width: 12,
      height: 12,
      availableTerrain: ['plains', 'forest', 'water', 'swamp', 'desert', 'mountain'],
      seed: 'cluster-fixture'
    })
    const byKey = new Map(board.map(c => [`${c.q},${c.r}`, c]))
    let same = 0
    for (const cell of board) {
      const left = byKey.get(`${cell.q - 1},${cell.r}`)
      if (left && left.terrainId === cell.terrainId) same++
      const up = byKey.get(`${cell.q},${cell.r - 1}`)
      if (up && up.terrainId === cell.terrainId) same++
    }
    // Weighted-only baseline for this fixture was 89; keep the floor well above
    // that baseline without coupling the test to the exact biased trace.
    expect(same).toBeGreaterThan(120)
  })

  it('spawn safety forces the provided safe cell coordinates to plains when available', () => {
    const out = sprinkleTerrainSeeds({
      width: 4,
      height: 4,
      availableTerrain: ['plains', 'mountain', 'water'],
      // Chosen because pre-safety weighted+bias output makes this cluster non-plains;
      // the test must fail without the spawn-safety post-pass.
      seed: 'rocky',
      terrainTypes: [
        { id: 'plains', terrainDifficulty: 0 },
        { id: 'mountain', terrainDifficulty: 3 },
        { id: 'water', terrainDifficulty: 2 }
      ],
      safeCells: [{ q: 1, r: 1 }]
    })
    const at = (q, r) => out.find(c => c.q === q && c.r === r)
    expect(at(1, 1).terrainId).toBe('plains')
  })

  it('spawn safety gives immediate 6-hex neighbors a deterministic 50% safe-terrain chance', () => {
    // (1, 1) is in an odd row under odd-r offset → neighbors are
    // W(0,1), E(2,1), NW(1,0), NE(2,0), SW(1,2), SE(2,2).
    const out = sprinkleTerrainSeeds({
      width: 4,
      height: 4,
      availableTerrain: ['plains', 'mountain', 'water'],
      // Chosen because pre-safety weighted+bias output makes this cluster non-plains;
      // the test must fail without the spawn-safety post-pass.
      seed: 'rocky',
      terrainTypes: [
        { id: 'plains', terrainDifficulty: 0 },
        { id: 'mountain', terrainDifficulty: 3 },
        { id: 'water', terrainDifficulty: 2 }
      ],
      safeCells: [{ q: 1, r: 1 }]
    })
    const at = (q, r) => out.find(c => c.q === q && c.r === r)
    const neighbors = [[0, 1], [2, 1], [1, 0], [2, 0], [1, 2], [2, 2]]
    const safeNeighbors = neighbors.filter(([q, r]) => at(q, r).terrainId === 'plains')
    expect(safeNeighbors).toEqual([[1, 0], [2, 2]])
  })

  it('spawn safety falls back to the lowest-terrainDifficulty available terrain when plains is unavailable', () => {
    const out = sprinkleTerrainSeeds({
      width: 4,
      height: 4,
      availableTerrain: ['mountain', 'water', 'desert'],
      seed: 'safety-fixture',
      terrainTypes: [
        { id: 'mountain', terrainDifficulty: 3 },
        { id: 'water', terrainDifficulty: 2 },
        { id: 'desert', terrainDifficulty: 1 }
      ],
      safeCells: [{ q: 0, r: 0 }]
    })
    const at = (q, r) => out.find(c => c.q === q && c.r === r)
    // The anchor cell itself must be the lowest-difficulty id, which is
    // desert (difficulty 1) in this fixture. Its neighbors are only
    // softened by the 50% safety chance, not guaranteed.
    expect(at(0, 0).terrainId).toBe('desert')
    // (0,0) is even-row under odd-r offset → in-bounds neighbors are
  })

  it('returns [] when dimensions or terrain list are invalid', () => {
    expect(sprinkleTerrainSeeds({ width: 0, height: 3, availableTerrain: ['plains'], seed: 's' })).toEqual([])
    expect(sprinkleTerrainSeeds({ width: 2, height: 0, availableTerrain: ['plains'], seed: 's' })).toEqual([])
    expect(sprinkleTerrainSeeds({ width: 2, height: 2, availableTerrain: [], seed: 's' })).toEqual([])
    expect(sprinkleTerrainSeeds({ width: 2, height: 2, availableTerrain: [42, null, ''], seed: 's' })).toEqual([])
  })
})

describe('copyTurntableSide', () => {
  const sampleTurntable = () => ({
    Our_operations: [
      { title: 'MANOEUVRE', moves: [{ title: 'x1', dice: [['move'], ['move'], ['turn'], ['turn'], ['move'], ['turn']] }] }
    ],
    Enemy_operations: [
      { title: 'MANOEUVRE', moves: [{ title: 'x1', dice: [['-'], ['-'], ['-'], ['-'], ['-'], ['-']] }] }
    ]
  })

  it('mirrors Our → Enemy as a deep copy (not a shared reference)', () => {
    const tt = sampleTurntable()
    const out = copyTurntableSide(tt, 'our->enemy')
    expect(out.Enemy_operations).toEqual(tt.Our_operations)
    expect(out.Enemy_operations).not.toBe(tt.Our_operations)
    // Mutating the input later must not affect the copy.
    tt.Our_operations[0].title = 'MUTATED'
    expect(out.Enemy_operations[0].title).toBe('MANOEUVRE')
  })

  it('mirrors Enemy → Our as a deep copy', () => {
    const tt = sampleTurntable()
    const out = copyTurntableSide(tt, 'enemy->our')
    expect(out.Our_operations).toEqual(tt.Enemy_operations)
    expect(out.Our_operations).not.toBe(tt.Enemy_operations)
  })

  it('returns the input untouched when it is not a plain object', () => {
    expect(copyTurntableSide(null, 'our->enemy')).toBe(null)
    expect(copyTurntableSide('x', 'our->enemy')).toBe('x')
  })

  it('does not mutate the input even when source side is missing', () => {
    const tt = { Enemy_operations: [{ title: 'X', moves: [] }] }
    const out = copyTurntableSide(tt, 'our->enemy')
    expect(out).not.toBe(tt)
    expect(out.Enemy_operations).toBe(tt.Enemy_operations) // unchanged on copy fallback
  })
})
