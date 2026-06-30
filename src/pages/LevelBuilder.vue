<template>
  <div class="level-builder">
    <HeaderComponent/>

    <div class="level-builder-shell">
      <header class="level-builder-shell__header">
        <h1 class="level-builder-shell__title">{{ $t('pages.levelBuilder.title') }}</h1>
        <p class="level-builder-shell__subtitle">
          {{ $t('pages.levelBuilder.subtitle') }}
        </p>
      </header>

      <LevelBuilderStepper
        :steps="steps"
        :active-step-id="activeStepId"
        @step-change="setActiveStep"
      />

      <div class="level-builder-shell__workspace">
        <section
          v-if="activeStep"
          class="level-builder-shell__step-card"
          :aria-labelledby="`step-${activeStep.id}-title`"
        >
          <h2
            :id="`step-${activeStep.id}-title`"
            class="level-builder-shell__step-title"
          >
            {{ $tf(activeStep.titleKey, activeStep.title) }}
          </h2>
          <p class="level-builder-shell__step-hint">{{ $tf(activeStep.hintKey, activeStep.hint) }}</p>

          <MapBuilderStep
            v-if="activeStepId === 'map-deployment'"
            :hexes="generatedMap"
            :map-width="currentMapWidth || mapParams.width"
            :map-height="currentMapHeight || mapParams.height"
            :hex-size="canvasHexSize"
            :selected-hex="selectedHex"
            :show-coordinates="showCoordinates"
            :is-painting-mode="isPaintingMode"
            :map-params="mapParams"
            :terrain-types="terrainTypes"
            :terrain-seed="terrainSeed"
            :terrain-seed-locked="terrainSeedLocked"
            :selected-terrain-for-painting="selectedTerrainForPainting"
            :zoom-level="zoomLevel"
            :min-zoom="hexMapConfig.minZoom"
            :max-zoom="hexMapConfig.maxZoom"
            :hex-count="generatedMap.length"
            :current-map-width="currentMapWidth"
            :current-map-height="currentMapHeight"
            :unique-terrain-types="uniqueTerrainTypes"
            :protect-deployment-terrain="protectDeploymentTerrain"
            :overlay-types="localizedOverlayTypes"
            :selected-overlay="selectedOverlay"
            :active-map-tool="activeMapTool"
            :lock-brush-mode="lockBrushMode"
            :locked-hex-count="lockedHexCount"
            :deployment-anchor-count="deploymentAnchorCount"
            :clearable-deployment-anchor-count="clearableDeploymentAnchorCount"
            @select-hex="selectHex"
            @start-drag-painting="startDragPainting"
            @continue-drag-painting="continueDragPainting"
            @stop-drag-painting="stopDragPainting"
            @hex-right-click="handleHexRightClick"
            @decrease-width="decreaseWidth"
            @increase-width="increaseWidth"
            @decrease-height="decreaseHeight"
            @increase-height="increaseHeight"
            @update:map-width="setMapWidth"
            @update:map-height="setMapHeight"
            @commit-map-dimensions="resizeGeneratedMapToDimensions"
            @update:terrain-seed="(value) => (terrainSeed = value)"
            @update:terrain-seed-locked="(value) => (terrainSeedLocked = value)"
            @generate-map="generateMap"
            @toggle-terrain="toggleTerrain"
            @update-terrain-types="updateTerrainTypes"
            @select-terrain-for-painting="selectTerrainForPainting"
            @select-map-tool="selectMapTool"
            @select-lock-brush-mode="selectLockBrushMode"
            @unlock-all-hexes="unlockAllHexes"
            @clear-deployment-anchors="clearDeploymentAnchors"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @update:show-coordinates="(value) => (showCoordinates = value)"
            @update:protect-deployment-terrain="(value) => (protectDeploymentTerrain = value)"
            @select-overlay="selectOverlay"
          />
          <UnitsBuilderStep
            v-else-if="activeStepId === 'units'"
            :units-data="unitsData"
            :unit-types="unitTypesForEditor"
            :used-unit-type-ids="usedUnitTypeIds"
            :deployment-slots="deploymentSlots"
            :available-types-by-key="availableTypesByKey"
            :unit-issues-by-key="unitIssuesByKey"
            @add-unit="(playerKey, type) => addUnitToRoster(playerKey, type)"
            @remove-unit="(playerKey, idx) => removeUnitFromRoster(playerKey, idx)"
            @set-type="(playerKey, idx, type) => setUnitType(playerKey, idx, type)"
            @update-field="(playerKey, idx, field, value) =>
              setUnitField(playerKey, idx, field, value)"
            @reset-units="resetUnitsToDefault"
            @copy-roster="copyUnitRoster"
            @sync-enemy-roster="syncEnemyRosterFromPlayer"
            @update-unit-types="updateUnitTypes"
          />
          <TurntableBuilderStep
            v-else-if="activeStepId === 'turntable'"
            :turntable-data="turntableData"
            :victory-condition-settings="victoryConditionSettings"
            :red-base-available="redBaseAvailable"
            :blue-base-available="blueBaseAvailable"
            @reset-turntable="resetTurntableToDefault"
            @mirror-turntable="copyTurntable"
            @toggle-action="(sideKey, opIdx, faceIdx, action) =>
              toggleTurntableAction(sideKey, opIdx, faceIdx, action)"
            @update-victory-condition="updateVictoryCondition"
          />
          <template v-else-if="activeStepId === 'review-export'">
            <ReviewExportStep
              :validation="liveValidation"
              :displayed-errors="validationDisplayedErrors"
              :displayed-warnings="validationDisplayedWarnings"
              :level-id="currentLevelId"
              :export-level-id="previewExportLevelId"
              :last-action-stage="lastActionStage"
              :section-readiness="sectionReadiness"
              @update:level-id="setLevelId"
              @export-archive="saveLevelArchive"
              @export="saveMap"
              @test-in-playground="testInPlayground"
              @test-in-automated-playground="testInAutomatedPlayground"
              @import-files="loadMap"
            >
              <template #automated-playtest>
                <AutomatedPlaytestPanel
                  :config="automationRunConfig"
                  :result="automationResult"
                  :error="automationError"
                  :running="automationRunning"
                  :trace-available="!!automationTraceId"
                  :seed-locked="automationSeedLocked"
                  @update-config="updateAutomationRunConfig"
                  @run-match="runAutomatedPlaytest"
                  @open-playback="openAutomatedPlayback"
                  @toggle-seed-lock="toggleAutomationSeedLock"
                  @commit-seed="commitAutomationSeedInput"
                />
              </template>
            </ReviewExportStep>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
// Level Builder — the canonical builder/editor page. Domain logic
// (loading, package assembly, validation, terrain sprinkling, turntable
// editing) is delegated to `src/domain/level/`; this component owns the
// stepper UI and the page-level coordinator state (map dimensions,
// painting tools, current level id, etc.).
import HeaderComponent from '../components/HeaderComponent'
import LevelBuilderStepper from '../components/level-builder/LevelBuilderStepper.vue'
import MapBuilderStep from '../components/level-builder/MapBuilderStep.vue'
import UnitsBuilderStep from '../components/level-builder/UnitsBuilderStep.vue'
import TurntableBuilderStep from '../components/level-builder/TurntableBuilderStep.vue'
import AutomatedPlaytestPanel from '../components/level-builder/AutomatedPlaytestPanel.vue'
import ReviewExportStep from '../components/level-builder/ReviewExportStep.vue'
import { mapDefaults, hexMap } from '../config/theme'
import { loadLevelPackage } from '../domain/level/loadLevelPackage'
import { validateLevelPackage } from '../domain/level/validateLevelPackage'
import {
  builderStateToPackage,
  packageToBuilderState,
  detectSection,
  mergeSectionsIntoPackage,
  SECTION_FILENAME_SUFFIX,
  sprinkleTerrainSeeds,
  copyTurntableSide
} from '../domain/level/builderPackage'
import {
  buildLevelArchiveBlob,
  levelArchiveFilename,
  parseLevelArchive
} from '../domain/level/levelArchive'
import {
  BUILDER_PLAYTEST_QUERY_KEY,
  createBuilderPlaytestHandoff,
  fingerprintLevelPackage
} from '../domain/level/builderPlaytestLevels'
import { OBJECTIVE_TYPES, hasBaseForPlayer } from '../domain/objectives/objectives'
import { runConfiguredMatch } from '../domain/simulation/runConfiguredMatch'
import { TRACE_QUOTA_MESSAGE } from '../domain/simulation/traceStorage'
import {
  appendTraceToHistory,
  readTraceFromHistory,
  readTraceHistoryIndex,
  writeBuilderEpoch
} from '../domain/simulation/traceHistory.js'
import {
  clearBuilderDraft,
  loadBuilderDraft,
  saveBuilderDraft
} from '../domain/level/builderDraftStorage.js'
import {
  DEFAULT_UNIT_CATALOG,
  DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID,
  normalizeUnitCatalog,
  resolveUnitTypeDef,
  unitCatalogToMap
} from '@/domain/engine/gameUnits.js'
import { computeHexPolygonGeometry, normalizeAttackAngle } from '@/domain/engine/hexUtils.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

const DEFAULT_LEVEL_ID = 'level_000'
const SAFE_LEVEL_ID = /^[a-zA-Z0-9_-]+$/
const DEFAULT_SURVIVE_TURNS = 10
const PRIMARY_OBJECTIVE_TYPES = Object.freeze([
  OBJECTIVE_TYPES.ELIMINATE_UNITS,
  OBJECTIVE_TYPES.OCCUPY_BASE,
  OBJECTIVE_TYPES.PROTECT_BASE,
  OBJECTIVE_TYPES.SURVIVE_TURNS
])
const MIN_MAP_DIMENSION = 4
const MAX_MAP_DIMENSION = 50
const EXPORT_TIMESTAMP_SUFFIX_PATTERN = /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/
const DEFAULT_VICTORY_CONDITION_SETTINGS = Object.freeze({
  type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
  deadlineEnabled: false,
  deadlineTurns: DEFAULT_SURVIVE_TURNS
})

function cloneVictoryConditionSettings() {
  return { ...DEFAULT_VICTORY_CONDITION_SETTINGS }
}

function normalizeSurviveTurns(value, fallback = DEFAULT_SURVIVE_TURNS) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(2, Math.min(999, Math.trunc(n)))
}

/** Build an empty roster shape that validateLevelPackage will accept (units array required). */
function emptyRoster() {
  return { units: [] }
}

function unitDefDefaults(type) {
  return {
    type,
    count: 1
  }
}

const DEFAULT_UNIT_IDS = DEFAULT_UNIT_TYPE_ID_BY_LEGACY_ID

const DEFAULT_UNITS_DATA = Object.freeze({
  unitTypes: DEFAULT_UNIT_CATALOG.map(unitType => ({ ...unitType })),
  player1: {
    units: [
      {
        type: DEFAULT_UNIT_IDS.infantry,
        count: 2
      },
      {
        type: DEFAULT_UNIT_IDS.armored,
        count: 1
      },
      {
        type: DEFAULT_UNIT_IDS.artillery,
        count: 1
      }
    ]
  },
  player2: {
    units: [
      {
        type: DEFAULT_UNIT_IDS.infantry,
        count: 2
      },
      {
        type: DEFAULT_UNIT_IDS.armored,
        count: 2
      },
      {
        type: DEFAULT_UNIT_IDS.artillery,
        count: 0
      }
    ]
  }
})

function cloneUnitDef(unit) {
  if (!unit || typeof unit !== 'object') return unit
  return Object.fromEntries(
    Object.entries(unit).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.slice() : value
    ])
  )
}

function cloneUnitsData(unitsData) {
  return {
    unitTypes: normalizeUnitCatalog(unitsData.unitTypes).map(unitType => ({ ...unitType })),
    player1: {
      units: unitsData.player1.units.map(unit => cloneUnitDef(unit))
    },
    player2: {
      units: unitsData.player2.units.map(unit => cloneUnitDef(unit))
    }
  }
}

export default {
  name: 'LevelBuilder',
  mixins: [i18nTextMixin],
  components: {
    HeaderComponent,
    LevelBuilderStepper,
    MapBuilderStep,
    UnitsBuilderStep,
    TurntableBuilderStep,
    AutomatedPlaytestPanel,
    ReviewExportStep
  },
  data() {
    return {
      steps: [
        {
          id: 'map-deployment',
          titleKey: 'pages.levelBuilder.steps.mapDeployment.title',
          title: 'Map & deployment',
          hintKey: 'pages.levelBuilder.steps.mapDeployment.hint',
          hint: 'Set dimensions, generate terrain, paint cells, and mark spawn/base anchors.'
        },
        {
          id: 'units',
          titleKey: 'pages.levelBuilder.steps.units.title',
          title: 'Units',
          hintKey: 'pages.levelBuilder.steps.units.hint',
          hint: 'Edit the player and enemy rosters that ship with the level package.'
        },
        {
          id: 'turntable',
          titleKey: 'pages.levelBuilder.steps.turntable.title',
          title: 'Turns & objectives',
          hintKey: 'pages.levelBuilder.steps.turntable.hint',
          hint: 'Edit the per-side, per-phase D6 action matrix for both sides, then set the level victory conditions.'
        },
        {
          id: 'review-export',
          titleKey: 'pages.levelBuilder.steps.reviewExport.title',
          title: 'Review & export',
          hintKey: 'pages.levelBuilder.steps.reviewExport.hint',
          hint: 'Validate the full level package and export it as a level archive.'
        }
      ],
      activeStepId: 'map-deployment',
      mapParams: {
        width: mapDefaults.width,
        height: mapDefaults.height,
        availableTerrain: []
      },
      terrainTypes: [],
      generatedMap: [],
      selectedHex: null,
      showCoordinates: false,
      zoomLevel: mapDefaults.zoom,
      currentMapWidth: 0,
      currentMapHeight: 0,
      currentLevelId: DEFAULT_LEVEL_ID,
      exportPreviewTimestamp: Date.now(),
      exportPreviewTimerId: null,
      lastGeneratedExportTimestamp: null,
      frozenExportLevelId: null,
      frozenExportFingerprint: null,
      unitsData: null,
      turntableData: null,
      objectivesData: null,
      victoryConditionSettings: cloneVictoryConditionSettings(),
      automationRunConfig: {
        seed: '',
        maxTurns: 100,
        players: {
          player1: { profile: 'balanced' },
          player2: { profile: 'balanced' }
        },
        trace: true
      },
      automationSeedLocked: false,
      automationResult: null,
      automationTraceId: '',
      automationError: '',
      automationRunning: false,
      terrainSeed: '',
      terrainSeedLocked: false,
      lastActionStage: 'idle',
      isPaintingMode: false,
      activeMapTool: 'select',
      lockBrushMode: 'lock',
      selectedTerrainForPainting: null,
      isDragging: false,
      lastPaintedHex: null,
      dragButton: 0,
      selectedOverlay: null,
      // Generation-time safety toggle. When on (the default), generateMap
      // passes the current spawn/base overlay coordinates as `safeCells`
      // to `sprinkleTerrainSeeds` so anchor cells are guaranteed safe and
      // their immediate neighbours get a softer 50% safety chance. Turning
      // it off makes the sprinkler treat anchor cells like any other
      // (useful when the designer wants to manually paint terrain under
      // anchors).
      protectDeploymentTerrain: true,
      // Deployment-anchor palette. Each entry pairs a UI label/icon with
      // the `<player>{Spawn,Base}` boolean flag set on a hex during
      // overlay painting.
      overlayTypes: [
        {
          id: 'player1-spawn',
          nameKey: 'levelBuilder.mapControls.player1Spawn',
          name: 'Player 1 spawn',
          iconPath: require('@/assets/icons/spawn_player1.svg'),
          property: 'player1Spawn',
          player: 1,
          type: 'spawn'
        },
        {
          id: 'player1-base',
          nameKey: 'levelBuilder.mapControls.player1Base',
          name: 'Player 1 base',
          iconPath: require('@/assets/icons/base_player1.svg'),
          property: 'player1Base',
          player: 1,
          type: 'base'
        },
        {
          id: 'player2-spawn',
          nameKey: 'levelBuilder.mapControls.player2Spawn',
          name: 'Player 2 spawn',
          iconPath: require('@/assets/icons/spawn_player2.svg'),
          property: 'player2Spawn',
          player: 2,
          type: 'spawn'
        },
        {
          id: 'player2-base',
          nameKey: 'levelBuilder.mapControls.player2Base',
          name: 'Player 2 base',
          iconPath: require('@/assets/icons/base_player2.svg'),
          property: 'player2Base',
          player: 2,
          type: 'base'
        }
      ]
    }
  },
  computed: {
    activeStep() {
      return this.steps.find(s => s.id === this.activeStepId) || this.steps[0]
    },
    currentObjectivesData() {
      return this.buildObjectivesDataFromVictoryConditions(this.victoryConditionSettings)
    },
    redBaseAvailable() {
      return hasBaseForPlayer(this.generatedMap, 'player2')
    },
    blueBaseAvailable() {
      return hasBaseForPlayer(this.generatedMap, 'player1')
    },
    localizedOverlayTypes() {
      return this.overlayTypes.map(overlay => ({
        ...overlay,
        name: this.uiText(overlay.nameKey, overlay.name)
      }))
    },
    uniqueTerrainTypes() {
      const terrainCounts = {}
      this.generatedMap.forEach(hex => {
        const terrainId = hex.terrain.id
        if (!terrainCounts[terrainId]) {
          terrainCounts[terrainId] = {
            ...hex.terrain,
            count: 0
          }
        }
        terrainCounts[terrainId].count++
      })
      return Object.values(terrainCounts)
    },
    lockedHexCount() {
      return this.generatedMap.filter(hex => hex.locked === true).length
    },
    deploymentAnchorCount() {
      return this.countDeploymentAnchors(this.generatedMap)
    },
    clearableDeploymentAnchorCount() {
      return this.countDeploymentAnchors(this.generatedMap.filter(hex => !this.isHexLocked(hex)))
    },
    hexMapConfig() {
      return hexMap
    },
    canvasHexSize() {
      return hexMap.baseHexSize * this.zoomLevel
    },
    liveValidation() {
      try {
        const pkg = this.buildPackageFromState()
        return validateLevelPackage(pkg)
      } catch (err) {
        const message = err && err.message ? err.message : String(err)
        return { ok: false, errors: [{ path: '', message }], warnings: [], package: null }
      }
    },
    validationDisplayedErrors() {
      return this.liveValidation.errors.slice(0, 5)
    },
    validationDisplayedWarnings() {
      return this.liveValidation.warnings.slice(0, 5)
    },
    previewExportLevelId() {
      const frozen = this.currentFrozenExportLevelId()
      if (frozen) return frozen
      return this.buildTimestampedExportLevelId(
        this.currentLevelId,
        this.exportPreviewTimestamp || Date.now()
      )
    },
    // Deployment slot counts per side, derived from the currently-
    // generated map. Mirrors the validator's `countSpawnSlots`
    // (src/domain/level/validateLevelPackage.js:218–227): a cell is
    // a deployment slot when EITHER `<player>Spawn === true` OR
    // `<player>Base === true`. Counting spawn-only would make the
    // Units step display `0 deployment slots` for a board that only
    // has base anchors, even though the validator considers it
    // deployment-capable.
    deploymentSlots() {
      const counts = { player1: 0, player2: 0 }
      for (const hex of this.generatedMap) {
        if (!hex) continue
        if (hex.player1Spawn === true || hex.player1Base === true) counts.player1++
        if (hex.player2Spawn === true || hex.player2Base === true) counts.player2++
      }
      return counts
    },
    unitTypesForEditor() {
      const unitsData = this.unitsData && typeof this.unitsData === 'object' ? this.unitsData : {}
      return normalizeUnitCatalog(unitsData.unitTypes)
    },
    unitCatalogById() {
      return unitCatalogToMap(this.unitTypesForEditor)
    },
    unitTypeIds() {
      return this.unitTypesForEditor.map(unitType => unitType.id)
    },
    usedUnitTypeIds() {
      const used = new Set()
      for (const playerKey of ['player1', 'player2']) {
        const roster = this.unitsData && this.unitsData[playerKey]
        const units = roster && Array.isArray(roster.units) ? roster.units : []
        units.forEach(unit => {
          if (unit && typeof unit.type === 'string' && unit.type.trim()) {
            used.add(unit.type.trim())
          }
        })
      }
      return Array.from(used)
    },
    // Per-side "Available unit types" for the add-row dropdown. Computed
    // here so the step component stays purely presentational and so the
    // existing `availableUnitTypes` method (validator-aligned) remains
    // the single source of truth.
    availableTypesByKey() {
      return {
        player1: this.availableUnitTypes('player1'),
        player2: this.availableUnitTypes('player2')
      }
    },
    // Split `liveValidation` errors+warnings by side using the validator's
    // path convention (`units.<key>` or `units.<key>.…`). Each entry is
    // tagged with `severity: 'error' | 'warning'` so the consumer can
    // render them distinctly: errors block export (validator returns
    // ok=false), warnings are advisory (validator still ok=true; e.g.
    // the legacy `maxTerrainDifficuly` migration warning at
    // src/domain/level/validateLevelPackage.js:301). Issues at the root
    // `units` path are not attributed to either side — they surface in
    // the global package validation panel (Review & Export). No rule
    // forking; this is purely a formatter over validator output.
    unitIssuesByKey() {
      const buckets = { player1: [], player2: [] }
      const validation = this.liveValidation
      const tag = (severity) => (issue) => ({ ...issue, severity })
      const tagged = [
        ...(validation && Array.isArray(validation.errors)
          ? validation.errors.map(tag('error'))
          : []),
        ...(validation && Array.isArray(validation.warnings)
          ? validation.warnings.map(tag('warning'))
          : [])
      ]
      for (const issue of tagged) {
        if (!issue || typeof issue.path !== 'string') continue
        for (const key of ['player1', 'player2']) {
          if (issue.path === `units.${key}` || issue.path.startsWith(`units.${key}.`)) {
            buckets[key].push(issue)
            break
          }
        }
      }
      return buckets
    },
    // Per-section status rows for the Review & Export step. Three rows
    // (Map, Units, Turntable) are driven directly by validator path
    // prefixes; Deployment is derived from `deploymentSlots` because
    // anchor placement is not separately validated (the
    // units-exceed-slots check lives under `units.<key>`). Status enum:
    //   'ready'    — no issues / both sides anchored
    //   'warnings' — validator warnings only, or partial anchor coverage
    //   'errors'   — validator errors present
    //   'empty'    — Deployment-only: no anchors placed yet
    // Returned as an array (not a dict) so the consumer can render in
    // a fixed visual order without re-sorting.
    sectionReadiness() {
      const validation = this.liveValidation
      const errors = (validation && Array.isArray(validation.errors)) ? validation.errors : []
      const warnings = (validation && Array.isArray(validation.warnings)) ? validation.warnings : []

      const countByPrefix = (entries, prefixes) => entries.filter(e => {
        if (!e || typeof e.path !== 'string') return false
        return prefixes.some(p => e.path === p || e.path.startsWith(`${p}.`))
      }).length

      const validatorRow = (key, title, titleKey, prefixes) => {
        const errorCount = countByPrefix(errors, prefixes)
        const warningCount = countByPrefix(warnings, prefixes)
        let status = 'ready'
        let statusLabel = this.uiText('levelBuilder.reviewExport.ready', 'Ready')
        if (errorCount > 0) {
          status = 'errors'
          const label = errorCount === 1
            ? this.uiText('levelBuilder.reviewExport.error', 'error')
            : this.uiText('levelBuilder.reviewExport.errors', 'errors')
          statusLabel = this.uiFormat('levelBuilder.reviewExport.errorCount', `${errorCount} ${label}`, { count: errorCount, label })
        } else if (warningCount > 0) {
          status = 'warnings'
          const label = warningCount === 1
            ? this.uiText('levelBuilder.reviewExport.warning', 'warning')
            : this.uiText('levelBuilder.reviewExport.warnings', 'warnings')
          statusLabel = this.uiFormat('levelBuilder.reviewExport.warningCount', `${warningCount} ${label}`, { count: warningCount, label })
        }
        return { key, title: this.uiText(titleKey, title), status, statusLabel, summary: null }
      }

      // Map: hexmap layout + terrain catalog (the palette is selected in
      // the Map & Deployment step).
      const map = validatorRow('map', 'Map', 'levelBuilder.reviewExport.map', ['hexmap', 'terrain'])

      // Deployment: derive from spawn/base anchor counts. No validator
      // path filtering — anchor flags are booleans on cells and any
      // value is accepted by the schema. Coverage gaps surface in the
      // Units row (validator emits `units.<key>` errors when units >
      // available slots).
      const p1 = this.deploymentSlots.player1
      const p2 = this.deploymentSlots.player2
      let deploymentStatus, deploymentLabel
      if (p1 === 0 && p2 === 0) {
        deploymentStatus = 'empty'
        deploymentLabel = this.uiText('levelBuilder.reviewExport.noAnchors', 'No anchors placed')
      } else if (p1 === 0 || p2 === 0) {
        deploymentStatus = 'warnings'
        // Name the side that is missing anchors so the label points to
        // the action the designer needs to take.
        deploymentLabel = p1 === 0
          ? this.uiText('levelBuilder.reviewExport.missingPlayerAnchors', 'Missing player anchors')
          : this.uiText('levelBuilder.reviewExport.missingEnemyAnchors', 'Missing enemy anchors')
      } else {
        deploymentStatus = 'ready'
        deploymentLabel = this.uiText('levelBuilder.reviewExport.bothSidesAnchored', 'Both sides anchored')
      }
      const deployment = {
        key: 'deployment',
        title: this.uiText('levelBuilder.reviewExport.deployment', 'Deployment'),
        status: deploymentStatus,
        statusLabel: deploymentLabel,
        summary: this.uiFormat('levelBuilder.reviewExport.deploymentSummary', `Player: ${p1} · enemy: ${p2}`, { player: p1, enemy: p2 })
      }

      const units = validatorRow('units', 'Units', 'levelBuilder.reviewExport.units', ['units'])
      const turntable = validatorRow('turntable', 'Turntable', 'levelBuilder.reviewExport.turntable', ['turntable'])

      return [map, deployment, units, turntable]
    },
    // #5.2: fingerprint of the NORMALIZED package (matches what
    // appendTraceToHistory stores as levelFingerprint for builder runs).
    builderLevelFingerprint() {
      const v = this.liveValidation
      // Invalid-draft fallback: liveValidation already called
      // buildPackageFromState() but discards the raw candidate on error, so a
      // second call here is intentional (and cheap — edits are user-paced). No
      // builder run is ever recorded while invalid, so this epoch can never
      // wrongly invalidate a stored run.
      return v && v.ok && v.package
        ? fingerprintLevelPackage(v.package)
        : fingerprintLevelPackage(this.buildPackageFromState())
    }
  },
  watch: {
    '$route.query.step': 'applyRouteStep',
    // #5.2: keep the builder epoch in sync with the current draft fingerprint
    // so AutomatedPlayground can detect stale builder traces on mount.
    builderLevelFingerprint: {
      handler(fp) {
        if (typeof sessionStorage !== 'undefined') writeBuilderEpoch(sessionStorage, fp)
        // Debounced draft persistence is gated on the one-time restore step
        // (mounted → restoreBuilderDraft) running first. The watcher is
        // `immediate: true`, so its baseline fire runs during setup — before
        // `created`, when `_draftRestoreComplete` is still falsy — and every
        // fire before restore completes is gated out, so it can never save over
        // a stored draft. Restore always wins on a fresh reload.
        if (this._draftRestoreComplete) this.scheduleBuilderDraftSave()
      },
      immediate: true
    }
  },
  created() {
    // Non-reactive guards: the draft save must not fire until the one-time
    // restore-on-reload step has run, and the debounce timer lives outside
    // Vue's reactivity.
    this._draftRestoreComplete = false
    this._draftSaveTimer = null
  },
  async mounted() {
    // Same bootstrap as the legacy page: hydrate from the canonical level
    // package (default `level_000`) so the page has a valid package to
    // validate/export against. UI for these states is wired up in later
    // tasks; for A1 they just exist on the instance.
    this.startExportPreviewTicker()
    this.applyRouteStep()
    await this.loadDefaultLevelPackage()
    this.restoreBuilderDraft()
  },
  activated() {
    this.startExportPreviewTicker()
    // Guard stale automationTraceId: if the trace was evicted from the capped
    // store since the last activation (e.g. AutomatedPlayground ran many runs),
    // reset the id so the "Open playback" button is disabled.
    if (this.automationTraceId) {
      if (typeof sessionStorage === 'undefined' || readTraceFromHistory(sessionStorage, this.automationTraceId) === null) {
        this.automationTraceId = ''
      }
    }
  },
  deactivated() {
    this.stopExportPreviewTicker()
  },
  beforeUnmount() {
    this.stopExportPreviewTicker()
    if (this._draftSaveTimer) {
      clearTimeout(this._draftSaveTimer)
      this._draftSaveTimer = null
    }
  },
  methods: {
    /**
     * Yield a real browser frame before the blocking synchronous compute.
     * $nextTick() flushes Vue's microtask queue so reactive bindings (e.g.
     * automationRunning) update their DOM; setTimeout(0) then crosses a task
     * boundary so the browser can actually repaint before the CPU-heavy match
     * engine runs. Both awaits are required — one alone is insufficient.
     */
    async awaitPaint() {
      await this.$nextTick()
      await new Promise(resolve => setTimeout(resolve))
    },

    setActiveStep(stepId) {
      if (this.steps.some(s => s.id === stepId)) {
        this.activeStepId = stepId
      }
    },

    applyRouteStep() {
      const stepId = this.$route && this.$route.query ? this.$route.query.step : ''
      if (typeof stepId === 'string') {
        this.setActiveStep(stepId)
      }
    },

    updateAutomationRunConfig(patch) {
      if (!patch || typeof patch !== 'object') return
      const nextPlayers = patch.players && typeof patch.players === 'object'
        ? {
            ...this.automationRunConfig.players,
            ...patch.players
          }
        : this.automationRunConfig.players
      this.automationRunConfig = {
        ...this.automationRunConfig,
        ...patch,
        players: nextPlayers
      }
    },

    defaultSeedForBuilderPlaytest() {
      const id = typeof this.currentLevelId === 'string' && this.currentLevelId.trim()
        ? this.currentLevelId.trim()
        : DEFAULT_LEVEL_ID
      const time = Date.now().toString(36)
      const entropy = Math.random().toString(36).slice(2, 8)
      return `builder-${id}-${time}-${entropy}`
    },

    prepareAutomationSeedForRun() {
      if (!this.automationSeedLocked || !this.automationRunConfig.seed) {
        this.automationRunConfig = {
          ...this.automationRunConfig,
          seed: this.defaultSeedForBuilderPlaytest()
        }
      }
      return this.automationRunConfig.seed
    },

    commitAutomationSeedInput(value) {
      this.automationRunConfig = { ...this.automationRunConfig, seed: value }
      if (!this.automationSeedLocked && typeof value === 'string' && value.trim()) {
        this.automationSeedLocked = true
      }
    },

    toggleAutomationSeedLock() {
      this.automationSeedLocked = !this.automationSeedLocked
      if (!this.automationSeedLocked) {
        this.automationRunConfig = {
          ...this.automationRunConfig,
          seed: this.defaultSeedForBuilderPlaytest()
        }
      }
    },

    async runAutomatedPlaytest() {
      if (this.automationRunning) return
      this.automationError = ''
      this.automationRunning = true
      // Run logic owns the seed: regenerate a fresh builder seed unless the
      // user has explicitly locked one (mirrors AutomatedPlayground).
      this.prepareAutomationSeedForRun()
      // Yield a real frame so the running state paints before the synchronous
      // match compute blocks the main thread.
      await this.awaitPaint()
      try {
        const candidate = this.buildPackageFromState()
        const validation = validateLevelPackage(candidate)
        if (!validation.ok) {
          this.automationResult = null
          this.automationTraceId = ''
          this.automationError = this.formatLevelIssues(validation.errors.slice(0, 3))
          return
        }

        const output = runConfiguredMatch({
          levelPackage: validation.package || candidate,
          runConfig: {
            ...this.automationRunConfig,
            trace: true
          }
        })
        this.automationRunConfig = output.runConfig
        this.automationResult = output.result

        const traceId = `builder-${Date.now()}`
        if (typeof sessionStorage === 'undefined') {
          this.automationTraceId = ''
          this.automationError = this.uiText(
            'levelBuilder.automatedPlaytest.traceStorageUnavailable',
            'Playback trace storage is unavailable in this browser.'
          )
          return
        }
        const levelPkg = validation.package || candidate
        const players = output.runConfig.players || {}
        // Mirror AutomatedPlayground.makeRunRecord's shape so the unified run
        // list renders builder runs identically. Builder packages carry no
        // display label or catalog key, so levelLabel falls back to the id and
        // levelKey is empty. `number` is best-effort from the current index
        // length; appendTraceToHistory may evict the oldest at the cap, so this
        // cosmetic `#` can lag by up to the cap — it is never used for lookup.
        const metadata = {
          id: traceId,
          traceId,
          source: 'builder',
          number: readTraceHistoryIndex(sessionStorage).length + 1,
          createdAt: output.trace.createdAt,
          levelId: levelPkg.id || '',
          levelLabel: levelPkg.id || '',
          levelKey: '',
          seed: output.runConfig.seed || '',
          maxTurns: output.runConfig.maxTurns,
          winner: output.result.winner || '',
          reason: output.result.reason || '',
          turns: output.result.turns,
          frames: Array.isArray(output.trace.frames) ? output.trace.frames.length : 0,
          player1Profile: players.player1 ? players.player1.profile : '',
          player2Profile: players.player2 ? players.player2.profile : ''
        }
        const persisted = appendTraceToHistory(sessionStorage, { metadata, trace: output.trace })
        if (!persisted.ok && persisted.quotaExceeded) {
          this.automationTraceId = ''
          this.automationError = this.uiText(
            'levelBuilder.automatedPlaytest.traceStorageQuotaExceeded',
            TRACE_QUOTA_MESSAGE
          )
          return
        }
        this.automationTraceId = traceId
      } catch (err) {
        this.automationResult = null
        this.automationTraceId = ''
        this.automationError = err && err.message ? err.message : String(err)
      } finally {
        this.automationRunning = false
      }
    },

    openAutomatedPlayback() {
      if (!this.automationTraceId || !this.$router || typeof this.$router.push !== 'function') return
      // Re-check that the trace is still in the store before navigating.
      // Another page (e.g. AutomatedPlayground) may have evicted it since
      // the last time this page was activated.
      if (typeof sessionStorage === 'undefined' || readTraceFromHistory(sessionStorage, this.automationTraceId) === null) {
        this.automationTraceId = ''
        this.notifyUser(
          'warning',
          'levelBuilder.automatedPlaytest.traceExpired',
          'Playback trace no longer available — please run the match again.'
        )
        return
      }
      return this.$router.push({
        path: '/AutomatedPlayground',
        query: { trace: this.automationTraceId }
      })
    },

    setLevelId(value) {
      this.currentLevelId = typeof value === 'string' ? value.trim() : ''
      this.clearFrozenExportLevelId()
      this.refreshExportPreviewTimestamp()
    },

    clearFrozenExportLevelId() {
      this.frozenExportLevelId = null
      this.frozenExportFingerprint = null
    },

    levelNameForExport(value = this.currentLevelId) {
      const raw = typeof value === 'string' && value.trim()
        ? value.trim()
        : DEFAULT_LEVEL_ID
      return raw
    },

    levelNameFromImportedId(value) {
      return this.levelNameForExport(value).replace(EXPORT_TIMESTAMP_SUFFIX_PATTERN, '') || DEFAULT_LEVEL_ID
    },

    formatExportTimestamp(timestamp = Date.now()) {
      const raw = Number(timestamp)
      const date = new Date(Number.isFinite(raw) ? raw : Date.now())
      const pad = (value) => String(value).padStart(2, '0')
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
      ].join('-') + '_' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
      ].join('-')
    },

    normalizeExportTimestamp(timestamp = Date.now()) {
      const raw = Number(timestamp)
      const safe = Number.isFinite(raw) ? raw : Date.now()
      return Math.trunc(safe / 1000) * 1000
    },

    reserveExportTimestamp(timestamp = Date.now()) {
      let next = this.normalizeExportTimestamp(timestamp)
      if (
        Number.isInteger(this.lastGeneratedExportTimestamp) &&
        next <= this.lastGeneratedExportTimestamp
      ) {
        next = this.lastGeneratedExportTimestamp + 1000
      }
      this.lastGeneratedExportTimestamp = next
      this.exportPreviewTimestamp = next
      return next
    },

    buildTimestampedExportLevelId(value = this.currentLevelId, timestamp = Date.now()) {
      return `${this.levelNameForExport(value)}_${this.formatExportTimestamp(timestamp)}`
    },

    buildReservedExportLevelId(value = this.currentLevelId, timestamp = Date.now()) {
      return this.buildTimestampedExportLevelId(value, this.reserveExportTimestamp(timestamp))
    },

    currentFrozenExportLevelId() {
      if (!this.frozenExportLevelId || !this.frozenExportFingerprint) return null
      try {
        const pkg = this.buildPackageFromState(this.frozenExportLevelId)
        const result = validateLevelPackage(pkg)
        if (!result.ok) return null
        const finalPackage = result.package || pkg
        return fingerprintLevelPackage(finalPackage) === this.frozenExportFingerprint
          ? this.frozenExportLevelId
          : null
      } catch (err) {
        return null
      }
    },

    resolveExportLevelIdForCurrentState(timestamp = Date.now()) {
      return this.currentFrozenExportLevelId() ||
        this.buildReservedExportLevelId(this.currentLevelId, timestamp)
    },

    rememberFrozenExportPackage(pkg) {
      if (!pkg || typeof pkg !== 'object') return
      const id = typeof pkg.id === 'string' && pkg.id.trim() ? pkg.id.trim() : DEFAULT_LEVEL_ID
      this.frozenExportLevelId = id
      this.frozenExportFingerprint = fingerprintLevelPackage(pkg)
    },

    refreshExportPreviewTimestamp(timestamp = Date.now()) {
      const next = this.normalizeExportTimestamp(timestamp)
      this.exportPreviewTimestamp =
        Number.isInteger(this.lastGeneratedExportTimestamp) &&
        next <= this.lastGeneratedExportTimestamp
          ? this.lastGeneratedExportTimestamp + 1000
          : next
    },

    startExportPreviewTicker() {
      this.stopExportPreviewTicker()
      this.refreshExportPreviewTimestamp()
      this.exportPreviewTimerId = window.setInterval(() => {
        this.refreshExportPreviewTimestamp()
      }, 1000)
    },

    stopExportPreviewTicker() {
      if (this.exportPreviewTimerId == null) return
      window.clearInterval(this.exportPreviewTimerId)
      this.exportPreviewTimerId = null
    },

    normalizeMapDimension(value, fallback = MIN_MAP_DIMENSION) {
      const fallbackNumber = Number(fallback)
      const safeFallback = Number.isFinite(fallbackNumber)
        ? Math.max(MIN_MAP_DIMENSION, Math.min(MAX_MAP_DIMENSION, Math.trunc(fallbackNumber)))
        : MIN_MAP_DIMENSION
      const n = Number(value)
      if (!Number.isFinite(n)) return safeFallback
      return Math.max(MIN_MAP_DIMENSION, Math.min(MAX_MAP_DIMENSION, Math.trunc(n)))
    },

    setMapWidth(value) {
      this.mapParams.width = this.normalizeMapDimension(value, this.mapParams.width)
    },

    setMapHeight(value) {
      this.mapParams.height = this.normalizeMapDimension(value, this.mapParams.height)
    },

    createTerrainSeed() {
      return `terrain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    },

    resolveTerrainSeedForGeneration({ forceNew = false } = {}) {
      const normalized = typeof this.terrainSeed === 'string' ? this.terrainSeed.trim() : ''
      const seed = forceNew || !normalized ? this.createTerrainSeed() : normalized
      this.terrainSeed = seed
      return seed
    },

    async loadDefaultLevelPackage() {
      try {
        const result = await loadLevelPackage(DEFAULT_LEVEL_ID)
        if (!result.ok) {
          this.lastActionStage = 'default-load-failed'
          if (!this.notifyUser(
            'error',
            'levelBuilder.notifications.defaultLevelFailed',
            'Default level failed',
            this.formatLevelIssues(result.errors)
          )) {
            console.error('Default level failed validation:', result.errors)
          }
          this.applyFallbackTerrainConfig()
          this.generateMap()
          return
        }
        if (result.warnings && result.warnings.length > 0) {
          this.notifyUser(
            'warning',
            'levelBuilder.notifications.defaultLevelWarnings',
            'Default level warnings',
            this.formatLevelIssues(result.warnings)
          )
        }
        this.hydrateFromPackage(result.package, { regenerateMap: true })
        this.refreshExportPreviewTimestamp()
        this.lastActionStage = 'default-loaded'
      } catch (error) {
        console.error('Failed to load default level package:', error)
        this.lastActionStage = 'default-load-failed'
        this.applyFallbackTerrainConfig()
        this.generateMap()
      }
    },

    applyFallbackTerrainConfig() {
      this.terrainTypes = [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 },
        { id: 'water', name: 'Water', color: '#2196F3', terrainDifficulty: 2 }
      ]
      this.mapParams.availableTerrain = this.terrainTypes.map(t => t.id)
      this.unitsData = null
      this.turntableData = null
      this.ensureUnitsData()
    },

    ensureUnitsData() {
      if (!this.unitsData || typeof this.unitsData !== 'object') {
        this.unitsData = { player1: emptyRoster(), player2: emptyRoster() }
      }
      if (!Array.isArray(this.unitsData.unitTypes) || this.unitsData.unitTypes.length === 0) {
        this.unitsData.unitTypes = DEFAULT_UNIT_CATALOG.map(unitType => ({ ...unitType }))
      } else {
        this.unitsData.unitTypes = normalizeUnitCatalog(this.unitsData.unitTypes)
      }
      if (!this.unitsData.player1 || !Array.isArray(this.unitsData.player1.units)) {
        this.unitsData.player1 = emptyRoster()
      }
      if (!this.unitsData.player2 || !Array.isArray(this.unitsData.player2.units)) {
        this.unitsData.player2 = emptyRoster()
      }
      return this.unitsData
    },

    availableUnitTypes(playerKey) {
      const roster = this.unitsData && this.unitsData[playerKey]
      const used = new Set(
        roster && Array.isArray(roster.units)
          ? roster.units.map(u => u && u.type).filter(Boolean)
          : []
      )
      return this.unitTypeIds.filter(type => !used.has(type))
    },

    addUnitToRoster(playerKey, type) {
      this.ensureUnitsData()
      const roster = this.unitsData[playerKey]
      if (!roster || !Array.isArray(roster.units)) return
      if (!type || !this.unitTypeIds.includes(type)) return
      if (roster.units.some(u => u && u.type === type)) return
      roster.units.push(unitDefDefaults(type))
    },

    removeUnitFromRoster(playerKey, index) {
      const roster = this.unitsData && this.unitsData[playerKey]
      if (!roster || !Array.isArray(roster.units)) return
      if (index < 0 || index >= roster.units.length) return
      roster.units.splice(index, 1)
    },

    setUnitType(playerKey, index, newType) {
      const roster = this.unitsData && this.unitsData[playerKey]
      if (!roster || !Array.isArray(roster.units)) return
      const row = roster.units[index]
      if (!row) return
      if (!this.unitTypeIds.includes(newType)) return
      if (roster.units.some((u, i) => i !== index && u && u.type === newType)) return

      const count = row.count
      Object.keys(row).forEach(key => delete row[key])
      row.type = newType
      row.count = count == null ? 1 : count
    },

    setUnitField(playerKey, index, field, value) {
      const allowedFields = new Set([
        'count',
        'health',
        'movement',
        'attackRange',
        'attackAngle',
        'attackPower',
        'maxTerrainDifficulty'
      ])
      if (!allowedFields.has(field)) return
      const roster = this.unitsData && this.unitsData[playerKey]
      if (!roster || !Array.isArray(roster.units)) return
      const row = roster.units[index]
      if (!row) return
      if (field === 'attackAngle' && value !== '') {
        const numericValue = Number(value)
        row[field] = Number.isFinite(numericValue) ? normalizeAttackAngle(numericValue) : value
        return
      }
      row[field] = value
    },

    updateUnitTypes(nextUnitTypes) {
      const unitsData = this.ensureUnitsData()
      const normalized = normalizeUnitCatalog(nextUnitTypes)
      if (normalized.length === 0) return

      const previousById = this.unitCatalogById
      const nextById = unitCatalogToMap(normalized)
      this.syncRosterRowsForUnitCatalogChange(previousById, nextById)
      unitsData.unitTypes = normalized.map(unitType => ({ ...unitType }))
      this.lastActionStage = 'unit-config-edit'
    },

    syncRosterRowsForUnitCatalogChange(previousById, nextById) {
      const fields = [
        'name',
        'health',
        'movement',
        'attackRange',
        'attackAngle',
        'attackPower',
        'maxTerrainDifficulty'
      ]
      for (const playerKey of ['player1', 'player2']) {
        const roster = this.unitsData && this.unitsData[playerKey]
        const rows = roster && Array.isArray(roster.units) ? roster.units : []
        rows.forEach(row => {
          if (!row || typeof row.type !== 'string') return
          const type = row.type.trim()
          const previousDef = resolveUnitTypeDef(type, previousById)
          const nextDef = resolveUnitTypeDef(type, nextById)
          if (!previousDef || !nextDef) return
          fields.forEach(field => {
            if (row[field] === undefined || row[field] === null) return
            if (row[field] === previousDef[field] || (field === 'name' && row[field] === type)) {
              row[field] = nextDef[field]
            }
          })
        })
      }
    },

    resetUnitsToDefault() {
      this.unitsData = cloneUnitsData(DEFAULT_UNITS_DATA)
    },

    syncEnemyRosterFromPlayer() {
      this.copyUnitRoster('player->enemy')
    },

    copyUnitRoster(direction) {
      const unitsData = this.ensureUnitsData()
      if (direction === 'player->enemy') {
        unitsData.player2.units = unitsData.player1.units.map(unit => cloneUnitDef(unit))
      } else if (direction === 'enemy->player') {
        unitsData.player1.units = unitsData.player2.units.map(unit => cloneUnitDef(unit))
      }
    },

    resetTurntableToDefault() {
      const manoeuvre = () => ({
        title: 'Manoeuvre',
        comment: 'How player moves.',
        moves: [{ title: 'x1 dice', comment: '-', dice: [
          ['move', 'turn'], ['move'], ['turn'], ['turn'], ['move'], ['turn']
        ] }]
      })
      const attack = () => ({
        title: 'Attack',
        comment: 'How player attacks.',
        moves: [{ title: 'x1 dice', comment: '-', dice: [
          ['fire', 'reload'], ['reload'], [], [], ['fire'], ['fire', 'reload']
        ] }]
      })
      this.turntableData = {
        Our_operations: [manoeuvre(), attack()],
        Enemy_operations: [manoeuvre(), attack()]
      }
      this.lastActionStage = 'turntable-reset'
    },

    copyTurntable(direction) {
      this.turntableData = copyTurntableSide(this.turntableData || {}, direction)
      this.lastActionStage = `turntable-${direction}`
    },

    /**
     * Toggle a single action chip in the turntable matrix editor.
     *
     * Empty dice rows mean "no actions". Legacy `'-'` tokens are ignored
     * when clicked and pruned whenever a real action is toggled.
     *
     * Defensive: silently bails on bad indices or a missing turntable
     * shape; the Reset to default button is the recovery path.
     */
    toggleTurntableAction(sideKey, opIndex, faceIdx, action) {
      const operations = this.turntableData && this.turntableData[sideKey]
      if (!Array.isArray(operations)) return
      const operation = operations[opIndex]
      if (!operation || !Array.isArray(operation.moves)) return
      const move = operation.moves[0]
      if (!move || !Array.isArray(move.dice)) return
      const row = move.dice[faceIdx]
      if (!Array.isArray(row)) return

      const NO_OP = '-'
      if (action === NO_OP) return

      const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : ''
      let wasSelected = false
      for (let i = row.length - 1; i >= 0; i--) {
        const normalizedRowAction = typeof row[i] === 'string' ? row[i].trim().toLowerCase() : ''
        if (row[i] === NO_OP || normalizedRowAction === NO_OP) {
          row.splice(i, 1)
        } else if (normalizedRowAction === normalizedAction) {
          wasSelected = true
          row.splice(i, 1)
        }
      }
      if (!wasSelected) {
        row.push(action)
      }
      this.lastActionStage = 'turntable-edit'
    },

    toggleTerrain(terrainId) {
      const index = this.mapParams.availableTerrain.indexOf(terrainId)
      if (index > -1) {
        this.mapParams.availableTerrain.splice(index, 1)
      } else {
        this.mapParams.availableTerrain.push(terrainId)
      }
    },

    updateTerrainTypes(nextTerrainTypes) {
      if (!Array.isArray(nextTerrainTypes) || nextTerrainTypes.length === 0) return

      const previousIds = new Set(this.terrainTypes.map(terrain => terrain.id))
      const terrainTypes = nextTerrainTypes
        .filter(terrain => terrain && typeof terrain.id === 'string' && terrain.id.trim())
        .map(terrain => ({ ...terrain, id: terrain.id.trim() }))
      if (terrainTypes.length === 0) return

      const terrainById = new Map(terrainTypes.map(terrain => [terrain.id, terrain]))
      const nextAvailableTerrain = this.mapParams.availableTerrain
        .filter(id => terrainById.has(id))

      for (const terrain of terrainTypes) {
        if (!previousIds.has(terrain.id) && !nextAvailableTerrain.includes(terrain.id)) {
          nextAvailableTerrain.push(terrain.id)
        }
      }
      if (nextAvailableTerrain.length === 0) {
        nextAvailableTerrain.push(terrainTypes[0].id)
      }

      const fallbackTerrain = terrainById.get('plains') || terrainTypes[0]
      this.terrainTypes = terrainTypes
      this.mapParams.availableTerrain = nextAvailableTerrain

      this.generatedMap.forEach(hex => {
        if (!hex) return
        const terrainId = hex && hex.terrain && hex.terrain.id
        hex.terrain = terrainById.get(terrainId) || fallbackTerrain
      })

      const selectedTerrainId = this.selectedTerrainForPainting && this.selectedTerrainForPainting.id
      if (selectedTerrainId && terrainById.has(selectedTerrainId)) {
        this.selectedTerrainForPainting = terrainById.get(selectedTerrainId)
      } else if (this.activeMapTool === 'terrain') {
        this.selectedTerrainForPainting = fallbackTerrain
      } else {
        this.selectedTerrainForPainting = null
      }

      this.lastActionStage = 'terrain-config-edit'
    },

    normalizeVictoryConditionSettings(settings = {}) {
      let type = PRIMARY_OBJECTIVE_TYPES.includes(settings.type)
        ? settings.type
        : null

      if (!type) {
        if (settings.occupyBase === true) type = OBJECTIVE_TYPES.OCCUPY_BASE
        else if (settings.surviveTurns === true) type = OBJECTIVE_TYPES.SURVIVE_TURNS
        else type = OBJECTIVE_TYPES.ELIMINATE_UNITS
      }

      if (type === OBJECTIVE_TYPES.OCCUPY_BASE && !this.redBaseAvailable) {
        type = OBJECTIVE_TYPES.ELIMINATE_UNITS
      }
      if (type === OBJECTIVE_TYPES.PROTECT_BASE && !this.blueBaseAvailable) {
        type = OBJECTIVE_TYPES.ELIMINATE_UNITS
      }

      const deadlineRequired = type === OBJECTIVE_TYPES.PROTECT_BASE ||
        type === OBJECTIVE_TYPES.SURVIVE_TURNS
      const rawDeadline = settings.deadlineTurns != null
        ? settings.deadlineTurns
        : settings.surviveTurnsCount

      return {
        type,
        deadlineEnabled: deadlineRequired || settings.deadlineEnabled === true,
        deadlineTurns: normalizeSurviveTurns(rawDeadline)
      }
    },

    buildObjectivesDataFromVictoryConditions(settings = this.victoryConditionSettings) {
      const normalized = this.normalizeVictoryConditionSettings(settings)
      const primary = {
        id: 'blue_primary',
        type: normalized.type,
        player: 'player1'
      }

      if (normalized.type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
        primary.targetPlayer = 'player2'
      } else if (normalized.type === OBJECTIVE_TYPES.OCCUPY_BASE) {
        primary.targetPlayer = 'player2'
        primary.basePlayer = 'player2'
      } else if (normalized.type === OBJECTIVE_TYPES.PROTECT_BASE) {
        primary.basePlayer = 'player1'
      }

      if (normalized.deadlineEnabled) {
        primary.deadlineTurns = normalized.deadlineTurns
      }

      return {
        mode: 'primaryBlue',
        primary
      }
    },

    syncVictoryConditionsWithMap() {
      const next = this.normalizeVictoryConditionSettings(this.victoryConditionSettings)
      this.victoryConditionSettings = this.normalizeVictoryConditionSettings(next)
      this.objectivesData = this.buildObjectivesDataFromVictoryConditions(this.victoryConditionSettings)
    },

    victoryConditionSettingsFromObjectives(objectives) {
      if (!objectives) {
        return cloneVictoryConditionSettings()
      }

      const primary = objectives.primary && typeof objectives.primary === 'object'
        ? objectives.primary
        : Array.isArray(objectives.conditions)
          ? objectives.conditions.find(condition =>
            condition &&
            (condition.winner === 'player1' || condition.player === 'player1' || condition.actorPlayer === 'player1')
          )
          : null

      if (!primary) return cloneVictoryConditionSettings()

      const type = primary.type === OBJECTIVE_TYPES.SURVIVE_TURNS
        ? OBJECTIVE_TYPES.SURVIVE_TURNS
        : primary.type === OBJECTIVE_TYPES.OCCUPY_BASE
          ? OBJECTIVE_TYPES.OCCUPY_BASE
          : primary.type === OBJECTIVE_TYPES.PROTECT_BASE
            ? OBJECTIVE_TYPES.PROTECT_BASE
            : OBJECTIVE_TYPES.ELIMINATE_UNITS

      const deadlineTurns = primary.deadlineTurns != null
        ? primary.deadlineTurns
        : primary.turns

      return this.normalizeVictoryConditionSettings({
        type,
        deadlineEnabled: deadlineTurns != null,
        deadlineTurns
      })
    },

    updateVictoryCondition(patch) {
      if (!patch || typeof patch !== 'object') return
      const next = this.normalizeVictoryConditionSettings(this.victoryConditionSettings)

      const requestedType = patch.type || patch.value
      if (patch.key === 'type' && PRIMARY_OBJECTIVE_TYPES.includes(requestedType)) {
        next.type = requestedType
      }

      if (['eliminateUnits', 'occupyBase', 'protectBase', 'surviveTurns'].includes(patch.key) && patch.checked === true) {
        next.type = patch.key
      }

      if (patch.key === 'deadlineEnabled' || patch.deadlineEnabled != null) {
        next.deadlineEnabled = patch.deadlineEnabled != null
          ? patch.deadlineEnabled === true
          : patch.value === true
      }

      if (patch.key === 'deadlineTurns' ||
        patch.key === 'surviveTurnsCount' ||
        patch.deadlineTurns != null ||
        patch.surviveTurnsCount != null
      ) {
        next.deadlineTurns = normalizeSurviveTurns(
          patch.deadlineTurns != null
            ? patch.deadlineTurns
            : patch.surviveTurnsCount != null
              ? patch.surviveTurnsCount
              : patch.value,
          next.deadlineTurns
        )
      }

      this.victoryConditionSettings = this.normalizeVictoryConditionSettings(next)
      this.objectivesData = this.buildObjectivesDataFromVictoryConditions(this.victoryConditionSettings)
    },

    selectMapTool(tool) {
      const allowedTools = ['select', 'terrain', 'deployment', 'lock']
      if (!allowedTools.includes(tool)) return

      this.activeMapTool = tool
      this.isPaintingMode = tool !== 'select'

      if (tool === 'select') {
        this.selectedTerrainForPainting = null
        this.selectedOverlay = null
        this.selectedHex = null
        return
      }

      if (tool === 'terrain') {
        this.selectedOverlay = null
        if (!this.selectedTerrainForPainting && this.terrainTypes.length > 0) {
          this.selectedTerrainForPainting = this.terrainTypes[0]
        }
        return
      }

      if (tool === 'deployment') {
        this.selectedTerrainForPainting = null
        if (!this.selectedOverlay && this.overlayTypes.length > 0) {
          this.selectedOverlay = this.overlayTypes[0]
        }
        return
      }

      this.selectedTerrainForPainting = null
      this.selectedOverlay = null
      if (!['lock', 'unlock'].includes(this.lockBrushMode)) {
        this.lockBrushMode = 'lock'
      }
    },

    selectLockBrushMode(mode) {
      if (!['lock', 'unlock'].includes(mode)) return
      this.lockBrushMode = mode
      this.selectMapTool('lock')
    },

    unlockAllHexes() {
      this.generatedMap.forEach(hex => {
        hex.locked = false
      })
    },

    countDeploymentAnchors(hexes) {
      if (!Array.isArray(hexes)) return 0
      return hexes.reduce((count, hex) => {
        return count +
          (hex.player1Spawn ? 1 : 0) +
          (hex.player1Base ? 1 : 0) +
          (hex.player2Spawn ? 1 : 0) +
          (hex.player2Base ? 1 : 0)
      }, 0)
    },

    clearDeploymentAnchors() {
      this.generatedMap.forEach(hex => {
        if (this.isHexLocked(hex)) return
        hex.player1Spawn = false
        hex.player1Base = false
        hex.player2Spawn = false
        hex.player2Base = false
      })
      this.syncVictoryConditionsWithMap()
    },

    togglePaintingMode() {
      this.selectMapTool(this.activeMapTool === 'select' ? 'terrain' : 'select')
    },

    onTogglePaintingMode() {
      this.togglePaintingMode()
    },

    selectTerrainForPainting(terrain) {
      this.selectMapTool('terrain')
      this.selectedTerrainForPainting = terrain
      this.selectedOverlay = null
    },

    selectOverlay(overlay) {
      this.selectMapTool('deployment')
      this.selectedOverlay = overlay
      this.selectedTerrainForPainting = null
    },

    generateMap() {
      if (this.mapParams.availableTerrain.length === 0) {
        this.notifyUser(
          'warning',
          'levelBuilder.notifications.terrainSelection',
          'Terrain selection',
          this.uiText('levelBuilder.notifications.terrainSelectionRequired', 'Please select at least one terrain type')
        )
        return
      }

      const preservedByKey = new Map()
      const safeCells = []
      for (const hex of this.generatedMap) {
        const hasDeployment = hex.player1Spawn || hex.player1Base || hex.player2Spawn || hex.player2Base
        const isLocked = hex.locked === true

        if (hasDeployment || isLocked) {
          preservedByKey.set(`${hex.q},${hex.r}`, {
            terrain: hex.terrain,
            player1Spawn: !!hex.player1Spawn,
            player1Base: !!hex.player1Base,
            player2Spawn: !!hex.player2Spawn,
            player2Base: !!hex.player2Base,
            locked: isLocked
          })
        }

        if (hasDeployment) {
          safeCells.push({ q: hex.q, r: hex.r })
        }
      }

      this.currentMapWidth = this.mapParams.width
      this.currentMapHeight = this.mapParams.height
      const terrainSeed = this.resolveTerrainSeedForGeneration({
        forceNew: !this.terrainSeedLocked && this.generatedMap.length > 0
      })

      const seeds = sprinkleTerrainSeeds({
        width: this.mapParams.width,
        height: this.mapParams.height,
        availableTerrain: this.mapParams.availableTerrain,
        seed: terrainSeed,
        terrainTypes: this.terrainTypes,
        // Honour the `Protect deployment terrain` toggle: passing an
        // empty array tells `applySpawnSafety` to early-return, so the
        // weighted sprinkler is the only thing that determines anchor
        // cell terrain. The overlay flags themselves are still preserved
        // below via `preservedByKey`.
        safeCells: this.protectDeploymentTerrain ? safeCells : []
      })
      const terrainById = new Map(this.terrainTypes.map(t => [t.id, t]))

      const nextMap = []
      for (const seed of seeds) {
        const preserved = preservedByKey.get(`${seed.q},${seed.r}`)
        const terrain = preserved && preserved.locked
          ? preserved.terrain
          : terrainById.get(seed.terrainId)
        const hex = this.createHex(seed.q, seed.r, terrain)
        if (preserved) {
          hex.player1Spawn = preserved.player1Spawn
          hex.player1Base = preserved.player1Base
          hex.player2Spawn = preserved.player2Spawn
          hex.player2Base = preserved.player2Base
          hex.locked = preserved.locked
        }
        nextMap.push(hex)
      }
      this.generatedMap = nextMap
      this.syncVictoryConditionsWithMap()
    },

    createHex(q, r, terrainOverride = null) {
      const geom = computeHexPolygonGeometry({
        q,
        r,
        hexSize: hexMap.baseHexSize * this.zoomLevel,
        hexStrokeOffset: hexMap.hexStrokeOffset
      })

      const paintBase = this.terrainTypes.find(t => t.id === 'plains') || this.terrainTypes[0]
      const finalTerrain = terrainOverride || paintBase || {
        id: 'default',
        name: 'Default',
        color: '#CCCCCC'
      }

      return {
        q,
        r,
        ...geom,
        terrain: finalTerrain,
        stroke: '#333',
        strokeWidth: 1,
        player1Spawn: false,
        player1Base: false,
        player2Spawn: false,
        player2Base: false,
        locked: false
      }
    },

    resizeGeneratedMapToDimensions() {
      const width = this.normalizeMapDimension(this.mapParams.width, this.currentMapWidth || mapDefaults.width)
      const height = this.normalizeMapDimension(this.mapParams.height, this.currentMapHeight || mapDefaults.height)
      this.mapParams.width = width
      this.mapParams.height = height
      this.currentMapWidth = width
      this.currentMapHeight = height

      if (this.generatedMap.length === 0) {
        this.selectedHex = null
        this.lastPaintedHex = null
        return
      }

      const existingByKey = new Map()
      const safeCells = []
      for (const hex of this.generatedMap) {
        if (!hex || !Number.isInteger(hex.q) || !Number.isInteger(hex.r)) continue
        if (hex.q < 0 || hex.q >= width || hex.r < 0 || hex.r >= height) continue

        const key = `${hex.q},${hex.r}`
        existingByKey.set(key, hex)

        if (hex.player1Spawn || hex.player1Base || hex.player2Spawn || hex.player2Base) {
          safeCells.push({ q: hex.q, r: hex.r })
        }
      }

      const terrainById = new Map(this.terrainTypes.map(t => [t.id, t]))
      const terrainSeed = this.mapParams.availableTerrain.length > 0
        ? this.resolveTerrainSeedForGeneration()
        : this.terrainSeed
      const generatedSeeds = sprinkleTerrainSeeds({
        width,
        height,
        availableTerrain: this.mapParams.availableTerrain,
        seed: terrainSeed,
        terrainTypes: this.terrainTypes,
        safeCells: this.protectDeploymentTerrain ? safeCells : []
      })
      const seedByKey = new Map(generatedSeeds.map(seed => [`${seed.q},${seed.r}`, seed]))
      const selectedKey = this.selectedHex &&
        Number.isInteger(this.selectedHex.q) &&
        Number.isInteger(this.selectedHex.r)
        ? `${this.selectedHex.q},${this.selectedHex.r}`
        : null

      const nextMap = []
      for (let r = 0; r < height; r++) {
        for (let q = 0; q < width; q++) {
          const key = `${q},${r}`
          const existing = existingByKey.get(key)
          const seed = seedByKey.get(key)
          const terrain = existing
            ? existing.terrain
            : (seed ? terrainById.get(seed.terrainId) : null)
          const hex = this.createHex(q, r, terrain)

          if (existing) {
            hex.stroke = existing.stroke ?? hex.stroke
            hex.strokeWidth = existing.strokeWidth ?? hex.strokeWidth
            hex.player1Spawn = !!existing.player1Spawn
            hex.player1Base = !!existing.player1Base
            hex.player2Spawn = !!existing.player2Spawn
            hex.player2Base = !!existing.player2Base
            hex.locked = existing.locked === true
          }

          nextMap.push(hex)
        }
      }

      this.generatedMap = nextMap
      this.selectedHex = selectedKey
        ? this.generatedMap.find(hex => `${hex.q},${hex.r}` === selectedKey) || null
        : null
      this.lastPaintedHex = null
      this.syncVictoryConditionsWithMap()
    },

    selectHex(hex) {
      if (this.activeMapTool === 'select') {
        if (this.selectedHex === hex) {
          this.selectedHex = null
        } else {
          this.selectedHex = hex
        }
        return
      }

      this.applyActiveMapTool(hex, 'left')
      this.lastPaintedHex = hex
    },

    isHexLocked(hex) {
      return hex && hex.locked === true
    },

    applyActiveMapTool(hex, mouseButton) {
      if (!hex) return false

      if (this.activeMapTool === 'terrain') {
        if (mouseButton !== 'left' || this.isHexLocked(hex) || !this.selectedTerrainForPainting) return false
        hex.terrain = this.selectedTerrainForPainting
        return true
      }

      if (this.activeMapTool === 'deployment') {
        if (this.isHexLocked(hex) || !this.selectedOverlay) return false
        return this.paintOverlay(hex, mouseButton)
      }

      if (this.activeMapTool === 'lock') {
        const mode = mouseButton === 'right' ? 'unlock' : this.lockBrushMode
        hex.locked = mode === 'lock'
        return true
      }

      return false
    },

    paintOverlay(hex, mouseButton) {
      if (!this.selectedOverlay || this.isHexLocked(hex)) return false

      const overlay = this.selectedOverlay
      const isAdding = mouseButton === 'left'

      if (isAdding) {
        const otherPlayer = overlay.player === 1 ? 2 : 1
        const hasOtherPlayerOverlay = hex[`player${otherPlayer}Spawn`] || hex[`player${otherPlayer}Base`]

        if (hasOtherPlayerOverlay) {
          return false
        }

        Object.assign(hex, { [overlay.property]: true })
      } else {
        Object.assign(hex, { [overlay.property]: false })
      }

      if (overlay.type === 'base') {
        this.syncVictoryConditionsWithMap()
      }
      return true
    },

    startDragPainting(hex, event) {
      if (this.activeMapTool !== 'select') {
        this.isDragging = true
        this.dragButton = event.button
        const mouseButton = event.button === 2 ? 'right' : 'left'
        this.applyActiveMapTool(hex, mouseButton)
        this.lastPaintedHex = hex
      }
    },

    continueDragPainting(hex) {
      if (this.isDragging && this.activeMapTool !== 'select' && hex !== this.lastPaintedHex) {
        const mouseButton = this.dragButton === 2 ? 'right' : 'left'
        this.applyActiveMapTool(hex, mouseButton)
        this.lastPaintedHex = hex
      }
    },

    stopDragPainting() {
      this.isDragging = false
      this.lastPaintedHex = null
    },

    handleHexRightClick(hex) {
      if (this.activeMapTool !== 'select') {
        this.applyActiveMapTool(hex, 'right')
      }
    },

    // Shared core for testInPlayground and testInAutomatedPlayground.
    // Validates, builds the handoff token, notifies, and navigates to
    // routePath with the token attached as the BUILDER_PLAYTEST_QUERY_KEY
    // query parameter.
    handoffBuilderLevelTo(routePath, destinationLabel) {
      const exportLevelId = this.resolveExportLevelIdForCurrentState()
      const pkg = this.buildPackageFromState(exportLevelId)
      const result = validateLevelPackage(pkg)

      if (!result.ok) {
        this.lastActionStage = 'playtest-blocked'
        const summary = this.formatLevelIssues(result.errors)
        console.error('Playtest blocked by validation:', result.errors)
        this.notifyUser('error', 'levelBuilder.notifications.testInPlaygroundBlocked', `Test in ${destinationLabel} blocked`, summary, { destination: destinationLabel })
        return false
      }

      const finalPackage = result.package || pkg
      const levelId = finalPackage.id || DEFAULT_LEVEL_ID
      const token = createBuilderPlaytestHandoff({
        package: finalPackage,
        warnings: result.warnings || []
      })

      if (!token) {
        this.lastActionStage = 'playtest-blocked'
        this.notifyUser(
          'error',
          'levelBuilder.notifications.testInPlaygroundBlocked',
          `Test in ${destinationLabel} blocked`,
          this.uiText('levelBuilder.notifications.playtestHandoffFailed', 'Could not prepare the level handoff.'),
          { destination: destinationLabel }
        )
        return false
      }

      this.rememberFrozenExportPackage(finalPackage)
      this.lastActionStage = 'playtest'

      if (result.warnings && result.warnings.length > 0) {
        this.notifyUser(
          'warning',
          'levelBuilder.notifications.levelSentWithWarnings',
          `Level sent to ${destinationLabel} with warnings`,
          this.formatLevelIssues(result.warnings),
          { destination: destinationLabel }
        )
      } else {
        this.notifyUser(
          'success',
          'levelBuilder.notifications.levelSent',
          `Level sent to ${destinationLabel}`,
          this.uiFormat('levelBuilder.notifications.levelReadyToTest', `Level ${levelId} is ready to test.`, { levelId }),
          { destination: destinationLabel }
        )
      }

      if (this.$router && typeof this.$router.push === 'function') {
        return this.$router.push({
          path: routePath,
          query: { [BUILDER_PLAYTEST_QUERY_KEY]: token }
        })
      }
      return true
    },

    testInPlayground() {
      return this.handoffBuilderLevelTo('/Playground', this.uiText('navigation.playground', 'Playground'))
    },

    testInAutomatedPlayground() {
      return this.handoffBuilderLevelTo('/AutomatedPlayground', this.uiText('pages.automatedPlayground.title', 'Automated playground'))
    },

    saveLevelArchive() {
      // Primary export path (Task C1). Validates first, then bundles the
      // four section JSON files into a single `<id>/`-rooted ZIP archive
      // so the user gets one download instead of four. Falls back to the
      // same blocked-on-errors UX as `saveMap()`.
      const exportLevelId = this.resolveExportLevelIdForCurrentState()
      const pkg = this.buildPackageFromState(exportLevelId)
      const result = validateLevelPackage(pkg)

      if (!result.ok) {
        this.lastActionStage = 'export-blocked'
        const summary = this.formatLevelIssues(result.errors)
        console.error('Export blocked by validation:', result.errors)
        this.notifyUser('error', 'levelBuilder.notifications.exportBlocked', 'Export blocked', summary)
        return
      }
      this.lastActionStage = 'export'

      const finalPackage = result.package || pkg
      const levelId = finalPackage.id || DEFAULT_LEVEL_ID
      this.rememberFrozenExportPackage(finalPackage)

      const blob = buildLevelArchiveBlob(finalPackage, levelId)
      this.downloadBlob(levelArchiveFilename(levelId), blob)

      if (result.warnings && result.warnings.length > 0) {
        this.notifyUser(
          'warning',
          'levelBuilder.notifications.levelExportedWithWarnings',
          'Level exported with warnings',
          this.formatLevelIssues(result.warnings)
        )
      } else {
        this.notifyUser(
          'success',
          'levelBuilder.notifications.levelExported',
          'Level exported',
          this.uiFormat('levelBuilder.notifications.levelArchiveDownloaded', `Archive "${levelId}.zip" downloaded. Unzip into public/ to load in Playground.`, { levelId })
        )
      }
    },

    saveMap() {
      // Secondary/debug export path. Downloads the same four section
      // JSON files individually so designers can hand-edit one without
      // unpacking an archive. Same validation gating as the archive
      // path — keep these two in lockstep.
      const exportLevelId = this.resolveExportLevelIdForCurrentState()
      const pkg = this.buildPackageFromState(exportLevelId)
      const result = validateLevelPackage(pkg)

      if (!result.ok) {
        this.lastActionStage = 'export-blocked'
        const summary = this.formatLevelIssues(result.errors)
        console.error('Export blocked by validation:', result.errors)
        this.notifyUser('error', 'levelBuilder.notifications.exportBlocked', 'Export blocked', summary)
        return
      }
      this.lastActionStage = 'export'

      const finalPackage = result.package || pkg
      const levelId = finalPackage.id || DEFAULT_LEVEL_ID
      this.rememberFrozenExportPackage(finalPackage)

      this.downloadJSON(`${levelId}${SECTION_FILENAME_SUFFIX.hexmap}`, finalPackage.hexmap)
      this.downloadJSON(`${levelId}${SECTION_FILENAME_SUFFIX.terrain}`, finalPackage.terrain)
      this.downloadJSON(`${levelId}${SECTION_FILENAME_SUFFIX.units}`, finalPackage.units)
      this.downloadJSON(`${levelId}${SECTION_FILENAME_SUFFIX.turntable}`, finalPackage.turntable)
      if (finalPackage.objectives) {
        this.downloadJSON(`${levelId}${SECTION_FILENAME_SUFFIX.objectives}`, finalPackage.objectives)
      }

      if (result.warnings && result.warnings.length > 0) {
        this.notifyUser(
          'warning',
          'levelBuilder.notifications.packageExportedWithWarnings',
          'Package exported with warnings',
          this.formatLevelIssues(result.warnings)
        )
      } else {
        const fileCount = finalPackage.objectives ? 5 : 4
        this.notifyUser(
          'success',
          'levelBuilder.notifications.packageExported',
          'Package exported',
          this.uiFormat('levelBuilder.notifications.packageFilesDownloaded', `${fileCount} files downloaded for "${levelId}". Drop them into public/${levelId}/ to load in Playground.`, { fileCount, levelId })
        )
      }
    },

    async loadMap(event) {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      if (files.length === 0) return

      const entries = []
      const parseErrors = []
      // A Level Archive (.zip) is a complete package — it must be
      // imported on its own. Mixing it with another .zip silently
      // overlays sections across archives while `pkg.id` sticks to
      // the first one; mixing it with loose JSON section files lets
      // those JSONs override archive sections in
      // `mergeSectionsIntoPackage` while `pkg.id` again sticks to
      // the archive. Both produce a hybrid package the user did not
      // ask for, so we block any combination of a .zip with anything
      // else here, before any archive is read.
      const zipCount = files.filter(f =>
        typeof f.name === 'string' && f.name.toLowerCase().endsWith('.zip')
      ).length
      if (zipCount > 0 && files.length > 1) {
        this.lastActionStage = 'import-blocked'
        this.notifyUser(
          'error',
          'levelBuilder.notifications.importBlocked',
          'Import blocked',
          this.uiText('levelBuilder.notifications.archiveImportAlone', 'A level archive (.zip) must be imported on its own. Select either a single .zip, or one or more JSON section files - not both.')
        )
        return
      }
      // Encoded archive id from the .zip (if one was selected) whose
      // directory/filename prefixes name a consistent level (e.g.
      // `level_007/level_007_*.json`). Threaded into the merged package
      // below so a `level_007.zip` imported into a `level_000` builder
      // hydrates as `level_007` — closing the round-trip gap that
      // section JSON imports inherently have (split files carry no id).
      let importedLevelId = null
      for (const file of files) {
        // ZIP archive path: extract all required section files via the shared
        // `parseLevelArchive` helper and merge its results into the
        // same `entries` / `parseErrors` channels the JSON path uses,
        // so the rest of the flow (validate-then-mutate) is unchanged.
        // Suffix is the only branch — content-sniffing is the
        // classifier's job downstream.
        if (typeof file.name === 'string' && file.name.toLowerCase().endsWith('.zip')) {
          let archiveResult
          try {
            const bytes = new Uint8Array(await file.arrayBuffer())
            archiveResult = parseLevelArchive(bytes, { sourceName: file.name })
          } catch (err) {
            // `unzipSync` throws synchronously on a corrupt archive.
            // Route it into `parseErrors` so the existing gate below
            // surfaces a friendly "Import Blocked" notification.
            parseErrors.push({
              path: file.name,
              message: this.uiFormat(
                'levelBuilder.notifications.failedReadArchive',
                `failed to read archive: ${err && err.message ? err.message : String(err)}`,
                { message: err && err.message ? err.message : String(err) }
              )
            })
            continue
          }
          for (const entry of archiveResult.entries) entries.push(entry)
          for (const err of archiveResult.errors) parseErrors.push(err)
          if (importedLevelId === null && typeof archiveResult.archiveId === 'string') {
            importedLevelId = archiveResult.archiveId
          }
          continue
        }

        try {
          const text = await file.text()
          const body = JSON.parse(text)
          const section = detectSection(body)
          if (!section) {
            parseErrors.push({
              path: file.name,
              message: this.uiText('levelBuilder.notifications.unrecognizedJsonShape', 'unrecognized JSON shape (not a LevelPackage section)')
            })
            continue
          }
          entries.push({ section, body, sourceName: file.name })
        } catch (err) {
          parseErrors.push({
            path: file.name,
            message: this.uiFormat(
              'levelBuilder.notifications.failedParseJson',
              `failed to parse JSON: ${err && err.message ? err.message : String(err)}`,
              { message: err && err.message ? err.message : String(err) }
            )
          })
        }
      }

      if (parseErrors.length > 0) {
        this.lastActionStage = 'import-blocked'
        this.notifyUser('error', 'levelBuilder.notifications.importBlocked', 'Import blocked', this.formatLevelIssues(parseErrors))
        return
      }

      // Apply the archive-encoded id (if any) to the merge baseline so
      // `builderStateToPackage` stamps it into `pkg.id` BEFORE validation
      // and BEFORE state mutation. This keeps the atomic-import contract
      // intact: a malformed archive still fails the same validation gate
      // below, no state is touched, and the (now-applied) id is rolled
      // back along with the rest of the candidate package.
      const baseState = this.snapshotBuilderState()
      if (importedLevelId !== null) baseState.levelId = importedLevelId
      const { pkg, appliedSections } = mergeSectionsIntoPackage(entries, baseState)
      const result = validateLevelPackage(pkg)

      if (!result.ok) {
        this.lastActionStage = 'import-blocked'
        const summary = this.formatLevelIssues(result.errors)
        console.error('Import blocked by validation:', result.errors)
        this.notifyUser('error', 'levelBuilder.notifications.importBlocked', 'Import blocked', summary)
        return
      }

      this.hydrateFromPackage(result.package || pkg, { regenerateMap: true })
      this.lastActionStage = 'import'

      const sectionsLabel = appliedSections.length > 0
        ? appliedSections.join(', ')
        : this.uiText('levelBuilder.notifications.none', 'none')
      if (result.warnings && result.warnings.length > 0) {
        const issues = this.formatLevelIssues(result.warnings)
        this.notifyUser(
          'warning',
          'levelBuilder.notifications.packageImportedWithWarnings',
          'Package imported with warnings',
          this.uiFormat('levelBuilder.notifications.appliedSectionsWithIssues', `Applied sections: ${sectionsLabel}. ${issues}`, { sections: sectionsLabel, issues })
        )
      } else {
        this.notifyUser(
          'success',
          'levelBuilder.notifications.packageImported',
          'Package imported',
          this.uiFormat('levelBuilder.notifications.appliedSections', `Applied sections: ${sectionsLabel}.`, { sections: sectionsLabel })
        )
      }
    },

    buildPackageFromState(levelIdOverride = null) {
      return builderStateToPackage(this.snapshotBuilderState(levelIdOverride))
    },

    snapshotBuilderState(levelIdOverride = null) {
      return {
        levelId: levelIdOverride || this.currentLevelId || DEFAULT_LEVEL_ID,
        mapParams: { ...this.mapParams, zoom: this.zoomLevel },
        generatedMap: this.generatedMap,
        terrainTypes: this.terrainTypes,
        unitsData: this.unitsData || {},
        turntableData: this.turntableData || {},
        objectivesData: this.currentObjectivesData
      }
    },

    hydrateFromPackage(pkg, { regenerateMap }) {
      const state = packageToBuilderState(pkg)
      const safeId = typeof state.levelId === 'string' && SAFE_LEVEL_ID.test(state.levelId)
        ? this.levelNameFromImportedId(state.levelId)
        : DEFAULT_LEVEL_ID
      this.currentLevelId = safeId
      this.clearFrozenExportLevelId()
      this.refreshExportPreviewTimestamp()
      this.terrainTypes = state.terrainTypes
      this.unitsData = state.unitsData
      this.turntableData = state.turntableData
      this.objectivesData = state.objectivesData
      this.victoryConditionSettings = this.victoryConditionSettingsFromObjectives(state.objectivesData)
      this.ensureUnitsData()

      const params = state.mapParams || {}
      if (Number.isFinite(params.width)) this.mapParams.width = params.width
      if (Number.isFinite(params.height)) this.mapParams.height = params.height
      this.mapParams.availableTerrain = Array.isArray(params.availableTerrain)
        ? [...params.availableTerrain]
        : this.terrainTypes.slice(0, Math.min(3, this.terrainTypes.length)).map(t => t.id)
      if (params.zoom !== undefined) {
        this.zoomLevel = params.zoom
      }
      this.currentMapWidth = this.mapParams.width
      this.currentMapHeight = this.mapParams.height

      if (!regenerateMap) return

      const terrainById = new Map(this.terrainTypes.map(t => [t.id, t]))
      const seedsByKey = new Map(state.cellSeeds.map(seed => [`${seed.q},${seed.r}`, seed]))
      const nextMap = []
      for (let r = 0; r < this.mapParams.height; r++) {
        for (let q = 0; q < this.mapParams.width; q++) {
          const seed = seedsByKey.get(`${q},${r}`)
          let terrain = null
          if (seed) {
            terrain = terrainById.get(seed.terrainId) || null
            if (!terrain && typeof seed.terrainId === 'string') {
              terrain = { id: seed.terrainId, name: seed.terrainId, color: '#CCCCCC' }
            }
          }

          const hex = this.createHex(q, r, terrain)
          if (seed) {
            hex.player1Spawn = seed.player1Spawn
            hex.player1Base = seed.player1Base
            hex.player2Spawn = seed.player2Spawn
            hex.player2Base = seed.player2Base
          }
          nextMap.push(hex)
        }
      }
      this.generatedMap = nextMap
      this.syncVictoryConditionsWithMap()
    },

    // ---- Draft persistence across full browser reloads --------------------
    // The builder is keep-alive (its draft survives in-app navigation) but a
    // hard reload tears the instance down. We persist the draft as the level
    // PACKAGE form to localStorage and restore it once on the first mount.

    // Run-once restore. Always unblocks saving at the end (whether or not a
    // draft existed) so a stored draft can never be clobbered before it has had
    // a chance to load.
    restoreBuilderDraft() {
      if (typeof localStorage !== 'undefined') {
        const draft = loadBuilderDraft(localStorage)
        if (draft && draft.package) {
          try {
            this.hydrateFromPackage(draft.package, { regenerateMap: true })
            this.notifyUser(
              'success',
              'levelBuilder.draft.restoredTitle',
              'Draft restored',
              this.uiText('levelBuilder.draft.restoredBody', 'Your unsaved level draft was restored.')
            )
          } catch {
            // A corrupt-but-shaped package must not break mount: drop it.
            clearBuilderDraft(localStorage)
          }
        }
      }
      this._draftRestoreComplete = true
    },

    scheduleBuilderDraftSave() {
      if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer)
      this._draftSaveTimer = setTimeout(() => {
        this._draftSaveTimer = null
        this.saveBuilderDraftNow()
      }, 750)
    },

    saveBuilderDraftNow() {
      if (typeof localStorage === 'undefined') return
      let pkg
      try {
        pkg = this.buildPackageFromState()
      } catch {
        // A structurally-incomplete draft cannot be packaged yet — skip the
        // save rather than persisting a half-formed state.
        return
      }
      const result = saveBuilderDraft(localStorage, pkg, Date.now())
      if (result && !result.ok && result.quotaExceeded) {
        console.warn('Builder draft not saved: browser storage quota exceeded.')
      }
    },

    downloadJSON(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      this.downloadBlob(filename, blob)
    },

    downloadBlob(filename, blob) {
      // Shared anchor-click downloader. Used by both `downloadJSON`
      // (split-file export) and `saveLevelArchive` (ZIP export) so
      // anchor creation/cleanup lives in one place.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    formatLevelIssues(issues) {
      const list = Array.isArray(issues) ? issues : []
      if (list.length === 0) return 'Failed to load level.'
      const formatted = list.slice(0, 3).map(issue => {
        const path = issue && issue.path ? `${issue.path}: ` : ''
        return `${path}${issue && issue.message ? issue.message : 'unknown issue'}`
      })
      const tail = list.length > 3 ? `\n…and ${list.length - 3} more` : ''
      return formatted.join('\n') + tail
    },

    zoomIn() {
      if (this.zoomLevel < hexMap.maxZoom) {
        this.zoomLevel = Math.min(hexMap.maxZoom, this.zoomLevel + hexMap.zoomStep)
        this.regenerateMapWithCurrentTerrain()
      }
    },

    zoomOut() {
      if (this.zoomLevel > hexMap.minZoom) {
        this.zoomLevel = Math.max(hexMap.minZoom, this.zoomLevel - hexMap.zoomStep)
        this.regenerateMapWithCurrentTerrain()
      }
    },

    regenerateMapWithCurrentTerrain() {
      if (this.generatedMap.length === 0) return

      const terrainMap = {}
      const overlaysMap = {}
      this.generatedMap.forEach(hex => {
        const key = `${hex.q},${hex.r}`
        terrainMap[key] = hex.terrain.id
        overlaysMap[key] = {
          player1Spawn: hex.player1Spawn,
          player1Base: hex.player1Base,
          player2Spawn: hex.player2Spawn,
          player2Base: hex.player2Base,
          locked: hex.locked === true
        }
      })

      const terrainById = new Map(this.terrainTypes.map(t => [t.id, t]))
      const nextMap = []
      for (let r = 0; r < this.mapParams.height; r++) {
        for (let q = 0; q < this.mapParams.width; q++) {
          const key = `${q},${r}`
          const terrainId = terrainMap[key]
          let terrain = null
          if (terrainId) {
            terrain = terrainById.get(terrainId) || null
            if (!terrain) {
              terrain = {
                id: terrainId,
                name: terrainId.charAt(0).toUpperCase() + terrainId.slice(1),
                color: '#CCCCCC'
              }
            }
          }

          const hex = this.createHex(q, r, terrain)
          const overlays = overlaysMap[key]
          if (overlays) {
            hex.player1Spawn = overlays.player1Spawn
            hex.player1Base = overlays.player1Base
            hex.player2Spawn = overlays.player2Spawn
            hex.player2Base = overlays.player2Base
            hex.locked = overlays.locked
          }

          nextMap.push(hex)
        }
      }
      this.generatedMap = nextMap
      this.syncVictoryConditionsWithMap()
    },

    increaseWidth() {
      const width = this.normalizeMapDimension(this.mapParams.width, MIN_MAP_DIMENSION)
      if (width < MAX_MAP_DIMENSION) {
        this.mapParams.width = width + 1
        this.resizeGeneratedMapToDimensions()
      }
    },

    decreaseWidth() {
      const width = this.normalizeMapDimension(this.mapParams.width, MIN_MAP_DIMENSION)
      if (width > MIN_MAP_DIMENSION) {
        this.mapParams.width = width - 1
        this.resizeGeneratedMapToDimensions()
      }
    },

    increaseHeight() {
      const height = this.normalizeMapDimension(this.mapParams.height, MIN_MAP_DIMENSION)
      if (height < MAX_MAP_DIMENSION) {
        this.mapParams.height = height + 1
        this.resizeGeneratedMapToDimensions()
      }
    },

    decreaseHeight() {
      const height = this.normalizeMapDimension(this.mapParams.height, MIN_MAP_DIMENSION)
      if (height > MIN_MAP_DIMENSION) {
        this.mapParams.height = height - 1
        this.resizeGeneratedMapToDimensions()
      }
    },

    hasPlayerOverlay(hex, player) {
      return hex[`player${player}Spawn`] || hex[`player${player}Base`]
    }
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/LevelBuilder.scss' as *;
</style>
