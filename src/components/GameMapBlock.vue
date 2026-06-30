<template>
  <div :class="mapRootClasses">
    <div class="block-header-with-status">
      <h3>{{ $t('gameplay.map.title') }}</h3>
      <div class="header-status">
        <div class="settings-container">
        <button 
          @click="toggleSettings" 
          class="settings-btn"
          :class="{ active: showSettings }"
          :title="$t('gameplay.map.settings')"
        >
          ⚙️
        </button>
        
        <!-- Settings Dropdown -->
        <div v-if="showSettings" class="settings-dropdown">
          <!-- Coordinates Toggle -->
          <div class="settings-section">
            <label class="switch-label">
              <input 
                type="checkbox" 
                v-model="showCoordinates"
                class="switch-input"
              />
              <span class="switch-slider"></span>
              {{ $t('gameplay.map.coordinates') }}
            </label>
          </div>
          
          <!-- Spawns Background Toggle -->
          <div class="settings-section">
            <label class="switch-label">
              <input 
                type="checkbox" 
                v-model="showSpawnsBg"
                class="switch-input"
              />
              <span class="switch-slider"></span>
              {{ $t('gameplay.map.spawnBg') }}
            </label>
          </div>
          
          <!-- Spawns Icons Toggle -->
          <div class="settings-section">
            <label class="switch-label">
              <input 
                type="checkbox" 
                v-model="showSpawnsIcons"
                class="switch-input"
              />
              <span class="switch-slider"></span>
              {{ $t('gameplay.map.spawnIcons') }}
            </label>
          </div>
          
          <!-- Bases Toggle -->
          <div class="settings-section">
            <label class="switch-label">
              <input 
                type="checkbox" 
                v-model="showBases"
                class="switch-input"
              />
              <span class="switch-slider"></span>
              {{ $t('gameplay.map.baseIcons') }}
            </label>
          </div>
          
          <!-- Zoom Controls -->
          <div class="settings-section">
            <h4>{{ $t('gameplay.map.zoom') }}</h4>
            <div class="zoom-buttons">
              <button 
                @click="zoomOut" 
                class="zoom-btn zoom-out"
                :disabled="zoomLevel <= hexMapConfig.minZoom"
              >
                −
              </button>
              <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
              <button 
                @click="zoomIn" 
                class="zoom-btn zoom-in"
                :disabled="zoomLevel >= hexMapConfig.maxZoom"
              >
                +
              </button>
            </div>
            <button @click="resetZoom" class="reset-zoom-btn">
              {{ $t('gameplay.map.resetZoom') }}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
    
    <div
      class="map-container"
      :class="{ 'map-container--has-map': hasMapSource && hexMapData.length > 0 && !isLoading }"
      ref="mapContainer"
    >
      <svg 
        v-if="hasMapSource && hexMapData.length > 0 && !isLoading"
        :width="svgWidth" 
        :height="svgHeight"
        class="hex-map-svg"
        @wheel="handleWheel"
        @mousedown="startPan"
        @mousemove="pan"
        @mouseup="stopPan"
        @mouseleave="stopPan"
        @contextmenu="handleRightClick"
      >
        <!-- SVG Patterns for overlay fills -->
        <defs>
          <pattern id="diagonal-stripes-p1" 
                   patternUnits="userSpaceOnUse" 
                   width="10" height="10" 
                   patternTransform="rotate(30)">
            <line x1="0" y="0" x2="0" y2="10" 
                  stroke="var(--overlay-player1-color)" 
                  stroke-opacity="var(--overlay-player1-fill-opacity)"
                  stroke-width="10" />
          </pattern>
          <pattern id="diagonal-stripes-p2" 
                   patternUnits="userSpaceOnUse" 
                   width="10" height="10" 
                   patternTransform="rotate(30)">
            <line x1="0" y="0" x2="0" y2="10" 
                  stroke="var(--overlay-player2-color)" 
                  stroke-opacity="var(--overlay-player2-fill-opacity)"
                  stroke-width="10" />
          </pattern>
        </defs>
        
        <g class="hex-map-group" :class="{ panning: isPanning }" :transform="`translate(${panX}, ${panY})`">
          <g v-for="(hex, index) in hexMapData" :key="index" class="hex-group">
            <polygon
              :points="hex.points"
              :fill="hex.terrain.color"
              :stroke="hex.stroke"
              :stroke-width="hex.strokeWidth"
              class="hex-cell"
              :class="{
                selected: selectedHex === hex,
                'out-of-range': isOutOfRange(hex)
              }"
              @click="selectHex(hex, $event)"
            />
            
            <text 
              v-if="showCoordinates"
              :x="hex.center.x" 
              :y="hex.center.y + 4"
              class="hex-coordinates"
              :class="{ 'out-of-range': isOutOfRange(hex) }"
              text-anchor="middle"
            >
              {{ hex.q }},{{ hex.r }}
            </text>
            
            <!-- Overlay Borders (spawns) -->
            <polygon
              v-if="showSpawnsBg && (hex.player1Spawn || hex.player2Spawn)"
              :points="hex.points"
              :class="[
                'hex-overlay-border',
                hex.player1Spawn ? 'hex-overlay-border-p1' : 'hex-overlay-border-p2'
              ]"
            />
            
            <!-- Overlay Icons -->
            <image 
              v-if="showSpawnsIcons && hex.player1Spawn"
              :href="getOverlayIcon(1, 'spawn')"
              :x="hex.center.x - (hex.player1Base && showBases ? overlayIconSize : overlayIconSize / 2)" 
              :y="hex.center.y - overlayIconSize / 2"
              :width="overlayIconSize"
              :height="overlayIconSize"
              class="overlay-icon overlay-icon-spawn-p1"
              preserveAspectRatio="xMidYMid meet"
            />
            <image 
              v-if="showBases && hex.player1Base"
              :href="getOverlayIcon(1, 'base')"
              :x="hex.center.x + (hex.player1Spawn && showSpawnsIcons ? 0 : -overlayIconSize / 2)" 
              :y="hex.center.y - overlayIconSize / 2"
              :width="overlayIconSize"
              :height="overlayIconSize"
              class="overlay-icon overlay-icon-base-p1"
              preserveAspectRatio="xMidYMid meet"
            />
            <image 
              v-if="showSpawnsIcons && hex.player2Spawn"
              :href="getOverlayIcon(2, 'spawn')"
              :x="hex.center.x - (hex.player2Base && showBases ? overlayIconSize : overlayIconSize / 2)" 
              :y="hex.center.y - overlayIconSize / 2"
              :width="overlayIconSize"
              :height="overlayIconSize"
              class="overlay-icon overlay-icon-spawn-p2"
              preserveAspectRatio="xMidYMid meet"
            />
            <image 
              v-if="showBases && hex.player2Base"
              :href="getOverlayIcon(2, 'base')"
              :x="hex.center.x + (hex.player2Spawn && showSpawnsIcons ? 0 : -overlayIconSize / 2)" 
              :y="hex.center.y - overlayIconSize / 2"
              :width="overlayIconSize"
              :height="overlayIconSize"
              class="overlay-icon overlay-icon-base-p2"
              preserveAspectRatio="xMidYMid meet"
            />
            
            <!-- Inner stroke overlay for hover and selected states -->
            <polygon
              v-if="selectedHex === hex"
              :points="hex.innerPoints"
              fill="none"
              stroke="#ffffff"
              stroke-width="3"
              class="hex-inner-stroke selected-stroke"
            />
            <!--
              Mouse-driven hover outline: always present, shown via CSS when the
              hex group is `:hover`ed (suppressed under `.panning`). Replaces the
              old `v-if="hoveredHex === hex"` write so crossing hexes no longer
              mutates reactive state (#61).
              Suppressed when the programmatic outline below is active for this
              hex: two identical #ffffff99 strokes stacked produce ~84% opacity.
              The `--suppressed` class is keyed on `hoveredHex === hex`, which is
              the same expression as the v-if below — no extra re-render cost.
            -->
            <polygon
              :points="hex.innerPoints"
              fill="none"
              stroke="#ffffff99"
              stroke-width="2"
              :class="['hex-inner-stroke', 'hex-hover-outline', { 'hex-hover-outline--suppressed': hoveredHex === hex }]"
            />
            <!--
              Programmatic hover outline driven by `unitPreviewHoverIntent` from a
              parent sidebar (no real DOM `:hover`, so CSS cannot show it). Same
              visual as the mouse-hover outline above; the CSS outline above is
              suppressed when this one is mounted to avoid double-stroke stacking.
            -->
            <polygon
              v-if="hoveredHex === hex"
              :points="hex.innerPoints"
              fill="none"
              stroke="#ffffff99"
              stroke-width="2"
              class="hex-inner-stroke hover-stroke"
            />
            <polygon
              v-if="isMoveForwardTarget(hex)"
              :points="hex.innerPoints"
              class="hex-inner-stroke move-forward-target-stroke"
            />
            <polygon
              v-if="isAttackTargetSelectedHex(hex)"
              :points="hex.innerPoints"
              class="hex-inner-stroke attack-target-selected-stroke"
            />
            
            <!-- Unit Display (rendered last to be on top of everything) -->
            <g v-if="renderedUnit(hex)" 
               class="unit-group" 
               :class="{ 'out-of-range': isOutOfRange(hex) }">
              <!-- Unit SVG Icon - centered at hex center -->
              <image
                v-if="getUnitIconPath(renderedUnit(hex), 'body')"
                :href="getUnitIconPath(renderedUnit(hex), 'body')"
                :x="hex.center.x - unitIconSize / 2"
                :y="hex.center.y - unitIconSize / 2"
                :width="unitIconSize"
                :height="unitIconSize"
                class="unit-body-icon"
                preserveAspectRatio="xMidYMid meet"
              />
              
              <image
                v-if="getUnitIconPath(renderedUnit(hex), 'arrow')"
                :href="getUnitIconPath(renderedUnit(hex), 'arrow')"
                :x="hex.center.x - unitIconSize / 2"
                :y="hex.center.y - unitIconSize / 2"
                :width="unitIconSize"
                :height="unitIconSize"
                class="unit-arrow-icon"
                preserveAspectRatio="xMidYMid meet"
                :transform="getUnitArrowTransform(hex.center.x, hex.center.y, renderedUnit(hex).facing)"
              />

            </g>
          </g>
          <path
            v-if="attackRangeContourPath"
            :d="attackRangeContourPath"
            class="attack-range-contour-path"
          />
        </g>
      </svg>
      
      <!-- Selected Hex Dropdown -->
      <SelectedHexDropdown
        :visible="showFloatingPanel && selectedHexDropdownVisible"
        :hex="selectedHex"
        :unit="selectedUnit"
        :show-floating-panel="showFloatingPanel"
        :position="localSelectedHexDropdownPosition"
        :actions-remaining="selectedUnitTurnState ? selectedUnitTurnState.actionsRemaining : null"
        :is-loaded="selectedUnitTurnState ? selectedUnitTurnState.isLoaded : null"
        :can-move-forward="canMoveForward"
        :can-move-reverse="canMoveReverse"
        :selected-target-index="selectedTargetIndex"
        :valid-attack-targets="validAttackTargets"
        :can-fire="canFireAttack"
        :can-reload="canReloadAttack"
        :actions-disabled="actionsBlocked"
        @update:showFloatingPanel="onUpdateShowFloatingPanel"
        @deselect="deselectHex"
        @start-drag="startSelectedHexDrag"
        @move-unit-forward="moveUnitForward"
        @move-unit-reverse="moveUnitReverse"
        @rotate-unit-clockwise="rotateUnitClockwise"
        @rotate-unit-counterclockwise="rotateUnitCounterClockwise"
        @fire="fireAtSelectedTarget"
        @reload="performReloadWeapon"
        @attack-target-shift="shiftAttackTarget"
      />
      
      <div v-if="hasMapSource && isLoading" class="map-loading">
        <div class="loading-spinner"></div>
        <p>{{ $t('gameplay.map.generating') }}</p>
      </div>
      
      <div v-else-if="!hasMapSource && !isLoading">
        <div class="placeholder-content no-map-content">
          <h4>{{ $t('gameplay.map.noMapTitle') }}</h4>
          <p>{{ $t('gameplay.map.noMapBody') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { hexMap } from '../config/theme'
import { getUnitIcon } from '../assets/icons/index.js'
import {
  getHexDirections,
  computeHexPolygonGeometry,
  computeSvgMapSize,
  pointyTopHexPolygonPoints
} from '@/domain/engine/hexUtils.js'
import { clampTargetIndex } from '../constants/combat.js'
import SelectedHexDropdown from './SelectedHexDropdown.vue'
import { normalizeBool } from '../utils/gamePersistence.js'
import { DEFAULT_TERRAIN_COLORS, TERRAIN_COLOR_UNKNOWN } from '../utils/terrainColors.js'
import { getDiceResultForUi } from '../utils/diceUi.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'
import {
  reactMoveForward,
  reactMoveReverse,
  reactRotate,
  reactSetFacing,
  reactFire,
  reactReload
} from '../ui/playground/commandReactions.js'

/** Shared empty Sets — identity only; do not mutate (Object.freeze does not block Set.prototype.add). */
const EMPTY_REACHABILITY_SET = Object.freeze(new Set())
const EMPTY_ATTACK_RANGE_KEYS_SET = Object.freeze(new Set())
const DEFAULT_MAP_ZOOM = 1.5
const PAN_CLICK_SUPPRESSION_THRESHOLD_PX = 3
// Fallback terrain for a hex whose GameState cell carries no terrain object.
// Frozen + shared by the full rebuild and the in-place refresh so the two
// paths can never drift to different "default plains" objects.
const DEFAULT_TERRAIN = Object.freeze({ id: 'plains', name: 'Plains', color: '#8BC34A' })

/**
 * Pre-resolved overlay icon modules — avoids per-call require() in the render path.
 * The try/catch wrapper is necessary because GameMapBlock is mounted under Vitest/happy-dom,
 * which has no SVG asset loader; a bare require() (as used in HexMapEditorCanvas.vue) would
 * throw at module load and break every test in the file before a single test runs.
 */
function _tryRequire(path) {
  try { return require(path) } catch (_) { return null }
}
const OVERLAY_ICONS = {
  '1:spawn': _tryRequire('@/assets/icons/spawn_player1.svg'),
  '1:base': _tryRequire('@/assets/icons/base_player1.svg'),
  '2:spawn': _tryRequire('@/assets/icons/spawn_player2.svg'),
  '2:base': _tryRequire('@/assets/icons/base_player2.svg')
}

export default {
  name: 'GameMapBlock',
  mixins: [i18nTextMixin],
  components: {
    SelectedHexDropdown
  },
  props: {
    mapData: {
      type: Object,
      default: null
    },
    terrainTypes: {
      type: Array,
      default: () => []
    },
    gameState: {
      type: Object,
      default: null
    },
    /**
     * Controller boundary for engine mutations supplied by the parent
     * playground. When present, the map calls
     * `gameController.moveUnit/updateUnitFacing/performAttack/...`
     * instead of `gameState.*` directly so the engine boundary stays
     * in one module.
     */
    gameController: {
      type: Object,
      default: null
    },
    selectedHexDropdownPosition: {
      type: Object,
      default: () => ({ x: 100, y: 100 })
    },
    /** Якщо false — клік по порожньому гексі не відкриває плаваючу панель (вибір гекса лишається для сайдбару). */
    showFloatingPanel: {
      type: Boolean,
      default: true
    },
    /**
     * Counter from the parent playground that bumps each time the
     * playground dispatches an engine command through `gameController`.
     * The map watches this and re-reads its selection/hex from the
     * engine so the view stays in sync without parent → child method
     * calls via `$refs`.
     */
    commandSeq: {
      type: Number,
      default: 0
    },
    /**
     * Intent channel for attack-target shift. The sidebar emits the
     * intent up to the playground; the playground bumps `seq` together
     * with `delta`; the map watches `seq` and applies the shift.
     */
    attackTargetShiftIntent: {
      type: Object,
      default: () => ({ delta: 0, seq: 0 })
    },
    /**
     * Intent channel for UI-level deselect (reset / revert / sidebar
     * close). Replaces the previous `$refs.gameMapBlock.deselectHex()`
     * call from the playground.
     */
    deselectIntent: {
      type: Number,
      default: 0
    },
    unitPreviewHoverIntent: {
      type: Object,
      default: () => ({ unitId: null, seq: 0 })
    },
    unitPreviewSelectIntent: {
      type: Object,
      default: () => ({ unitId: null, seq: 0 })
    },
    actionsDisabled: {
      type: Boolean,
      default: false
    },
    readOnly: {
      type: Boolean,
      default: false
    },
    surfaceVariant: {
      type: String,
      default: 'playground',
      validator: value => value === 'playground' || value === 'viewer'
    }
  },
  data() {
    return {
      currentMap: null,
      hexMapData: [],
      isLoading: false,
      selectedHex: null,
      hoveredHex: null,
      panX: 0,
      panY: 0,
      isPanning: false,
      panStartX: 0,
      panStartY: 0,
      panMovedBeyondClickThreshold: false,
      suppressNextHexClick: false,
      lastPanX: 0,
      lastPanY: 0,
      svgWidth: 800,
      svgHeight: 600,
      resizeTimeout: null,
      showSettings: false,
      showCoordinates: false,
      showSpawnsBg: true,
      showSpawnsIcons: true,
      showBases: true,
      zoomLevel: DEFAULT_MAP_ZOOM,
      selectedUnit: null, // Додаємо стан вибраного юніта
      selectedHexDropdownVisible: false,
      isDraggingSelectedHexDropdown: false,
      selectedHexDragCleanup: null,
      localSelectedHexDropdownPosition: { x: 100, y: 100 }, // Локальна копія позиції
      /** Індекс цілі в validAttackTargets (завжди нормалізується clamp) */
      selectedTargetIndex: 0,
      /** Запобігає подвійному Fire з одного кадру (debounce через rAF) */
      fireRafPending: false,
      /** rAF handle for coalesced wheel-zoom rebuild; cancelled in beforeUnmount */
      zoomRafPending: null,
      /** Оновлюється в `syncValidAttackTargets` (не рахувати LOS у computed — ESLint / побічні ефекти). */
      validAttackTargetsCache: [],
      /** Per-instance LOS toast dedupe key; remounts must not inherit stale errors. */
      losErrorDedupeKey: null,
      /** Deep-watch на currentTurnActions (мутація без зміни length). */
      diceUiSeq: 0
    }
  },
  computed: {
    hexMapConfig() {
      return hexMap
    },
    
    // Overlay icon size - fixed screen size (doesn't scale with zoom)
    overlayIconSize() {
      const baseIconSize = getComputedStyle(document.documentElement).getPropertyValue('--overlay-icon-size').trim()
      return parseInt(baseIconSize) || 24
    },
    
    // Unit icon size - fixed screen size (doesn't scale with zoom)
    unitIconSize() {
      return 64 // Fixed size on screen, like coordinates
    },

    currentDiceResultForUi() {
      void this.diceUiSeq
      return getDiceResultForUi(this.gameState, this.diceUiSeq)
    },

    activeTurnClass() {
      const player = this.gameState && this.gameState.currentPlayer
      const normalized = player == null ? '' : String(player).toLowerCase()
      if (normalized === 'player1') return 'game-map--player1-turn'
      if (normalized === 'player2') return 'game-map--player2-turn'
      return null
    },

    mapRootClasses() {
      const surfaceClass = this.surfaceVariant === 'viewer'
        ? 'game-map-block game-map-block--viewer'
        : 'grid-item grid-item--game-map'
      return [
        surfaceClass,
        this.activeTurnClass,
        {
          'game-map--read-only': this.readOnly
        }
      ]
    },

    actionsBlocked() {
      return this.actionsDisabled || this.readOnly
    },

    canMoveForward() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      const targetPos = this.moveForwardTarget
      if (!targetPos) return false
      const pathCost = this.getDirectionalPathCost('forward', targetPos.q, targetPos.r)
      if (pathCost === undefined) return false
      return this.canSelectedUnitPerformMovementAction('move', pathCost)
    },
    /** Hex directly behind unit facing; used for Reverse (turntable action "reverse"). */
    moveReverseTarget() {
      if (!this.selectedUnit || !this.gameState) return null
      const direction = (this.selectedUnit.facing + 3) % 6
      const currentPos = this.selectedUnit.position
      const directions = getHexDirections(currentPos.r)
      return {
        q: currentPos.q + directions[direction].q,
        r: currentPos.r + directions[direction].r
      }
    },
    canMoveReverse() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      const targetPos = this.moveReverseTarget
      if (!targetPos) return false
      const pathCost = this.getDirectionalPathCost('reverse', targetPos.q, targetPos.r)
      if (pathCost === undefined) return false
      return this.canSelectedUnitPerformMovementAction('reverse', pathCost)
    },
    /** Turntable "turn" costs 1 action by default — same as GameState.updateUnitFacing. */
    canRotate() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      return this.gameState.canPerformAction(
        this.selectedUnit.id,
        'turn',
        1,
        this.gameState.gamePhase,
        this.currentDiceResultForUi
      )
    },
    /**
     * Legal-now movement cells for the selected unit. Physical reachability is filtered through
     * the current turntable/dice/phase so reverse-only cells do not look legal for a forward move.
     */
    selectedUnitReachabilitySet() {
      if (!this.gameState || !this.selectedUnit) return EMPTY_REACHABILITY_SET
      if (this.readOnly) return EMPTY_REACHABILITY_SET
      const unitId = this.selectedUnit.id
      void this.gameState.reachabilityVersion
      void this.gameState.gamePhase
      void this.gameState.currentPlayer
      void this.currentDiceResultForUi

      const set = new Set()
      const pos = this.selectedUnit.position
      if (pos && Number.isFinite(pos.q) && Number.isFinite(pos.r)) {
        set.add(`${pos.q},${pos.r}`)
      }
      // Highlight overlay uses rotation-inclusive ("maneuver") reachability:
      // a hex reachable only after turning is dimmed-in, not out. The
      // per-direction move buttons below keep their own directional gating.
      this.collectLegalManeuverReachability(set, unitId)
      return set
    },
    // Отримує цільову позицію для move forward
    moveForwardTarget() {
      if (!this.selectedUnit || !this.gameState) {
        return null
      }
      
      const direction = this.selectedUnit.facing
      const currentPos = this.selectedUnit.position
      const directions = getHexDirections(currentPos.r)
      
      const targetPos = {
        q: currentPos.q + directions[direction].q,
        r: currentPos.r + directions[direction].r
      }
      
      return targetPos
    },
    
    
    hasMapSource() {
      return (
        (this.currentMap && this.currentMap.parameters) ||
        (this.gameState && this.gameState.width > 0 && this.gameState.height > 0)
      )
    },

    /**
     * O(1) lookup map: first unit per hex matches legacy Array.find() semantics; duplicates warn.
     */
    unitsByHexKey() {
      const map = new Map()
      if (!this.gameState || typeof this.gameState.getAllUnits !== 'function') {
        return map
      }
      const units = this.gameState.getAllUnits()
      for (let i = 0; i < units.length; i++) {
        const unit = units[i]
        const pos = unit?.position
        if (!pos) continue
        if (!Number.isFinite(pos.q) || !Number.isFinite(pos.r)) continue
        const key = `${pos.q},${pos.r}`
        if (!map.has(key)) {
          map.set(key, unit)
        } else {
          console.warn('Multiple units on hex', key)
        }
      }
      return map
    },

    /**
     * Валідні цілі для пострілу — дзеркало `validAttackTargetsCache` (оновлення: `syncValidAttackTargets`).
     * Політика помилок LOS: див. `getValidFireTargets` / план §6.
     */
    validAttackTargets() {
      return this.validAttackTargetsCache
    },

    canFireAttack() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      if (this.validAttackTargets.length === 0) return false
      const dice = this.currentDiceResultForUi
      return this.gameState.canPerformAction(
        this.selectedUnit.id,
        'fire',
        1,
        'ATTACK',
        dice
      )
    },

    canReloadAttack() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      const dice = this.currentDiceResultForUi
      return this.gameState.canPerformAction(
        this.selectedUnit.id,
        'reload',
        1,
        'ATTACK',
        dice
      )
    },

    /**
     * Підсвітка цілей пострілу: лише власний юніт поточного гравця й є валідні цілі.
     */
    showAttackTargetOverlays() {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      if (!this.isSelectedUnitOwnedByCurrentPlayer()) return false
      return this.validAttackTargets.length > 0
    },

    attackRangeKeysSet() {
      if (!this.selectedUnit || !this.gameState) return EMPTY_ATTACK_RANGE_KEYS_SET
      if (!this.isSelectedUnitOwnedByCurrentPlayer()) return EMPTY_ATTACK_RANGE_KEYS_SET
      void this.gameState.reachabilityVersion

      const readRange = typeof this.gameState.getFireRangeHexesCached === 'function'
        ? this.gameState.getFireRangeHexesCached
        : this.gameState.getFireRangeHexes
      if (typeof readRange !== 'function') return EMPTY_ATTACK_RANGE_KEYS_SET

      let rangeHexes
      try {
        rangeHexes = readRange.call(this.gameState, this.selectedUnit.id)
      } catch (err) {
        console.error('[attackRangeKeysSet] getFireRangeHexes failed:', this.formatThrownMessage(err), err)
        return EMPTY_ATTACK_RANGE_KEYS_SET
      }

      if (!Array.isArray(rangeHexes) || rangeHexes.length === 0) {
        return EMPTY_ATTACK_RANGE_KEYS_SET
      }
      const set = new Set()
      for (const h of rangeHexes) {
        if (!h || !Number.isFinite(h.q) || !Number.isFinite(h.r)) continue
        set.add(`${h.q},${h.r}`)
      }
      return set.size > 0 ? set : EMPTY_ATTACK_RANGE_KEYS_SET
    },

    attackRangeContourPath() {
      return this.buildHexSetContourPath(this.attackRangeKeysSet)
    },

    /** Current selected target hex key `"q,r"` (normalized index), or null. */
    attackSelectedTargetHexKey() {
      if (!this.showAttackTargetOverlays) return null
      const targets = this.validAttackTargets
      const len = targets.length
      if (len === 0) return null
      const idx = clampTargetIndex(this.selectedTargetIndex, len)
      const t = targets[idx]
      return t && Number.isFinite(t.q) && Number.isFinite(t.r) ? `${t.q},${t.r}` : null
    },

    selectedUnitTurnState() {
      const unitId = this.selectedUnit && this.selectedUnit.id
      if (!unitId || !this.gameState || !this.gameState.turnState) return null
      const row = this.gameState.turnState[unitId]
      return row && typeof row === 'object' ? row : null
    },

    /**
     * Sync with `GameEngineBlock` / `SelectionInspectorPanel` (engine) without
     * duplicating combat logic. Also carries enough state for the parent
     * playground to dispatch move/rotate/fire/reload commands through the
     * `gameController` without reaching into this child via `$refs`.
     */
    selectionInspectorBridgePayload() {
      return {
        selectedUnitId: this.selectedUnit ? this.selectedUnit.id : null,
        canMoveForward: this.canMoveForward,
        canMoveReverse: this.canMoveReverse,
        canRotate: this.canRotate,
        canFire: this.canFireAttack,
        canReload: this.canReloadAttack,
        validAttackTargets: this.validAttackTargets,
        selectedTargetIndex: this.selectedTargetIndex,
        moveForwardTarget: this.moveForwardTarget,
        moveReverseTarget: this.moveReverseTarget,
        currentDiceResultForUi: this.currentDiceResultForUi
      }
    }
  },
  watch: {
    'gameState.currentTurnActions': {
      deep: true,
      handler() {
        this.diceUiSeq++
      }
    },
    gameState: {
      handler() {
        this.syncMapFromProps()
        this.syncValidAttackTargets()
      },
      immediate: true
    },
    mapData: {
      handler() {
        this.syncMapFromProps()
      },
      immediate: true
    },
    terrainTypes: {
      handler() {
        this.syncMapFromProps()
      },
      immediate: true
    },
    selectedHexDropdownPosition: {
      handler(newPosition) {
        // Синхронізуємо prop з локальною копією
        this.localSelectedHexDropdownPosition = { ...newPosition }
      },
      immediate: true
    },

    showFloatingPanel: {
      handler(newVal) {
        if (!newVal) {
          this.selectedHexDropdownVisible = false
        } else if (this.selectedHex) {
          this.selectedHexDropdownVisible = true
        }
      },
      immediate: true
    },

    validAttackTargets: {
      handler() {
        this.normalizeSelectedTargetIndex()
      }
    },

    'gameState.reachabilityVersion'() {
      this.syncValidAttackTargets()
    },

    selectedUnit: {
      handler(newUnit, oldUnit) {
        if (!newUnit) {
          this.selectedTargetIndex = 0
          this.syncValidAttackTargets()
          return
        }
        if (!oldUnit || newUnit.id !== oldUnit.id) {
          this.selectedTargetIndex = 0
        }
        this.normalizeSelectedTargetIndex()
        this.syncValidAttackTargets()
      }
    },

    selectionInspectorBridgePayload: {
      handler(val) {
        this.$emit('selection-inspector-bridge', val)
      },
      immediate: true
    },

    /**
     * The playground bumps `commandSeq` after every successful
     * `gameController` dispatch. Re-read selection/hex from the engine
     * so the view reflects the new authoritative state. Engine itself
     * has already mutated the unit; this is pure view sync.
     */
    commandSeq(newVal, oldVal) {
      if (newVal === oldVal) return
      this.refreshSelectedUnitFromGameState()
      this.syncValidAttackTargets()
    },

    /**
     * Bumping `seq` (with a fresh `delta`) is the signal from the
     * playground that the sidebar requested an attack-target shift.
     * Delegates to the existing UI-only handler — no engine mutation.
     */
    'attackTargetShiftIntent.seq'(newVal, oldVal) {
      if (newVal === oldVal) return
      const delta = this.attackTargetShiftIntent && Number(this.attackTargetShiftIntent.delta)
      this.shiftAttackTarget(Number.isFinite(delta) ? delta : 0)
    },

    /** Playground signal to clear selection without method calls via `$refs`. */
    deselectIntent(newVal, oldVal) {
      if (newVal === oldVal) return
      this.deselectHex()
    },

    'unitPreviewHoverIntent.seq'(newVal, oldVal) {
      if (newVal === oldVal) return
      const unitId = this.unitPreviewHoverIntent && this.unitPreviewHoverIntent.unitId
      this.hoverUnitPreviewHex(unitId)
    },

    'unitPreviewSelectIntent.seq'(newVal, oldVal) {
      if (newVal === oldVal) return
      const unitId = this.unitPreviewSelectIntent && this.unitPreviewSelectIntent.unitId
      this.selectUnitPreviewHex(unitId)
    }

  },
  created() {
    // Non-reactive scratch state for pan rAF coalescing (#61). Kept off the
    // reactive system on purpose: a burst of mousemoves accumulates here and is
    // applied to the reactive panX/panY at most once per frame, so the whole
    // hex `v-for` re-renders once per frame instead of once per mousemove.
    this._pendingPanDX = 0
    this._pendingPanDY = 0
    this._panRafPending = null
  },
  mounted() {
    // Add resize listener for centering
    window.addEventListener('resize', this.handleResize)
    // Add click outside listener for dropdown
    document.addEventListener('click', this.handleClickOutside)
    // Клавіатура: при вибраному юніті (див. handleKeyDown)
    document.addEventListener('keydown', this.handleKeyDown)
  },
  beforeUnmount() {
    if (this.resizeTimeout != null) {
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = null
    }
    if (this.zoomRafPending != null) {
      cancelAnimationFrame(this.zoomRafPending)
      this.zoomRafPending = null
    }
    if (this._panRafPending != null) {
      cancelAnimationFrame(this._panRafPending)
      this._panRafPending = null
    }
    // Remove resize listener
    window.removeEventListener('resize', this.handleResize)
    // Remove click outside listener
    document.removeEventListener('click', this.handleClickOutside)
    // Remove keyboard listeners (facing direction feature)
    document.removeEventListener('keydown', this.handleKeyDown)
    this.cleanupSelectedHexDrag()
  },
  methods: {
    /** Явне порівняння власника юніта з поточним гравцем (узгоджені рядки). */
    isSelectedUnitOwnedByCurrentPlayer() {
      const u = this.selectedUnit
      const gs = this.gameState
      if (!u || !gs) return false
      const pu = u.player
      const cp = gs.currentPlayer
      if (pu == null || cp == null) return false
      return String(pu) === String(cp)
    },

    /**
     * Перераховує цілі для пострілу (виклик з watch / після зміни gameState, не з computed).
     * При помилці LOS: кеш `[]`, notify з дедупом, без throw.
     */
    syncValidAttackTargets() {
      if (!this.gameState || !this.selectedUnit?.id) {
        this.validAttackTargetsCache = []
        return
      }
      if (typeof this.gameState.getValidFireTargetsCached !== 'function') {
        this.validAttackTargetsCache = []
        return
      }
      try {
        const raw = this.gameState.getValidFireTargetsCached(this.selectedUnit.id)
        this.losErrorDedupeKey = null
        this.validAttackTargetsCache = Array.isArray(raw) ? raw.slice() : []
      } catch (err) {
        const msg = this.formatThrownMessage(err)
        const cause = err instanceof Error ? err.cause : undefined
        console.error(
          '[syncValidAttackTargets] getValidFireTargetsCached failed:',
          msg,
          err,
          cause != null ? { cause } : ''
        )
        this.validAttackTargetsCache = []
        const dedupeKey = `${this.selectedUnit.id}:${msg}`
        if (this.losErrorDedupeKey !== dedupeKey) {
          this.losErrorDedupeKey = dedupeKey
          try {
            this.notify(
              'error',
              this.uiText('gameplay.map.notifications.aimingError', 'Aiming error'),
              this.uiText('gameplay.map.notifications.lineOfFireFailed', 'Could not compute line of fire.')
            )
          } catch (notifyErr) {
            console.error('[syncValidAttackTargets] notify failed:', this.formatThrownMessage(notifyErr))
          }
        }
      }
    },

    /**
     * Обмежує selectedTargetIndices до [0, length-1]; при length===0 завжди 0.
     * Викликати після будь-якої зміни індексу або списку цілей.
     */
    normalizeSelectedTargetIndex() {
      const targets = this.validAttackTargets
      const len = targets.length
      if (len === 0) {
        this.selectedTargetIndex = 0
        return
      }
      this.selectedTargetIndex = clampTargetIndex(this.selectedTargetIndex, len)
    },

    formatThrownMessage(error) {
      return error instanceof Error ? error.message : String(error)
    },

    /** Prefer Vue-injected `$notify`, fallback to `window.$notify` from NotificationSystem. */
    notify(level, title, message) {
      const api = this.$notify || (typeof window !== 'undefined' ? window.$notify : null)
      if (api && typeof api[level] === 'function') {
        api[level](title, message)
        return
      }
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(`[notify:${level}] ${title} — ${message}`)
      }
    },

    /**
     * Не перехоплювати клавіші під час вводу в полях / IME / contenteditable.
     */
    shouldIgnoreKeyboardForEditableTarget(event) {
      if (event.isComposing) return true
      const el = event.target
      if (!el || typeof el !== 'object') return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable === true) return true
      if (typeof el.closest !== 'function') return false
      if (el.closest('[contenteditable="true"]')) return true
      if (
        el.closest(
          'button, [role="button"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [role="slider"], summary'
        )
      ) {
        return true
      }
      if (el.closest('a[href]')) return true
      return false
    },

    getHexKey(q, r) {
      return `${q},${r}`
    },

    findUnitById(unitId) {
      const id = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      if (!id || !this.gameState || typeof this.gameState.getAllUnits !== 'function') return null
      const units = this.gameState.getAllUnits()
      if (!Array.isArray(units)) return null
      return units.find(unit => unit && unit.id != null && String(unit.id) === id) || null
    },

    findHexForUnit(unit) {
      const pos = unit && unit.position
      if (!pos || !Number.isFinite(pos.q) || !Number.isFinite(pos.r)) return null
      return this.hexMapData.find(hex => hex.q === pos.q && hex.r === pos.r) || null
    },

    hoverUnitPreviewHex(unitId) {
      const unit = this.findUnitById(unitId)
      if (!unit) {
        this.hoveredHex = null
        return
      }
      const hex = this.findHexForUnit(unit)
      if (!hex) {
        this.hoveredHex = null
        return
      }
      // Programmatic hover from the sidebar preview intent. No map drag is in
      // flight here, so set the highlight directly (the old `hoverHex` guard on
      // `isPanning` never applied on this path). Mouse-driven hover is now pure
      // CSS (#61); this reactive write remains only for the off-DOM preview case.
      this.hoveredHex = hex
    },

    selectUnitPreviewHex(unitId) {
      if (!unitId) {
        this.deselectHex()
        return
      }
      const unit = this.findUnitById(unitId)
      const hex = this.findHexForUnit(unit)
      if (!hex) return
      this.selectHex(hex, null)
    },

    parsePolygonPoints(points) {
      if (typeof points !== 'string') return []
      return points
        .trim()
        .split(/\s+/)
        .map(pair => {
          const [xRaw, yRaw] = pair.split(',')
          const x = Number(xRaw)
          const y = Number(yRaw)
          return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
        })
        .filter(Boolean)
    },

    formatPathNumber(value) {
      if (!Number.isFinite(value)) return 0
      return Number(value.toFixed(3))
    },

    buildHexSetContourPath(hexKeysSet) {
      if (!(hexKeysSet instanceof Set) || hexKeysSet.size === 0) return ''

      const hexByKey = new Map()
      for (const hex of this.hexMapData) {
        if (!hex || !Number.isFinite(hex.q) || !Number.isFinite(hex.r)) continue
        hexByKey.set(hex.key ?? `${hex.q},${hex.r}`, hex)
      }

      const edgeDirections = [1, 2, 3, 4, 5, 0]
      const segments = []
      hexKeysSet.forEach(key => {
        const hex = hexByKey.get(key)
        if (!hex) return
        const vertices = this.parsePolygonPoints(hex.points)
        if (vertices.length !== 6) return
        const directions = getHexDirections(hex.r)
        for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
          const directionIndex = edgeDirections[edgeIndex]
          const direction = directions[directionIndex]
          const neighborKey = `${hex.q + direction.q},${hex.r + direction.r}`
          if (hexKeysSet.has(neighborKey)) continue
          const start = vertices[edgeIndex]
          const end = vertices[(edgeIndex + 1) % 6]
          segments.push(
            `M ${this.formatPathNumber(start.x)} ${this.formatPathNumber(start.y)} ` +
            `L ${this.formatPathNumber(end.x)} ${this.formatPathNumber(end.y)}`
          )
        }
      })
      return segments.join(' ')
    },

    /**
     * O(1) unit for this hex cell during SVG render (delegates to unitsByHexKey).
     */
    renderedUnit(hex) {
      const key = hex.key ?? `${hex.q},${hex.r}`
      return this.unitsByHexKey.get(key) || null
    },

    // Перевіряє чи є гекс цільовою коміркою для move forward (facing direction feature)
    isMoveForwardTarget(hex) {
      if (!this.selectedUnit || !this.moveForwardTarget || !this.canMoveForward) {
        return false
      }
      
      return hex.q === this.moveForwardTarget.q && hex.r === this.moveForwardTarget.r
    },

    isAttackTargetSelectedHex(hex) {
      if (!this.showAttackTargetOverlays) return false
      const sel = this.attackSelectedTargetHexKey
      if (sel == null) return false
      const key = hex.key ?? `${hex.q},${hex.r}`
      return key === sel
    },

    // Перевіряє чи гекс поза радіусом руху вибраного юніта
    isOutOfRange(hex) {
      if (this.readOnly) {
        return false
      }
      if (!this.selectedUnit) {
        return false
      }
      
      const hexKey = `${hex.q},${hex.r}`
      return !this.selectedUnitReachabilitySet.has(hexKey)
    },
    
    // Перевіряє чи можна перемістити юніт на даний гекс
    isHexReachable(hex) {
      if (this.readOnly) {
        return false
      }
      if (!this.selectedUnit) {
        return false
      }
      
      const hexKey = `${hex.q},${hex.r}`
      const currentPos = `${this.selectedUnit.position.q},${this.selectedUnit.position.r}`
      
      // Гекс досяжний якщо він в reachableHexes і не є поточною позицією юніта
      return this.selectedUnitReachabilitySet.has(hexKey) && hexKey !== currentPos
    },
    
    // Перевіряє чи гекс в межах мапи (з gameState або currentMap)
    isHexInBounds(q, r) {
      if (this.gameState && this.gameState.width != null && this.gameState.height != null) {
        return q >= 0 && q < this.gameState.width && r >= 0 && r < this.gameState.height
      }
      if (this.currentMap && this.currentMap.parameters) {
        const { width, height } = this.currentMap.parameters
        return q >= 0 && q < width && r >= 0 && r < height
      }
      return false
    },
    
    collectLegalDirectionalReachability(targetSet, unitId, motionMode, actionType) {
      const gs = this.gameState
      if (!gs || !unitId) return
      if (typeof gs.getDirectionalReachableCosts !== 'function') return
      if (typeof gs.canPerformAction !== 'function') return
      const costs = gs.getDirectionalReachableCosts(unitId, motionMode)
      if (!(costs instanceof Map)) return
      costs.forEach((cost, key) => {
        if (typeof key !== 'string') return
        if (gs.canPerformAction(unitId, actionType, cost, gs.gamePhase, this.currentDiceResultForUi)) {
          targetSet.add(key)
        }
      })
    },

    /**
     * Rotation-inclusive reachability for the highlight overlay. A maneuver
     * mixes a turn with a move/reverse, so a hex at summed cost `cost` is
     * reachable-in-principle when EITHER a forward `move` or a `reverse` of
     * that cost fits the current budget/turntable/phase. Mirrors
     * `collectLegalDirectionalReachability` but reads the maneuver cost map.
     */
    collectLegalManeuverReachability(targetSet, unitId) {
      const gs = this.gameState
      if (!gs || !unitId) return
      if (typeof gs.getManeuverReachableCosts !== 'function') return
      if (typeof gs.canPerformAction !== 'function') return
      const costs = gs.getManeuverReachableCosts(unitId)
      if (!(costs instanceof Map)) return
      const dice = this.currentDiceResultForUi
      costs.forEach((cost, key) => {
        if (typeof key !== 'string') return
        if (
          gs.canPerformAction(unitId, 'move', cost, gs.gamePhase, dice) ||
          gs.canPerformAction(unitId, 'reverse', cost, gs.gamePhase, dice)
        ) {
          targetSet.add(key)
        }
      })
    },

    getDirectionalPathCost(motionMode, q, r) {
      if (!this.selectedUnit || !this.gameState) return undefined
      if (typeof this.gameState.getDirectionalReachableCosts !== 'function') return undefined
      const costs = this.gameState.getDirectionalReachableCosts(this.selectedUnit.id, motionMode)
      if (!(costs instanceof Map)) return undefined
      return costs.get(`${q},${r}`)
    },

    canSelectedUnitPerformMovementAction(actionType, pathCost) {
      if (this.readOnly) return false
      if (!this.selectedUnit || !this.gameState) return false
      if (typeof this.gameState.canPerformAction !== 'function') return false
      return this.gameState.canPerformAction(
        this.selectedUnit.id,
        actionType,
        pathCost,
        this.gameState.gamePhase,
        this.currentDiceResultForUi
      )
    },

    isHexReachableByCoords(q, r) {
      if (this.readOnly) return false
      if (!this.selectedUnit) return false
      const key = `${q},${r}`
      const currentPos = `${this.selectedUnit.position.q},${this.selectedUnit.position.r}`
      return this.selectedUnitReachabilitySet.has(key) && key !== currentPos
    },
    
    syncMapFromProps() {
      // Пріоритет: будувати карту з GameState (єдине джерело істини після init/restore)
      if (this.gameState && this.gameState.width > 0 && this.gameState.height > 0) {
        this.loadMapFromGameState()
        return
      }
      if (this.mapData && this.terrainTypes !== null) {
        this.loadMap(this.mapData)
        return
      }
      // No map source (e.g. after reset): clear map and selection
      this.currentMap = null
      this.hexMapData = []
      this.selectedUnit = null
      this.selectedHex = null
      this.selectedHexDropdownVisible = false
      this.selectedTargetIndex = 0
      this.$emit('hex-selected', null)
    },

    /**
     * Обчислює геометрію гекса (points, innerPoints, center) для заданих q,r і поточного zoom.
     * Використовується і в createHex, і в buildHexMapFromGameState.
     */
    computeHexGeometry(q, r) {
      // Inner-stroke offset is kept at the pre-refactor value (2) so the
      // viewport renders identically to previous builds. LevelBuilder
      // historically used `hexMap.hexStrokeOffset` (3); aligning the two
      // is a separate visual-tuning PR, not part of this extraction.
      return computeHexPolygonGeometry({
        q,
        r,
        hexSize: hexMap.baseHexSize * this.zoomLevel,
        hexStrokeOffset: 2
      })
    },

    /**
     * Будує hexMapData виключно з GameState (террейн і overlays з гексів).
     * Розміри обмежені (max 200) щоб уникнути зависання при пошкодженому snapshot.
     */
    buildHexMapFromGameState() {
      if (!this.gameState) return
      const w = Math.min(Math.max(0, Number(this.gameState.width) || 0), 200)
      const h = Math.min(Math.max(0, Number(this.gameState.height) || 0), 200)
      if (w === 0 || h === 0) return
      this.currentMap = {
        parameters: { width: w, height: h }
      }
      this.hexMapData = []
      this.updateMapDimensions()
      for (let r = 0; r < h; r++) {
        for (let q = 0; q < w; q++) {
          const gameHex = this.gameState.getHex(q, r)
          if (!gameHex) continue
          const geom = this.computeHexGeometry(q, r)
          const terrain = gameHex.terrain && typeof gameHex.terrain === 'object'
            ? gameHex.terrain
            : DEFAULT_TERRAIN
          this.hexMapData.push({
            q,
            r,
            key: this.getHexKey(q, r),
            ...geom,
            terrain,
            stroke: '#333',
            strokeWidth: 1,
            player1Spawn: !!gameHex.player1Spawn,
            player1Base: !!gameHex.player1Base,
            player2Spawn: !!gameHex.player2Spawn,
            player2Base: !!gameHex.player2Base
          })
        }
      }
    },

    loadMapFromGameState() {
      // Same-size swaps (e.g. automated-playback scrubbing feeding a new
      // GameState per frame, or live-game moves) only differ in terrain /
      // overlays / unit positions — never geometry or dimensions. Take a
      // cheap in-place refresh that preserves the user's pan/zoom and the
      // selectedHex/hoveredHex object references. Units update reactively
      // via the `unitsByHexKey` computed when the gameState prop changes.
      const w = Math.min(Math.max(0, Number(this.gameState.width) || 0), 200)
      const h = Math.min(Math.max(0, Number(this.gameState.height) || 0), 200)
      const sameSize = this.hexMapData.length > 0 &&
        this.currentMap && this.currentMap.parameters &&
        this.currentMap.parameters.width === w &&
        this.currentMap.parameters.height === h
      if (sameSize) {
        this.refreshHexCellsFromGameState()
        return
      }
      // First build (empty hexMapData) or a dimension change: full rebuild,
      // re-center, and reset pan/zoom.
      this.isLoading = true
      this.buildHexMapFromGameState()
      this.panX = 0
      this.panY = 0
      this.zoomLevel = DEFAULT_MAP_ZOOM
      this.$nextTick(() => {
        this.isLoading = false
        this.centerMap()
      })
    },

    /**
     * In-place refresh of the existing hexMapData cells from the current
     * GameState — terrain + overlays only. Geometry (points/innerPoints/
     * center) and q/r/key are left untouched (static across same-size
     * swaps), so the hex object identities are preserved and the
     * selectedHex/hoveredHex references stay valid. Units are NOT in
     * hexMapData; they re-render reactively via `unitsByHexKey`.
     */
    refreshHexCellsFromGameState() {
      if (!this.gameState) return
      for (let i = 0; i < this.hexMapData.length; i++) {
        const hex = this.hexMapData[i]
        const gh = this.gameState.getHex(hex.q, hex.r)
        if (!gh) {
          // A cell that vanished from the new state (sparse/holey grid): reset
          // to the same blank the full rebuild would leave, so no stale terrain
          // or overlay survives. Keeps the incremental path equivalent to a
          // full rebuild for the cells it visits.
          hex.terrain = DEFAULT_TERRAIN
          hex.player1Spawn = false
          hex.player1Base = false
          hex.player2Spawn = false
          hex.player2Base = false
          continue
        }
        hex.terrain = gh.terrain && typeof gh.terrain === 'object'
          ? gh.terrain
          : DEFAULT_TERRAIN
        hex.player1Spawn = !!gh.player1Spawn
        hex.player1Base = !!gh.player1Base
        hex.player2Spawn = !!gh.player2Spawn
        hex.player2Base = !!gh.player2Base
      }
    },

    loadMap(mapData) {
      this.isLoading = true
      this.currentMap = mapData
      this.generateHexMap()
      
      // Reset pan and zoom when loading new map
      this.panX = 0
      this.panY = 0
      this.zoomLevel = DEFAULT_MAP_ZOOM
      
      // Set loading to false after map generation is complete
      this.$nextTick(() => {
        this.isLoading = false
      })
    },
    
    generateHexMap() {
      if (!this.currentMap) return
      
      this.hexMapData = []
      this.updateMapDimensions()
      
      const terrainTypes = (this.terrainTypes && this.terrainTypes.length > 0) ? this.terrainTypes : this.getTerrainTypes()
      
      for (let r = 0; r < this.currentMap.parameters.height; r++) {
        for (let q = 0; q < this.currentMap.parameters.width; q++) {
          const hex = this.createHex(q, r, terrainTypes)
          // terrain/overlay are applied to hex AFTER push — do not Object.freeze hexes
          this.hexMapData.push(hex)
        }
      }

      // Apply saved terrain and overlays to each hex
      if (this.currentMap.map) {
        // Build O(1) key → hex index to avoid O(N²) Array.find per saved cell
        const hexByKey = new Map()
        for (const hex of this.hexMapData) {
          // `hex.key` is not set by createHex at this point; use the `q,r` string as the
          // stable identity here to prevent future drift from the `hex.key ?? ...` lookups elsewhere.
          hexByKey.set(`${hex.q},${hex.r}`, hex)
        }
        this.currentMap.map.forEach(savedHex => {
          const hex = hexByKey.get(`${savedHex.q},${savedHex.r}`)
          if (hex) {
            const terrain = terrainTypes.find(t => t.id === savedHex.terrain)
            if (terrain) {
              hex.terrain = terrain
            }

            // Restore overlays
            hex.player1Spawn = savedHex.player1Spawn || false
            hex.player1Base = savedHex.player1Base || false
            hex.player2Spawn = savedHex.player2Spawn || false
            hex.player2Base = savedHex.player2Base || false
          }
        })
      }
      
      // Center the map after generation
      this.$nextTick(() => {
        this.centerMap()
      })
    },
    
    getTerrainTypes() {
      // Build from canonical DEFAULT_TERRAIN_COLORS so both GEB legend and map use the same source.
      const NAMES = {
        grass: 'Grass', forest: 'Forest', water: 'Water', mountain: 'Mountain',
        desert: 'Desert', plains: 'Plains', mud: 'Mud', snow: 'Snow'
      }
      return Object.entries(DEFAULT_TERRAIN_COLORS).map(([id, color]) => ({
        id,
        name: NAMES[id] || id,
        color
      }))
    },
    
    createHex(q, r, terrainTypes) {
      const geom = this.computeHexGeometry(q, r)
      const terrain = terrainTypes[0] || { id: 'default', name: 'Default', color: TERRAIN_COLOR_UNKNOWN }
      return {
        q,
        r,
        key: this.getHexKey(q, r),
        ...geom,
        terrain,
        stroke: '#333',
        strokeWidth: 1,
        player1Spawn: false,
        player1Base: false,
        player2Spawn: false,
        player2Base: false
      }
    },
    
    updateMapDimensions() {
      const width = this.gameState?.width ?? this.currentMap?.parameters?.width
      const height = this.gameState?.height ?? this.currentMap?.parameters?.height
      if (width == null || height == null) return

      const { svgWidth, svgHeight } = computeSvgMapSize({
        width,
        height,
        hexSize: hexMap.baseHexSize * this.zoomLevel
      })
      this.svgWidth = svgWidth
      this.svgHeight = svgHeight
    },
    
    selectHex(hex, event = null) {
      if (this.isPanning) return
      if (this.suppressNextHexClick && event) {
        this.suppressNextHexClick = false
        return
      }
      
      // Перевіряємо чи є юніт на цьому гексі
      const unit = this.renderedUnit(hex)
      
      if (unit) {
        // Якщо клікнули на юніт - відкриваємо дропдаун (якщо увімкнено плаваючу панель)
        this.selectedUnit = unit
        this.selectedHexDropdownVisible = this.showFloatingPanel
        
        // Позиціонуємо відносно курсора тільки якщо це перше відкриття (позиція дефолтна)
        // Інакше використовуємо збережену позицію
        if (event && (this.localSelectedHexDropdownPosition.x === 100 && this.localSelectedHexDropdownPosition.y === 100)) {
          this.positionDropdownRelativeToCursor(event)
        }
        
        this.selectedHex = hex
        this.$emit('hex-selected', hex)
      } else {
        // Звичайний вибір гекса
        if (this.selectedHex === hex) {
          this.selectedHex = null
          this.selectedHexDropdownVisible = false
          
          // Зберігаємо поточну позицію дропдауну при закритті
          this.$emit('update-selected-hex-dropdown-position', this.localSelectedHexDropdownPosition)
        } else {
          this.selectedHex = hex
          this.selectedHexDropdownVisible = this.showFloatingPanel
          
          if (
            this.selectedHexDropdownVisible &&
            event &&
            (this.localSelectedHexDropdownPosition.x === 100 && this.localSelectedHexDropdownPosition.y === 100)
          ) {
            this.positionDropdownRelativeToCursor(event)
          }
          
          this.$emit('hex-selected', hex)
        }
        
        this.selectedUnit = null
      }
    },
    
    handleRightClick(event) {
      event.preventDefault() // Prevent browser context menu
      
      // If a unit is selected, deselect it
      if (this.selectedUnit) {
        this.deselectHex()
      }
      // If a hex is selected (but no unit), deselect it
      else if (this.selectedHex) {
        this.selectedHex = null
        this.selectedHexDropdownVisible = false
        this.$emit('hex-selected', null)
        
        // Зберігаємо поточну позицію дропдауну при закритті
        this.$emit('update-selected-hex-dropdown-position', this.localSelectedHexDropdownPosition)
      }
    },
    
    handleWheel(event) {
      event.preventDefault()

      const delta = event.deltaY > 0 ? -hexMap.zoomStep : hexMap.zoomStep
      const newZoom = Math.max(hexMap.minZoom, Math.min(hexMap.maxZoom, this.zoomLevel + delta))

      if (newZoom === this.zoomLevel) return // Already at limit

      // Get mouse position in viewport coordinates
      const rect = this.$refs.mapContainer.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      // Calculate world coordinates of mouse position BEFORE zoom change
      const worldMouseX = (mouseX - this.panX) / this.zoomLevel
      const worldMouseY = (mouseY - this.panY) / this.zoomLevel

      this.zoomLevel = newZoom

      // Adjust pan synchronously so every tick in the burst accumulates correctly
      this.panX = mouseX - worldMouseX * this.zoomLevel
      this.panY = mouseY - worldMouseY * this.zoomLevel

      // Coalesce the O(N) hex rebuild: a burst of wheel ticks in one frame
      // triggers exactly one regenerate. Same coalescing intent as fireRafPending,
      // but zoomRafPending stores the rAF handle (not a boolean) so beforeUnmount
      // can cancelAnimationFrame and prevent a regenerate after teardown.
      // The one-frame geometry lag is cosmetic — the CSS transform already reflects
      // the new zoomLevel/panX/panY, so the map stays visually correct mid-burst.
      if (this.zoomRafPending == null) {
        this.zoomRafPending = requestAnimationFrame(() => {
          this.zoomRafPending = null
          this.regenerateMapWithCurrentState()
        })
      }
    },
    
    startPan(event) {
      if (event.button === 0) { // Left mouse button
        this.isPanning = true
        this.panStartX = event.clientX
        this.panStartY = event.clientY
        this.panMovedBeyondClickThreshold = false
        this.suppressNextHexClick = false
        this.lastPanX = event.clientX
        this.lastPanY = event.clientY
      }
    },
    
    pan(event) {
      if (this.isPanning) {
        const deltaX = event.clientX - this.lastPanX
        const deltaY = event.clientY - this.lastPanY
        const totalDeltaX = event.clientX - this.panStartX
        const totalDeltaY = event.clientY - this.panStartY
        if (Math.hypot(totalDeltaX, totalDeltaY) > PAN_CLICK_SUPPRESSION_THRESHOLD_PX) {
          this.panMovedBeyondClickThreshold = true
        }

        // Coalesce the reactive panX/panY write (#61): accumulate the per-event
        // delta in non-reactive scratch fields and apply the sum at most once per
        // frame. A burst of N mousemoves-per-frame collapses to one re-render of
        // the hex `v-for` instead of N. `lastPanX/Y` (the per-event reference
        // point) and the drag-threshold flag stay live so `stopPan`'s suppression
        // still trips even before the rAF fires.
        this._pendingPanDX += deltaX
        this._pendingPanDY += deltaY

        this.lastPanX = event.clientX
        this.lastPanY = event.clientY

        if (this._panRafPending == null) {
          this._panRafPending = requestAnimationFrame(() => {
            this._panRafPending = null
            this.flushPendingPan()
          })
        }
      }
    },

    /**
     * Apply any accumulated pan delta to the reactive panX/panY exactly once and
     * clear the pending delta. Cancels a scheduled rAF so a synchronous flush
     * (e.g. from `stopPan`) yields the exact final offset without a duplicate
     * frame applying a now-zero delta. Idempotent when nothing is pending.
     */
    flushPendingPan() {
      // cancelAnimationFrame is a no-op when called from inside the rAF callback
      // itself (the callback already nulled `_panRafPending` before calling us).
      // It only does real work on the synchronous callers: stopPan and beforeUnmount.
      if (this._panRafPending != null) {
        cancelAnimationFrame(this._panRafPending)
        this._panRafPending = null
      }
      if (this._pendingPanDX !== 0 || this._pendingPanDY !== 0) {
        this.panX += this._pendingPanDX
        this.panY += this._pendingPanDY
        this._pendingPanDX = 0
        this._pendingPanDY = 0
      }
    },

    stopPan(event = null) {
      // Flush any pending pan delta so the final position is exact even if the
      // last mousemove's rAF has not fired yet.
      this.flushPendingPan()
      if (this.panMovedBeyondClickThreshold && (!event || event.type === 'mouseup')) {
        this.suppressNextHexClick = true
      }
      this.isPanning = false
      this.panMovedBeyondClickThreshold = false
    },
    
    centerMap() {
      if (!this.$refs.mapContainer || !this.hexMapData.length) return
      
      const container = this.$refs.mapContainer
      const containerRect = container.getBoundingClientRect()
      
      // Calculate map bounds
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      
      this.hexMapData.forEach(hex => {
        const points = hex.points.split(' ').map(p => p.split(',').map(Number))
        points.forEach(([x, y]) => {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        })
      })
      
      const mapWidth = maxX - minX
      const mapHeight = maxY - minY
      
      // Calculate center offset - center the map in the full container
      const centerX = (containerRect.width - mapWidth) / 2 - minX
      const centerY = (containerRect.height - mapHeight) / 2 - minY
      
      // Apply centering
      this.panX = centerX
      this.panY = centerY
    },
    
    handleResize() {
      // Debounce resize events
      clearTimeout(this.resizeTimeout)
      this.resizeTimeout = setTimeout(() => {
        if (this.hexMapData.length > 0) {
          this.centerMap()
        }
      }, 100)
    },
    
    toggleSettings() {
      this.showSettings = !this.showSettings
    },
    
    zoomIn() {
      if (this.zoomLevel >= hexMap.maxZoom) return
      
      // Get viewport center point in world coordinates BEFORE zoom
      const container = this.$refs.mapContainer
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      const viewportCenterX = rect.width / 2
      const viewportCenterY = rect.height / 2
      
      // World coordinates of viewport center (before zoom)
      const worldCenterX = (viewportCenterX - this.panX) / this.zoomLevel
      const worldCenterY = (viewportCenterY - this.panY) / this.zoomLevel
      
      this.zoomLevel = Math.min(hexMap.maxZoom, this.zoomLevel + hexMap.zoomStep)
      
      // Regenerate map with new zoom
      this.regenerateMapWithCurrentState()
      
      // Adjust pan to keep the same world point in viewport center
      this.panX = viewportCenterX - worldCenterX * this.zoomLevel
      this.panY = viewportCenterY - worldCenterY * this.zoomLevel
    },
    
    zoomOut() {
      if (this.zoomLevel <= hexMap.minZoom) return
      
      // Get viewport center point in world coordinates BEFORE zoom
      const container = this.$refs.mapContainer
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      const viewportCenterX = rect.width / 2
      const viewportCenterY = rect.height / 2
      
      // World coordinates of viewport center (before zoom)
      const worldCenterX = (viewportCenterX - this.panX) / this.zoomLevel
      const worldCenterY = (viewportCenterY - this.panY) / this.zoomLevel
      
      this.zoomLevel = Math.max(hexMap.minZoom, this.zoomLevel - hexMap.zoomStep)
      
      // Regenerate map with new zoom
      this.regenerateMapWithCurrentState()
      
      // Adjust pan to keep the same world point in viewport center
      this.panX = viewportCenterX - worldCenterX * this.zoomLevel
      this.panY = viewportCenterY - worldCenterY * this.zoomLevel
    },
    
    resetZoom() {
      this.zoomLevel = DEFAULT_MAP_ZOOM
      this.panX = 0
      this.panY = 0
      this.regenerateMapWithCurrentState()
      this.$nextTick(() => {
        this.centerMap()
      })
    },
    
    regenerateMapWithCurrentState() {
      if (this.hexMapData.length === 0) return

      // Capture old selection coordinates BEFORE clearing the array (#11)
      const oldSelQ = this.selectedHex != null ? this.selectedHex.q : null
      const oldSelR = this.selectedHex != null ? this.selectedHex.r : null
      const oldHovQ = this.hoveredHex != null ? this.hoveredHex.q : null
      const oldHovR = this.hoveredHex != null ? this.hoveredHex.r : null

      // Save current terrain (full object) and overlays so zoom keeps them (works without terrainTypes)
      const terrainMap = {}
      const overlaysMap = {}
      this.hexMapData.forEach(hex => {
        const key = `${hex.q},${hex.r}`
        terrainMap[key] = hex.terrain && typeof hex.terrain === 'object' ? { ...hex.terrain } : null
        overlaysMap[key] = {
          player1Spawn: hex.player1Spawn,
          player1Base: hex.player1Base,
          player2Spawn: hex.player2Spawn,
          player2Base: hex.player2Base
        }
      })

      const width = this.currentMap?.parameters?.width ?? this.gameState?.width
      const height = this.currentMap?.parameters?.height ?? this.gameState?.height
      if (width == null || height == null) return

      this.hexMapData = []
      this.updateMapDimensions()
      const terrainTypes = (this.terrainTypes && this.terrainTypes.length > 0) ? this.terrainTypes : this.getTerrainTypes()

      for (let r = 0; r < height; r++) {
        for (let q = 0; q < width; q++) {
          const hex = this.createHex(q, r, terrainTypes)
          const key = `${q},${r}`
          const savedTerrain = terrainMap[key]
          if (savedTerrain) {
            hex.terrain = savedTerrain
          } else if (terrainTypes.length > 0) {
            const terrainId = (this.gameState && this.gameState.getHex(q, r)?.terrain?.id) || 'plains'
            const terrain = terrainTypes.find(t => t.id === terrainId)
            if (terrain) hex.terrain = terrain
          }
          const overlays = overlaysMap[key]
          if (overlays) {
            hex.player1Spawn = overlays.player1Spawn
            hex.player1Base = overlays.player1Base
            hex.player2Spawn = overlays.player2Spawn
            hex.player2Base = overlays.player2Base
          }
          this.hexMapData.push(hex)
        }
      }

      // Remap selectedHex/hoveredHex to new objects by coordinate (#11).
      // Template uses identity comparison (selectedHex === hex) so stale refs
      // cause the selection outline to vanish and toggle to break after zoom.
      if (oldSelQ != null) {
        this.selectedHex = this.hexMapData.find(h => h.q === oldSelQ && h.r === oldSelR) || null
      }
      if (oldHovQ != null) {
        this.hoveredHex = this.hexMapData.find(h => h.q === oldHovQ && h.r === oldHovR) || null
      }

      // If the remap failed (hex no longer in bounds after board shrink), close
      // the floating panel so it is never bound to a null selectedHex.
      if (this.selectedHex == null) this.selectedHexDropdownVisible = false

      // Units are managed by gameState and don't need regeneration
    },
    
    handleClickOutside(event) {
      // Close dropdown if clicked outside
      if (this.showSettings && !this.$el.contains(event.target)) {
        this.showSettings = false
      }
    },
    
    /**
     * Гарячі клавіші при вибраному юніті (незалежно від видимості плаваючої панелі).
     * Стрілки — маневр; Ctrl+←/→ — зміна цілі пострілу; Space / R — постріл / перезарядка.
     */
    handleKeyDown(event) {
      if (this.readOnly) {
        return
      }
      if (!this.selectedUnit) {
        return
      }
      if (event.key === 'Tab') {
        if (this.shouldIgnoreUnitCycleTarget(event)) return
        event.preventDefault()
        this.cycleSelectedUnit(event.shiftKey ? -1 : 1)
        return
      }
      if (this.shouldIgnoreKeyboardForEditableTarget(event)) {
        return
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        this.fireAtSelectedTarget()
        return
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        this.performReloadWeapon()
        return
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault()
        this.shiftAttackTarget(event.key === 'ArrowLeft' ? -1 : 1)
        return
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          this.moveUnitForward()
          break
        case 'ArrowDown':
          event.preventDefault()
          this.moveUnitReverse()
          break
        case 'ArrowLeft':
          event.preventDefault()
          this.rotateUnitCounterClockwise()
          break
        case 'ArrowRight':
          event.preventDefault()
          this.rotateUnitClockwise()
          break
        default:
          break
      }
    },

    shouldIgnoreUnitCycleTarget(event) {
      const el = event && event.target
      if (!el || typeof el.closest !== 'function') return false
      const tag = el.tagName ? String(el.tagName).toLowerCase() : ''
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if (el.isContentEditable === true) return true
      if (el.closest('[contenteditable="true"]')) return true
      return !!el.closest('[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]')
    },

    isUnitAlive(unit) {
      if (!unit) return false
      if (typeof unit.isAlive === 'function') return unit.isAlive()
      return unit.isActive !== false && Number(unit.health ?? 1) > 0
    },

    getCyclableActivePlayerUnits() {
      const gs = this.gameState
      if (!gs) return []
      const player = gs.currentPlayer
      let units = []
      if (typeof gs.getActivePlayerUnits === 'function') {
        units = gs.getActivePlayerUnits(player)
      } else if (typeof gs.getPlayerUnits === 'function') {
        units = gs.getPlayerUnits(player).filter(unit => this.isUnitAlive(unit))
      } else if (typeof gs.getAllUnits === 'function') {
        units = gs.getAllUnits()
          .filter(unit => unit && String(unit.player) === String(player) && this.isUnitAlive(unit))
      }
      if (!Array.isArray(units)) return []
      return units.filter(unit => unit && unit.id != null)
    },

    cycleSelectedUnit(delta = 1) {
      if (this.readOnly) return
      const units = this.getCyclableActivePlayerUnits()
      if (units.length === 0) return
      const selectedId = this.selectedUnit && this.selectedUnit.id != null ? String(this.selectedUnit.id) : null
      const currentIndex = selectedId == null
        ? -1
        : units.findIndex(unit => String(unit.id) === selectedId)
      const step = Number(delta) < 0 ? -1 : 1
      const nextIndex = (((currentIndex + step) % units.length) + units.length) % units.length
      const nextUnit = units[nextIndex]
      if (!nextUnit || (selectedId != null && String(nextUnit.id) === selectedId && units.length === 1)) return
      const hex = this.findHexForUnit(nextUnit)
      if (!hex) return
      this.selectHex(hex, null)
    },

    shiftAttackTarget(delta) {
      this.normalizeSelectedTargetIndex()
      const n = this.validAttackTargets.length
      if (n === 0) {
        this.selectedTargetIndex = 0
        if (Number(delta) !== 0) {
          this.notify(
            'warning',
            this.uiText('gameplay.map.notifications.target', 'Target'),
            this.uiText('gameplay.map.notifications.noTargets', 'No targets in line of fire.')
          )
        }
        return
      }
      const d = Number(delta)
      if (!Number.isFinite(d)) return
      let i = this.selectedTargetIndex
      i = (((i + d) % n) + n) % n
      this.selectedTargetIndex = i
      this.normalizeSelectedTargetIndex()
    },

    fireAtSelectedTarget() {
      if (this.readOnly) return
      if (this.fireRafPending) return
      this.fireRafPending = true
      requestAnimationFrame(() => {
        try {
          this._executeFireAtSelectedTarget()
        } finally {
          this.fireRafPending = false
        }
      })
    },

    _executeFireAtSelectedTarget() {
      if (this.readOnly) return
      // Normalize the index before snapshotting it for the reaction so
      // a stale `selectedTargetIndex` cannot push the chosen target
      // off the end of `validAttackTargets`.
      this.normalizeSelectedTargetIndex()
      reactFire(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m)
      )
    },

    performReloadWeapon() {
      if (this.readOnly) return
      reactReload(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m)
      )
    },

    refreshSelectedUnitFromGameState() {
      if (!this.selectedUnit || !this.gameState || typeof this.gameState.getAllUnits !== 'function') return
      const units = this.gameState.getAllUnits()
      const fresh = units.find(u => u.id === this.selectedUnit.id)
      if (fresh) {
        this.selectedUnit = fresh
        if (this.selectedHex) {
          const h = this.hexMapData.find(x => x.q === fresh.position.q && x.r === fresh.position.r)
          if (h) {
            const previousHex = this.selectedHex
            this.selectedHex = h
            if (!previousHex || previousHex.q !== h.q || previousHex.r !== h.r) {
              this.$emit('hex-selected', h)
            }
          }
        }
      } else {
        this.deselectHex()
      }
    },
    
    getUnitHexagonPoints(centerX, centerY) {
      return pointyTopHexPolygonPoints({ centerX, centerY, radius: 10 })
    },
    
    // Unit management methods
    /** Подія з плаваючої панелі / інспектора: оновлення прапорця (× лише ховає панель). */
    onUpdateShowFloatingPanel(value) {
      const next = normalizeBool(value, this.showFloatingPanel)
      this.$emit('update:showFloatingPanel', next)
    },
    
    deselectHex() {
      this.selectedUnit = null
      this.selectedHexDropdownVisible = false
      this.selectedHex = null
      this.selectedTargetIndex = 0
      this.$emit('hex-selected', null)
      
      // Зберігаємо поточну позицію дропдауну
      this.$emit('update-selected-hex-dropdown-position', this.localSelectedHexDropdownPosition)
    },
    
    positionDropdownRelativeToCursor(event) {
      // Позиціонуємо дропдаун відносно курсора з offset x+100px, y-50px
      const offsetX = 100
      const offsetY = -50
      
      let x = event.clientX + offsetX
      let y = event.clientY + offsetY
      
      // Перевіряємо межі вікна
      const dropdownWidth = 300 // max-width з CSS
      const dropdownHeight = 400 // приблизна висота
      
      if (x + dropdownWidth > window.innerWidth) {
        x = event.clientX - dropdownWidth - 10
      }
      
      if (y < 0) {
        y = event.clientY + 10
      }
      
      if (y + dropdownHeight > window.innerHeight) {
        y = window.innerHeight - dropdownHeight - 10
      }
      
      const newPosition = { x, y }
      // Оновлюємо локальну позицію
      this.localSelectedHexDropdownPosition = newPosition
      this.$emit('update-selected-hex-dropdown-position', newPosition)
    },
    
    startSelectedHexDrag(event) {
      event.preventDefault()
      this.cleanupSelectedHexDrag()
      this.isDraggingSelectedHexDropdown = true
      
      const startX = event.clientX
      const startY = event.clientY
      const startPosX = this.localSelectedHexDropdownPosition.x
      const startPosY = this.localSelectedHexDropdownPosition.y
      
      const handleMouseMove = (e) => {
        if (!this.isDraggingSelectedHexDropdown) return
        
        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY
        
        const newPosition = {
          x: Math.max(0, startPosX + deltaX),
          y: Math.max(0, startPosY + deltaY)
        }
        
        // Локально лише — збереження в localStorage один раз на mouseup (без спаму)
        this.localSelectedHexDropdownPosition = newPosition
      }
      
      const handleMouseUp = () => {
        this.isDraggingSelectedHexDropdown = false
        this.cleanupSelectedHexDrag()
        this.$emit('update-selected-hex-dropdown-position', { ...this.localSelectedHexDropdownPosition })
      }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      this.selectedHexDragCleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        this.selectedHexDragCleanup = null
      }
    },

    cleanupSelectedHexDrag() {
      if (typeof this.selectedHexDragCleanup !== 'function') return
      this.selectedHexDragCleanup()
      this.isDraggingSelectedHexDropdown = false
    },
    
    /**
     * Snapshot of UI state in the shape `commandReactions` expects.
     * Mirrors what `Playground.buildReactionContext()` passes,
     * but reads from the map's own computed properties so the two
     * surfaces produce identical results.
     */
    buildReactionContext() {
      const unitId = this.selectedUnit ? this.selectedUnit.id : null
      const row = unitId && this.gameState && this.gameState.turnState
        ? this.gameState.turnState[unitId]
        : null
      return {
        selectedUnitId: unitId,
        canMoveForward: this.canMoveForward,
        canMoveReverse: this.canMoveReverse,
        canRotate: this.canRotate,
        canFire: this.canFireAttack,
        canReload: this.canReloadAttack,
        validAttackTargets: this.validAttackTargets,
        selectedTargetIndex: this.selectedTargetIndex,
        moveForwardTarget: this.moveForwardTarget,
        moveReverseTarget: this.moveReverseTarget,
        dice: this.currentDiceResultForUi == null ? null : this.currentDiceResultForUi,
        currentFacing: this.selectedUnit && Number.isInteger(this.selectedUnit.facing)
          ? this.selectedUnit.facing
          : 0,
        isLoaded: !!(row && row.isLoaded === true),
        uiText: (key, fallback, params) => this.uiText(key, fallback, params)
      }
    },

    /**
     * `gameController` wrapped so reactions automatically refresh the
     * map's view state (selected unit/hex) and emit
     * `game-state-updated` on success. Keeps the reactions ignorant
     * of view sync; keeps the map ignorant of dispatch semantics.
     */
    buildReactionController() {
      const component = this
      const base = component.gameController
      const wrap = (method) => (args) => {
        if (!base) return { ok: false, code: 'NO_CONTROLLER', message: 'Game controller is not available.' }
        const result = base[method](args)
        if (result.ok) {
          component.refreshSelectedUnitFromGameState()
          component.$emit('game-state-updated', component.gameState)
        }
        return result
      }
      return {
        moveUnit: wrap('moveUnit'),
        updateUnitFacing: wrap('updateUnitFacing'),
        performAttack: wrap('performAttack'),
        performReload: wrap('performReload')
      }
    },

    /** Adapter to the `(level,title,message)` notifier signature used by reactions. */
    reactionNotifier(level, title, message) {
      this.notify(level, title, message)
    },

    rotateUnitClockwise() {
      if (this.readOnly) return
      reactRotate(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m),
        1
      )
    },

    rotateUnitCounterClockwise() {
      if (this.readOnly) return
      reactRotate(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m),
        -1
      )
    },

    // setUnitFacing (facing direction feature) — explicit facing target picker.
    setUnitFacing(facing) {
      if (this.readOnly) return
      reactSetFacing(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m),
        facing
      )
    },
    
    // debugUnitState (facing direction feature)
    debugUnitState() {
      if (!this.selectedUnit) return
      
      console.log('=== UNIT DEBUG ===')
      console.log('Unit:', this.selectedUnit)
      console.log('facing (raw):', this.selectedUnit.facing)
      console.log('facing (type):', typeof this.selectedUnit.facing)
      console.log('facing (isArray):', Array.isArray(this.selectedUnit.facing))
      
      const facing = this.selectedUnit.facing
      console.log('facing (processed):', facing)
      
      // Отримуємо напрямки для поточного рядка
      const directions = getHexDirections(this.selectedUnit.position.r)
      console.log('Directions for row', this.selectedUnit.position.r, ':', directions)
      console.log('Direction', facing, ':', directions[facing])
      
      const currentPos = this.selectedUnit.position
      console.log('Current position:', currentPos)
      
      const targetPos = {
        q: currentPos.q + directions[facing].q,
        r: currentPos.r + directions[facing].r
      }
      console.log('Target position:', targetPos)
      console.log('=== END DEBUG ===')
    },
    
    // moveUnitForward (facing direction feature) — turntable action "move".
    moveUnitForward() {
      if (this.readOnly) return
      reactMoveForward(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m)
      )
    },

    // moveUnitReverse — turntable action "reverse" (step behind facing).
    moveUnitReverse() {
      if (this.readOnly) return
      reactMoveReverse(
        this.buildReactionContext(),
        this.buildReactionController(),
        (l, t, m) => this.reactionNotifier(l, t, m)
      )
    },
    
    // Unit icon methods
    getUnitIconPath(unitOrType, iconType) {
      try {
        const unitType = unitOrType && typeof unitOrType === 'object'
          ? (unitOrType.iconKey || unitOrType.type)
          : unitOrType
        const player = unitOrType && typeof unitOrType === 'object'
          ? unitOrType.player
          : null
        return getUnitIcon(unitType, iconType, { player })
      } catch (error) {
        console.warn(`Failed to get icon for unit type ${unitOrType}, icon type ${iconType}:`, error)
        return null
      }
    },
    
    // Get overlay icon path (spawn/base markers)
    getOverlayIcon(player, type) {
      return OVERLAY_ICONS[`${player}:${type}`] || null
    },
    
    // getUnitRotationTransform (facing direction feature)
    getUnitRotationTransform(centerX, centerY, facing) {
      // Calculate rotation angle based on facing direction
      // facing: 0-5, where 0 = north (↑) in pointy-top hex grid
      // In pointy-top orientation, direction 0 should be at -30° (330°)
      const angle = (facing * 60) + 30
      return `rotate(${angle} ${centerX} ${centerY})`
    },
    
    /**
     * Отримує transform для іконки юніта (facing direction feature)
     * Returns transform string for unit icon rotation based on facing direction
     */
    getUnitIconTransform(centerX, centerY, facing) {
      return this.getUnitRotationTransform(centerX, centerY, facing)
    },
    
    /**
     * Знаходить юніт за координатами центру
     */
    findUnitByCenter(centerX, centerY) {
      if (!this.gameState || typeof this.gameState.getAllUnits !== 'function') return null
      
      const units = this.gameState.getAllUnits()
      return units.find(unit => {
        const hex = this.hexMapData.find(h => h.q === unit.position.q && h.r === unit.position.r)
        return hex && Math.abs(hex.center.x - centerX) < 1 && Math.abs(hex.center.y - centerY) < 1
      })
    },
    
    /**
     * Отримує transform для стрілочки (завжди повертається) (facing direction feature)
     */
    getUnitArrowTransform(centerX, centerY, facing) {
      return this.getUnitRotationTransform(centerX, centerY, facing)
    }
  }
}
</script>

<style scoped lang="scss">
@use '../styles/components.scss' as *;
@use '../styles/GameMapBlock.scss' as *;

// Unit styles
.game-map-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.game-map-block--viewer {
  height: 100%;
  background: #fff;

  .map-container {
    min-height: 420px;
  }
}

.unit-group {
  pointer-events: none; // Units don't interfere with hex selection
  
  &.out-of-range {
    opacity: 0.4;
    filter: grayscale(100%);
  }
}

.unit-body-icon {
  pointer-events: none;
  // filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.3));
}

.unit-arrow-icon {
  pointer-events: none;
  // filter: drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.5));
}

.unit-background {
  pointer-events: none;
}

.unit-arrow {
  pointer-events: none;
}

.unit-background {
  transition: all 0.2s ease;
  
  &:hover {
    stroke-width: 3;
    stroke: #4CAF50;
  }
}

.unit-arrow {
  transition: all 0.2s ease;
  stroke: #333;
  stroke-width: 1;
}

// Unit dropdown styles are now in universal-components.scss
</style>

