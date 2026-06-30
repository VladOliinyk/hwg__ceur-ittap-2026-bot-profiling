/**
 * Canonical default terrain color map.
 * These match the GEB hardcoded table (authoritative).
 * GMB's getTerrainTypes() had the same ids/colors — no divergence found.
 */
export const DEFAULT_TERRAIN_COLORS = Object.freeze({
  grass: '#4CAF50',
  forest: '#2E7D32',
  water: '#2196F3',
  mountain: '#795548',
  desert: '#FFC107',
  plains: '#8BC34A',
  mud: '#8D6E63',
  snow: '#E1F5FE'
})

/** Grey fallback for completely unknown terrain ids. */
export const TERRAIN_COLOR_UNKNOWN = '#CCCCCC'

/**
 * Resolve the display color for a terrain id.
 *
 * Priority:
 *   1. Package-defined color  (packageTerrainTypes array from loadedPackage.terrain.terrainTypes)
 *   2. DEFAULT_TERRAIN_COLORS (canonical defaults)
 *   3. TERRAIN_COLOR_UNKNOWN  ('#CCCCCC')
 *
 * @param {Array|null|undefined} packageTerrainTypes  terrain.terrainTypes from the loaded level package
 * @param {string} terrainId
 * @returns {string}
 */
export function resolveTerrainColor(packageTerrainTypes, terrainId) {
  const id = terrainId == null ? '' : String(terrainId)
  if (Array.isArray(packageTerrainTypes)) {
    const entry = packageTerrainTypes.find(t => t && t.id === id)
    if (entry && typeof entry.color === 'string' && entry.color.trim()) {
      return entry.color.trim()
    }
  }
  return DEFAULT_TERRAIN_COLORS[id] ?? TERRAIN_COLOR_UNKNOWN
}
