/**
 * Shared test fixtures for simulation tests.
 *
 * Builds tiny self-contained level packages (small map, fixed turntable,
 * predictable units) and helpers to load `level_000` from disk for
 * integration-style tests.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../../../../public')

export async function fetchFromPublic(url) {
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

const ALL_ACTIONS_TURNTABLE = {
  Our_operations: [
    {
      title: 'MANOEUVRE',
      moves: [
        {
          dice: [
            ['move', 'turn', 'reverse'],
            ['move', 'turn'],
            ['move'],
            ['turn'],
            ['reverse'],
            ['move', 'reverse']
          ]
        }
      ]
    },
    {
      title: 'ATTACK',
      moves: [
        {
          dice: [
            ['fire', 'reload'],
            ['fire'],
            ['fire'],
            ['fire'],
            ['fire'],
            ['fire', 'reload']
          ]
        }
      ]
    }
  ],
  Enemy_operations: [
    {
      title: 'MANOEUVRE',
      moves: [
        {
          dice: [
            ['move', 'turn'],
            ['move'],
            ['move'],
            ['turn'],
            ['reverse'],
            ['move']
          ]
        }
      ]
    },
    {
      title: 'ATTACK',
      moves: [
        {
          dice: [
            ['fire'],
            ['fire'],
            ['fire'],
            ['fire'],
            ['fire'],
            ['fire', 'reload']
          ]
        }
      ]
    }
  ]
}

/**
 * Tiny "two infantry on a 5x3 plains strip" level package.
 *
 * Both rosters share dimensions intentionally so simulation tests have
 * a predictable starting position. The map is fully covered by `plains`
 * with no impassable hexes so reachability is uniform.
 */
export function makeMicroLevelPackage(overrides = {}) {
  const width = 5
  const height = 3
  const map = []
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const cell = { q, r, terrain: 'plains' }
      if (q === 0 && r === 1) cell.player1Spawn = true
      if (q === width - 1 && r === 1) cell.player2Spawn = true
      map.push(cell)
    }
  }

  const pkg = {
    id: 'micro',
    hexmap: {
      parameters: { width, height },
      map
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4caf50', terrainDifficulty: 0 }
      ]
    },
    units: {
      player1: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackAngle: 1, attackPower: 30, maxTerrainDifficulty: 10, count: 1 }
        ]
      },
      player2: {
        units: [
          { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackAngle: 1, attackPower: 30, maxTerrainDifficulty: 10, count: 1 }
        ]
      }
    },
    turntable: ALL_ACTIONS_TURNTABLE
  }

  if (overrides.turntable) pkg.turntable = overrides.turntable
  if (overrides.units) pkg.units = overrides.units
  return pkg
}
