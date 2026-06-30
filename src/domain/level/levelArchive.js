/**
 * Two-way ZIP helpers for the LevelPackage archive format.
 *
 *   - `buildLevelArchiveFiles` / `buildLevelArchiveBlob` /
 *     `levelArchiveFilename` produce a `level_id/` directory of the
 *     four canonical section JSON files, zipped together so the user
 *     gets one file instead of four (Task C1).
 *   - `parseLevelArchive` consumes the same shape on import: given the
 *     raw bytes of a ZIP archive, it extracts the section JSON files
 *     and returns the `{ section, body, sourceName }` entry shape the
 *     existing multi-file JSON import path already consumes (Task C2).
 *
 * Pure functions only — no DOM, no Vue. The caller (LevelBuilder.vue)
 * is responsible for running `validateLevelPackage` before/after
 * calling these helpers; we intentionally do not duplicate validation
 * here. That keeps the atomic-import contract (validate → mutate)
 * owned by one place.
 *
 * Filename convention matches Playground's loader:
 *   level_000/
 *     level_000_hexmap.json
 *     level_000_terrain.json
 *     level_000_units.json
 *     level_000_turntable.json
 *
 * The `SECTION_FILENAME_SUFFIX` table from `builderPackage.js` is the
 * single source of truth for the suffix strings; we do not redefine
 * them here. Import-side matching uses suffix-only (not full path),
 * so hand-zipped archives without the `<id>/` prefix still work.
 *
 * @module domain/level/levelArchive
 */

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { SECTION_FILENAME_SUFFIX, detectSection } from './builderPackage.js'

const DEFAULT_LEVEL_ID = 'level_000'

// Same alphabet as the Playground loader's `SAFE_ID_PATTERN`
// (`src/domain/level/loadLevelPackage.js`) and the page-level
// `SAFE_LEVEL_ID` hydration guard. Keeping the rule local lets this
// helper stay safe even if it is reused outside the LevelBuilder page.
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Resolve the directory/level id used for archive entry paths. Falls
 * back to `DEFAULT_LEVEL_ID` when `levelId` is missing, empty, or
 * contains characters outside the safe path/filename alphabet — so a
 * stray `..` or `/` from an unsanitized caller cannot escape the
 * archive's own directory.
 */
function resolveLevelId(levelId) {
  if (typeof levelId === 'string') {
    const trimmed = levelId.trim()
    if (trimmed.length > 0 && SAFE_ID_PATTERN.test(trimmed)) {
      return trimmed
    }
  }
  return DEFAULT_LEVEL_ID
}

/**
 * Build the in-memory file map for a validated LevelPackage. Keys are
 * archive entry paths (`<id>/<id>_<section>.json`), values are pretty-
 * printed JSON strings. Returning a plain object keeps this helper
 * easy to unit-test without spinning up fflate.
 *
 * Section payloads are NOT cloned — the caller is responsible for
 * ensuring the package is immutable for the lifetime of the call (it
 * usually comes straight out of `validateLevelPackage`).
 *
 * @param {object} pkg LevelPackage (post-validation)
 * @param {string} [levelId] override for the directory/file prefix;
 *   defaults to `pkg.id`, then `DEFAULT_LEVEL_ID`
 * @returns {Object<string,string>} archive-path → JSON-string map
 */
export function buildLevelArchiveFiles(pkg, levelId) {
  if (!isPlainObject(pkg)) {
    throw new TypeError('buildLevelArchiveFiles: package must be an object')
  }
  const id = resolveLevelId(levelId || pkg.id)
  const dir = id
  const files = {}
  files[`${dir}/${id}${SECTION_FILENAME_SUFFIX.hexmap}`] = JSON.stringify(pkg.hexmap, null, 2)
  files[`${dir}/${id}${SECTION_FILENAME_SUFFIX.terrain}`] = JSON.stringify(pkg.terrain, null, 2)
  files[`${dir}/${id}${SECTION_FILENAME_SUFFIX.units}`] = JSON.stringify(pkg.units, null, 2)
  files[`${dir}/${id}${SECTION_FILENAME_SUFFIX.turntable}`] = JSON.stringify(pkg.turntable, null, 2)
  if (pkg.objectives) {
    files[`${dir}/${id}${SECTION_FILENAME_SUFFIX.objectives}`] = JSON.stringify(pkg.objectives, null, 2)
  }
  return files
}

/**
 * Produce a ZIP `Blob` for the given LevelPackage, suitable for
 * `URL.createObjectURL` + `<a download>` download. Wraps
 * `buildLevelArchiveFiles` so unit tests can assert structure against
 * the plain-object form without unzipping anything.
 *
 * @param {object} pkg LevelPackage (post-validation)
 * @param {string} [levelId] see `buildLevelArchiveFiles`
 * @returns {Blob} `application/zip` Blob containing one `<id>/` dir
 */
export function buildLevelArchiveBlob(pkg, levelId) {
  const files = buildLevelArchiveFiles(pkg, levelId)
  const archiveInput = {}
  for (const [path, text] of Object.entries(files)) {
    archiveInput[path] = strToU8(text)
  }
  const bytes = zipSync(archiveInput, { level: 6 })
  return new Blob([bytes], { type: 'application/zip' })
}

/**
 * Suggested download filename for the archive, e.g. `level_000.zip`.
 * Exported so the caller can pair it with `buildLevelArchiveBlob` in
 * one line without re-implementing the id-resolution rule.
 */
export function levelArchiveFilename(levelId) {
  return `${resolveLevelId(levelId)}.zip`
}

/**
 * Suffix table inverted for fast lookup during import. Maps a filename
 * suffix (e.g. `_hexmap.json`) to its canonical section name
 * (`'hexmap'`). Kept local so the import path can match by suffix
 * alone — the directory prefix in the archive is deliberately ignored
 * so a hand-zipped or re-zipped archive that omits the `<id>/` parent
 * still loads.
 */
const SUFFIX_TO_SECTION = Object.freeze(
  Object.fromEntries(
    Object.entries(SECTION_FILENAME_SUFFIX).map(([section, suffix]) => [suffix, section])
  )
)
const REQUIRED_ARCHIVE_SECTIONS = Object.freeze(['hexmap', 'terrain', 'units', 'turntable'])

/**
 * Look up the canonical section name for an archive entry path. Returns
 * the longest-suffix match so a hypothetical `_units.json` extension on
 * a `.terrain_units.json` filename does not steal the classification —
 * suffixes are distinct today but checking longest first keeps the
 * matcher robust if the suffix table ever grows.
 *
 * @param {string} entryPath archive entry path (e.g. `level_x/level_x_hexmap.json`)
 * @returns {string|null} section name or null when no suffix matches
 */
function matchSectionSuffix(entryPath) {
  let bestSection = null
  let bestLength = -1
  for (const [suffix, section] of Object.entries(SUFFIX_TO_SECTION)) {
    if (entryPath.endsWith(suffix) && suffix.length > bestLength) {
      bestSection = section
      bestLength = suffix.length
    }
  }
  return bestSection
}

/**
 * Strip the trailing `_<section>.json` suffix from an entry's basename
 * to recover the filename-prefix id. Returns `null` if the basename
 * does not end with a known suffix.
 */
function filenameIdPrefix(basename) {
  for (const suffix of Object.keys(SUFFIX_TO_SECTION)) {
    if (basename.endsWith(suffix)) {
      const prefix = basename.slice(0, basename.length - suffix.length)
      return prefix.length > 0 ? prefix : null
    }
  }
  return null
}

/**
 * Infer the encoded level id from the archive's matched section entry
 * paths. The export side writes `<id>/<id>_<section>.json` so the id is
 * recoverable from either the common directory prefix OR the canonical
 * `<id>_` filename prefix; this helper agrees with both and returns the
 * single consistent id when present.
 *
 * Three outcomes, communicated as `{ id, error }`:
 *   - `{ id: 'level_007', error: null }` — consistent + safe id.
 *   - `{ id: null, error: null }` — no id signals at all (e.g. a
 *     re-zipped archive with bare `_hexmap.json` at root). Caller
 *     falls back to its current builder id; same as the pre-fix
 *     behavior.
 *   - `{ id: null, error: 'reason' }` — id signals were present but
 *     either disagreed (between entries or between dir and filename
 *     on the same entry) or failed `SAFE_ID_PATTERN`. The caller MUST
 *     surface this as a parse error and refuse the import, otherwise
 *     a malformed/conflicting archive would silently load under the
 *     caller's current id.
 *
 * Hand-zipped archives without a `<id>/` parent still recover an id
 * from their filename prefix; archives with no `<id>_` filename
 * prefix and no parent dir get `{ id: null, error: null }` (safe).
 *
 * @param {Array<{entryPath: string}>} matchedEntries entries whose path
 *   has already passed `matchSectionSuffix` (so we know they end in one
 *   of the canonical suffixes)
 * @returns {{ id: string | null, error: string | null }}
 */
function inferArchiveLevelId(matchedEntries) {
  if (matchedEntries.length === 0) return { id: null, error: null }
  let consensusId = null
  for (const { entryPath } of matchedEntries) {
    const slashIndex = entryPath.lastIndexOf('/')
    const basename = slashIndex >= 0 ? entryPath.slice(slashIndex + 1) : entryPath
    const dirPath = slashIndex >= 0 ? entryPath.slice(0, slashIndex) : ''
    // Strip any nested directory prefix (e.g. `outer/level_007/...`) —
    // only the immediate parent dir is treated as the encoded id.
    const dirSlashIndex = dirPath.lastIndexOf('/')
    const dirId = dirSlashIndex >= 0 ? dirPath.slice(dirSlashIndex + 1) : dirPath
    const fileId = filenameIdPrefix(basename)

    let entryId = null
    if (dirId && fileId) {
      // Both signals present. They must agree, otherwise this entry
      // has mixed signals and the archive is internally inconsistent.
      if (dirId !== fileId) {
        return {
          id: null,
          error: `archive entry "${entryPath}" has conflicting id signals (dir "${dirId}" vs filename "${fileId}")`
        }
      }
      entryId = dirId
    } else if (dirId) {
      entryId = dirId
    } else if (fileId) {
      entryId = fileId
    }

    if (!entryId) continue
    if (consensusId === null) {
      consensusId = entryId
    } else if (consensusId !== entryId) {
      return {
        id: null,
        error: `archive contains conflicting level ids ("${consensusId}" and "${entryId}")`
      }
    }
  }

  if (consensusId === null) return { id: null, error: null }
  if (!SAFE_ID_PATTERN.test(consensusId)) {
    return {
      id: null,
      error: `archive encodes an unsafe level id "${consensusId}" (allowed characters: a-zA-Z0-9_-)`
    }
  }
  return { id: consensusId, error: null }
}

/**
 * Parse a level archive (ZIP bytes) into the same
 * `{ section, body, sourceName }` entries the existing JSON-import flow
 * already consumes, plus the level id encoded by the archive's directory
 * / filename prefixes (see `inferArchiveLevelId`). The caller is still
 * responsible for running `mergeSectionsIntoPackage` and
 * `validateLevelPackage` — keeping validation in one place preserves
 * atomic-import semantics.
 *
 * Behavior:
 *   - Each archive entry whose path ENDS WITH one of the four
 *     `SECTION_FILENAME_SUFFIX` values is decoded as UTF-8, parsed as
 *     JSON, then run through `detectSection`. The classifier is the
 *     source of truth — branching on suffix alone would misclassify a
 *     file that was renamed to `_units.json` but contains a hexmap
 *     payload.
 *   - Entries that match a suffix but fail JSON.parse, or whose body
 *     `detectSection` cannot classify, push to `errors`. Other entries
 *     proceed normally — one bad section file does not corrupt the
 *     whole import.
 *   - Entries that DO NOT match a suffix (e.g. a `README.md`) are
 *     silently ignored.
 *   - A Level Archive must contain exactly one payload for each canonical
 *     section (`hexmap`, `terrain`, `units`, `turntable`). Empty,
 *     unrelated, partial, or duplicate-section archives push errors so
 *     the caller refuses import instead of merging a hybrid package with
 *     the Builder's current state.
 *   - `archiveId` carries the level id encoded in the archive (e.g.
 *     `level_007` from `level_007/level_007_hexmap.json`), so the
 *     caller can apply it as `pkg.id` and preserve round-trip
 *     `Export Level → Import Level → Export Level` fidelity. `null`
 *     when no id signals are present (e.g. a re-zipped archive with
 *     bare `_hexmap.json` filenames at the root) — the caller falls
 *     back to its current builder id in that case.
 *   - When id signals ARE present but inconsistent (entries disagree,
 *     dir vs filename conflict on the same entry) or fail the safe-id
 *     alphabet, `archiveId` is null AND an entry is pushed onto
 *     `errors` so the caller's existing `parseErrors.length > 0` gate
 *     refuses the import — silently importing a confused archive under
 *     the current builder id would be more surprising than an explicit
 *     "Import Blocked" notification.
 *   - A corrupt zip throws synchronously from `unzipSync`. The caller
 *     should wrap this call in try/catch and route the failure into
 *     its own `parseErrors` channel.
 *
 * @param {Uint8Array} bytes archive bytes — typically produced via
 *   `new Uint8Array(await file.arrayBuffer())`
 * @param {object} [opts]
 * @param {string} [opts.sourceName] base label used as a prefix in
 *   each entry's `sourceName` (e.g. the original `file.name`). The
 *   full path stored on each entry is `${sourceName}/${entryPath}` so
 *   downstream error messages can name both the archive and the
 *   offending file inside it.
 * @returns {{
 *   entries: Array<{section: string, body: object, sourceName: string}>,
 *   errors: Array<{path: string, message: string}>,
 *   archiveId: string | null
 * }}
 */
export function parseLevelArchive(bytes, opts = {}) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('parseLevelArchive: bytes must be a Uint8Array')
  }
  const sourceName = typeof opts.sourceName === 'string' && opts.sourceName.length > 0
    ? opts.sourceName
    : 'archive.zip'

  const unzipped = unzipSync(bytes)

  const entries = []
  const errors = []
  // Raw archive-relative paths of suffix-matched entries are kept in
  // step with `entries` so we can infer the encoded id from the
  // archive's own naming without re-parsing.
  const matchedEntries = []
  const seenSections = new Set()

  for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
    // Skip directory entries (fflate represents them as zero-length
    // payloads under a path ending in `/`). They never carry section
    // data and would just confuse the classifier.
    if (entryPath.endsWith('/')) continue

    const section = matchSectionSuffix(entryPath)
    if (!section) continue

    const labelPath = `${sourceName}/${entryPath}`

    let text
    try {
      text = strFromU8(entryBytes)
    } catch (err) {
      errors.push({
        path: labelPath,
        message: `failed to decode entry as UTF-8: ${err && err.message ? err.message : String(err)}`
      })
      continue
    }

    let body
    try {
      body = JSON.parse(text)
    } catch (err) {
      errors.push({
        path: labelPath,
        message: `failed to parse JSON: ${err && err.message ? err.message : String(err)}`
      })
      continue
    }

    const detected = detectSection(body)
    if (!detected) {
      errors.push({
        path: labelPath,
        message: 'unrecognized JSON shape (not a LevelPackage section)'
      })
      continue
    }

    // We trust `detectSection` over the suffix — if a file named
    // `*_units.json` actually contains a hexmap payload, treat it as
    // a hexmap. That matches the JSON-import path's behavior, which
    // also classifies by content.
    if (seenSections.has(detected)) {
      errors.push({
        path: labelPath,
        message: `duplicate "${detected}" section in level archive`
      })
      continue
    }
    seenSections.add(detected)
    entries.push({ section: detected, body, sourceName: labelPath })
    matchedEntries.push({ entryPath })
  }

  // Guard against the silent no-op: an empty zip or a zip full of
  // unrelated files would otherwise reach `mergeSectionsIntoPackage`
  // with zero entries, leave the package equal to the caller's
  // current state, and pass validation as "Package Imported".
  if (entries.length === 0 && errors.length === 0) {
    errors.push({
      path: sourceName,
      message: 'archive contains no level-section files (expected one of _hexmap.json, _terrain.json, _units.json, _turntable.json, _objectives.json)'
    })
  } else if (entries.length > 0 && errors.length === 0) {
    const missingSections = REQUIRED_ARCHIVE_SECTIONS.filter(section => !seenSections.has(section))
    if (missingSections.length > 0) {
      const missingSuffixes = missingSections.map(section => SECTION_FILENAME_SUFFIX[section]).join(', ')
      errors.push({
        path: sourceName,
        message: `archive is incomplete; missing required section file(s): ${missingSuffixes}`
      })
    }
  }

  const { id: archiveId, error: archiveIdError } = inferArchiveLevelId(matchedEntries)
  // Surface id-inference problems as parse errors so the caller's
  // existing validation gate refuses the import. `archiveId` stays
  // null in that case, but the error path makes sure the archive
  // does not silently load under the caller's current builder id.
  if (archiveIdError !== null) {
    errors.push({ path: sourceName, message: archiveIdError })
  }
  return { entries, errors, archiveId }
}
