<template>
  <section class="map-controls-panel" :aria-label="$t('levelBuilder.mapControls.ariaLabel')">
    <div class="map-controls-panel__tabs" role="tablist" :aria-label="$t('levelBuilder.mapControls.stepsAria')">
      <button
        id="map-controls-generation-tab"
        type="button"
        class="map-controls-panel__tab"
        :class="{ 'map-controls-panel__tab--active': activeControlStep === 'generation' }"
        role="tab"
        :aria-selected="String(activeControlStep === 'generation')"
        aria-controls="map-controls-generation-panel"
        @click="activeControlStep = 'generation'"
      >
        <span class="map-controls-panel__tab-text">{{ $t('levelBuilder.mapControls.mapGeneration') }}</span>
      </button>
      <button
        id="map-controls-adjustment-tab"
        type="button"
        class="map-controls-panel__tab"
        :class="{ 'map-controls-panel__tab--active': activeControlStep === 'adjustment' }"
        role="tab"
        :aria-selected="String(activeControlStep === 'adjustment')"
        aria-controls="map-controls-adjustment-panel"
        :disabled="!hasGeneratedMap"
        @click="activeControlStep = 'adjustment'"
      >
        <span class="map-controls-panel__tab-text">{{ $t('levelBuilder.mapControls.manualAdjustments') }}</span>
      </button>
    </div>

    <div
      v-if="activeControlStep === 'generation'"
      id="map-controls-generation-panel"
      class="map-controls-panel__step"
      role="tabpanel"
      aria-labelledby="map-controls-generation-tab"
    >
      <div class="map-controls-panel__group">
        <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.mapDimensions') }}</h4>
        <div class="map-controls-panel__dimensions">
          <div class="map-controls-panel__input-group">
            <label :for="widthInputId" class="map-controls-panel__label">{{ $t('levelBuilder.mapControls.widthHexCells') }}</label>
            <div class="map-controls-panel__stepper">
              <button
                type="button"
                class="map-controls-panel__stepper-btn"
                :disabled="mapParams.width <= minMapDimension"
                :aria-label="$t('levelBuilder.mapControls.decreaseWidth')"
                @click="$emit('decrease-width')"
              >-</button>
              <input
                :id="widthInputId"
                type="number"
                :min="minMapDimension"
                max="50"
                class="map-controls-panel__number-input"
                :value="mapParams.width"
                @input="onWidthInput"
                @keydown.enter.prevent="commitWidthInput"
                @blur="commitWidthInput"
              />
              <button
                type="button"
                class="map-controls-panel__stepper-btn"
                :disabled="mapParams.width >= 50"
                :aria-label="$t('levelBuilder.mapControls.increaseWidth')"
                @click="$emit('increase-width')"
              >+</button>
            </div>
          </div>

          <div class="map-controls-panel__input-group">
            <label :for="heightInputId" class="map-controls-panel__label">{{ $t('levelBuilder.mapControls.heightHexCells') }}</label>
            <div class="map-controls-panel__stepper">
              <button
                type="button"
                class="map-controls-panel__stepper-btn"
                :disabled="mapParams.height <= minMapDimension"
                :aria-label="$t('levelBuilder.mapControls.decreaseHeight')"
                @click="$emit('decrease-height')"
              >-</button>
              <input
                :id="heightInputId"
                type="number"
                :min="minMapDimension"
                max="50"
                class="map-controls-panel__number-input"
                :value="mapParams.height"
                @input="onHeightInput"
                @keydown.enter.prevent="commitHeightInput"
                @blur="commitHeightInput"
              />
              <button
                type="button"
                class="map-controls-panel__stepper-btn"
                :disabled="mapParams.height >= 50"
                :aria-label="$t('levelBuilder.mapControls.increaseHeight')"
                @click="$emit('increase-height')"
              >+</button>
            </div>
          </div>
        </div>

        <div class="map-controls-panel__input-group map-controls-panel__seed-group">
          <label :for="seedInputId" class="map-controls-panel__label">{{ $t('levelBuilder.mapControls.terrainSeedOptional') }}</label>
          <div class="map-controls-panel__seed-row">
            <input
              :id="seedInputId"
              type="text"
              class="map-controls-panel__seed-input"
              :placeholder="$t('levelBuilder.mapControls.seedPlaceholder')"
              :value="terrainSeed"
              :readonly="terrainSeedLocked"
              @input="onSeedInput"
              @change="commitSeedInput"
              @keydown.enter.prevent="commitSeedInput"
            />
            <button
              type="button"
              class="map-controls-panel__seed-lock-btn"
              :class="{ 'map-controls-panel__seed-lock-btn--locked': terrainSeedLocked }"
              :aria-label="terrainSeedLockButtonLabel"
              :aria-pressed="String(terrainSeedLocked)"
              :title="terrainSeedLockButtonLabel"
              @click="toggleTerrainSeedLock"
            >
              <PhLockKey v-if="terrainSeedLocked" :size="18" weight="bold" aria-hidden="true" />
              <PhLockKeyOpen v-else :size="18" weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div class="map-controls-panel__divider"></div>

      <div class="map-controls-panel__group">
        <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.terrainIncluded') }}</h4>
        <div class="map-controls-panel__terrain-grid">
          <button
            v-for="terrain in terrainTypes"
            :key="terrain.id"
            type="button"
            class="map-controls-panel__terrain-option"
            :class="{ 'map-controls-panel__terrain-option--selected': isGenerationTerrainSelected(terrain) }"
            @click="$emit('toggle-terrain', terrain.id)"
          >
            <span
              class="map-controls-panel__terrain-swatch"
              :style="{ backgroundColor: terrain.color }"
            ></span>
            <span class="map-controls-panel__terrain-name">{{ terrainLabel(terrain) }}</span>
            <span class="map-controls-panel__terrain-difficulty">
              ({{ terrainDifficultyLabel(terrain) }})
            </span>
          </button>
        </div>
        <button
          type="button"
          class="map-controls-panel__configure-terrain-btn"
          @click="openTerrainDialog"
        >
          <PhGearSix :size="17" weight="bold" aria-hidden="true" />
          <span>{{ $t('levelBuilder.mapControls.configureTerrain') }}</span>
        </button>
      </div>

      <div class="map-controls-panel__divider"></div>

      <div class="map-controls-panel__group">
        <button
          type="button"
          class="map-controls-panel__generate-btn map-controls-panel__regenerate-btn"
          :disabled="mapParams.availableTerrain.length === 0"
          @click="emitGenerateMap"
        >
          <PhShuffle :size="17" weight="bold" aria-hidden="true" />
          <span>{{ hasGeneratedMap ? $t('levelBuilder.mapControls.regenerateTerrain') : $t('levelBuilder.mapControls.generateTerrain') }}</span>
        </button>
      </div>
    </div>

    <div
      v-else
      id="map-controls-adjustment-panel"
      class="map-controls-panel__step"
      role="tabpanel"
      aria-labelledby="map-controls-adjustment-tab"
    >
      <div class="map-controls-panel__group">
        <div class="map-controls-panel__input-group map-controls-panel__seed-group">
          <label :for="adjustmentSeedInputId" class="map-controls-panel__label">{{ $t('levelBuilder.mapControls.terrainSeedOptional') }}</label>
          <div class="map-controls-panel__seed-row">
            <input
              :id="adjustmentSeedInputId"
              type="text"
              class="map-controls-panel__seed-input"
              :placeholder="$t('levelBuilder.mapControls.seedPlaceholder')"
              :value="terrainSeed"
              :readonly="terrainSeedLocked"
              @input="onSeedInput"
              @change="commitSeedInput"
              @keydown.enter.prevent="commitSeedInput"
            />
            <button
              type="button"
              class="map-controls-panel__seed-lock-btn"
              :class="{ 'map-controls-panel__seed-lock-btn--locked': terrainSeedLocked }"
              :aria-label="terrainSeedLockButtonLabel"
              :aria-pressed="String(terrainSeedLocked)"
              :title="terrainSeedLockButtonLabel"
              @click="toggleTerrainSeedLock"
            >
              <PhLockKey v-if="terrainSeedLocked" :size="18" weight="bold" aria-hidden="true" />
              <PhLockKeyOpen v-else :size="18" weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
        <button
          type="button"
          class="map-controls-panel__regenerate-btn"
          :disabled="mapParams.availableTerrain.length === 0 || !hasGeneratedMap"
          @click="$emit('generate-map')"
        >
          <PhShuffle :size="17" weight="bold" aria-hidden="true" />
          <span>{{ $t('levelBuilder.mapControls.regenerateTerrain') }}</span>
        </button>
        <label class="map-controls-panel__checkbox">
          <input
            type="checkbox"
            class="map-controls-panel__checkbox-input"
            :checked="protectDeploymentTerrain"
            @change="onProtectDeploymentTerrainChange"
          />
          <span class="map-controls-panel__checkbox-text">{{ $t('levelBuilder.mapControls.protectDeploymentTerrain') }}</span>
        </label>
      </div>

      <div class="map-controls-panel__divider"></div>

      <div class="map-controls-panel__group">
        <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.editorTools') }}</h4>
        <div class="map-controls-panel__tool-grid" role="toolbar" :aria-label="$t('levelBuilder.mapControls.editorToolsAria')">
          <button
            type="button"
            class="map-controls-panel__tool map-controls-panel__tool--icon-only"
            :class="{ 'map-controls-panel__tool--active': activeMapTool === 'select' }"
            :disabled="!hasGeneratedMap"
            :aria-label="$t('levelBuilder.mapControls.selectTool')"
            :title="$t('levelBuilder.mapControls.select')"
            @click="selectTool('select')"
          >
            <PhCursor :size="18" weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="map-controls-panel__tool"
            :class="{ 'map-controls-panel__tool--active': activeMapTool === 'terrain' }"
            :disabled="!hasGeneratedMap"
            :aria-label="$t('levelBuilder.mapControls.terrainBrushTool')"
            :title="$t('levelBuilder.mapControls.terrainBrush')"
            @click="selectTool('terrain')"
          >
            <PhPaintBrush :size="18" weight="bold" aria-hidden="true" />
            <span>{{ $t('levelBuilder.mapControls.terrain') }}</span>
          </button>
          <button
            type="button"
            class="map-controls-panel__tool"
            :class="{ 'map-controls-panel__tool--active': activeMapTool === 'deployment' }"
            :disabled="!hasGeneratedMap"
            :aria-label="$t('levelBuilder.mapControls.deploymentAnchorsTool')"
            :title="$t('levelBuilder.mapControls.deploymentAnchors')"
            @click="selectTool('deployment')"
          >
            <PhMapPin :size="18" weight="bold" aria-hidden="true" />
            <span>{{ $t('levelBuilder.mapControls.spawn') }}</span>
          </button>
          <button
            type="button"
            class="map-controls-panel__tool"
            :class="{ 'map-controls-panel__tool--active': activeMapTool === 'lock' }"
            :disabled="!hasGeneratedMap"
            :aria-label="$t('levelBuilder.mapControls.lockTool')"
            :title="$t('levelBuilder.mapControls.lock')"
            @click="selectTool('lock')"
          >
            <PhLockKey :size="18" weight="bold" aria-hidden="true" />
            <span>{{ $t('levelBuilder.mapControls.lock') }}</span>
          </button>
        </div>
      </div>

      <template v-if="activeMapTool === 'terrain'">
        <div class="map-controls-panel__group">
          <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.terrainBrush') }}</h4>
          <div class="map-controls-panel__terrain-grid">
            <button
              v-for="terrain in terrainTypes"
              :key="terrain.id"
              type="button"
              class="map-controls-panel__terrain-option map-controls-panel__terrain-option--brush"
              :class="{ 'map-controls-panel__terrain-option--selected': isBrushTerrainSelected(terrain) }"
              @click="$emit('select-terrain-for-painting', terrain)"
            >
              <span
                class="map-controls-panel__terrain-swatch map-controls-panel__terrain-swatch--round"
                :style="{ backgroundColor: terrain.color }"
              ></span>
              <span class="map-controls-panel__terrain-name">{{ terrainLabel(terrain) }}</span>
              <span class="map-controls-panel__terrain-difficulty">
                ({{ terrainDifficultyLabel(terrain) }})
              </span>
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="activeMapTool === 'deployment'">
        <div class="map-controls-panel__group">
          <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.deploymentAnchors') }}</h4>
          <div class="map-controls-panel__anchor-groups">
            <section
              v-for="group in deploymentAnchorGroups"
              :key="group.id"
              class="map-controls-panel__anchor-group"
            >
              <h5 class="map-controls-panel__anchor-group-title">{{ group.title }}</h5>
              <div class="map-controls-panel__anchors-grid">
                <button
                  v-for="overlay in group.overlays"
                  :key="overlay.id"
                  type="button"
                  class="map-controls-panel__anchor"
                  :class="{
                    'map-controls-panel__anchor--selected':
                      selectedOverlay && selectedOverlay.id === overlay.id
                  }"
                  @click="$emit('select-overlay', overlay)"
                >
                  <span
                    class="map-controls-panel__anchor-indicator"
                    :class="`map-controls-panel__anchor-indicator--p${overlay.player}`"
                  >
                    <img
                      :src="overlay.iconPath"
                      :alt="overlay.name"
                      class="map-controls-panel__anchor-icon"
                    />
                  </span>
                  <span class="map-controls-panel__anchor-name">
                    {{ deploymentAnchorButtonLabel(overlay) }}
                  </span>
                </button>
              </div>
            </section>
          </div>
          <div class="map-controls-panel__lock-summary">
            <span>{{ $tf('levelBuilder.mapControls.anchorsPlaced', `Anchors placed: ${deploymentAnchorCount}`, { count: deploymentAnchorCount }) }}</span>
            <button
              type="button"
              class="map-controls-panel__text-btn"
              :disabled="clearableDeploymentAnchorCount === 0"
              @click="$emit('clear-deployment-anchors')"
            >
              {{ clearDeploymentButtonText }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="activeMapTool === 'lock'">
        <div class="map-controls-panel__group">
          <h4 class="map-controls-panel__group-title">{{ $t('levelBuilder.mapControls.lockTool') }}</h4>
          <div class="map-controls-panel__lock-actions" role="group" :aria-label="$t('levelBuilder.mapControls.lockBrushMode')">
            <button
              type="button"
              class="map-controls-panel__lock-action"
              :class="{ 'map-controls-panel__lock-action--active': lockBrushMode === 'lock' }"
              @click="$emit('select-lock-brush-mode', 'lock')"
            >
              <PhLockKey :size="17" weight="bold" aria-hidden="true" />
              <span>{{ $t('levelBuilder.mapControls.lockTiles') }}</span>
            </button>
            <button
              type="button"
              class="map-controls-panel__lock-action"
              :class="{ 'map-controls-panel__lock-action--active': lockBrushMode === 'unlock' }"
              @click="$emit('select-lock-brush-mode', 'unlock')"
            >
              <PhLockKeyOpen :size="17" weight="bold" aria-hidden="true" />
              <span>{{ $t('levelBuilder.mapControls.unlockTiles') }}</span>
            </button>
          </div>
          <div class="map-controls-panel__lock-summary">
            <span>{{ $tf('levelBuilder.mapControls.lockedTiles', `Locked tiles: ${lockedHexCount}`, { count: lockedHexCount }) }}</span>
            <button
              type="button"
              class="map-controls-panel__text-btn"
              :disabled="lockedHexCount === 0"
              @click="$emit('unlock-all-hexes')"
            >
              {{ $t('levelBuilder.mapControls.unlockAll') }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <TerrainCatalogDialog
      v-if="terrainDialogOpen"
      :terrain-types="terrainTypes"
      @close="terrainDialogOpen = false"
      @apply="applyTerrainTypes"
    />
  </section>
</template>

<script>
import {
  PhCursor,
  PhGearSix,
  PhLockKey,
  PhLockKeyOpen,
  PhMapPin,
  PhPaintBrush,
  PhShuffle
} from '@phosphor-icons/vue'
import TerrainCatalogDialog from './TerrainCatalogDialog.vue'
import { resolvePackageEntryLabel } from '../../utils/packageLabels.js'

const MIN_MAP_DIMENSION = 4
const MAX_MAP_DIMENSION = 50

export default {
  name: 'MapControlsPanel',
  components: {
    PhCursor,
    PhGearSix,
    PhLockKey,
    PhLockKeyOpen,
    PhMapPin,
    PhPaintBrush,
    PhShuffle,
    TerrainCatalogDialog
  },
  props: {
    mapParams: {
      type: Object,
      required: true
    },
    terrainTypes: {
      type: Array,
      required: true
    },
    terrainSeed: {
      type: String,
      required: true
    },
    terrainSeedLocked: {
      type: Boolean,
      required: true
    },
    selectedTerrainForPainting: {
      type: Object,
      default: null
    },
    protectDeploymentTerrain: {
      type: Boolean,
      required: true
    },
    overlayTypes: {
      type: Array,
      required: true
    },
    selectedOverlay: {
      type: Object,
      default: null
    },
    activeMapTool: {
      type: String,
      default: 'select'
    },
    lockBrushMode: {
      type: String,
      default: 'lock'
    },
    hasGeneratedMap: {
      type: Boolean,
      default: false
    },
    lockedHexCount: {
      type: Number,
      default: 0
    },
    deploymentAnchorCount: {
      type: Number,
      default: 0
    },
    clearableDeploymentAnchorCount: {
      type: Number,
      default: 0
    }
  },
  emits: [
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
    'select-overlay',
    'select-map-tool',
    'select-lock-brush-mode',
    'unlock-all-hexes',
    'clear-deployment-anchors',
    'update:protect-deployment-terrain'
  ],
  data() {
    return {
      uid: `${Math.random().toString(36).slice(2, 8)}`,
      activeControlStep: 'generation',
      terrainDialogOpen: false,
      minMapDimension: MIN_MAP_DIMENSION
    }
  },
  computed: {
    widthInputId() {
      return `map-controls-width-${this.uid}`
    },
    heightInputId() {
      return `map-controls-height-${this.uid}`
    },
    seedInputId() {
      return `map-controls-seed-${this.uid}`
    },
    adjustmentSeedInputId() {
      return `map-controls-adjustment-seed-${this.uid}`
    },
    terrainSeedLockButtonLabel() {
      return this.terrainSeedLocked
        ? this.$t('levelBuilder.mapControls.unlockTerrainSeed')
        : this.$t('levelBuilder.mapControls.lockTerrainSeed')
    },
    clearDeploymentButtonText() {
      return this.clearableDeploymentAnchorCount < this.deploymentAnchorCount
        ? this.$t('levelBuilder.mapControls.clearUnlocked')
        : this.$t('levelBuilder.mapControls.clearAll')
    },
    deploymentAnchorGroups() {
      return [
        { id: 'player', title: this.$t('levelBuilder.mapControls.playerGroup'), player: 1 },
        { id: 'enemy', title: this.$t('levelBuilder.mapControls.enemyGroup'), player: 2 }
      ].map(group => ({
        ...group,
        overlays: this.overlayTypes
          .filter(overlay => overlay.player === group.player)
          .sort((a, b) => this.deploymentAnchorSortValue(a) - this.deploymentAnchorSortValue(b))
      }))
    }
  },
  watch: {
    hasGeneratedMap(value) {
      if (!value) this.activeControlStep = 'generation'
    }
  },
  methods: {
    isGenerationTerrainSelected(terrain) {
      return this.mapParams.availableTerrain.includes(terrain.id)
    },
    isBrushTerrainSelected(terrain) {
      return !!this.selectedTerrainForPainting && this.selectedTerrainForPainting.id === terrain.id
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
    },
    openTerrainDialog() {
      this.terrainDialogOpen = true
    },
    applyTerrainTypes(terrainTypes) {
      this.$emit('update-terrain-types', terrainTypes)
      this.terrainDialogOpen = false
    },
    deploymentAnchorButtonLabel(overlay) {
      return overlay && overlay.type === 'spawn'
        ? this.$t('levelBuilder.mapControls.spawnPoint')
        : this.$t('levelBuilder.mapControls.base')
    },
    deploymentAnchorSortValue(overlay) {
      if (overlay && overlay.type === 'spawn') return 0
      if (overlay && overlay.type === 'base') return 1
      return 2
    },
    emitGenerateMap() {
      const shouldAdvanceToAdjustment = !this.hasGeneratedMap
      this.$emit('generate-map')
      if (shouldAdvanceToAdjustment) {
        this.activeControlStep = 'adjustment'
      }
    },
    selectTool(tool) {
      this.$emit('select-map-tool', tool)
    },
    normalizeDimensionInput(value, fallback) {
      const n = Number(value)
      if (!Number.isFinite(n)) return fallback
      return Math.max(MIN_MAP_DIMENSION, Math.min(MAX_MAP_DIMENSION, Math.trunc(n)))
    },
    onWidthInput(event) {
      const value = event.target.valueAsNumber
      if (Number.isFinite(value) && value >= MIN_MAP_DIMENSION && value <= MAX_MAP_DIMENSION) {
        this.$emit('update:map-width', value)
      }
    },
    onHeightInput(event) {
      const value = event.target.valueAsNumber
      if (Number.isFinite(value) && value >= MIN_MAP_DIMENSION && value <= MAX_MAP_DIMENSION) {
        this.$emit('update:map-height', value)
      }
    },
    commitWidthInput(event) {
      const value = this.normalizeDimensionInput(event.target.value, this.mapParams.width)
      event.target.value = String(value)
      this.$emit('update:map-width', value)
      this.$emit('commit-map-dimensions')
    },
    commitHeightInput(event) {
      const value = this.normalizeDimensionInput(event.target.value, this.mapParams.height)
      event.target.value = String(value)
      this.$emit('update:map-height', value)
      this.$emit('commit-map-dimensions')
    },
    onSeedInput(event) {
      this.$emit('update:terrain-seed', event.target.value)
    },
    commitSeedInput(event) {
      const value = event.target.value
      this.$emit('update:terrain-seed', value)
      if (!this.terrainSeedLocked && typeof value === 'string' && value.trim()) {
        this.$emit('update:terrain-seed-locked', true)
      }
    },
    toggleTerrainSeedLock() {
      this.$emit('update:terrain-seed-locked', !this.terrainSeedLocked)
    },
    onProtectDeploymentTerrainChange(event) {
      this.$emit('update:protect-deployment-terrain', event.target.checked)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.map-controls-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border: $border-width solid $border-color;
  border-radius: $border-radius;
  background-color: $surface-color;
  overflow: hidden;

  &__tabs {
    display: flex;
    min-width: 0;
    padding: 0;
    border: 0;
    border-bottom: $border-width solid $border-light;
    border-radius: $border-radius $border-radius 0 0;
    background-color: $background-color;
  }

  &__tab {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    min-height: 54px;
    padding: 12px 16px;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: $text-secondary;
    cursor: pointer;
    text-align: left;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      background-color: rgba($primary-color, 0.08);
      color: $text-primary;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    &--active {
      border-bottom-color: $primary-color;
      background-color: $surface-color;
      color: $primary-color;
    }
  }

  &__tab-text {
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    line-height: 1.2;
  }

  &__step {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: $panel-padding;
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__group-title {
    margin: 0 0 2px;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__dimensions {
    display: flex;
    flex-direction: row;
    gap: 10px;
  }

  &__input-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__seed-group {
    margin-top: 6px;
  }

  &__seed-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
  }

  &__label {
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    color: $text-secondary;
  }

  &__stepper {
    display: flex;
    align-items: stretch;
    border: $border-width solid $border-color;
    border-radius: 4px;
    overflow: hidden;
    background: $surface-color;
  }

  &__stepper-btn {
    flex: 0 0 30px;
    border: none;
    background-color: $surface-color;
    color: $text-primary;
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      background-color: $primary-light;
      color: $primary-color;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__number-input {
    flex: 1;
    min-width: 0;
    border: none;
    padding: 6px 4px;
    font-size: $font-size-medium;
    text-align: center;
    background: $surface-color;
    color: $text-primary;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    appearance: textfield;
    -moz-appearance: textfield;
  }

  &__seed-input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    padding: $input-padding;
    border: $border-width solid $border-color;
    border-radius: 4px;
    background: $surface-color;
    font-family: monospace;
    font-size: $font-size-medium;
    color: $text-primary;
    transition: border-color $transition-fast $transition-easing,
                box-shadow $transition-fast $transition-easing;

    &:focus {
      outline: none;
      border-color: $primary-color;
      box-shadow: 0 0 0 2px rgba($primary-color, 0.2);
    }

    &[readonly] {
      background: $primary-light;
      border-color: rgba($primary-color, 0.5);
      cursor: text;
    }
  }

  &__seed-lock-btn {
    flex: 0 0 38px;
    width: 38px;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: $border-width solid $border-color;
    border-radius: 4px;
    background: $surface-color;
    color: $text-secondary;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing,
                box-shadow $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
      color: $primary-color;
      background-color: $primary-light;
    }

    &--locked {
      border-color: $primary-color;
      background-color: $primary-light;
      color: $primary-color;
    }
  }

  &__divider {
    border-bottom: $border-width solid $border-light;
    margin: 2px 0;
  }

  &__terrain-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  &__terrain-option {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 34px;
    padding: 8px;
    border: 2px solid $border-color;
    border-radius: 6px;
    background: $surface-color;
    cursor: pointer;
    text-align: left;
    transition: border-color $transition-fast $transition-easing,
                background-color $transition-fast $transition-easing,
                box-shadow $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
    }

    &--selected {
      border-color: $primary-color;
      background-color: $primary-light;
    }

    &--brush.map-controls-panel__terrain-option--selected {
      border-color: $success-color;
      background-color: rgba($success-color, 0.1);
      box-shadow: 0 2px 8px rgba($success-color, 0.25);
    }
  }

  &__terrain-swatch {
    width: $terrain-color-size;
    height: $terrain-color-size;
    border-radius: 3px;
    border: $border-width solid $border-dark;
    flex-shrink: 0;

    &--round {
      border-radius: 50%;
      border-color: $border-color;
    }
  }

  &__terrain-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__terrain-difficulty {
    flex: 0 0 auto;
    font-size: $font-size-normal;
    font-weight: $font-weight-normal;
    color: rgba($text-primary, 0.58);
  }

  &__configure-terrain-btn {
    width: 100%;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 10px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    color: $text-primary;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
      color: $primary-color;
      background-color: $primary-light;
    }
  }

  &__generate-btn,
  &__regenerate-btn {
    width: 100%;
    min-height: 40px;
    padding: $button-padding;
    border: none;
    border-radius: 6px;
    background-color: $success-color;
    color: $surface-color;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      background-color: $success-hover;
    }

    &:disabled {
      background-color: $disabled-background;
      color: $disabled-color;
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  &__regenerate-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  &__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    user-select: none;

    &:hover {
      color: $text-primary;
    }
  }

  &__checkbox-input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: $primary-color;
    cursor: pointer;
    flex-shrink: 0;
  }

  &__checkbox-text {
    color: $text-primary;
  }

  &__tool-grid {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
  }

  &__tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex: 0 0 auto;
    min-width: 0;
    height: 38px;
    padding: 8px 10px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    color: $text-secondary;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:hover:not(:disabled) {
      border-color: $primary-color;
      color: $primary-color;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    &--active {
      border-color: $primary-color;
      background-color: $primary-light;
      color: $primary-color;
    }

    &--icon-only {
      width: 38px;
      padding: 0;
    }
  }

  &__anchor-groups {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__anchor-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__anchor-group-title {
    margin: 0;
    color: $text-secondary;
    font-size: $font-size-normal;
    font-weight: $font-weight-bold;
  }

  &__anchors-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  &__anchor {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 48px;
    padding: 8px;
    border: 2px solid $border-color;
    border-radius: 8px;
    background: $surface-color;
    cursor: pointer;
    text-align: left;
    transition: border-color $transition-fast $transition-easing,
                background-color $transition-fast $transition-easing,
                box-shadow $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
      background-color: $primary-light;
    }

    &--selected {
      border-color: $success-color;
      background-color: rgba($success-color, 0.1);
      box-shadow: 0 2px 8px rgba($success-color, 0.25);
    }
  }

  &__anchor-indicator {
    width: 34px;
    height: 34px;
    border: 3px solid;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.1);

    &--p1 {
      border-color: var(--overlay-player1-color);
    }

    &--p2 {
      border-color: var(--overlay-player2-color);
    }
  }

  &__anchor-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  &__anchor-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__lock-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  &__lock-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px;
    border: 2px solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    color: $text-secondary;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
      color: $primary-color;
    }

    &--active {
      border-color: $success-color;
      background-color: rgba($success-color, 0.1);
      color: $text-primary;
      box-shadow: 0 2px 8px rgba($success-color, 0.25);
    }
  }

  &__lock-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
    color: $text-secondary;
    font-size: $font-size-medium;
  }

  &__text-btn {
    border: none;
    background: none;
    color: $primary-color;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    cursor: pointer;
    padding: 4px 0;

    &:hover:not(:disabled) {
      color: $primary-hover;
      text-decoration: underline;
    }

    &:disabled {
      color: $disabled-color;
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

}
</style>
