import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate'
import {
  buildLevelArchiveFiles,
  buildLevelArchiveBlob,
  levelArchiveFilename,
  parseLevelArchive
} from '../levelArchive.js'
import { SECTION_FILENAME_SUFFIX } from '../builderPackage.js'

/**
 * Lock-in tests for the Task C1 archive helpers. The Builder page
 * already validates with `validateLevelPackage` before calling these,
 * so the helpers themselves do not duplicate validation — we exercise
 * the archive shape only.
 */

function samplePackage(id = 'level_test') {
  return {
    id,
    schemaVersion: 1,
    hexmap: {
      parameters: { width: 2, height: 2 },
      map: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 1, r: 0, terrain: 'forest' }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50' },
        { id: 'forest', name: 'Forest', color: '#2E7D32' }
      ]
    },
    units: { player1: { units: [] }, player2: { units: [] } },
    turntable: { Our_operations: [], Enemy_operations: [] }
  }
}

describe('buildLevelArchiveFiles', () => {
  it('emits the four canonical entry paths under the level directory', () => {
    const pkg = samplePackage('level_test')
    const files = buildLevelArchiveFiles(pkg)
    expect(Object.keys(files).sort()).toEqual([
      `level_test/level_test${SECTION_FILENAME_SUFFIX.hexmap}`,
      `level_test/level_test${SECTION_FILENAME_SUFFIX.terrain}`,
      `level_test/level_test${SECTION_FILENAME_SUFFIX.turntable}`,
      `level_test/level_test${SECTION_FILENAME_SUFFIX.units}`
    ].sort())
  })

  it('round-trips each section through JSON.parse', () => {
    const pkg = samplePackage('level_round')
    const files = buildLevelArchiveFiles(pkg)
    expect(JSON.parse(files[`level_round/level_round${SECTION_FILENAME_SUFFIX.hexmap}`])).toEqual(pkg.hexmap)
    expect(JSON.parse(files[`level_round/level_round${SECTION_FILENAME_SUFFIX.terrain}`])).toEqual(pkg.terrain)
    expect(JSON.parse(files[`level_round/level_round${SECTION_FILENAME_SUFFIX.units}`])).toEqual(pkg.units)
    expect(JSON.parse(files[`level_round/level_round${SECTION_FILENAME_SUFFIX.turntable}`])).toEqual(pkg.turntable)
  })

  it('includes objectives when the package carries them', () => {
    const pkg = samplePackage('level_objectives')
    pkg.objectives = {
      mode: 'firstSatisfied',
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 3 }]
    }
    const files = buildLevelArchiveFiles(pkg)
    expect(JSON.parse(files[`level_objectives/level_objectives${SECTION_FILENAME_SUFFIX.objectives}`])).toEqual(pkg.objectives)
  })

  it('honours an explicit levelId override', () => {
    const pkg = samplePackage('inside-pkg')
    const files = buildLevelArchiveFiles(pkg, 'override_id')
    const keys = Object.keys(files)
    expect(keys.every(k => k.startsWith('override_id/'))).toBe(true)
    expect(keys.every(k => k.includes('override_id_'))).toBe(true)
  })

  it('falls back to level_000 when neither levelId nor pkg.id is usable', () => {
    const pkg = samplePackage('')
    delete pkg.id
    const files = buildLevelArchiveFiles(pkg)
    expect(Object.keys(files).every(k => k.startsWith('level_000/'))).toBe(true)
  })

  it('falls back to level_000 when the id contains unsafe characters', () => {
    // Path separators, parent-dir tokens, spaces, dots — anything
    // outside the safe alphabet must be quarantined so an unsanitised
    // caller cannot escape the archive's own directory.
    const unsafeIds = ['../escape', 'foo/bar', 'has space', 'dot.id', 'кирилиця']
    for (const id of unsafeIds) {
      const files = buildLevelArchiveFiles(samplePackage('whatever'), id)
      expect(Object.keys(files).every(k => k.startsWith('level_000/'))).toBe(true)
    }
  })

  it('throws when input is not an object', () => {
    expect(() => buildLevelArchiveFiles(null)).toThrow(TypeError)
    expect(() => buildLevelArchiveFiles('nope')).toThrow(TypeError)
  })
})

describe('buildLevelArchiveBlob', () => {
  it('produces a zip whose entries unzip back to the same section JSON', async () => {
    const pkg = samplePackage('level_blob')
    const blob = buildLevelArchiveBlob(pkg)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/zip')

    const buf = new Uint8Array(await blob.arrayBuffer())
    const unzipped = unzipSync(buf)
    const paths = Object.keys(unzipped).sort()
    expect(paths).toEqual([
      `level_blob/level_blob${SECTION_FILENAME_SUFFIX.hexmap}`,
      `level_blob/level_blob${SECTION_FILENAME_SUFFIX.terrain}`,
      `level_blob/level_blob${SECTION_FILENAME_SUFFIX.turntable}`,
      `level_blob/level_blob${SECTION_FILENAME_SUFFIX.units}`
    ].sort())

    const hexmap = JSON.parse(strFromU8(unzipped[`level_blob/level_blob${SECTION_FILENAME_SUFFIX.hexmap}`]))
    expect(hexmap).toEqual(pkg.hexmap)
  })
})

describe('levelArchiveFilename', () => {
  it('appends .zip to the resolved level id', () => {
    expect(levelArchiveFilename('level_007')).toBe('level_007.zip')
  })

  it('falls back to level_000.zip for empty/missing ids', () => {
    expect(levelArchiveFilename('')).toBe('level_000.zip')
    expect(levelArchiveFilename(undefined)).toBe('level_000.zip')
    expect(levelArchiveFilename('   ')).toBe('level_000.zip')
  })

  it('falls back to level_000.zip for unsafe ids', () => {
    expect(levelArchiveFilename('../escape')).toBe('level_000.zip')
    expect(levelArchiveFilename('foo/bar')).toBe('level_000.zip')
    expect(levelArchiveFilename('has space')).toBe('level_000.zip')
  })
})

/**
 * Lock-in tests for the Task C2 import side. We build fixture archives
 * on the fly with `fflate.zipSync` so no binary fixtures need to live
 * in the repo. The helper itself does NOT call `validateLevelPackage` —
 * those checks are owned by the page-level `loadMap` flow, which keeps
 * the atomic-import contract in a single place. Tests here therefore
 * assert only on `entries` / `errors` returned by the parser.
 */

function buildFixtureArchive(files) {
  const archiveInput = {}
  for (const [path, body] of Object.entries(files)) {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    archiveInput[path] = strToU8(text)
  }
  return zipSync(archiveInput)
}

function canonicalSections(id = 'level_fix') {
  return {
    hexmap: {
      parameters: { width: 2, height: 2 },
      map: [{ q: 0, r: 0, terrain: 'plains' }]
    },
    terrain: {
      terrainTypes: [{ id: 'plains', name: 'Plains', color: '#4CAF50' }]
    },
    units: { player1: { units: [] }, player2: { units: [] } },
    turntable: { Our_operations: [], Enemy_operations: [] },
    id
  }
}

describe('parseLevelArchive', () => {
  it('extracts the four canonical files from a level_<id>/ directory', () => {
    const id = 'level_fix'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: 'pkg.zip' })

    expect(errors).toEqual([])
    expect(entries).toHaveLength(4)
    const bySection = Object.fromEntries(entries.map(e => [e.section, e]))
    expect(bySection.hexmap.body).toEqual(s.hexmap)
    expect(bySection.terrain.body).toEqual(s.terrain)
    expect(bySection.units.body).toEqual(s.units)
    expect(bySection.turntable.body).toEqual(s.turntable)
    // sourceName carries both the archive label and the inner path so
    // downstream notifications can name the offending file precisely.
    expect(bySection.hexmap.sourceName).toBe(`pkg.zip/${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`)
  })

  it('extracts optional objectives alongside the required section files', () => {
    const id = 'level_objectives'
    const s = canonicalSections(id)
    const objectives = {
      mode: 'firstSatisfied',
      conditions: [{ type: 'surviveTurns', player: 'player1', turns: 2 }]
    }
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.objectives}`]: objectives
    })

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: 'pkg.zip' })

    expect(errors).toEqual([])
    expect(entries).toHaveLength(5)
    const bySection = Object.fromEntries(entries.map(e => [e.section, e]))
    expect(bySection.objectives.body).toEqual(objectives)
  })

  it('matches section files at the archive root (no <id>/ prefix)', () => {
    // A user may unzip and re-zip without preserving the parent dir.
    // Suffix-only matching keeps that case working — we never rely on
    // a specific directory prefix.
    const s = canonicalSections()
    const bytes = buildFixtureArchive({
      [`anything${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`anything${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`anything${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`anything${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes)

    expect(errors).toEqual([])
    expect(entries.map(e => e.section).sort()).toEqual(
      ['hexmap', 'terrain', 'turntable', 'units']
    )
  })

  it('ignores unrelated archive entries instead of erroring', () => {
    // A README.md (or any non-section file) sitting next to the
    // sections must be silently skipped — the validator will catch
    // anything genuinely missing after the merge step.
    const id = 'level_extra'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/README.md`]: '# notes',
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: 'pkg.zip' })

    expect(errors).toEqual([])
    expect(entries).toHaveLength(4)
  })

  it('records an error for malformed JSON inside the archive', () => {
    const id = 'level_bad'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: '{ not valid json',
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: 'pkg.zip' })

    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.section).sort()).toEqual(['terrain', 'turntable', 'units'])
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe(`pkg.zip/${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`)
    expect(errors[0].message).toMatch(/failed to parse JSON/)
  })

  it('records an error when a section file has an unrecognized shape', () => {
    // The suffix says `_hexmap.json` but the payload is neither a
    // hexmap nor any other known section. `detectSection` returns
    // null and the entry is rejected — the suffix alone is not enough.
    const id = 'level_shape'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: { foo: 'bar' },
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes)

    expect(entries).toHaveLength(3)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/unrecognized JSON shape/)
  })

  it('errors when only a partial archive is provided', () => {
    // A Level Archive is the complete export format. Accepting a 2-of-4
    // archive would merge missing sections from the current Builder state
    // and create a hybrid package that the user did not select.
    const id = 'level_partial'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units
    })

    const { entries, errors } = parseLevelArchive(bytes)

    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.section).sort()).toEqual(['hexmap', 'units'])
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('archive.zip')
    expect(errors[0].message).toMatch(/incomplete/)
    expect(errors[0].message).toMatch(/_terrain\.json/)
    expect(errors[0].message).toMatch(/_turntable\.json/)
  })

  it('errors when an archive contains duplicate detected sections', () => {
    const id = 'level_duplicate'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}_copy${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: 'dupe.zip' })

    expect(entries.map(e => e.section).sort()).toEqual(['hexmap', 'terrain', 'turntable', 'units'])
    expect(errors.some(e =>
      e.path.includes('_copy_hexmap.json') && /duplicate "hexmap"/.test(e.message)
    )).toBe(true)
  })

  it('errors when the archive yields zero section entries', () => {
    // Empty zip and "only unrelated files" zips would otherwise
    // silently round-trip through merge+validate as no-op successes
    // because mergeSectionsIntoPackage fills missing sections from
    // the caller's current state. The parse step is the only place
    // that knows the archive carried no level data, so the guard
    // lives here.
    const emptyBytes = buildFixtureArchive({})
    const emptyResult = parseLevelArchive(emptyBytes, { sourceName: 'empty.zip' })
    expect(emptyResult.entries).toEqual([])
    expect(emptyResult.errors).toHaveLength(1)
    expect(emptyResult.errors[0].path).toBe('empty.zip')
    expect(emptyResult.errors[0].message).toMatch(/no level-section files/)

    const unrelatedBytes = buildFixtureArchive({
      'README.md': '# notes',
      'misc/notes.txt': 'hello'
    })
    const unrelatedResult = parseLevelArchive(unrelatedBytes, { sourceName: 'docs.zip' })
    expect(unrelatedResult.entries).toEqual([])
    expect(unrelatedResult.errors).toHaveLength(1)
    expect(unrelatedResult.errors[0].path).toBe('docs.zip')
    expect(unrelatedResult.errors[0].message).toMatch(/no level-section files/)
  })

  it('throws synchronously on a corrupt zip so the caller can route it', () => {
    // `unzipSync` is the throw site. The page-level wrapper in
    // LevelBuilder.vue catches this and pushes a friendly entry into
    // its own `parseErrors` channel; we just verify it is in fact
    // synchronous here so the wrapper's try/catch is justified.
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00])
    expect(() => parseLevelArchive(garbage)).toThrow()
  })

  it('rejects non-Uint8Array input loudly', () => {
    expect(() => parseLevelArchive('not bytes')).toThrow(TypeError)
    expect(() => parseLevelArchive(null)).toThrow(TypeError)
  })

  it('round-trips a real export through buildLevelArchiveBlob → parseLevelArchive', async () => {
    // Closing the loop: an archive produced by C1 must be readable by
    // C2 without information loss in the four section payloads.
    const id = 'level_loop'
    const pkg = {
      id,
      schemaVersion: 1,
      hexmap: {
        parameters: { width: 2, height: 2 },
        map: [
          { q: 0, r: 0, terrain: 'plains' },
          { q: 1, r: 0, terrain: 'forest' }
        ]
      },
      terrain: {
        terrainTypes: [
          { id: 'plains', name: 'Plains', color: '#4CAF50' },
          { id: 'forest', name: 'Forest', color: '#2E7D32' }
        ]
      },
      units: { player1: { units: [] }, player2: { units: [] } },
      turntable: { Our_operations: [], Enemy_operations: [] }
    }
    const blob = buildLevelArchiveBlob(pkg)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const { entries, errors } = parseLevelArchive(bytes, { sourceName: `${id}.zip` })

    expect(errors).toEqual([])
    expect(entries).toHaveLength(4)
    const bySection = Object.fromEntries(entries.map(e => [e.section, e.body]))
    expect(bySection.hexmap).toEqual(pkg.hexmap)
    expect(bySection.terrain).toEqual(pkg.terrain)
    expect(bySection.units).toEqual(pkg.units)
    expect(bySection.turntable).toEqual(pkg.turntable)
  })
})

describe('parseLevelArchive · archiveId inference', () => {
  it('recovers the encoded id from a canonical level_<id>/level_<id>_*.json archive', () => {
    const id = 'level_007'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}/${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { archiveId, errors } = parseLevelArchive(bytes)
    expect(errors).toEqual([])
    expect(archiveId).toBe(id)
  })

  it('recovers the id from filename prefix when the parent dir is missing', () => {
    // Hand-zipped archives without a `<id>/` parent still encode the
    // id in their filenames; we should pick it up.
    const id = 'level_hand'
    const s = canonicalSections(id)
    const bytes = buildFixtureArchive({
      [`${id}${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`${id}${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`${id}${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`${id}${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { archiveId } = parseLevelArchive(bytes)
    expect(archiveId).toBe(id)
  })

  it('errors when entries disagree on the encoded id', () => {
    // Two different ids inside the same archive — refuse to guess.
    // The archive cannot be trusted, so we surface an explicit parse
    // error AND keep `archiveId` null. The caller's existing
    // `parseErrors.length > 0` gate refuses the import.
    const s = canonicalSections('level_a')
    const bytes = buildFixtureArchive({
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`level_b/level_b${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { archiveId, errors } = parseLevelArchive(bytes, { sourceName: 'mixed.zip' })
    expect(archiveId).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.path === 'mixed.zip' && /conflicting level ids/.test(e.message))).toBe(true)
  })

  it('errors when dir id and filename id on the same entry conflict', () => {
    // The export side always writes `<id>/<id>_*.json`; an entry like
    // `level_a/level_b_hexmap.json` is suspicious. Surface as a parse
    // error rather than silently dropping the id.
    const s = canonicalSections('level_a')
    const bytes = buildFixtureArchive({
      [`level_a/level_b${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`level_a/level_a${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { archiveId, errors } = parseLevelArchive(bytes, { sourceName: 'mixed.zip' })
    expect(archiveId).toBeNull()
    expect(errors.some(e => /conflicting id signals/.test(e.message))).toBe(true)
  })

  it('returns null when neither the dir nor the filename encodes an id', () => {
    // A re-zipped archive with bare canonical suffixes at the root
    // (e.g. `_hexmap.json`) carries no `<id>_` filename prefix and no
    // parent dir — the matcher still classifies the sections, but no
    // id can be inferred; the caller keeps its current id (the
    // pre-fix behavior). The leading `_` is preserved so the suffix
    // match still fires; the filename-prefix recovery returns null
    // because the stripped prefix is empty.
    const s = canonicalSections()
    const bytes = buildFixtureArchive({
      [SECTION_FILENAME_SUFFIX.hexmap]: s.hexmap,
      [SECTION_FILENAME_SUFFIX.terrain]: s.terrain,
      [SECTION_FILENAME_SUFFIX.units]: s.units,
      [SECTION_FILENAME_SUFFIX.turntable]: s.turntable
    })

    const { archiveId, entries } = parseLevelArchive(bytes)
    expect(entries).toHaveLength(4)
    expect(archiveId).toBeNull()
  })

  it('errors when an inferred id fails the safe-id alphabet', () => {
    // A dir-name containing whitespace or path separators must not
    // sneak into the imported `pkg.id`. We also refuse to import
    // silently — the user gets a parse error pointing at the
    // unsafe id so they can fix the archive.
    const s = canonicalSections()
    const bytes = buildFixtureArchive({
      [`bad id/bad id${SECTION_FILENAME_SUFFIX.hexmap}`]: s.hexmap,
      [`bad id/bad id${SECTION_FILENAME_SUFFIX.terrain}`]: s.terrain,
      [`bad id/bad id${SECTION_FILENAME_SUFFIX.units}`]: s.units,
      [`bad id/bad id${SECTION_FILENAME_SUFFIX.turntable}`]: s.turntable
    })

    const { archiveId, errors } = parseLevelArchive(bytes, { sourceName: 'unsafe.zip' })
    expect(archiveId).toBeNull()
    expect(errors.some(e => /unsafe level id/.test(e.message))).toBe(true)
  })
})
