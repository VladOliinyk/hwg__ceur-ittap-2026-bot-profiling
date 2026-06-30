import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLevelPackage } from '../loadLevelPackage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../../../../public')

/**
 * fs-backed `fetch` good enough for level loading: maps `/${id}/...json`
 * to disk reads under `public/`, returns the same `.ok / .status / .json()`
 * shape that `loadLevelPackage` expects from the runtime fetch.
 */
async function fetchFromPublic(url) {
  const stripped = url.startsWith('/') ? url.slice(1) : url
  const abs = path.join(PUBLIC_DIR, stripped)
  try {
    const buf = await readFile(abs, 'utf8')
    const parsed = JSON.parse(buf)
    return { ok: true, status: 200, json: async () => parsed }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: false, status: 404, json: async () => null }
    }
    throw err
  }
}

function makeFetchStub(responses) {
  return async function fetchStub(url) {
    if (!(url in responses)) {
      return { ok: false, status: 404, json: async () => null }
    }
    const entry = responses[url]
    if (typeof entry === 'function') return entry(url)
    return entry
  }
}

describe('loadLevelPackage — real level_000', () => {
  it('loads, validates, and returns ok for the on-disk level_000 package', async () => {
    const result = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    if (!result.ok) {
      // Make assertion failure include the actual errors for triage.
      throw new Error('expected ok, got errors: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.ok).toBe(true)
    expect(result.package.id).toBe('level_000')
    expect(result.package.hexmap.parameters.width).toBeGreaterThan(0)
    expect(result.package.terrain.terrainTypes.length).toBeGreaterThan(0)
    expect(result.package.units.player1.units.length).toBeGreaterThan(0)
    expect(Array.isArray(result.package.turntable.Our_operations)).toBe(true)
  })

  it('real level_000 ships with canonical field names and current schemaVersion', async () => {
    const result = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(result.ok).toBe(true)
    // No legacy-typo migration warnings should fire — the on-disk data is canonical.
    expect(result.warnings.some(w => /terrainDifficuly/.test(w.message))).toBe(false)
    expect(result.warnings.some(w => /maxTerrainDifficuly/.test(w.message))).toBe(false)
    expect(result.warnings.some(w => /schemaVersion/.test(w.message))).toBe(false)
    // Canonical fields are populated.
    expect(result.package.schemaVersion).toBe(1)
    expect(result.package.terrain.terrainTypes[0].terrainDifficulty).toBeDefined()
    expect(result.package.units.player1.units[0].maxTerrainDifficulty).toBeDefined()
  })

  it('hoists hexmap.parameters.schemaVersion into the assembled package', async () => {
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => ({
        parameters: { schemaVersion: 1, width: 1, height: 2 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 0, r: 1, terrain: 'plains', player2Spawn: true }
        ]
      }) },
      '/level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({
        terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }]
      }) },
      '/level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }) },
      '/level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] }
      }) }
    })
    const result = await loadLevelPackage('level_x', { fetch: fetchStub })
    expect(result.ok).toBe(true)
    // No migration warning for schemaVersion when present on disk.
    expect(result.warnings.some(w => /schemaVersion/.test(w.message))).toBe(false)
    expect(result.package.schemaVersion).toBe(1)
    expect(result.package.objectives).toMatchObject({
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: 'eliminateUnits',
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('loads an optional objectives section when present', async () => {
    const objectives = {
      mode: 'firstSatisfied',
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 3 }]
    }
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => ({
        parameters: { schemaVersion: 1, width: 1, height: 2 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 0, r: 1, terrain: 'plains', player2Spawn: true }
        ]
      }) },
      '/level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({
        terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }]
      }) },
      '/level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }) },
      '/level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] }
      }) },
      '/level_x/level_x_objectives.json': { ok: true, status: 200, json: async () => objectives }
    })

    const result = await loadLevelPackage('level_x', { fetch: fetchStub })

    expect(result.ok).toBe(true)
    expect(result.package.objectives.primary).toMatchObject({
      id: 'surviveTurns_1',
      type: 'surviveTurns',
      player: 'player1',
      deadlineTurns: 3
    })
  })

  it('uses a relative public base URL for subpath deployments', async () => {
    const fetchStub = makeFetchStub({
      './level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => ({
        parameters: { schemaVersion: 1, width: 1, height: 2 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 0, r: 1, terrain: 'plains', player2Spawn: true }
        ]
      }) },
      './level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({
        terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }]
      }) },
      './level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }) },
      './level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] }
      }) }
    })

    const result = await loadLevelPackage('level_x', { fetch: fetchStub, baseUrl: './' })

    expect(result.ok).toBe(true)
    expect(result.package.id).toBe('level_x')
  })
})

describe('loadLevelPackage — id sanitization', () => {
  it('rejects ids that contain unsafe characters', async () => {
    const result = await loadLevelPackage('../etc/passwd', { fetch: fetchFromPublic })
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'id')).toBe(true)
  })

  it('rejects empty or non-string ids', async () => {
    const empty = await loadLevelPackage('', { fetch: fetchFromPublic })
    expect(empty.ok).toBe(false)
    expect(empty.errors.some(e => e.path === 'id')).toBe(true)

    const nonString = await loadLevelPackage(42, { fetch: fetchFromPublic })
    expect(nonString.ok).toBe(false)
    expect(nonString.errors.some(e => e.path === 'id')).toBe(true)
  })
})

describe('loadLevelPackage — fetch error surface', () => {
  it('reports a structured error when hexmap response is not ok', async () => {
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: false, status: 500, json: async () => null }
    })
    const result = await loadLevelPackage('level_x', { fetch: fetchStub })
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.path === 'hexmap' && /500/.test(e.message))).toBe(true)
    // No GameState-style throw, no partial package
    expect(result.package).toBeNull()
  })

  it('reports a structured error when fetch throws (network failure)', async () => {
    async function fetchThrow() { throw new Error('net down') }
    const result = await loadLevelPackage('level_x', { fetch: fetchThrow })
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /net down/.test(e.message))).toBe(true)
    expect(result.package).toBeNull()
  })

  it('reports a structured error when response.json() throws', async () => {
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => { throw new Error('bad json') } },
      '/level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({ terrainTypes: [] }) },
      '/level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({ Our_operations: [], Enemy_operations: [] }) },
      '/level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({ player1: { units: [] }, player2: { units: [] } }) }
    })
    const result = await loadLevelPackage('level_x', { fetch: fetchStub })
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /bad json/.test(e.message))).toBe(true)
  })
})

describe('loadLevelPackage — validation propagation', () => {
  it('returns ok:false with validator errors when fetched JSON is malformed', async () => {
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => ({ parameters: { width: 1, height: 1 }, map: [{ q: 0, r: 0, terrain: 'lava' }] }) },
      '/level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({ terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] }) },
      '/level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({ Our_operations: [], Enemy_operations: [] }) },
      '/level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({ player1: { units: [] }, player2: { units: [] } }) }
    })
    const result = await loadLevelPackage('level_x', { fetch: fetchStub })
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /lava/.test(e.message))).toBe(true)
    expect(result.package).toBeNull()
  })

  it('returns ok:true on minimal but valid package', async () => {
    const fetchStub = makeFetchStub({
      '/level_x/level_x_hexmap.json': { ok: true, status: 200, json: async () => ({
        parameters: { width: 1, height: 2 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 0, r: 1, terrain: 'plains', player2Spawn: true }
        ]
      }) },
      '/level_x/level_x_terrain.json': { ok: true, status: 200, json: async () => ({
        terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }]
      }) },
      '/level_x/level_x_turntable.json': { ok: true, status: 200, json: async () => ({
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }) },
      '/level_x/level_x_units.json': { ok: true, status: 200, json: async () => ({
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }] }
      }) }
    })
    const result = await loadLevelPackage('level_x', { fetch: fetchStub })
    if (!result.ok) throw new Error('expected ok, got: ' + JSON.stringify(result.errors))
    expect(result.package.id).toBe('level_x')
  })
})
