/**
 * Fetch-and-validate entry point for split-file level packages.
 *
 * Reads `${BASE_URL}/${id}/${id}_hexmap.json`, `_terrain.json`, `_units.json`,
 * `_turntable.json` in parallel, assembles a single LevelPackage shape,
 * and runs `validateLevelPackage` on it. Network failures are reported
 * through the same `{ ok, errors, warnings, package }` envelope as
 * validation failures, so callers never need to mix `try/catch` with
 * the validator result shape.
 *
 * The runtime `fetch` is injectable via options so the loader can be
 * unit-tested under node (vitest) without a DOM.
 *
 * @module domain/level/loadLevelPackage
 */

import { validateLevelPackage } from './validateLevelPackage.js'
import { buildDefaultObjectivesForLevelPackage } from '../objectives/objectives.js'

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

const SECTION_FILES = [
  { key: 'hexmap', suffix: '_hexmap.json' },
  { key: 'terrain', suffix: '_terrain.json' },
  { key: 'units', suffix: '_units.json' },
  { key: 'turntable', suffix: '_turntable.json' },
  { key: 'objectives', suffix: '_objectives.json', optional: true }
]

const COMPILED_BASE_URL = process.env.BASE_URL

function failure(errors, warnings = []) {
  return { ok: false, errors, warnings, package: null }
}

function getDefaultBaseUrl() {
  return typeof COMPILED_BASE_URL === 'string' ? COMPILED_BASE_URL : './'
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return '/'
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function buildSectionUrl(levelId, suffix, baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}${levelId}/${levelId}${suffix}`
}

async function fetchSection(fetchImpl, levelId, key, suffix, optional = false, baseUrl = '/') {
  const url = buildSectionUrl(levelId, suffix, baseUrl)
  let response
  try {
    response = await fetchImpl(url)
  } catch (err) {
    return { key, error: { path: key, message: `failed to fetch ${url}: ${err && err.message ? err.message : String(err)}` } }
  }
  if (!response || response.ok !== true) {
    const status = response && response.status != null ? response.status : 'unknown'
    if (optional && status === 404) {
      return { key, body: null, optional: true }
    }
    return { key, error: { path: key, message: `failed to fetch ${url}: HTTP ${status}` } }
  }
  let body
  try {
    body = await response.json()
  } catch (err) {
    return { key, error: { path: key, message: `failed to parse JSON for ${url}: ${err && err.message ? err.message : String(err)}` } }
  }
  return { key, body }
}

/**
 * Load and validate a level package by id.
 *
 * @param {string} levelId
 * @param {{ fetch?: typeof fetch }} [options]
 * @returns {Promise<{ ok: boolean, errors: Array<{path:string, message:string}>, warnings: Array<{path:string, message:string}>, package: object|null }>}
 */
export async function loadLevelPackage(levelId, options = {}) {
  if (typeof levelId !== 'string' || !levelId.trim()) {
    return failure([{ path: 'id', message: 'level id must be a non-empty string' }])
  }
  if (!SAFE_ID_PATTERN.test(levelId)) {
    return failure([{ path: 'id', message: `level id "${levelId}" must match /^[a-zA-Z0-9_-]+$/` }])
  }

  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) {
    return failure([{ path: '', message: 'no fetch implementation available (pass options.fetch in node environments)' }])
  }

  const baseUrl = Object.prototype.hasOwnProperty.call(options, 'baseUrl')
    ? options.baseUrl
    : getDefaultBaseUrl()

  const results = await Promise.all(
    SECTION_FILES.map(s => fetchSection(fetchImpl, levelId, s.key, s.suffix, s.optional === true, baseUrl))
  )

  const fetchErrors = results.filter(r => r.error).map(r => r.error)
  if (fetchErrors.length > 0) {
    return failure(fetchErrors)
  }

  const pkg = { id: levelId }
  for (const r of results) {
    if (r.body !== null) pkg[r.key] = r.body
  }

  // Split-file levels carry schemaVersion inside hexmap.parameters so the
  // four on-disk files can stay self-describing. Hoist it to the top level
  // before validation; the assembled-package shape is the canonical home.
  if (
    pkg.hexmap &&
    typeof pkg.hexmap === 'object' &&
    pkg.hexmap.parameters &&
    typeof pkg.hexmap.parameters === 'object' &&
    pkg.hexmap.parameters.schemaVersion != null
  ) {
    pkg.schemaVersion = pkg.hexmap.parameters.schemaVersion
  }

  const result = validateLevelPackage(pkg)
  if (result.ok && result.package && !result.package.objectives) {
    const objectives = buildDefaultObjectivesForLevelPackage(result.package)
    if (!objectives) return result
    return {
      ...result,
      package: {
        ...result.package,
        objectives
      }
    }
  }
  return result
}
