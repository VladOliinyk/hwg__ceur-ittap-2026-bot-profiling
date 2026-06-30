import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLevelPackage } from '../loadLevelPackage.js'
import { validateLevelPackage } from '../validateLevelPackage.js'
import {
  builderStateToPackage,
  packageToBuilderState,
  detectSection,
  mergeSectionsIntoPackage
} from '../builderPackage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../../../../public')

/** fs-backed fetch shim: same shape as the production fetch contract. */
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

/**
 * Re-derive a Builder-shaped hex map from the seeds produced by
 * `packageToBuilderState`. Production code does this through `createHex`
 * (Vue component); here we only need the logical fields the round-trip
 * actually inspects, not SVG geometry.
 */
function rebuildBuilderMapFromSeeds(seeds, terrainTypes) {
  return seeds.map(seed => ({
    q: seed.q,
    r: seed.r,
    terrain: terrainTypes.find(t => t.id === seed.terrainId) || { id: seed.terrainId },
    player1Spawn: seed.player1Spawn,
    player1Base: seed.player1Base,
    player2Spawn: seed.player2Spawn,
    player2Base: seed.player2Base
  }))
}

describe('Builder ↔ Playground round trip with real level_000', () => {
  it('package → builder seeds → package re-validates ok', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    if (!loaded.ok) {
      throw new Error('expected ok, got errors: ' + JSON.stringify(loaded.errors, null, 2))
    }
    const state = packageToBuilderState(loaded.package)
    const rebuiltMap = rebuildBuilderMapFromSeeds(state.cellSeeds, state.terrainTypes)
    const reExported = builderStateToPackage({
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: rebuiltMap,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    })
    const revalidated = validateLevelPackage(reExported)
    if (!revalidated.ok) {
      throw new Error('round-trip lost validity: ' + JSON.stringify(revalidated.errors, null, 2))
    }
    expect(revalidated.ok).toBe(true)
    // level_000 now ships with canonical field names and an explicit
    // schemaVersion; the round-trip exports the current package schema.
    expect(reExported.schemaVersion).toBe(2)
    expect(reExported.hexmap.parameters.schemaVersion).toBe(2)
    expect(reExported.hexmap.map).toHaveLength(
      reExported.hexmap.parameters.width * reExported.hexmap.parameters.height
    )
  })

  /**
   * Round 1 review regression guard for P1: bootstrap previously
   * discarded `cellSeeds` because `regenerateMap: false` left them
   * unapplied. This test exercises the exact same composition the
   * Builder now uses on mount — `loadLevelPackage` → `packageToBuilderState`
   * → rebuilt-with-geometry map → `builderStateToPackage` — and asserts
   * that every spawn/base overlay from the real level_000 hexmap is
   * preserved coordinate-for-coordinate. If the round trip starts
   * dropping overlays again, this test fails before the regression
   * reaches the browser.
   */
  it('round trip preserves every spawn/base overlay from real level_000', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(loaded.ok).toBe(true)
    const sourceCells = loaded.package.hexmap.map
    const overlayKey = (c, flag) => `${c.q},${c.r}|${flag}`
    const expectedOverlays = new Set()
    const overlayFlags = ['player1Spawn', 'player1Base', 'player2Spawn', 'player2Base']
    for (const cell of sourceCells) {
      for (const flag of overlayFlags) {
        if (cell[flag] === true) expectedOverlays.add(overlayKey(cell, flag))
      }
    }
    // Sanity: level_000 has overlays — otherwise this guard would be vacuous.
    expect(expectedOverlays.size).toBeGreaterThan(0)

    const state = packageToBuilderState(loaded.package)
    const rebuiltMap = rebuildBuilderMapFromSeeds(state.cellSeeds, state.terrainTypes)
    const reExported = builderStateToPackage({
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: rebuiltMap,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    })
    const reExportedOverlays = new Set()
    for (const cell of reExported.hexmap.map) {
      for (const flag of overlayFlags) {
        if (cell[flag] === true) reExportedOverlays.add(overlayKey(cell, flag))
      }
    }
    expect(reExportedOverlays).toEqual(expectedOverlays)
  })

  /**
   * Round 1 review regression guard for P2: with the live computed
   * `liveValidation`, the same composition (`buildPackageFromState` →
   * `validateLevelPackage`) is what the Builder evaluates on every
   * reactive tick. Exercising it against bootstrap state proves that
   * the panel reports `ok` immediately after mount, instead of showing
   * stale data from a prior import/export. This is the headless
   * equivalent of "open the Builder; validation panel says ok".
   */
  it('bootstrap composition (build state → validate) returns ok for real level_000', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(loaded.ok).toBe(true)
    const state = packageToBuilderState(loaded.package)
    const rebuiltMap = rebuildBuilderMapFromSeeds(state.cellSeeds, state.terrainTypes)
    const builderStateSnapshot = {
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: rebuiltMap,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    }
    // This is exactly what `liveValidation` evaluates each tick.
    const pkg = builderStateToPackage(builderStateSnapshot)
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('liveValidation composition produced errors on bootstrap: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.ok).toBe(true)
  })

  it('detects every real level_000 section by shape only', async () => {
    const files = ['hexmap', 'terrain', 'units', 'turntable', 'objectives']
    for (const section of files) {
      const url = `/level_000/level_000_${section}.json`
      const response = await fetchFromPublic(url)
      const body = await response.json()
      expect(detectSection(body)).toBe(section)
    }
  })

  it('merging individual real section files reproduces the full package', async () => {
    const sections = ['hexmap', 'terrain', 'units', 'turntable', 'objectives']
    const entries = []
    for (const section of sections) {
      const url = `/level_000/level_000_${section}.json`
      const response = await fetchFromPublic(url)
      const body = await response.json()
      entries.push({ section, body })
    }
    // Empty baseline so the merge result reflects only the imported files.
    const baseline = {
      levelId: 'level_000',
      mapParams: {},
      generatedMap: [],
      terrainTypes: [],
      unitsData: {},
      turntableData: {}
    }
    const { pkg, appliedSections } = mergeSectionsIntoPackage(entries, baseline)
    expect(appliedSections.sort()).toEqual(['hexmap', 'objectives', 'terrain', 'turntable', 'units'])
    const result = validateLevelPackage(pkg)
    if (!result.ok) {
      throw new Error('merged real sections did not validate: ' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.ok).toBe(true)
  })

  it('real level_000 declares an availableTerrain superset of the terrain ids used by its map', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(loaded.ok).toBe(true)
    const usedTerrain = new Set(loaded.package.hexmap.map.map(cell => cell.terrain))
    const availableTerrain = loaded.package.hexmap.parameters.availableTerrain || []
    // Invariant: every terrain id that appears on the map must be
    // declared in the palette. Guards against the palette narrowing
    // below the map's actual terrain ids or the map being repainted
    // with terrain that the palette no longer declares.
    for (const id of usedTerrain) {
      expect(availableTerrain).toContain(id)
    }
    // Lock the canonical default palette so the Builder's default
    // `Generate map` action draws from plains/forest/water.
    expect([...availableTerrain].sort()).toEqual(['forest', 'plains', 'water'])
  })

  it('export gate: hydrated state with a missing spawn cell fails validation', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    const state = packageToBuilderState(loaded.package)
    // Strip every overlay flag — player1 will have units but no spawn slots.
    const map = rebuildBuilderMapFromSeeds(state.cellSeeds, state.terrainTypes)
      .map(hex => ({
        ...hex,
        player1Spawn: false,
        player1Base: false,
        player2Spawn: false,
        player2Base: false
      }))
    const exported = builderStateToPackage({
      levelId: state.levelId,
      mapParams: state.mapParams,
      generatedMap: map,
      terrainTypes: state.terrainTypes,
      unitsData: state.unitsData,
      turntableData: state.turntableData
    })
    const result = validateLevelPackage(exported)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /no spawn or base hex/.test(e.message))).toBe(true)
  })
})
