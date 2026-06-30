<template>
  <div
    class="hex-map-editor-canvas"
    :class="{ 'hex-map-editor-canvas--painting': isPaintingMode }"
  >
    <svg
      v-if="hexes.length > 0"
      :width="svgWidth"
      :height="svgHeight"
      class="hex-map-editor-canvas__svg"
    >
      <defs>
        <pattern
          id="diagonal-stripes-p1"
          patternUnits="userSpaceOnUse"
          width="10"
          height="10"
          patternTransform="rotate(30)"
        >
          <line
            x1="0"
            y="0"
            x2="0"
            y2="10"
            stroke="var(--overlay-player1-color)"
            stroke-opacity="var(--overlay-player1-fill-opacity)"
            stroke-width="10"
          />
        </pattern>
        <pattern
          id="diagonal-stripes-p2"
          patternUnits="userSpaceOnUse"
          width="10"
          height="10"
          patternTransform="rotate(30)"
        >
          <line
            x1="0"
            y="0"
            x2="0"
            y2="10"
            stroke="var(--overlay-player2-color)"
            stroke-opacity="var(--overlay-player2-fill-opacity)"
            stroke-width="10"
          />
        </pattern>
      </defs>

      <g
        class="hex-map-editor-canvas__group"
        :transform="`translate(${svgSafeZone}, ${svgSafeZone})`"
      >
        <g
          v-for="hex in hexes"
          :key="hexKey(hex)"
          class="hex-map-editor-canvas__hex-group"
        >
          <polygon
            :points="hex.points"
            :fill="hex.terrain.color"
            :stroke="hex.stroke"
            :stroke-width="hex.strokeWidth"
            class="hex-map-editor-canvas__cell"
            :class="{
              'hex-map-editor-canvas__cell--selected': selectedHex === hex,
              'hex-map-editor-canvas__cell--locked': hex.locked
            }"
            @click="onSelectHex(hex)"
            @mousedown="onStartDragPainting(hex, $event)"
            @mouseenter="onContinueDragPainting(hex)"
            @mouseup="onStopDragPainting"
            @contextmenu.prevent="onHexRightClick(hex, $event)"
          />
          <polygon
            v-if="selectedHex === hex"
            :points="hex.innerPoints"
            fill="none"
            stroke="#ffffff"
            stroke-width="3"
            class="hex-map-editor-canvas__inner-stroke hex-map-editor-canvas__inner-stroke--selected"
          />
          <polygon
            :points="hex.innerPoints"
            fill="none"
            stroke="#ffffff99"
            stroke-width="2"
            class="hex-map-editor-canvas__inner-stroke hex-map-editor-canvas__inner-stroke--hover"
          />
          <text
            v-if="showCoordinates"
            :x="hex.center.x"
            :y="hex.center.y + 4"
            class="hex-map-editor-canvas__coordinates"
          >
            {{ hex.q }},{{ hex.r }}
          </text>

          <polygon
            v-if="hex.player1Spawn || hex.player1Base"
            :points="hex.points"
            class="hex-overlay-border hex-overlay-border-p1"
          />
          <polygon
            v-if="hex.player2Spawn || hex.player2Base"
            :points="hex.points"
            class="hex-overlay-border hex-overlay-border-p2"
          />
          <polygon
            v-if="hex.locked"
            :points="hex.innerPoints"
            class="hex-map-editor-canvas__lock-outline"
          />

          <image
            v-if="hex.player1Spawn"
            :href="getOverlayIcon(1, 'spawn')"
            :x="hex.center.x - (hex.player1Base ? overlayIconSize / 2 : 0) - overlayIconSize / 2"
            :y="hex.center.y - overlayIconSize / 2"
            :width="overlayIconSize"
            :height="overlayIconSize"
            class="overlay-icon overlay-icon-spawn-p1"
          />
          <image
            v-if="hex.player1Base"
            :href="getOverlayIcon(1, 'base')"
            :x="hex.center.x + (hex.player1Spawn ? overlayIconSize / 2 : 0) - overlayIconSize / 2"
            :y="hex.center.y - overlayIconSize / 2"
            :width="overlayIconSize"
            :height="overlayIconSize"
            class="overlay-icon overlay-icon-base-p1"
          />
          <image
            v-if="hex.player2Spawn"
            :href="getOverlayIcon(2, 'spawn')"
            :x="hex.center.x - (hex.player2Base ? overlayIconSize / 2 : 0) - overlayIconSize / 2"
            :y="hex.center.y - overlayIconSize / 2"
            :width="overlayIconSize"
            :height="overlayIconSize"
            class="overlay-icon overlay-icon-spawn-p2"
          />
          <image
            v-if="hex.player2Base"
            :href="getOverlayIcon(2, 'base')"
            :x="hex.center.x + (hex.player2Spawn ? overlayIconSize / 2 : 0) - overlayIconSize / 2"
            :y="hex.center.y - overlayIconSize / 2"
            :width="overlayIconSize"
            :height="overlayIconSize"
            class="overlay-icon overlay-icon-base-p2"
          />
          <g
            v-if="hex.locked"
            class="hex-map-editor-canvas__lock-icon"
            :transform="`translate(${hex.center.x - 11}, ${hex.center.y - 12})`"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="12" height="9" rx="2" />
            <path d="M8 10V7a3 3 0 0 1 6 0v3" />
          </g>
        </g>
      </g>
    </svg>
    <div v-else class="hex-map-editor-canvas__empty">
      <p>{{ $t('levelBuilder.mapCanvas.empty') }}</p>
    </div>
  </div>
</template>

<script>
import { hexMap } from '@/config/theme'
import { computeSvgMapSize } from '@/domain/engine/hexUtils.js'

const OVERLAY_ICON_FALLBACK_SIZE = 28
const SVG_SAFE_ZONE = 24

const OVERLAY_ICONS = {
  '1:spawn': require('@/assets/icons/spawn_player1.svg'),
  '1:base': require('@/assets/icons/base_player1.svg'),
  '2:spawn': require('@/assets/icons/spawn_player2.svg'),
  '2:base': require('@/assets/icons/base_player2.svg')
}

export default {
  name: 'HexMapEditorCanvas',
  props: {
    hexes: {
      type: Array,
      required: true
    },
    mapWidth: {
      type: Number,
      required: true
    },
    mapHeight: {
      type: Number,
      required: true
    },
    hexSize: {
      type: Number,
      default: () => hexMap.baseHexSize
    },
    selectedHex: {
      type: Object,
      default: null
    },
    showCoordinates: {
      type: Boolean,
      default: false
    },
    isPaintingMode: {
      type: Boolean,
      default: false
    }
  },
  emits: [
    'select-hex',
    'start-drag-painting',
    'continue-drag-painting',
    'stop-drag-painting',
    'hex-right-click'
  ],
  computed: {
    svgSize() {
      return computeSvgMapSize({
        width: this.mapWidth,
        height: this.mapHeight,
        hexSize: this.hexSize
      })
    },
    svgWidth() {
      return this.svgSize.svgWidth + this.svgSafeZone * 2
    },
    svgHeight() {
      return this.svgSize.svgHeight + this.svgSafeZone * 2
    },
    svgSafeZone() {
      return SVG_SAFE_ZONE
    },
    // Reads `--overlay-icon-size` from :root so we match the global CSS sizing
    // used elsewhere in the app; falls back to a sane integer if the var is
    // missing (e.g. during SSR/test environments without a real DOM).
    overlayIconSize() {
      if (typeof document === 'undefined' || !document.documentElement) {
        return OVERLAY_ICON_FALLBACK_SIZE
      }
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--overlay-icon-size')
        .trim()
      const parsed = parseInt(raw, 10)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : OVERLAY_ICON_FALLBACK_SIZE
    }
  },
  mounted() {
    document.addEventListener('mouseup', this.onDocumentStopDrag)
    document.addEventListener('mouseleave', this.onDocumentStopDrag)
  },
  beforeUnmount() {
    document.removeEventListener('mouseup', this.onDocumentStopDrag)
    document.removeEventListener('mouseleave', this.onDocumentStopDrag)
  },
  methods: {
    hexKey(hex) {
      return `${hex.q},${hex.r}`
    },
    getOverlayIcon(player, type) {
      return OVERLAY_ICONS[`${player}:${type}`] || ''
    },
    onSelectHex(hex) {
      this.$emit('select-hex', hex)
    },
    onStartDragPainting(hex, event) {
      this.$emit('start-drag-painting', hex, event)
    },
    onContinueDragPainting(hex) {
      this.$emit('continue-drag-painting', hex)
    },
    onStopDragPainting() {
      this.$emit('stop-drag-painting')
    },
    onHexRightClick(hex, event) {
      this.$emit('hex-right-click', hex, event)
    },
    onDocumentStopDrag() {
      this.$emit('stop-drag-painting')
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.hex-map-editor-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  min-height: fit-content;

  &--painting {
    cursor: crosshair;
  }

  &__svg {
    background-color: $surface-color;
    flex-shrink: 0;
  }

  &__hex-group {
    cursor: pointer;
  }

  &__cell {
    transition: filter $transition-fast $transition-easing;
  }

  &__cell--locked {
    filter: saturate(0.85) brightness(0.95);
  }

  &__inner-stroke {
    pointer-events: none;
    opacity: 0;
    transition: opacity $transition-fast;
  }

  &__hex-group:hover &__inner-stroke--hover {
    opacity: 1;
  }

  &__inner-stroke--selected {
    opacity: 1;
  }

  &__lock-outline {
    fill: rgba(0, 0, 0, 0.08);
    stroke: rgba(0, 0, 0, 0.5);
    stroke-width: 2;
    stroke-dasharray: 4 3;
    pointer-events: none;
  }

  &__lock-icon {
    pointer-events: none;

    rect {
      fill: rgba(255, 255, 255, 0.86);
      stroke: rgba(0, 0, 0, 0.68);
      stroke-width: 1.5;
    }

    path {
      fill: none;
      stroke: rgba(0, 0, 0, 0.72);
      stroke-width: 1.6;
      stroke-linecap: round;
    }
  }

  &__coordinates {
    font-size: $font-size-small;
    text-anchor: middle;
    fill: $hex-coordinates;
    pointer-events: none;
  }

  &__empty {
    text-align: center;
    color: $text-muted;
    font-style: italic;
  }
}
</style>
