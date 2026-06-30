import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { SECTION_FILENAME_SUFFIX } from '../builderPackage.js'
import { buildLevelArchiveBlob } from '../levelArchive.js'
import { loadLevelArchivePackage } from '../loadLevelArchivePackage.js'

function validPackage(id = 'level_archive') {
  return {
    id,
    schemaVersion: 1,
    hexmap: {
      parameters: { schemaVersion: 1, width: 1, height: 1 },
      map: [{ q: 0, r: 0, terrain: 'plains' }]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 }
      ]
    },
    units: { player1: { units: [] }, player2: { units: [] } },
    turntable: { Our_operations: [], Enemy_operations: [] }
  }
}

function buildArchive(files) {
  const archiveInput = {}
  for (const [path, body] of Object.entries(files)) {
    archiveInput[path] = strToU8(typeof body === 'string' ? body : JSON.stringify(body))
  }
  return zipSync(archiveInput)
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('loadLevelArchivePackage', () => {
  it('loads a buildLevelArchiveBlob export into a validated LevelPackage', async () => {
    const pkg = validPackage('level_roundtrip')
    const bytes = await blobBytes(buildLevelArchiveBlob(pkg))

    const result = loadLevelArchivePackage(bytes, { sourceName: 'level_roundtrip.zip' })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.archiveId).toBe('level_roundtrip')
    expect(result.package.id).toBe('level_roundtrip')
    expect(result.package.schemaVersion).toBe(1)
    expect(result.package.hexmap).toEqual(pkg.hexmap)
    expect(result.package.objectives).toBeUndefined()
  })

  it('uses the archive id as the package id, not unrelated caller state', async () => {
    const pkg = validPackage('original_pkg_id')
    const bytes = await blobBytes(buildLevelArchiveBlob(pkg, 'archive_level'))

    const result = loadLevelArchivePackage(bytes)

    expect(result.ok).toBe(true)
    expect(result.archiveId).toBe('archive_level')
    expect(result.package.id).toBe('archive_level')
  })

  it('adds default objectives for archives with configured units on both sides', async () => {
    const pkg = validPackage('level_with_units')
    pkg.hexmap = {
      parameters: { schemaVersion: 1, width: 2, height: 1 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
      ]
    }
    pkg.units = {
      player1: { units: [{ type: 'infantry', name: 'I', health: 10, movement: 1, attackRange: 1, attackPower: 1, count: 1 }] },
      player2: { units: [{ type: 'infantry', name: 'I', health: 10, movement: 1, attackRange: 1, attackPower: 1, count: 1 }] }
    }
    const bytes = await blobBytes(buildLevelArchiveBlob(pkg))

    const result = loadLevelArchivePackage(bytes, { sourceName: 'level_with_units.zip' })

    expect(result.ok).toBe(true)
    expect(result.package.objectives).toMatchObject({
      mode: 'primaryBlue',
      primary: {
        type: 'eliminateUnits',
        player: 'player1',
        targetPlayer: 'player2'
      }
    })
  })

  it('returns parse errors without running validation for an incomplete archive', () => {
    const id = 'level_partial'
    const pkg = validPackage(id)
    const bytes = buildArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: pkg.hexmap
    })

    const result = loadLevelArchivePackage(bytes, { sourceName: 'partial.zip' })

    expect(result.ok).toBe(false)
    expect(result.warnings).toEqual([])
    expect(result.package).toBeNull()
    expect(result.archiveId).toBe(id)
    expect(result.errors.some(e => /archive is incomplete/.test(e.message))).toBe(true)
  })

  it('falls back to "imported_archive" (not "level_000") when the archive has no id signal', () => {
    const pkg = validPackage('ignored')
    const bytes = buildArchive({
      [SECTION_FILENAME_SUFFIX.hexmap]: pkg.hexmap,
      [SECTION_FILENAME_SUFFIX.terrain]: pkg.terrain,
      [SECTION_FILENAME_SUFFIX.units]: pkg.units,
      [SECTION_FILENAME_SUFFIX.turntable]: pkg.turntable
    })

    const result = loadLevelArchivePackage(bytes)

    expect(result.ok).toBe(true)
    expect(result.archiveId).toBeNull()
    expect(result.package.id).toBe('imported_archive')
  })

  it('returns a structured error for non-Uint8Array input', () => {
    const result = loadLevelArchivePackage('not bytes', { sourceName: 'bad.zip' })

    expect(result.ok).toBe(false)
    expect(result.warnings).toEqual([])
    expect(result.package).toBeNull()
    expect(result.archiveId).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].path).toBe('bad.zip')
    expect(result.errors[0].message).toMatch(/Uint8Array/)
  })
})
