<template>
  <!--
    Two-column layout for the Map & Deployment step.
    Left column: hex canvas + canvas legend (Map Stats / Terrain Legend,
    only when `hexCount > 0`).
    Canvas view controls (zoom / coordinates) sit in the canvas frame.
    Right column: MapControlsPanel - includes the two-step generation /
    adjustment flow, editor tools, deployment anchors, and lock controls.
  -->
  <div class="map-builder-step">
    <div class="map-builder-step__main">
      <div class="map-builder-step__map-group" :aria-label="$t('levelBuilder.mapBuilder.mapCanvasInfoAria')">
        <div class="map-builder-step__canvas-area">
          <HexMapEditorCanvas
            class="map-builder-step__canvas"
            :hexes="hexes"
            :map-width="mapWidth"
            :map-height="mapHeight"
            :hex-size="hexSize"
            :selected-hex="selectedHex"
            :show-coordinates="showCoordinates"
            :is-painting-mode="isPaintingMode"
            @select-hex="(hex) => $emit('select-hex', hex)"
            @start-drag-painting="(hex, evt) => $emit('start-drag-painting', hex, evt)"
            @continue-drag-painting="(hex) => $emit('continue-drag-painting', hex)"
            @stop-drag-painting="$emit('stop-drag-painting')"
            @hex-right-click="(hex, evt) => $emit('hex-right-click', hex, evt)"
          />
          <div class="map-builder-step__canvas-zoom-controls" :aria-label="$t('levelBuilder.mapBuilder.zoomControlsAria')">
            <button
              type="button"
              class="map-builder-step__zoom-btn"
              :disabled="zoomLevel <= minZoom"
              :aria-label="$t('levelBuilder.mapBuilder.zoomOut')"
              @click="$emit('zoom-out')"
            >
              <PhMagnifyingGlassMinus :size="18" weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="map-builder-step__zoom-btn"
              :disabled="zoomLevel >= maxZoom"
              :aria-label="$t('levelBuilder.mapBuilder.zoomIn')"
              @click="$emit('zoom-in')"
            >
              <PhMagnifyingGlassPlus :size="18" weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div class="map-builder-step__canvas-quick-controls" :aria-label="$t('levelBuilder.mapBuilder.coordinateControlsAria')">
            <label
              class="map-builder-step__show-coordinates"
              :aria-label="$t('levelBuilder.mapBuilder.showCoordinates')"
              :title="$t('levelBuilder.mapBuilder.showCoordinates')"
            >
              <input
                type="checkbox"
                class="map-builder-step__show-coordinates-input"
                :aria-label="$t('levelBuilder.mapBuilder.showCoordinates')"
                :checked="showCoordinates"
                @change="onShowCoordinatesChange"
              />
              <span class="map-builder-step__show-coordinates-text">{{ $t('levelBuilder.mapBuilder.showCoordinates') }}</span>
            </label>
          </div>
        </div>
        <div
          v-if="hexCount > 0"
          class="map-builder-step__canvas-legend"
          :aria-label="$t('levelBuilder.mapBuilder.mapInformationAria')"
        >
            <div class="map-builder-step__legend-block">
              <h4 class="map-builder-step__legend-title">{{ $t('levelBuilder.mapBuilder.mapStats') }}</h4>
              <div class="map-builder-step__legend-stats">
                <p class="map-builder-step__legend-stat">
                  {{ $tf('levelBuilder.mapBuilder.dimensions', `Dimensions: ${currentMapWidth} x ${currentMapHeight}`, { width: currentMapWidth, height: currentMapHeight }) }}
                </p>
                <p class="map-builder-step__legend-stat">{{ $tf('levelBuilder.mapBuilder.totalHexes', `Total hexes: ${hexCount}`, { count: hexCount }) }}</p>
                <p class="map-builder-step__legend-stat">
                  {{ $tf('levelBuilder.mapBuilder.terrainTypesUsed', `Terrain types used: ${uniqueTerrainTypes.length}`, { count: uniqueTerrainTypes.length }) }}
                </p>
              </div>
            </div>

            <div class="map-builder-step__legend-divider"></div>
            <div class="map-builder-step__legend-block">
              <h4 class="map-builder-step__legend-title">{{ $t('levelBuilder.mapBuilder.terrainLegend') }}</h4>
              <ul class="map-builder-step__legend-list">
                <li
                  v-for="terrain in uniqueTerrainTypes"
                  :key="terrain.id"
                  class="map-builder-step__legend-item"
                >
                  <span
                    class="map-builder-step__legend-swatch"
                    :style="{ backgroundColor: terrain.color }"
                  ></span>
                  <span class="map-builder-step__legend-text">
                    <span class="map-builder-step__legend-name">{{ terrainLabel(terrain) }}</span>
                    <span class="map-builder-step__legend-meta">
                      {{ $tf('levelBuilder.mapBuilder.terrainLegendMeta', `(Count: ${terrain.count}, terrain difficulty: ${terrainDifficultyLabel(terrain)})`, { count: terrain.count, difficulty: terrainDifficultyLabel(terrain) }) }}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
        </div>
      </div>
    </div>

    <aside class="map-builder-step__tools-area" :aria-label="$t('levelBuilder.mapBuilder.mapDeploymentControlsAria')">
      <MapControlsPanel
        :map-params="mapParams"
        :terrain-types="terrainTypes"
        :terrain-seed="terrainSeed"
        :terrain-seed-locked="terrainSeedLocked"
        :selected-terrain-for-painting="selectedTerrainForPainting"
        :protect-deployment-terrain="protectDeploymentTerrain"
        :overlay-types="overlayTypes"
        :selected-overlay="selectedOverlay"
        :active-map-tool="activeMapTool"
        :lock-brush-mode="lockBrushMode"
        :has-generated-map="hexCount > 0"
        :locked-hex-count="lockedHexCount"
        :deployment-anchor-count="deploymentAnchorCount"
        :clearable-deployment-anchor-count="clearableDeploymentAnchorCount"
        @decrease-width="$emit('decrease-width')"
        @increase-width="$emit('increase-width')"
        @decrease-height="$emit('decrease-height')"
        @increase-height="$emit('increase-height')"
        @update:map-width="(value) => $emit('update:map-width', value)"
        @update:map-height="(value) => $emit('update:map-height', value)"
        @commit-map-dimensions="$emit('commit-map-dimensions')"
        @update:terrain-seed="(value) => $emit('update:terrain-seed', value)"
        @update:terrain-seed-locked="(value) => $emit('update:terrain-seed-locked', value)"
        @generate-map="$emit('generate-map')"
        @toggle-terrain="(id) => $emit('toggle-terrain', id)"
        @update-terrain-types="(terrainTypes) => $emit('update-terrain-types', terrainTypes)"
        @select-terrain-for-painting="(terrain) => $emit('select-terrain-for-painting', terrain)"
        @select-overlay="(overlay) => $emit('select-overlay', overlay)"
        @select-map-tool="(tool) => $emit('select-map-tool', tool)"
        @select-lock-brush-mode="(mode) => $emit('select-lock-brush-mode', mode)"
        @unlock-all-hexes="$emit('unlock-all-hexes')"
        @clear-deployment-anchors="$emit('clear-deployment-anchors')"
        @update:protect-deployment-terrain="(value) => $emit('update:protect-deployment-terrain', value)"
      />
    </aside>
  </div>
</template>

<script>
import { PhMagnifyingGlassMinus, PhMagnifyingGlassPlus } from '@phosphor-icons/vue'
import HexMapEditorCanvas from './HexMapEditorCanvas.vue'
import MapControlsPanel from './MapControlsPanel.vue'
import { resolvePackageEntryLabel } from '../../utils/packageLabels.js'

export default {
  name: 'MapBuilderStep',
  components: {
    HexMapEditorCanvas,
    MapControlsPanel,
    PhMagnifyingGlassMinus,
    PhMagnifyingGlassPlus
  },
  props: {
    // Canvas props
    hexes: { type: Array, required: true },
    mapWidth: { type: Number, required: true },
    mapHeight: { type: Number, required: true },
    hexSize: { type: Number, required: true },
    selectedHex: { type: Object, default: null },
    showCoordinates: { type: Boolean, required: true },
    isPaintingMode: { type: Boolean, required: true },

    // Map controls props
    mapParams: { type: Object, required: true },
    terrainTypes: { type: Array, required: true },
    terrainSeed: { type: String, required: true },
    terrainSeedLocked: { type: Boolean, required: true },
    selectedTerrainForPainting: { type: Object, default: null },
    zoomLevel: { type: Number, required: true },
    minZoom: { type: Number, required: true },
    maxZoom: { type: Number, required: true },
    // hexCount, currentMapWidth, currentMapHeight, uniqueTerrainTypes
    // were previously forwarded to MapControlsPanel. They now stay on
    // MapBuilderStep because the legend lives in the left column under
    // the canvas (not in the right-column controls panel).
    hexCount: { type: Number, required: true },
    currentMapWidth: { type: Number, required: true },
    currentMapHeight: { type: Number, required: true },
    uniqueTerrainTypes: { type: Array, required: true },
    protectDeploymentTerrain: { type: Boolean, required: true },
    activeMapTool: { type: String, required: true },
    lockBrushMode: { type: String, required: true },
    lockedHexCount: { type: Number, required: true },
    deploymentAnchorCount: { type: Number, required: true },
    clearableDeploymentAnchorCount: { type: Number, required: true },

    // Deployment tools props
    overlayTypes: { type: Array, required: true },
    selectedOverlay: { type: Object, default: null }
  },
  emits: [
    // Canvas
    'select-hex',
    'start-drag-painting',
    'continue-drag-painting',
    'stop-drag-painting',
    'hex-right-click',
    // Map controls
    'decrease-width',
    'increase-width',
    'decrease-height',
    'increase-height',
    'update:map-width',
    'update:map-height',
    'commit-map-dimensions',
    'update:terrain-seed',
    'update:terrain-seed-locked',
    'generate-map',
    'toggle-terrain',
    'update-terrain-types',
    'select-terrain-for-painting',
    'select-map-tool',
    'select-lock-brush-mode',
    'unlock-all-hexes',
    'clear-deployment-anchors',
    'zoom-in',
    'zoom-out',
    'update:show-coordinates',
    'update:protect-deployment-terrain',
    // Deployment tools
    'select-overlay'
  ],
  methods: {
    onShowCoordinatesChange(event) {
      this.$emit('update:show-coordinates', event.target.checked)
    },
    terrainDifficultyLabel(terrain) {
      const value = terrain && (terrain.terrainDifficulty ?? terrain.terrainDifficuly)
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    },
    terrainLabel(terrain) {
      const locale = this.$i18n && this.$i18n.locale ? this.$i18n.locale : undefined
      if (typeof this.$localizedLabel === 'function') {
        return this.$localizedLabel(terrain, locale, terrain && (terrain.name || terrain.id))
      }
      return resolvePackageEntryLabel(terrain, locale)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.map-builder-step {
  display: grid;
  grid-template-columns: minmax(0, 1fr) $map-tools-panel-width;
  gap: $panel-gap;
  align-items: start;

  &__main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $panel-gap;
  }

  &__workflow {
    margin: 0;
    padding-left: 1.4em;
    list-style: decimal;
    color: $text-secondary;
    font-size: $font-size-normal;
    display: flex;
    flex-direction: column;
    gap: 2px;

    em {
      font-style: normal;
      font-weight: $font-weight-medium;
      color: $text-primary;
    }
  }

  // The bordered canvas and the unframed stats/legend sit in one logical
  // group so map metadata stays close without being inside the canvas frame.
  &__map-group {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__canvas-area {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    background-color: $surface-color;
    overflow: hidden;
  }

  &__canvas {
    align-self: stretch;
    min-height: 320px;
    margin-bottom: $panel-padding + $zoom-button-size + 8px;
  }

  &__canvas-quick-controls {
    position: absolute;
    left: $panel-padding;
    bottom: $panel-padding;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__canvas-zoom-controls {
    position: absolute;
    top: $panel-padding;
    right: $panel-padding;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__canvas-legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }

  // The zoom buttons ARE natively `disabled` when at min/max — there is
  // no usable state at those bounds, unlike the anchor buttons which
  // need to stay focusable to surface their hover hint.
  &__zoom-btn {
    width: $zoom-button-size;
    height: $zoom-button-size;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    color: $primary-color;
    font-size: $font-size-xlarge;
    font-weight: $font-weight-bold;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover:not(:disabled) {
      background-color: $primary-color;
      color: $surface-color;
    }

    &:disabled {
      background-color: $disabled-background;
      cursor: not-allowed;
      border-color: $border-light;
    }
  }

  &__legend-divider {
    border-bottom: $border-width solid $border-light;
    margin: 4px 0;
  }

  &__legend-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__legend-title {
    margin: 0 0 4px;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__legend-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 4px 16px;
  }

  &__legend-stat {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-secondary;
  }

  &__legend-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  &__legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
  }

  &__legend-swatch {
    width: $legend-color-size;
    height: $legend-color-size;
    border-radius: 3px;
    border: $border-width solid $border-dark;
    flex-shrink: 0;
  }

  &__legend-text {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: $font-size-normal;
    color: $text-secondary;
  }

  &__legend-name {
    color: $text-primary;
    font-weight: $font-weight-medium;
    line-height: 1.3;
  }

  &__legend-meta {
    color: $text-muted;
    font-size: $font-size-small;
    font-weight: $font-weight-normal;
    line-height: 1.3;
  }

  &__show-coordinates {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: $zoom-button-size;
    height: $zoom-button-size;
    padding: 0 10px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    cursor: pointer;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    user-select: none;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing;

    &:hover,
    &:focus-within {
      border-color: $primary-color;
      color: $text-primary;
    }
  }

  &__show-coordinates-input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: $primary-color;
    cursor: pointer;
    flex-shrink: 0;
  }

  &__show-coordinates-text {
    color: $text-primary;
    font-size: $font-size-normal;
    line-height: 1;
    white-space: nowrap;
  }

  // Right column is a pure layout wrapper - no padding/background/border/
  // shadow, so MapControlsPanel itself is the visual surface and starts
  // flush with the top of the parent step-card.
  &__tools-area {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $panel-gap;
  }
}

// Single-column stack on narrow viewports. The parent card renders the
// title/hint above this component; inside the step body, controls stay
// before the canvas group.
@media (max-width: 960px) {
  .map-builder-step {
    grid-template-columns: minmax(0, 1fr);
  }

  // The map-group keeps the canvas and its external stats/legend together.
  .map-builder-step__main {
    display: contents;
  }

  .map-builder-step__tools-area { order: 3; }
  .map-builder-step__workflow { order: 4; }
  .map-builder-step__map-group { order: 5; }
}
</style>
