/**
 * Pure Level Archive -> validated LevelPackage adapter.
 *
 * This is the Playground-facing archive import boundary: callers pass
 * ZIP bytes and receive the same validation envelope as `loadLevelPackage`,
 * plus the `archiveId` inferred from archive paths. The helper deliberately
 * assembles a package only from archive contents; it does not merge partial
 * archives with Builder/UI state.
 *
 * @module domain/level/loadLevelArchivePackage
 */

import { parseLevelArchive } from './levelArchive.js'
import { validateLevelPackage } from './validateLevelPackage.js'
import { buildDefaultObjectivesForLevelPackage } from '../objectives/objectives.js'

const FALLBACK_LEVEL_ID = 'imported_archive'

function sourceLabel(sourceName) {
  return typeof sourceName === 'string' && sourceName.length > 0
    ? sourceName
    : 'archive.zip'
}

function parseFailure(err, sourceName) {
  return {
    ok: false,
    errors: [{
      path: sourceLabel(sourceName),
      message: `failed to parse level archive: ${err && err.message ? err.message : String(err)}`
    }],
    warnings: [],
    package: null,
    archiveId: null
  }
}

function assemblePackage(entries, archiveId) {
  // Archives with bare `_hexmap.json`-style filenames carry no id signal.
  // `imported_archive` is intentionally inside the validator's safe id alphabet
  // and does not collide with any built-in level id, so no-id archives can
  // still load without consulting UI state.
  const pkg = { id: archiveId || FALLBACK_LEVEL_ID }
  for (const entry of entries) {
    if (!entry || !entry.section) continue
    if (entry.section === 'hexmap') pkg.hexmap = entry.body
    if (entry.section === 'terrain') pkg.terrain = entry.body
    if (entry.section === 'units') pkg.units = entry.body
    if (entry.section === 'turntable') pkg.turntable = entry.body
    if (entry.section === 'objectives') pkg.objectives = entry.body
  }

  // Match `loadLevelPackage`: split-file data keeps schemaVersion inside
  // hexmap.parameters, then the assembled package hoists it before validation.
  if (
    pkg.hexmap &&
    typeof pkg.hexmap === 'object' &&
    pkg.hexmap.parameters &&
    typeof pkg.hexmap.parameters === 'object' &&
    pkg.hexmap.parameters.schemaVersion != null
  ) {
    pkg.schemaVersion = pkg.hexmap.parameters.schemaVersion
  }

  return pkg
}

/**
 * Load and validate a complete Level Archive from ZIP bytes.
 *
 * @param {Uint8Array} bytes
 * @param {{ sourceName?: string }} [options]
 * @returns {{
 *   ok: boolean,
 *   errors: Array<{path:string, message:string}>,
 *   warnings: Array<{path:string, message:string}>,
 *   package: object|null,
 *   archiveId: string|null
 * }}
 */
export function loadLevelArchivePackage(bytes, options = {}) {
  let parsed
  try {
    parsed = parseLevelArchive(bytes, { sourceName: options.sourceName })
  } catch (err) {
    return parseFailure(err, options.sourceName)
  }

  const archiveId = parsed.archiveId
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      errors: parsed.errors,
      warnings: [],
      package: null,
      archiveId
    }
  }

  const result = validateLevelPackage(assemblePackage(parsed.entries, archiveId))
  const defaultObjectives = result.ok && result.package && !result.package.objectives
    ? buildDefaultObjectivesForLevelPackage(result.package)
    : null
  const packageWithObjectives = defaultObjectives
    ? { ...result.package, objectives: defaultObjectives }
    : result.package
  return {
    ...result,
    package: packageWithObjectives,
    archiveId
  }
}
