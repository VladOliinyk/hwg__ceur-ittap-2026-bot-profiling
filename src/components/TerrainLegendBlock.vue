<template>
  <section v-if="rows.length > 0" class="terrain-legend-block">
    <h2 v-if="showTitle" class="terrain-legend-block__title">{{ titleText }}</h2>
    <ul class="terrain-legend-block__list">
      <li
        v-for="terrain in rows"
        :key="terrain.id"
        class="terrain-legend-block__item"
        :class="{ 'terrain-legend-block__item--selected': terrain.selected }"
      >
        <span
          class="terrain-legend-block__swatch"
          :style="{ backgroundColor: terrain.color }"
          aria-hidden="true"
        ></span>
        <span class="terrain-legend-block__text">
          <span class="terrain-legend-block__name">{{ terrain.label }}</span>
          <span class="terrain-legend-block__meta">
            {{ legendMeta(terrain) }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>

<script>
import { resolvePackageEntryLabel } from '../utils/packageLabels.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

function normalizeTerrainId(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'object' && !Array.isArray(value)) {
    const id = value.id
    return typeof id === 'string' && id.trim() ? id.trim() : null
  }
  return null
}

function normalizeHex(value) {
  if (Array.isArray(value) && value.length >= 2 && value[1] && typeof value[1] === 'object') {
    return value[1]
  }
  return value && typeof value === 'object' ? value : null
}

function terrainDifficultyValue(terrain) {
  const raw = terrain && (terrain.terrainDifficulty ?? terrain.terrainDifficuly)
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export default {
  name: 'TerrainLegendBlock',
  mixins: [i18nTextMixin],
  props: {
    terrainTypes: {
      type: Array,
      default: () => []
    },
    hexes: {
      type: Array,
      default: () => []
    },
    selectedTerrainId: {
      type: String,
      default: null
    },
    showTitle: {
      type: Boolean,
      default: true
    },
    showEmptyTerrain: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    titleText() {
      return this.uiText('levelBuilder.mapBuilder.terrainLegend', 'Terrain legend')
    },
    terrainCounts() {
      const counts = new Map()
      for (const rawHex of this.hexes) {
        const hex = normalizeHex(rawHex)
        if (!hex) continue
        const id = normalizeTerrainId(hex.terrain)
        if (!id) continue
        counts.set(id, (counts.get(id) || 0) + 1)
      }
      return counts
    },
    rows() {
      const locale = this.$i18n && this.$i18n.locale ? this.$i18n.locale : undefined
      const terrainById = new Map()
      for (const terrain of this.terrainTypes) {
        const id = normalizeTerrainId(terrain)
        if (!id || terrainById.has(id)) continue
        terrainById.set(id, terrain)
      }
      for (const rawHex of this.hexes) {
        const hex = normalizeHex(rawHex)
        const terrain = hex && hex.terrain
        const id = normalizeTerrainId(terrain)
        if (!id || terrainById.has(id)) continue
        terrainById.set(id, typeof terrain === 'object' ? terrain : { id })
      }

      return Array.from(terrainById.entries())
        .map(([id, terrain]) => {
          const count = this.terrainCounts.get(id) || 0
          return {
            id,
            label: this.terrainLabel(terrain, locale, id),
            color: terrain && terrain.color ? terrain.color : '#d1d5db',
            count,
            difficulty: terrainDifficultyValue(terrain),
            selected: this.selectedTerrainId === id
          }
        })
        .filter(row => this.showEmptyTerrain || row.count > 0 || row.selected)
        .sort((a, b) => a.label.localeCompare(b.label))
    }
  },
  methods: {
    terrainLabel(terrain, locale, fallback) {
      if (typeof this.$localizedLabel === 'function') {
        return this.$localizedLabel(terrain, locale, fallback)
      }
      return resolvePackageEntryLabel(terrain, locale, fallback)
    },
    legendMeta(terrain) {
      return this.uiText(
        'levelBuilder.mapBuilder.terrainLegendMeta',
        `(Count: ${terrain.count}, terrain difficulty: ${terrain.difficulty})`,
        { count: terrain.count, difficulty: terrain.difficulty }
      )
    }
  }
}
</script>

<style scoped lang="scss">
.terrain-legend-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.terrain-legend-block__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
}

.terrain-legend-block__list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.terrain-legend-block__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
}

.terrain-legend-block__item--selected {
  border-color: #94a3b8;
  background: #f8fafc;
}

.terrain-legend-block__swatch {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  border: 1px solid #64748b;
  border-radius: 3px;
}

.terrain-legend-block__text {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  min-width: 0;
  font-size: 13px;
}

.terrain-legend-block__name {
  color: #0f172a;
  font-weight: 700;
}

.terrain-legend-block__meta {
  color: #64748b;
  font-size: 12px;
}
</style>
